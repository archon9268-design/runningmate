import { speak, beep } from './audio.js';
import { keepAwake } from './wakelock.js';
import { expandPreset, KIND_LABEL, speakAmount } from './interval.js';
import { speakKm, speakDuration, speakPace } from './util.js';
import { startCadence, stopCadence, cadenceFrom } from './cadence.js';

const STORAGE_KEY = 'rm.activeRun';
const MAX_ACCURACY_M = 40;
const MAX_SPEED_MS = 12;
const PACE_WINDOW_MS = 20000;
const AUTO_PAUSE_AFTER_MS = 8000;
const PACE_ALERT_GAP_SEC = 60;
const PACE_ALERT_TOLERANCE_SEC = 15;

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const PERSISTED_FIELDS = [
  'id', 'type', 'indoor', 'goal', 'preset', 'planDate', 'status', 'startedAt', 'endedAt',
  'distanceM', 'route', 'seg', 'laps', 'lapStartD', 'lapStartT', 'steps', 'stepIdx', 'stepStartD',
  'stepStartT', 'stepResults', 'stepsDone', 'nextAnnounce', 'lastAnnounceD', 'lastAnnounceT', 'goalDone',
  'stepCount',
];

export class RunSession {
  /**
   * @param {{type:'free'|'goal'|'interval', indoor?:boolean, goal?:{kind:'distance'|'time', value:number, paceSec?:number|null}, preset?:object, planDate?:string}} opts
   */
  constructor(opts, settings, id) {
    this.id = id;
    this.type = opts.type;
    this.indoor = !!opts.indoor;
    this.goal = opts.goal || null;
    this.preset = opts.preset || null;
    this.planDate = opts.planDate || null;
    this.settings = settings;

    this.status = 'ready'; // ready | running | paused | finished
    this.startedAt = null;
    this.endedAt = null;
    this.movingMs = 0;
    this.resumedAt = null;
    this.autoPaused = false;

    this.distanceM = 0;
    this.route = [];
    this.seg = 0;
    this.lastFix = null;
    this.lastMoveAt = 0;
    this.recent = [];

    this.laps = [];
    this.lapStartD = 0;
    this.lapStartT = 0;

    this.steps = this.preset ? expandPreset(this.preset) : [];
    this.stepIdx = this.steps.length ? 0 : -1;
    this.stepStartD = 0;
    this.stepStartT = 0;
    this.stepResults = [];
    this.stepsDone = this.steps.length === 0;
    this.lastCountdownBeep = null;

    this.nextAnnounce = this.announceStep();
    this.lastAnnounceD = 0;
    this.lastAnnounceT = 0;
    this.goalDone = false;
    this.lastPaceAlert = 0;

    this.stepCount = 0;
    this.stepTimes = [];

    this.gpsAccuracy = null;
    this.gpsError = null;
    this.lastPos = null;
    this.watchId = null;
    this.timer = null;
    this.lastPersist = 0;
    this.listeners = new Set();
  }

  // ---------- 계산 값 ----------

  /** 움직인 시간(초) */
  get t() {
    const live = this.status === 'running' ? Date.now() - this.resumedAt : 0;
    return (this.movingMs + live) / 1000;
  }

  get avgPace() {
    return this.distanceM > 50 ? this.t / (this.distanceM / 1000) : null;
  }

  get currentPace() {
    if (this.status !== 'running' || this.recent.length < 2) return null;
    const a = this.recent[0];
    const b = this.recent[this.recent.length - 1];
    const dd = b.d - a.d;
    const dt = (b.ts - a.ts) / 1000;
    if (dd < 10 || dt <= 0) return null;
    return dt / (dd / 1000);
  }

  /** 현재 케이던스 (spm) */
  get cadence() {
    return this.status === 'running' ? cadenceFrom(this.stepTimes) : null;
  }

  /** 평균 케이던스 (spm). 걸음이 충분히 쌓였을 때만 */
  get avgCadence() {
    return this.stepCount >= 30 && this.t > 0 ? Math.round(this.stepCount / (this.t / 60)) : null;
  }

  onStep(ts) {
    if (this.status !== 'running') return;
    this.stepCount++;
    this.stepTimes.push(ts);
    if (this.stepTimes.length > 60) this.stepTimes.splice(0, this.stepTimes.length - 60);
  }

  get currentStep() {
    return this.stepIdx >= 0 && this.stepIdx < this.steps.length ? this.steps[this.stepIdx] : null;
  }

