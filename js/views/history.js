import { getRuns } from '../db.js';
import { fmtKm, fmtDuration, fmtPace, fmtShortDate, esc } from '../util.js';
import { summarize, inRange, periodRange, periodLabel, chartBuckets, personalBests } from '../stats.js';
import { runListItem, barChart } from '../ui.js';

const PERIODS = [['week', '주'], ['month', '월'], ['year', '년'], ['all', '전체']];
const state = { period: 'week', offset: 0 };

export async function render(el) {
  const runs = await getRuns();

  const draw = () => {
    const { from, to } = periodRange(state.period, state.offset);
    const list = inRange(runs, from, to);
    const sum = summarize(list);
    const pbs = personalBests(runs);
    el.innerHTML = `
      <h1>기록 <a class="btn small right" href="#/history/new">+ 직접 입력</a></h1>
      <div class="seg wide" id="period">
        ${PERIODS.map(([k, v]) => `<button data-v="${k}" class="${state.period === k ? 'on' : ''}">${v}</button>`).join('')}
      </div>
      <div class="period-nav">
        ${state.period === 'all' ? '<span></span>' : '<button class="btn small" id="prev">‹</button>'}
        <b>${periodLabel(state.period, from)}</b>
        ${state.period === 'all' ? '<span></span>' : `<button class="btn small" id="next" ${state.offset >= 0 ? 'disabled' : ''}>›</button>`}
      </div>
      <div class="card">
        <div class="stat-grid four">
          <div><b>${fmtKm(sum.m, 1)}</b><small>거리 km</small></div>
          <div><b>${sum.count}</b><small>횟수</small></div>
          <div><b>${fmtDuration(sum.sec)}</b><small>시간</small></div>
          <div><b>${fmtPace(sum.pace)}</b><small>평균 페이스</small></div>
        </div>
        ${barChart(chartBuckets(list, state.period, from, to))}
      </div>
      <div class="card">
        <div class="card-title">개인 최고 기록</div>
        <div class="pb-grid">
          ${pbs.map((p) => `
            <${p.best ? `a href="#/run/${esc(p.best.runId)}"` : 'div'} class="pb">
              <small>${p.label}</small>
              <b>${p.best ? fmtDuration(p.best.sec) : '-'}</b>
              <small class="muted">${p.best ? fmtShortDate(p.best.date) : '기록 없음'}</small>
            </${p.best ? 'a' : 'div'}>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-title">러닝 ${list.length}건</div>
        ${list.length ? list.map(runListItem).join('') : '<p class="muted">이 기간에는 기록이 없습니다.</p>'}
      </div>
    `;
    el.querySelectorAll('#period button').forEach((b) => {
      b.onclick = () => {
        state.period = b.dataset.v;
        state.offset = 0;
        draw();
      };
    });
    const prev = el.querySelector('#prev');
    const next = el.querySelector('#next');
    if (prev) prev.onclick = () => { state.offset--; draw(); };
    if (next) next.onclick = () => { state.offset = Math.min(0, state.offset + 1); draw(); };
  };

  draw();
}
