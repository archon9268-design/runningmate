/**
 * 가속도 센서로 걸음을 세서 케이던스(분당 걸음 수, spm)를 계산한다.
 * 손에 들거나 주머니에 넣어도 발이 땅에 닿을 때마다 생기는 충격 피크를 한 걸음으로 센다.
 */

const MIN_STEP_GAP_MS = 250; // 240spm 이상은 무시
const WINDOW_MS = 12000;
const STALE_MS = 3000;

export const motionSupported = typeof window !== 'undefined' && 'DeviceMotionEvent' in window;

let permission = motionSupported && typeof DeviceMotionEvent.requestPermission !== 'function' ? 'granted' : 'unknown';
let listening = false;
let sensorSeen = false;
let onStep = null;

let smooth = 9.8;
let baseline = 9.8;
let peakAmp = 3;
let above = false;
let lastStepAt = 0;

/** iOS는 버튼 클릭 핸들러 안에서 동기적으로 호출해야 권한 창이 뜬다 */
export function requestMotionPermission() {
  if (!motionSupported || permission === 'granted' || permission === 'denied') return;
  DeviceMotionEvent.requestPermission()
    .then((r) => {
      permission = r === 'granted' ? 'granted' : 'denied';
      if (permission === 'granted' && onStep) listen();
    })
    .catch(() => { permission = 'denied'; });
}

/** 센서 값이 실제로 들어오는지 (노트북은 보통 false) */
export function cadenceAvailable() {
  return sensorSeen;
}

function handleMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  sensorSeen = true;
  const m = Math.hypot(a.x, a.y, a.z);
  smooth = smooth * 0.75 + m * 0.25;
  baseline = baseline * 0.98 + m * 0.02;
  const diff = smooth - baseline;
  const threshold = Math.max(1.2, peakAmp * 0.45);
  if (!above && diff > threshold) {
    above = true;
    const now = performance.now();
    if (now - lastStepAt >= MIN_STEP_GAP_MS) {
      lastStepAt = now;
      onStep?.(Date.now());
    }
  } else if (above && diff < threshold * 0.4) {
    above = false;
  }
  if (diff > 0) peakAmp = Math.max(diff, peakAmp * 0.995);
}

function listen() {
  if (listening || permission !== 'granted') return;
  window.addEventListener('devicemotion', handleMotion);
  listening = true;
}

export function startCadence(cb) {
  onStep = cb;
  listen();
}

export function stopCadence() {
  onStep = null;
  if (listening) window.removeEventListener('devicemotion', handleMotion);
  listening = false;
}

/** 최근 걸음 시각 목록으로 현재 케이던스 계산 */
export function cadenceFrom(stepTimes, now = Date.now()) {
  const recent = stepTimes.filter((t) => now - t <= WINDOW_MS);
  if (recent.length < 6 || now - recent[recent.length - 1] > STALE_MS) return null;
  const span = (recent[recent.length - 1] - recent[0]) / 60000;
  return span > 0 ? Math.round((recent.length - 1) / span) : null;
}
