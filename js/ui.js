import { esc, fmtKm, fmtDuration, fmtPace, fmtShortDate, uid, toast, go } from './util.js';
import { unlockAudio, setAudioSettings } from './audio.js';
import { keepAwake } from './wakelock.js';
import { createSession, getSession } from './tracker.js';
import { getSettings } from './db.js';
import { hasDistanceStep, fmtAmount } from './interval.js';

export const TYPE_LABEL = { free: '자유', goal: '목표', interval: '인터벌', manual: '직접 입력' };

export function isIndoor() {
  return localStorage.getItem('rm.indoor') === '1';
}

export function setIndoor(on) {
  localStorage.setItem('rm.indoor', on ? '1' : '0');
}

/**
 * 러닝 시작. 반드시 버튼 클릭 핸들러 안에서 동기적으로 호출해야 한다.
 * (iOS는 사용자 동작 중에만 오디오와 화면 꺼짐 방지를 허용)
 */
export function startRun(opts, settings) {
  const existing = getSession();
  if (existing && existing.status !== 'finished') {
    toast('이미 진행 중인 러닝이 있습니다.');
    go('#/live');
    return;
  }
  const indoor = opts.indoor ?? isIndoor();
  if (indoor && opts.preset && hasDistanceStep(opts.preset)) {
    alert('실내 모드에서는 거리 기준 구간이 있는 인터벌을 실행할 수 없습니다.\n프리셋을 시간 기준으로 바꾸거나 실내 모드를 꺼 주세요.');
    return;
  }
  if (indoor && opts.goal?.kind === 'distance') {
    alert('실내 모드에서는 거리 목표를 측정할 수 없습니다. 시간 목표를 사용해 주세요.');
    return;
  }
  unlockAudio();
  keepAwake(true);
  setAudioSettings(settings);
  const s = createSession({ ...opts, indoor }, settings, uid());
  s.startGps();
  go('#/live');
}

export async function loadSettingsForRun() {
  const s = await getSettings();
  setAudioSettings(s);
  return s;
}

export const PLAN_TYPES = { rest: '휴식', free: '자유 달리기', distance: '거리', time: '시간', interval: '인터벌' };

export function planDayText(day, presets) {
  if (!day || day.type === 'rest') return '휴식';
  if (day.type === 'free') return '자유 달리기';
  if (day.type === 'distance') return `거리 ${day.value || '?'}km${day.paceSec ? ` @${fmtPace(day.paceSec)}` : ''}`;
  if (day.type === 'time') return `시간 ${day.value || '?'}분${day.paceSec ? ` @${fmtPace(day.paceSec)}` : ''}`;
  const p = presets.find((x) => x.id === day.presetId);
  return p ? `인터벌 · ${p.name}` : '인터벌 (프리셋 없음)';
}

/** 계획 하루를 startRun 옵션으로 변환. 실행할 수 없으면 null */
export function planDayToOpts(day, presets, planDate) {
  if (!day || day.type === 'rest') return null;
  if (day.type === 'free') return { type: 'free', planDate };
  if (day.type === 'distance' && day.value > 0) return { type: 'goal', goal: { kind: 'distance', value: day.value * 1000, paceSec: day.paceSec || null }, planDate };
  if (day.type === 'time' && day.value > 0) return { type: 'goal', goal: { kind: 'time', value: day.value * 60, paceSec: day.paceSec || null }, planDate };
  if (day.type === 'interval') {
    const preset = presets.find((x) => x.id === day.presetId);
    return preset ? { type: 'interval', preset, planDate } : null;
  }
  return null;
}

export function goalText(goal) {
  if (!goal) return '';
  const amount = goal.kind === 'distance' ? fmtAmount('distance', goal.value) : fmtAmount('time', goal.value);
  return goal.paceSec ? `${amount} @${fmtPace(goal.paceSec)}` : amount;
}

