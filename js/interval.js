import { fmtPace } from './util.js';

export const KIND_LABEL = { warmup: '워밍업', run: '달리기', rest: '휴식', cooldown: '쿨다운' };

/** 프리셋을 실제로 실행할 구간 목록으로 펼친다. value: time=초, distance=미터 */
export function expandPreset(p) {
  const out = [];
  if (p.warmup && p.warmup.value > 0) out.push({ kind: 'warmup', unit: p.warmup.unit, value: p.warmup.value });
  for (let rep = 1; rep <= p.repeat; rep++) {
    for (const s of p.steps) out.push({ kind: s.kind, unit: s.unit, value: s.value, paceSec: s.paceSec || null, rep });
  }
  if (p.cooldown && p.cooldown.value > 0) out.push({ kind: 'cooldown', unit: p.cooldown.unit, value: p.cooldown.value });
  return out;
}

export function fmtAmount(unit, value) {
  if (unit === 'distance') return value >= 1000 ? `${+(value / 1000).toFixed(2)}km` : `${value}m`;
  const m = Math.floor(value / 60);
  const s = value % 60;
  if (m && s) return `${m}분 ${s}초`;
  return m ? `${m}분` : `${s}초`;
}

export function speakAmount(unit, value) {
  if (unit === 'distance') return value >= 1000 ? `${+(value / 1000).toFixed(2)}킬로미터` : `${value}미터`;
  return fmtAmount(unit, value);
}

export function describePreset(p) {
  const inner = p.steps.map((s) => `${fmtAmount(s.unit, s.value)} ${KIND_LABEL[s.kind]}${s.paceSec ? ` @${fmtPace(s.paceSec)}` : ''}`).join(' / ');
  const parts = [];
  if (p.warmup && p.warmup.value > 0) parts.push(`워밍업 ${fmtAmount(p.warmup.unit, p.warmup.value)}`);
  parts.push(`(${inner}) × ${p.repeat}`);
  if (p.cooldown && p.cooldown.value > 0) parts.push(`쿨다운 ${fmtAmount(p.cooldown.unit, p.cooldown.value)}`);
  return parts.join(' · ');
}

/** 예상 총 시간(초)과 거리(m). 달리기 6'00", 그 외 8'00" 페이스로 가정 */
export function estimatePreset(p) {
  let sec = 0;
  let m = 0;
  for (const s of expandPreset(p)) {
    const pace = s.paceSec || (s.kind === 'run' ? 360 : 480);
    if (s.unit === 'time') {
      sec += s.value;
      m += (s.value / pace) * 1000;
    } else {
      m += s.value;
      sec += (s.value / 1000) * pace;
    }
  }
  return { sec: Math.round(sec), m: Math.round(m) };
}

export function hasDistanceStep(p) {
  return expandPreset(p).some((s) => s.unit === 'distance');
}
