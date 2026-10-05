import { getPresets, getSettings } from '../db.js';
import { esc, fmtDuration, fmtKm } from '../util.js';
import { describePreset, estimatePreset, hasDistanceStep } from '../interval.js';
import { startRun, isIndoor } from '../ui.js';

export async function render(el) {
  const [presets, settings] = await Promise.all([getPresets(), getSettings()]);
  const indoor = isIndoor();
  el.innerHTML = `
    <h1>인터벌 <a class="btn small right" href="#/intervals/new">+ 새 프리셋</a></h1>
    ${indoor ? '<p class="muted">실내 모드가 켜져 있습니다. 시간 기준 프리셋만 시작할 수 있습니다.</p>' : ''}
    ${presets.length ? presets.map((p) => {
      const est = estimatePreset(p);
      const blocked = indoor && hasDistanceStep(p);
      return `
        <div class="card preset">
          <div class="card-title">${esc(p.name)}</div>
          <p class="muted">${esc(describePreset(p))}</p>
          <p class="muted small">예상 ${fmtDuration(est.sec)} · 약 ${fmtKm(est.m, 1)}km</p>
          <div class="row">
            <button class="btn primary" data-start="${esc(p.id)}" ${blocked ? 'disabled' : ''}>시작</button>
            <a class="btn" href="#/intervals/${esc(p.id)}">편집</a>
          </div>
        </div>`;
    }).join('') : '<div class="card"><p class="muted">프리셋이 없습니다.</p></div>'}
  `;
  el.querySelectorAll('[data-start]').forEach((b) => {
    b.onclick = () => {
      const preset = presets.find((p) => p.id === b.dataset.start);
      startRun({ type: 'interval', preset }, settings);
    };
  });
}
