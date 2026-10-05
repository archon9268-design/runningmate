import { getRun, saveRun, deleteRun } from '../db.js';
import { esc, fmtDate, fmtKm, fmtDuration, fmtPace, go, toast } from '../util.js';
import { paceSeries } from '../stats.js';
import { TYPE_LABEL, drawRouteMap, paceChart, goalText } from '../ui.js';

export async function render(el, [id]) {
  const run = await getRun(id);
  if (!run) {
    el.innerHTML = '<div class="card"><p>기록을 찾을 수 없습니다.</p><a class="btn" href="#/history">기록으로</a></div>';
    return;
  }
  const tags = [TYPE_LABEL[run.type] || run.type];
  if (run.indoor) tags.push('실내');
  const hasRoute = run.route && run.route.length > 1;
  const series = hasRoute ? paceSeries(run.route) : [];
  const fullLaps = (run.laps || []).filter((l) => l.distanceM >= 1000);
  const bestLap = fullLaps.length ? fmtPace(Math.min(...fullLaps.map((l) => l.paceSec))) : '-';

  el.innerHTML = `
    <h1><a class="back" href="#/history">‹</a> ${esc(fmtDate(run.startedAt))}</h1>
    <div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
      ${run.presetName ? `<span class="tag">${esc(run.presetName)}</span>` : ''}
      ${run.goal ? `<span class="tag">목표 ${esc(goalText(run.goal))}</span>` : ''}
    </div>
    <div class="card">
      <div class="stat-grid">
        <div><b>${fmtKm(run.distanceM)}</b><small>거리 km</small></div>
        <div><b>${fmtDuration(run.durationSec)}</b><small>시간</small></div>
        <div><b>${fmtPace(run.avgPaceSec)}</b><small>평균 페이스</small></div>
      </div>
      <div class="stat-grid small">
        <div><b>${fmtDuration(run.elapsedSec || run.durationSec)}</b><small>전체 경과</small></div>
        <div><b>${run.calories ?? '-'}</b><small>kcal</small></div>
        <div><b>${bestLap}</b><small>최고 1km</small></div>
      </div>
      ${run.avgCadence ? `
      <div class="stat-grid small">
        <div><b>${run.avgCadence}</b><small>평균 케이던스 spm</small></div>
        <div><b>${run.stepCount.toLocaleString()}</b><small>걸음</small></div>
        <div><b>${run.distanceM > 0 ? Math.round((run.distanceM * 100) / run.stepCount) : '-'}</b><small>보폭 cm</small></div>
      </div>` : ''}
    </div>
    ${hasRoute ? '<div class="card"><div id="detail-map" class="detail-map"></div></div>' : ''}
    ${series.length > 1 ? `<div class="card"><div class="card-title">페이스</div>${paceChart(series)}</div>` : ''}
    ${run.steps?.length ? `
      <div class="card"><div class="card-title">인터벌 구간</div>
        <table class="table"><thead><tr><th>구간</th><th>거리</th><th>시간</th><th>페이스</th></tr></thead>
        <tbody>${run.steps.map((s) => `<tr class="k-${s.kind}"><td>${esc(s.label)}</td><td>${run.indoor ? '-' : `${s.distanceM}m`}</td><td>${fmtDuration(s.durationSec)}</td><td>${run.indoor || s.distanceM < 20 ? '-' : fmtPace(s.durationSec / (s.distanceM / 1000))}</td></tr>`).join('')}</tbody></table>
      </div>` : ''}
    ${run.laps?.length ? `
      <div class="card"><div class="card-title">구간 기록</div>
        <table class="table"><thead><tr><th>km</th><th>거리</th><th>시간</th><th>페이스</th></tr></thead>
        <tbody>${run.laps.map((l) => `<tr><td>${l.index}</td><td>${fmtKm(l.distanceM)}</td><td>${fmtDuration(l.durationSec)}</td><td>${fmtPace(l.paceSec)}</td></tr>`).join('')}</tbody></table>
      </div>` : ''}
    <div class="card form">
      <label>메모<textarea id="memo" rows="3" placeholder="컨디션, 날씨 등">${esc(run.memo || '')}</textarea></label>
      <div class="row">
        <button class="btn" id="save-memo">메모 저장</button>
        <button class="btn danger" id="delete">기록 삭제</button>
      </div>
    </div>
  `;

  let map = null;
  if (hasRoute) map = drawRouteMap(el.querySelector('#detail-map'), run.route);

  el.querySelector('#save-memo').onclick = async () => {
    run.memo = el.querySelector('#memo').value.trim();
    await saveRun(run);
    toast('메모를 저장했습니다.');
  };
  el.querySelector('#delete').onclick = async () => {
    if (!confirm('이 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
    await deleteRun(run.id);
    toast('삭제했습니다.');
    go('#/history');
  };

  return () => map?.remove();
}
