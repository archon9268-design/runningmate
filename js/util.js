export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm) || secPerKm > 3600) return `-'--"`;
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}'${pad2(s % 60)}"`;
}

export function fmtKm(m, digits = 2) {
  return ((m || 0) / 1000).toFixed(digits);
}

export function speakDuration(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  if (s || parts.length === 0) parts.push(`${s}초`);
  return parts.join(' ');
}

export function speakPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '측정 중';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

export function speakKm(m) {
  const km = Math.round((m || 0) / 10) / 100;
  return `${km}킬로미터`;
}

export function dateKey(d) {
  d = new Date(d);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function weekdayIdx(d) {
  return (new Date(d).getDay() + 6) % 7;
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - weekdayIdx(x));
  return x;
}

export function startOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function startOfYear(d) {
  const x = startOfMonth(d);
  x.setMonth(0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function fmtDate(ts, withTime = true) {
  const d = new Date(ts);
  const base = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${WEEKDAYS[weekdayIdx(d)]})`;
  return withTime ? `${base} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : base;
}

export function fmtShortDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[weekdayIdx(d)]})`;
}

/** "6:00" → 360. 빈 값이나 잘못된 값이면 null */
export function parsePace(str) {
  if (str == null || String(str).trim() === '') return null;
  const m = String(str).trim().match(/^(\d{1,2})(?:[:'](\d{1,2}))?"?$/);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2] || 0);
  return v > 0 ? v : null;
}

/** "1:02:03" / "45:30" / "45"(분) → 초 */
export function parseDuration(str) {
  if (str == null || String(str).trim() === '') return null;
  const parts = String(str).trim().split(':').map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  let v;
  if (n.length === 1) v = n[0] * 60;
  else if (n.length === 2) v = n[0] * 60 + n[1];
  else if (n.length === 3) v = n[0] * 3600 + n[1] * 60 + n[2];
  else return null;
  return v > 0 ? v : null;
}

export function fmtDurationInput(sec) {
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${pad2(sec % 60)}`;
}

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function go(hash) {
  location.hash = hash;
}
