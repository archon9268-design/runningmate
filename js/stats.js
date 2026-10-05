import { startOfWeek, startOfMonth, startOfYear, addDays, dateKey } from './util.js';

export function summarize(runs) {
  const m = runs.reduce((a, r) => a + (r.distanceM || 0), 0);
  const sec = runs.reduce((a, r) => a + (r.durationSec || 0), 0);
  return { count: runs.length, m, sec, pace: m > 0 ? sec / (m / 1000) : null };
}

export function inRange(runs, from, to) {
  return runs.filter((r) => r.startedAt >= +from && r.startedAt < +to);
}

/** period: week | month | year | all, offset: 0=이번, -1=지난 */
export function periodRange(period, offset = 0, now = new Date()) {
  if (period === 'week') {
    const from = addDays(startOfWeek(now), offset * 7);
    return { from, to: addDays(from, 7) };
  }
  if (period === 'month') {
    const from = startOfMonth(now);
    from.setMonth(from.getMonth() + offset);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    return { from, to };
  }
  if (period === 'year') {
    const from = startOfYear(now);
    from.setFullYear(from.getFullYear() + offset);
    const to = new Date(from);
    to.setFullYear(to.getFullYear() + 1);
    return { from, to };
  }
  return { from: new Date(0), to: new Date(8.64e15) };
}

export function periodLabel(period, from) {
  if (period === 'week') {
    const to = addDays(from, 6);
    return `${from.getMonth() + 1}/${from.getDate()} ~ ${to.getMonth() + 1}/${to.getDate()}`;
  }
  if (period === 'month') return `${from.getFullYear()}년 ${from.getMonth() + 1}월`;
  if (period === 'year') return `${from.getFullYear()}년`;
  return '전체 기간';
}

/** 차트용 막대 데이터 [{label, m}] */
export function chartBuckets(runs, period, from, to) {
  const buckets = [];
  if (period === 'week' || period === 'month') {
    for (let d = new Date(from); d < to; d = addDays(d, 1)) {
      buckets.push({ key: dateKey(d), label: period === 'week' ? ['월', '화', '수', '목', '금', '토', '일'][buckets.length] : String(d.getDate()), m: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const r of runs) {
      const i = idx.get(dateKey(r.startedAt));
      if (i != null) buckets[i].m += r.distanceM || 0;
    }
  } else if (period === 'year') {
    for (let i = 0; i < 12; i++) buckets.push({ label: `${i + 1}`, m: 0 });
    for (const r of runs) buckets[new Date(r.startedAt).getMonth()].m += r.distanceM || 0;
  } else {
    if (runs.length === 0) return [];
    const years = runs.map((r) => new Date(r.startedAt).getFullYear());
    const min = Math.min(...years);
    const max = Math.max(...years);
    for (let y = min; y <= max; y++) buckets.push({ label: `${y}`, m: 0 });
    for (const r of runs) buckets[new Date(r.startedAt).getFullYear() - min].m += r.distanceM || 0;
  }
  return buckets;
}

function bestSegment(route, dist) {
  let best = Infinity;
  let j = 0;
  for (let i = 1; i < route.length; i++) {
    while (j + 1 < i && route[i].d - route[j + 1].d >= dist) j++;
    const dd = route[i].d - route[j].d;
    if (dd >= dist) best = Math.min(best, ((route[i].t - route[j].t) * dist) / dd);
  }
  return best;
}

export const PB_TARGETS = [
  [1000, '1km'],
  [5000, '5km'],
  [10000, '10km'],
  [21097.5, '하프'],
];

/** 거리별 최고 기록. GPS 경로가 있으면 가장 빠른 구간, 없으면 평균 페이스로 추정 */
export function personalBests(runs) {
  return PB_TARGETS.map(([dist, label]) => {
    let best = null;
    for (const r of runs) {
      if (!r.distanceM || r.distanceM < dist || !r.durationSec) continue;
      const sec = r.route && r.route.length > 1 ? bestSegment(r.route, dist) : (r.durationSec * dist) / r.distanceM;
      if (isFinite(sec) && (!best || sec < best.sec)) best = { sec, runId: r.id, date: r.startedAt };
    }
    return { label, dist, best };
  });
}

/** 상세 화면 페이스 그래프용 [{d, pace}] (최근 200m 구간 기준) */
export function paceSeries(route, maxPoints = 120) {
  if (!route || route.length < 3) return [];
  const out = [];
  let j = 0;
  for (let i = 1; i < route.length; i++) {
    while (j + 1 < i && route[i].d - route[j + 1].d >= 200) j++;
    const dd = route[i].d - route[j].d;
    const dt = route[i].t - route[j].t;
    if (dd >= 100 && dt > 0) out.push({ d: route[i].d, pace: dt / (dd / 1000) });
  }
  if (out.length <= maxPoints) return out;
  const step = out.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, k) => out[Math.floor(k * step)]);
}