  /** 현재 구간에서 남은 양 (초 또는 m) */
  get stepRemaining() {
    const s = this.currentStep;
    if (!s) return null;
    return s.unit === 'time' ? s.value - (this.t - this.stepStartT) : s.value - (this.distanceM - this.stepStartD);
  }

  get targetPace() {
    const s = this.currentStep;
    if (s && !this.stepsDone) return s.kind === 'run' ? s.paceSec : null;
    return this.goal?.paceSec || null;
  }

  announceStep() {
    const a = this.settings.announce || 'd1000';
    let unit = a[0] === 't' ? 'time' : 'distance';
    let value = Number(a.slice(1)) || 1000;
    if (this.indoor && unit === 'distance') {
      unit = 'time';
      value = 300;
    }
    return { unit, value, at: value };
  }

  // ---------- 이벤트 ----------

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  // ---------- GPS ----------

  startGps() {
    if (this.indoor || this.watchId != null) return;
    if (!('geolocation' in navigator)) {
      this.gpsError = '이 기기는 위치 기능을 지원하지 않습니다.';
      this.emit();
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onFix(pos),
      (err) => {
        this.gpsError = err.code === 1 ? '위치 권한이 거부되었습니다. 설정에서 위치 접근을 허용해 주세요.' : '위치 신호를 받을 수 없습니다.';
        this.emit();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
  }

  stopGps() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  onFix(pos) {
    const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
    const ts = pos.timestamp || Date.now();
    this.gpsAccuracy = accuracy;
    this.gpsError = null;
    if (accuracy <= 100) this.lastPos = { lat, lng };

    if (accuracy > MAX_ACCURACY_M) return this.emit();

    if (this.status === 'paused' && this.autoPaused && this.lastFix) {
      const moved = haversine(this.lastFix.lat, this.lastFix.lng, lat, lng);
      if (moved > 15 || (speed != null && speed > 1.5)) this.resume(true);
    }
    if (this.status !== 'running') return this.emit();

    if (!this.lastFix) {
      this.lastFix = { lat, lng, ts };
      this.lastMoveAt = Date.now();
      this.pushPoint(lat, lng);
      return this.emit();
    }

    const d = haversine(this.lastFix.lat, this.lastFix.lng, lat, lng);
    const dt = (ts - this.lastFix.ts) / 1000;
    if (dt <= 0 || d / dt > MAX_SPEED_MS) return this.emit();
    if (d < Math.max(3, accuracy * 0.5)) return this.emit();

    this.distanceM += d;
    this.lastFix = { lat, lng, ts };
    this.lastMoveAt = Date.now();
    this.recent.push({ ts, d: this.distanceM });
    while (this.recent.length > 2 && ts - this.recent[0].ts > PACE_WINDOW_MS) this.recent.shift();
    this.pushPoint(lat, lng);
    this.afterDistance();
    this.emit();
  }

  pushPoint(lat, lng) {
    this.route.push({
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      t: Math.round(this.t),
      d: Math.round(this.distanceM),
      seg: this.seg,
    });
  }

  // ---------- 진행 ----------

  afterDistance() {
    const t = this.t;
    while (this.distanceM - this.lapStartD >= 1000) {
      const durationSec = Math.round(t - this.lapStartT);
      this.laps.push({ index: this.laps.length + 1, distanceM: 1000, durationSec, paceSec: durationSec });
      this.lapStartD += 1000;
      this.lapStartT = t;
    }
    const s = this.currentStep;
    if (s && s.unit === 'distance' && this.stepRemaining <= 0) this.advanceStep();
    if (this.nextAnnounce.unit === 'distance' && this.distanceM >= this.nextAnnounce.at) {
      const mark = Math.floor(this.distanceM / this.nextAnnounce.value) * this.nextAnnounce.value;
      while (this.nextAnnounce.at <= this.distanceM) this.nextAnnounce.at += this.nextAnnounce.value;
      this.announce(mark);
    }
    this.checkGoal();
  }

  tick() {
    if (this.status === 'running') {
      const t = this.t;
      const s = this.currentStep;
      if (s && s.unit === 'time') {
        const remaining = this.stepRemaining;
        const sec = Math.ceil(remaining);
        if (remaining <= 0) this.advanceStep();
        else if (sec <= 3 && sec !== this.lastCountdownBeep) {
          this.lastCountdownBeep = sec;
          beep(660, 0.12);
        }
      }
      if (this.nextAnnounce.unit === 'time' && t >= this.nextAnnounce.at) {
        while (this.nextAnnounce.at <= t) this.nextAnnounce.at += this.nextAnnounce.value;
        this.announce();
      }
      this.checkGoal();
      this.checkPace();
      if (this.settings.autoPause && !this.indoor && this.lastFix && Date.now() - this.lastMoveAt > AUTO_PAUSE_AFTER_MS) {
        this.pause(true);
      }
    }
    if (Date.now() - this.lastPersist > 5000) this.persist();
    this.emit();
  }

  advanceStep() {
    const s = this.currentStep;
    if (!s) return;
    this.stepResults.push(this.stepResult(s));
    this.stepIdx++;
    this.stepStartD = this.distanceM;
    this.stepStartT = this.t;
    this.lastCountdownBeep = null;
    const n = this.currentStep;
    if (!n) {
      this.stepsDone = true;
      beep(1046, 0.5);
      speak('인터벌 완료. 수고하셨습니다.', { interrupt: true });
    } else {
      beep(1320, 0.35);
      let text = `${KIND_LABEL[n.kind]}. ${speakAmount(n.unit, n.value)}`;
      if (n.kind === 'run' && n.rep) text += `. ${n.rep}번째, 총 ${this.preset.repeat}회`;
      speak(text, { interrupt: true });
    }
    this.persist();
  }

  stepResult(s) {
    const label = KIND_LABEL[s.kind] + (s.rep ? ` ${s.rep}` : '');
    return {
      kind: s.kind,
      label,
      distanceM: Math.round(this.distanceM - this.stepStartD),
      durationSec: Math.round(this.t - this.stepStartT),
    };
  }

  skipStep() {
    if (this.currentStep) this.advanceStep();
    this.emit();
  }

  announce(markM) {
    const it = this.settings.items || {};
    const t = this.t;
    const parts = [];
    if (it.distance && !this.indoor) parts.push(speakKm(markM ?? this.distanceM));
    if (it.time) parts.push(`시간 ${speakDuration(t)}`);
    const dd = this.distanceM - this.lastAnnounceD;
    if (it.lapPace && !this.indoor && dd > 50) parts.push(`구간 페이스 ${speakPace((t - this.lastAnnounceT) / (dd / 1000))}`);
    if (it.avgPace && !this.indoor && this.avgPace) parts.push(`평균 페이스 ${speakPace(this.avgPace)}`);
    const cad = this.cadence;
    if (it.cadence && cad) parts.push(`케이던스 ${cad}`);
    this.lastAnnounceD = this.distanceM;
    this.lastAnnounceT = t;
    if (parts.length) speak(parts.join('. '));
  }

  checkGoal() {
    if (!this.goal || this.goalDone) return;
    const reached = this.goal.kind === 'distance' ? this.distanceM >= this.goal.value : this.t >= this.goal.value;
    if (!reached) return;
    this.goalDone = true;
    beep(1046, 0.5);
    speak(`목표 달성! ${speakKm(this.distanceM)}, ${speakDuration(this.t)}`, { interrupt: true });
  }

  checkPace() {
    const target = this.targetPace;
    const cur = this.currentPace;
    if (!target || !cur || this.indoor) return;
    const t = this.t;
    if (t - this.lastPaceAlert < PACE_ALERT_GAP_SEC) return;
    const sinceStart = this.currentStep && !this.stepsDone ? this.distanceM - this.stepStartD : this.distanceM;
    if (sinceStart < 200) return;
    const diff = cur - target;
    if (Math.abs(diff) <= PACE_ALERT_TOLERANCE_SEC) return;
    this.lastPaceAlert = t;
    speak(`${diff > 0 ? '조금 빠르게' : '조금 천천히'}. 현재 페이스 ${speakPace(cur)}`);
  }

  // ---------- 제어 ----------

  start() {
    if (this.status !== 'ready') return;
    this.startedAt = Date.now();
    this.resumedAt = this.startedAt;
    this.status = 'running';
    this.lastMoveAt = Date.now();
    keepAwake(true);
    this.startGps();
    this.startTimer();
    let text = '러닝을 시작합니다.';
    const s = this.currentStep;
    if (s) text += ` ${KIND_LABEL[s.kind]}. ${speakAmount(s.unit, s.value)}`;
    speak(text, { interrupt: true });
    this.persist();
    this.emit();
  }

  startTimer() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), 250);
    startCadence((ts) => this.onStep(ts));
  }

  pause(auto = false) {
    if (this.status === 'paused' && !auto) {
      this.autoPaused = false;
      return this.emit();
    }
    if (this.status !== 'running') return;
    this.movingMs += Date.now() - this.resumedAt;
    this.status = 'paused';
    this.autoPaused = auto;
    this.recent = [];
    this.stepTimes = [];
    speak(auto ? '자동 일시정지' : '일시정지', { interrupt: true });
    this.persist();
    this.emit();
  }

  resume(auto = false) {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.resumedAt = Date.now();
    this.lastMoveAt = Date.now();
    if (!auto && !this.autoPaused) {
      this.seg++;
      this.lastFix = null;
    }
    this.autoPaused = false;
    keepAwake(true);
    this.startGps();
    this.startTimer();
    speak('다시 시작합니다', { interrupt: true });
    this.persist();
    this.emit();
  }

  finish() {
    if (this.status === 'running') this.movingMs += Date.now() - this.resumedAt;
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.endedAt = Date.now();
    const t = this.t;
    if (this.currentStep && !this.stepsDone) {
      const r = this.stepResult(this.currentStep);
      if (r.durationSec > 0) this.stepResults.push(r);
    }
    const restD = this.distanceM - this.lapStartD;
    if (restD >= 20) {
      const durationSec = Math.round(t - this.lapStartT);
      this.laps.push({ index: this.laps.length + 1, distanceM: Math.round(restD), durationSec, paceSec: Math.round(durationSec / (restD / 1000)) });
    }
    this.cleanup();
    speak(`러닝 종료. ${this.indoor ? '' : `${speakKm(this.distanceM)}, `}${speakDuration(t)}`, { interrupt: true });
    this.persist();
    this.emit();
  }

  cleanup() {
    this.stopGps();
    stopCadence();
    clearInterval(this.timer);
    this.timer = null;
    keepAwake(false);
  }

  /** 저장용 러닝 기록. 실내 모드는 거리를 직접 입력받는다. */
  toRun({ distanceM, memo, weightKg } = {}) {
    const durationSec = Math.round(this.movingMs / 1000);
    const dist = Math.round(distanceM ?? this.distanceM);
    return {
      id: this.id,
      startedAt: this.startedAt,
      endedAt: this.endedAt || Date.now(),
      type: this.type,
      indoor: this.indoor,
      distanceM: dist,
      durationSec,
      elapsedSec: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      avgPaceSec: dist > 0 ? Math.round(durationSec / (dist / 1000)) : null,
      calories: weightKg ? Math.round(weightKg * (dist / 1000) * 1.036) : null,
      stepCount: this.stepCount || null,
      avgCadence: this.stepCount >= 30 && durationSec > 0 ? Math.round(this.stepCount / (durationSec / 60)) : null,
      route: this.indoor ? [] : this.route,
      laps: this.indoor ? [] : this.laps,
      steps: this.stepResults,
      goal: this.goal,
      presetId: this.preset?.id || null,
      presetName: this.preset?.name || null,
      planDate: this.planDate,
      memo: memo || '',
    };
  }

  // ---------- 복구 ----------

  persist() {
    this.lastPersist = Date.now();
    const data = {};
    for (const k of PERSISTED_FIELDS) data[k] = this[k];
    data.movingMs = Math.round(this.t * 1000);
    if (data.status === 'running') data.status = 'paused';
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* 저장 공간 부족 */ }
  }

  static restore(data, settings) {
    const s = new RunSession(data, settings, data.id);
    for (const k of PERSISTED_FIELDS) if (k in data) s[k] = data[k];
    s.movingMs = data.movingMs || 0;
    s.autoPaused = false;
    s.lastFix = null;
    return s;
  }
}

// ---------- 현재 세션 (앱 전체에서 하나) ----------

let current = null;

export function getSession() {
  return current;
}

export function createSession(opts, settings, id) {
  if (current) current.cleanup();
  current = new RunSession(opts, settings, id);
  return current;
}

export function savedSessionData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function restoreSession(settings) {
  const data = savedSessionData();
  if (!data) return null;
  current = RunSession.restore(data, settings);
  if (current.status === 'paused') current.startTimer();
  return current;
}

export function clearSession() {
  if (current) current.cleanup();
  current = null;
  localStorage.removeItem(STORAGE_KEY);
}
