import { uid } from './util.js';

const DB_NAME = 'runningmate';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('runs', { keyPath: 'id' });
        db.createObjectStore('presets', { keyPath: 'id' });
        db.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    let result;
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
};

export async function kvGet(key, fallback) {
  const row = await db.get('kv', key);
  return row ? row.value : fallback;
}

export function kvSet(key, value) {
  return db.put('kv', { key, value });
}

// ---------- 러닝 기록 ----------

export async function getRuns() {
  const runs = await db.getAll('runs');
  return runs.sort((a, b) => b.startedAt - a.startedAt);
}

export const getRun = (id) => db.get('runs', id);
export const saveRun = (run) => db.put('runs', run);
export const deleteRun = (id) => db.del('runs', id);

// ---------- 설정 ----------

export const DEFAULT_SETTINGS = {
  voice: true,
  voiceName: '', // 빈 값이면 자연스러운 여성 음성을 자동 선택
  voiceRate: 1,
  announce: 'd1000', // d500 | d1000 | d2000 | t300 | t600
  items: { distance: true, time: true, lapPace: true, avgPace: false, cadence: false },
  beep: true,
  autoPause: false,
  weightKg: 65,
};

export async function getSettings() {
  const s = await kvGet('settings', {});
  return { ...DEFAULT_SETTINGS, ...s, items: { ...DEFAULT_SETTINGS.items, ...(s.items || {}) } };
}

export const saveSettings = (s) => kvSet('settings', s);

// ---------- 계획 / 목표 ----------

export const DEFAULT_PLAN = Array.from({ length: 7 }, () => ({ type: 'rest' }));

export async function getPlan() {
  const p = await kvGet('plan', null);
  return Array.isArray(p) && p.length === 7 ? p : DEFAULT_PLAN.map((d) => ({ ...d }));
}

export const savePlan = (p) => kvSet('plan', p);

export async function getGoal() {
  return kvGet('goal', { weeklyKm: null, monthlyKm: null });
}

export const saveGoal = (g) => kvSet('goal', g);

// ---------- 인터벌 프리셋 ----------

const DEFAULT_PRESETS = () => [
  {
    id: uid(),
    name: '400m × 8',
    warmup: { unit: 'time', value: 600 },
    steps: [
      { kind: 'run', unit: 'distance', value: 400, paceSec: null },
      { kind: 'rest', unit: 'time', value: 90, paceSec: null },
    ],
    repeat: 8,
    cooldown: { unit: 'time', value: 600 },
  },
  {
    id: uid(),
    name: '1분 달리기 / 1분 걷기 × 10',
    warmup: null,
    steps: [
      { kind: 'run', unit: 'time', value: 60, paceSec: null },
      { kind: 'rest', unit: 'time', value: 60, paceSec: null },
    ],
    repeat: 10,
    cooldown: null,
  },
  {
    id: uid(),
    name: '트레드밀 3분 / 2분 × 5',
    warmup: { unit: 'time', value: 300 },
    steps: [
      { kind: 'run', unit: 'time', value: 180, paceSec: null },
      { kind: 'rest', unit: 'time', value: 120, paceSec: null },
    ],
    repeat: 5,
    cooldown: { unit: 'time', value: 300 },
  },
];

export async function getPresets() {
  let list = await db.getAll('presets');
  if (list.length === 0 && !(await kvGet('presetsSeeded', false))) {
    list = DEFAULT_PRESETS();
    for (const p of list) await db.put('presets', p);
    await kvSet('presetsSeeded', true);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export const getPreset = (id) => db.get('presets', id);
export const savePreset = (p) => db.put('presets', p);
export const deletePreset = (id) => db.del('presets', id);

// ---------- 내보내기 / 가져오기 ----------

export async function exportAll() {
  return {
    app: 'runningmate',
    version: 1,
    exportedAt: Date.now(),
    runs: await db.getAll('runs'),
    presets: await db.getAll('presets'),
    plan: await kvGet('plan', null),
    goal: await kvGet('goal', null),
    settings: await kvGet('settings', null),
  };
}

/** 기록과 프리셋은 id 기준으로 합친다. 계획/목표/설정은 includeConfig일 때만 덮어쓴다. */
export async function importAll(data, includeConfig) {
  if (!data || data.app !== 'runningmate') throw new Error('런닝메이트 백업 파일이 아닙니다.');
  const existing = new Set((await db.getAll('runs')).map((r) => r.id));
  let added = 0;
  for (const r of data.runs || []) {
    if (!existing.has(r.id)) added++;
    await db.put('runs', r);
  }
  for (const p of data.presets || []) await db.put('presets', p);
  if (includeConfig) {
    if (data.plan) await kvSet('plan', data.plan);
    if (data.goal) await kvSet('goal', data.goal);
    if (data.settings) await kvSet('settings', data.settings);
  }
  return added;
}

export async function wipeAll() {
  await db.clear('runs');
  await db.clear('presets');
  await db.clear('kv');
}
