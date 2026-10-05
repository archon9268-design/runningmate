import { getSession } from './tracker.js';
import { getSettings } from './db.js';
import { setAudioSettings } from './audio.js';
import * as home from './views/home.js';
import * as startGoal from './views/start-goal.js';
import * as plan from './views/plan.js';
import * as intervals from './views/intervals.js';
import * as intervalEdit from './views/interval-edit.js';
import * as live from './views/live.js';
import * as history from './views/history.js';
import * as runDetail from './views/run-detail.js';
import * as manual from './views/manual.js';
import * as settings from './views/settings.js';

const ROUTES = [
  [/^\/$/, home, 'home'],
  [/^\/start\/goal$/, startGoal, 'home'],
  [/^\/plan$/, plan, 'plan'],
  [/^\/intervals$/, intervals, 'intervals'],
  [/^\/intervals\/([\w-]+)$/, intervalEdit, 'intervals'],
  [/^\/live$/, live, null],
  [/^\/history$/, history, 'history'],
  [/^\/history\/new$/, manual, 'history'],
  [/^\/run\/([\w-]+)$/, runDetail, 'history'],
  [/^\/settings$/, settings, 'settings'],
];

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  intervals: '<path d="M3 17h4V7h4v10h4V7h4v10h2"/>',
  history: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

const NAV = [
  ['home', '#/', '홈'],
  ['plan', '#/plan', '계획'],
  ['intervals', '#/intervals', '인터벌'],
  ['history', '#/history', '기록'],
  ['settings', '#/settings', '설정'],
];

const nav = document.getElementById('nav');
const view = document.getElementById('view');
const banner = document.getElementById('live-banner');
let cleanup = null;
let renderToken = 0;

nav.innerHTML = `
  <div class="brand">RunningMate</div>
  ${NAV.map(([key, href, label]) => `
    <a href="${href}" data-key="${key}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>
      <span>${label}</span>
    </a>`).join('')}
`;

function updateBanner(isLive) {
  const s = getSession();
  const show = !isLive && s && s.status !== 'finished';
  banner.hidden = !show;
  document.body.classList.toggle('has-banner', !!show);
}

banner.onclick = () => { location.hash = '#/live'; };

async function router() {
  const path = (location.hash || '#/').slice(1) || '/';
  const match = ROUTES.map(([re, mod, key]) => [path.match(re), mod, key]).find(([m]) => m);
  const token = ++renderToken;

  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;

  if (!match) {
    location.hash = '#/';
    return;
  }
  const [m, mod, key] = match;
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.key === key));
  updateBanner(key === null);
  window.scrollTo(0, 0);
  try {
    const result = await mod.render(view, m.slice(1));
    if (token !== renderToken) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup = result;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><p>오류가 발생했습니다.</p><pre class="small muted">${String(e?.message || e)}</pre></div>`;
  }
}

setInterval(() => updateBanner(location.hash === '#/live'), 2000);
window.addEventListener('hashchange', router);

(async () => {
  setAudioSettings(await getSettings());
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  router();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('서비스 워커 등록 실패', e));
}
