import { getSettings } from '../db.js';
import { parsePace, parseDuration, toast } from '../util.js';
import { startRun, isIndoor } from '../ui.js';

export async function render(el) {
  const settings = await getSettings();
  const indoor = isIndoor();
  el.innerHTML = `
    <h1><a class="back" href="#/">‹</a> 목표 달리기</h1>
    <div class="card form">
      <label>목표 종류
        <div class="seg" id="kind">
          <button data-v="distance" class="${indoor ? '' : 'on'}" ${indoor ? 'disabled' : ''}>거리</button>
          <button data-v="time" class="${indoor ? 'on' : ''}">시간</button>
        </div>
      </label>
      <label id="dist-row" ${indoor ? 'hidden' : ''}>거리 (km)
        <input type="number" id="dist" inputmode="decimal" step="0.1" min="0.1" value="5">
      </label>
      <label id="time-row" ${indoor ? '' : 'hidden'}>시간 (분 또는 분:초)
        <input type="text" id="time" inputmode="numeric" value="30" placeholder="30">
      </label>
      <label ${indoor ? 'hidden' : ''}>목표 페이스 (선택, 분:초/km)
        <input type="text" id="pace" inputmode="numeric" placeholder="예: 6:00">
      </label>
      ${indoor ? '<p class="muted">실내 모드에서는 시간 목표만 사용할 수 있습니다.</p>' : ''}
      <button class="btn primary big" id="go">시작</button>
    </div>
  `;

  let kind = indoor ? 'time' : 'distance';
  el.querySelectorAll('#kind button').forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault();
      kind = b.dataset.v;
      el.querySelectorAll('#kind button').forEach((x) => x.classList.toggle('on', x === b));
      el.querySelector('#dist-row').hidden = kind !== 'distance';
      el.querySelector('#time-row').hidden = kind !== 'time';
    };
  });

  el.querySelector('#go').onclick = () => {
    const paceStr = el.querySelector('#pace').value;
    const paceSec = parsePace(paceStr);
    if (paceStr.trim() && !paceSec) return toast('페이스는 6:00 형식으로 입력해 주세요.');
    let goal;
    if (kind === 'distance') {
      const km = Number(el.querySelector('#dist').value);
      if (!(km > 0)) return toast('거리를 입력해 주세요.');
      goal = { kind, value: Math.round(km * 1000), paceSec };
    } else {
      const sec = parseDuration(el.querySelector('#time').value);
      if (!sec) return toast('시간을 입력해 주세요.');
      goal = { kind, value: sec, paceSec };
    }
    startRun({ type: 'goal', goal }, settings);
  };
}