export function runListItem(r) {
  const tags = [TYPE_LABEL[r.type] || r.type];
  if (r.indoor) tags.push('실내');
  return `
    <a class="run-item" href="#/run/${esc(r.id)}">
      <div class="run-item-main">
        <div class="run-item-date">${esc(fmtShortDate(r.startedAt))} <span class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span></div>
        <div class="run-item-title">${esc(r.presetName || (r.memo ? r.memo.slice(0, 30) : ''))}</div>
      </div>
      <div class="run-item-stats">
        <div><b>${fmtKm(r.distanceM)}</b><small>km</small></div>
        <div><b>${fmtDuration(r.durationSec)}</b><small>시간</small></div>
        <div><b>${fmtPace(r.avgPaceSec)}</b><small>/km</small></div>
      </div>
    </a>`;
}

export function barChart(buckets, { height = 140 } = {}) {
  if (!buckets.length) return '<p class="muted">기록이 없습니다.</p>';
  const max = Math.max(1, ...buckets.map((b) => b.m));
  const w = 100 / buckets.length;
  const showEvery = buckets.length > 16 ? 5 : 1;
  const bars = buckets.map((b, i) => {
    const h = (b.m / max) * (height - 30);
    const x = i * w;
    const label = (i % showEvery === 0 || i === buckets.length - 1) ? `<text x="${x + w / 2}%" y="${height - 6}" text-anchor="middle">${esc(b.label)}</text>` : '';
    const value = b.m > 0 && buckets.length <= 12 ? `<text class="v" x="${x + w / 2}%" y="${height - 24 - h}" text-anchor="middle">${(b.m / 1000).toFixed(1)}</text>` : '';
    return `<rect x="${x + w * 0.15}%" y="${height - 20 - h}" width="${w * 0.7}%" height="${Math.max(h, b.m > 0 ? 2 : 0)}" rx="3"></rect>${label}${value}`;
  }).join('');
  return `<svg class="chart" width="100%" height="${height}">${bars}</svg>`;
}

export function paceChart(series, { height = 160 } = {}) {
  if (series.length < 2) return '';
  const paces = series.map((p) => p.pace).sort((a, b) => a - b);
  const lo = paces[Math.floor(paces.length * 0.05)];
  const hi = paces[Math.floor(paces.length * 0.95)];
  const min = Math.max(0, lo - 15);
  const max = hi + 15;
  const maxD = series[series.length - 1].d;
  const W = 1000;
  const H = height;
  const pts = series.map((p) => {
    const x = (p.d / maxD) * W;
    const pace = Math.min(max, Math.max(min, p.pace));
    const y = 10 + ((pace - min) / (max - min || 1)) * (H - 30);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `
    <svg class="pace-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="chart-axis"><span>빠름 ${fmtPace(min)}</span><span>느림 ${fmtPace(max)}</span><span>${fmtKm(maxD, 1)}km</span></div>`;
}

/** Leaflet 지도에 경로를 그린다. 반환값: map 객체 (없으면 null) */
export function drawRouteMap(el, route) {
  if (!window.L || !route || route.length < 2) return null;
  const map = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  const segs = new Map();
  for (const p of route) {
    if (!segs.has(p.seg)) segs.set(p.seg, []);
    segs.get(p.seg).push([p.lat, p.lng]);
  }
  const lines = [...segs.values()].map((pts) => {
    L.polyline(pts, { color: '#1a1c21', weight: 9, opacity: 0.85 }).addTo(map);
    return L.polyline(pts, { color: '#c8ff00', weight: 5 }).addTo(map);
  });
  const first = route[0];
  const last = route[route.length - 1];
  L.circleMarker([first.lat, first.lng], { radius: 7, color: '#fff', fillColor: '#2ecc71', fillOpacity: 1, weight: 2 }).addTo(map);
  L.circleMarker([last.lat, last.lng], { radius: 7, color: '#fff', fillColor: '#e74c3c', fillOpacity: 1, weight: 2 }).addTo(map);
  map.fitBounds(L.featureGroup(lines).getBounds(), { padding: [20, 20] });
  return map;
}
