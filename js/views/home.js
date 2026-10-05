import { getRuns, getPlan, getGoal, getPresets, getSettings } from '../db.js';
import { esc, fmtKm, dateKey, weekdayIdx, WEEKDAYS, go } from '../util.js';
import { summarize, inRange, periodRange } from '../stats.js';
import { runListItem, startRun, isIndoor, setIndoor, planDayText, planDayToOpts } from '../ui.js';
import { savedSessionData, getSession, restoreSession, clearSession } from '../tracker.js';
import { setAudioSettings } from '../audio.js';
import { requestMotionPermission } from '../cadence.js';

function progress(m, goalKm) {
  if (!goalKm) return '';
  const pct = Math.min(100, (m / 1000 / goalKm) * 100);
  return `<div class="progress"><div style="width:${pct}%"></div></div><small class="muted">목표 ${goalKm}km · ${pct.toFixed(0)}%</small>`;
}

export async function render(el) {
  const [runs, plan, goal, presets, settings] = await Promise.all([getRuns(), getPlan(), getGoal(), getPresets(), getSettings()]);
  const today = new Date();
  const todayKey = dateKey(today);
  const day = plan[weekdayIdx(today)];
  const doneToday = runs.some((r) => dateKey(r.startedAt) === todayKey);
  const week = summarize(inRange(runs, ...Object.values(periodRange('week'))));
  const month = summarize(inRange(runs, ...Object.values(periodRange('month'))));
  const saved = !getSession() ? savedSessionData() : null;
  const indoor = isIndoor();

  let planCard;
  if (plan.every((d) => d.type === 'rest')) {
    planCard = `<p class="muted">아직 주간 계획이 없습니다.</p><a class="btn" href="#/plan">계획 만들기</a>`;
  } else if (day.type === 'rest') {
    planCard = `<p class="big-text">오늘은 휴식일입니다</p>`;
  } else {
    planCard = `
      <p class="big-text">${esc(planDayText(day, presets))} ${doneToday ? '<span class="tag ok">완료</span>' : ''}</p>
      <button class="btn primary" id="plan-start">시작</button>`;
  }

  el.innerHTML = `
    <h1>RunningMate</h1>
    ${saved ? `
      <div class="card warn">
        <b>진행 중이던 러닝이 있습니다</b>
        <p class="muted">${saved.status === 'finished' ? '종료 후 저장하지 않은 기록입니다.' : '앱이 종료되어 일시정지된 상태입니다.'}</p>
        <div class="row"><button class="btn primary" id="restore">이어서</button><button class="btn" id="discard">버리기</button></div>
      </div>` : ''}

    <div class="card">
      <div class="card-title">오늘의 계획 · ${WEEKDAYS[weekdayIdx(today)]}요일</div>
      ${planCard}
    </div>

    <div class="grid2">
      <div class="card">
        <div class="card-title">이번 주</div>
        <div class="stat-big">${fmtKm(week.m, 1)}<small>km</small></div>
        <small class="muted">${week.count}회</small>
        ${progress(week.m, goal.weeklyKm)}
      </div>
      <div class="card">
        <div class="card-title">이번 달</div>
        <div class="stat-big">${fmtKm(month.m, 1)}<small>km</small></div>
        <small class="muted">${month.count}회</small>
        ${progress(month.m, goal.monthlyKm)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">빠른 시작</div>
      <div class="quick">
        <button class="btn primary big" id="free">자유 달리기</button>
        <a class="btn big" href="#/start/goal">목표 달리기</a>
        <a class="btn big" href="#/intervals">인터벌</a>
      </div>
      <label class="switch-row">
        <span>실내 모드 (트레드밀, GPS 없이 시간만 기록)</span>
        <input type="checkbox" id="indoor" ${indoor ? 'checked' : ''}>
      </label>
    </div>

    <div class="card">
      <div class="card-title">최근 러닝 <a class="link" href="#/history">전체 보기</a></div>
      ${runs.length ? runs.slice(0, 3).map(runListItem).join('') : '<p class="muted">아직 기록이 없습니다.</p>'}
    </div>
  `;

  el.querySelector('#free').onclick = () => startRun({ type: 'free' }, settings);
  el.querySelector('#indoor').onchange = (e) => setIndoor(e.target.checked);
  const planBtn = el.querySelector('#plan-start');
  if (planBtn) {
    planBtn.onclick = () => {
      const opts = planDayToOpts(day, presets, todayKey);
      if (!opts) return alert('계획 내용이 비어 있습니다. 계획 화면에서 값을 입력해 주세요.');
      startRun(opts, settings);
    };
  }
  if (saved) {
    el.querySelector('#restore').onclick = () => {
      setAudioSettings(settings);
      requestMotionPermission();
      restoreSession(settings);
      go('#/live');
    };
    el.querySelector('#discard').onclick = () => {
      if (!confirm('진행 중이던 기록을 버릴까요?')) return;
      clearSession();
      render(el);
    };
  }
}
