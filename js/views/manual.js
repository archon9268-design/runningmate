import { saveRun, getSettings } from '../db.js';
import { uid, pad2, parseDuration, fmtPace, go, toast } from '../util.js';

export async function render(el) {
  const settings = await getSettings();
  const now = new Date();
  const local = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  el.innerHTML = `
    <h1><a class="back" href="#/history">‹</a> 러닝 직접 입력</h1>
    <div class="card form">
      <label>시작 날짜/시간<input type="datetime-local" id="date" value="${local}"></label>
      <label>거리 (km)<input type="number" id="dist" inputmode="decimal" step="0.01" min="0" placeholder="예: 5.2"></label>
      <label>시간 (시:분:초 또는 분:초)<input type="text" id="time" inputmode="numeric" placeholder="예: 32:15"></label>
      <label class="switch-row"><span>실내 (트레드밀)</span><input type="checkbox" id="indoor" checked></label>
      <label>메모<textarea id="memo" rows="2"></textarea></label>
      <p class="muted" id="pace">평균 페이스: -</p>
      <button class="btn primary big" id="save">저장</button>
    </div>
  `;

  const read = () => {
    const km = Number(el.querySelector('#dist').value);
    const sec = parseDuration(el.querySelector('#time').value);
    return { km, sec };
  };
  const refresh = () => {
    const { km, sec } = read();
    el.querySelector('#pace').textContent = `평균 페이스: ${km > 0 && sec ? `${fmtPace(sec / km)} /km` : '-'}`;
  };
  el.querySelector('#dist').oninput = refresh;
  el.querySelector('#time').oninput = refresh;

  el.querySelector('#save').onclick = async () => {
    const { km, sec } = read();
    if (!(km > 0)) return toast('거리를 입력해 주세요.');
    if (!sec) return toast('시간을 32:15 형식으로 입력해 주세요.');
    const startedAt = new Date(el.querySelector('#date').value).getTime();
    if (!startedAt) return toast('날짜를 입력해 주세요.');
    const distanceM = Math.round(km * 1000);
    const run = {
      id: uid(),
      startedAt,
      endedAt: startedAt + sec * 1000,
      type: 'manual',
      indoor: el.querySelector('#indoor').checked,
      distanceM,
      durationSec: sec,
      elapsedSec: sec,
      avgPaceSec: Math.round(sec / km),
      calories: settings.weightKg ? Math.round(settings.weightKg * km * 1.036) : null,
      route: [],
      laps: [],
      steps: [],
      goal: null,
      presetId: null,
      presetName: null,
      planDate: null,
      memo: el.querySelector('#memo').value.trim(),
    };
    await saveRun(run);
    toast('저장했습니다.');
    go(`#/run/${run.id}`);
  };
}
