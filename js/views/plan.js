import { getPlan, savePlan, getGoal, saveGoal, getPresets, getRuns, getSettings } from '../db.js';
import { esc, WEEKDAYS, dateKey, addDays, startOfWeek, weekdayIdx, parsePace, fmtPace, toast } from '../util.js';
import { PLAN_TYPES, planDayToOpts, startRun } from '../ui.js';

export async function render(el) {
  const [plan, goal, presets, runs, settings] = await Promise.all([getPlan(), getGoal(), getPresets(), getRuns(), getSettings()]);
  const monday = startOfWeek(new Date());
  const runDays = new Set(runs.map((r) => dateKey(r.startedAt)));
  const todayIdx = weekdayIdx(new Date());

  const dayRow = (d, i) => {
    const date = addDays(monday, i);
    const done = d.type !== 'rest' && runDays.has(dateKey(date));
    const valueInput = d.type === 'distance' || d.type === 'time'
      ? `<input type="number" class="v" inputmode="decimal" step="${d.type === 'distance' ? '0.1' : '1'}" min="0" value="${d.value ?? ''}" placeholder="${d.type === 'distance' ? 'km' : '분'}">
         <span class="unit">${d.type === 'distance' ? 'km' : '분'}</span>
         <input type="text" class="p" inputmode="numeric" value="${d.paceSec ? fmtPace(d.paceSec).replace("'", ':').replace('"', '') : ''}" placeholder="페이스 6:00">`
      : '';
    const presetSelect = d.type === 'interval'
      ? `<select class="preset">${presets.length ? presets.map((p) => `<option value="${esc(p.id)}" ${p.id === d.presetId ? 'selected' : ''}>${esc(p.name)}</option>`).join('') : '<option value="">프리셋 없음</option>'}</select>`
      : '';
    return `
      <div class="plan-day ${i === todayIdx ? 'today' : ''}" data-i="${i}">
        <div class="plan-day-head">
          <b>${WEEKDAYS[i]}</b><small class="muted">${date.getMonth() + 1}/${date.getDate()}</small>
          ${done ? '<span class="tag ok">완료</span>' : ''}
        </div>
        <div class="plan-day-body">
          <select class="type">${Object.entries(PLAN_TYPES).map(([k, v]) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${v}</option>`).join('')}</select>
          ${valueInput}${presetSelect}
          ${d.type !== 'rest' ? '<button class="btn small start">시작</button>' : ''}
        </div>
      </div>`;
  };

  el.innerHTML = `
    <h1>계획</h1>
    <div class="card">
      <div class="card-title">주간 계획 <small class="muted">매주 반복 · 변경 사항은 자동 저장</small></div>
      <div class="plan-list">${plan.map(dayRow).join('')}</div>
    </div>
    <div class="card form">
      <div class="card-title">거리 목표</div>
      <div class="grid2">
        <label>주간 (km)<input type="number" id="weekly" inputmode="decimal" min="0" step="1" value="${goal.weeklyKm ?? ''}"></label>
        <label>월간 (km)<input type="number" id="monthly" inputmode="decimal" min="0" step="1" value="${goal.monthlyKm ?? ''}"></label>
      </div>
    </div>
  `;

  const persist = async () => {
    await savePlan(plan);
  };

  el.querySelectorAll('.plan-day').forEach((row) => {
    const i = Number(row.dataset.i);
    const d = plan[i];
    row.querySelector('.type').onchange = async (e) => {
      plan[i] = { type: e.target.value };
      if (plan[i].type === 'interval') plan[i].presetId = presets[0]?.id || null;
      await persist();
      render(el);
    };
    const v = row.querySelector('.v');
    if (v) v.onchange = () => { d.value = Number(v.value) || null; persist(); };
    const p = row.querySelector('.p');
    if (p) {
      p.onchange = () => {
        const sec = parsePace(p.value);
        if (p.value.trim() && !sec) return toast('페이스는 6:00 형식으로 입력해 주세요.');
        d.paceSec = sec;
        persist();
      };
    }
    const ps = row.querySelector('.preset');
    if (ps) ps.onchange = () => { d.presetId = ps.value; persist(); };
    const start = row.querySelector('.start');
    if (start) {
      start.onclick = () => {
        const opts = planDayToOpts(d, presets, dateKey(new Date()));
        if (!opts) return toast('계획 값을 먼저 입력해 주세요.');
        startRun(opts, settings);
      };
    }
  });

  const saveGoals = () => saveGoal({
    weeklyKm: Number(el.querySelector('#weekly').value) || null,
    monthlyKm: Number(el.querySelector('#monthly').value) || null,
  }).then(() => toast('목표를 저장했습니다.'));
  el.querySelector('#weekly').onchange = saveGoals;
  el.querySelector('#monthly').onchange = saveGoals;
}
