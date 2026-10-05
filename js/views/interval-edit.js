import { getPreset, savePreset, deletePreset } from '../db.js';
import { esc, uid, go, toast, fmtDuration, fmtKm, parseDuration, parsePace, fmtDurationInput, fmtPace } from '../util.js';
import { estimatePreset, describePreset } from '../interval.js';

const paceInput = (sec) => (sec ? fmtPace(sec).replace("'", ':').replace('"', '') : '');

function amountInput(unit, value, cls) {
  const input = unit === 'distance'
    ? `<input type="number" class="${cls}" inputmode="numeric" min="1" step="1" value="${value || ''}" placeholder="400"><span class="unit">m</span>`
    : `<input type="text" class="${cls}" inputmode="numeric" value="${fmtDurationInput(value)}" placeholder="1:30"><span class="unit">분:초</span>`;
  return `<span class="amount">${input}</span>`;
}

function readAmount(unit, raw) {
  if (unit === 'distance') {
    const v = Math.round(Number(raw));
    return v > 0 ? v : null;
  }
  return parseDuration(raw);
}

export async function render(el, [id]) {
  const isNew = id === 'new';
  const found = isNew ? null : await getPreset(id);
  if (!isNew && !found) {
    el.innerHTML = '<p>프리셋을 찾을 수 없습니다.</p>';
    return;
  }
  const p = found ? structuredClone(found) : {
    id: uid(),
    name: '',
    warmup: null,
    steps: [
      { kind: 'run', unit: 'time', value: 60, paceSec: null },
      { kind: 'rest', unit: 'time', value: 60, paceSec: null },
    ],
    repeat: 5,
    cooldown: null,
  };

  const edgeRow = (key, label) => {
    const e = p[key];
    return `
      <div class="edge" data-key="${key}">
        <span class="lbl">${label}</span>
        <select class="eunit">
          <option value="none" ${!e ? 'selected' : ''}>없음</option>
          <option value="time" ${e?.unit === 'time' ? 'selected' : ''}>시간</option>
          <option value="distance" ${e?.unit === 'distance' ? 'selected' : ''}>거리</option>
        </select>
        ${e ? amountInput(e.unit, e.value, 'evalue') : ''}
      </div>`;
  };

  const draw = () => {
    const est = estimatePreset(p);
    el.innerHTML = `
      <h1><a class="back" href="#/intervals">‹</a> ${isNew ? '새 프리셋' : '프리셋 편집'}</h1>
      <div class="card form">
        <label>이름<input type="text" id="name" value="${esc(p.name)}" placeholder="예: 400m × 8"></label>
        ${edgeRow('warmup', '워밍업')}
        <div class="card-title">반복 구간</div>
        <div class="steps">
          ${p.steps.map((s, i) => `
            <div class="step" data-i="${i}">
              <select class="kind"><option value="run" ${s.kind === 'run' ? 'selected' : ''}>달리기</option><option value="rest" ${s.kind === 'rest' ? 'selected' : ''}>휴식</option></select>
              <select class="unitsel"><option value="time" ${s.unit === 'time' ? 'selected' : ''}>시간</option><option value="distance" ${s.unit === 'distance' ? 'selected' : ''}>거리</option></select>
              ${amountInput(s.unit, s.value, 'svalue')}
              ${s.kind === 'run' ? `<input type="text" class="space" inputmode="numeric" value="${paceInput(s.paceSec)}" placeholder="페이스(선택)">` : ''}
              <button class="btn small danger del" ${p.steps.length <= 1 ? 'disabled' : ''}>삭제</button>
            </div>`).join('')}
        </div>
        <button class="btn small" id="add">+ 구간 추가</button>
        <label>반복 횟수<input type="number" id="repeat" inputmode="numeric" min="1" max="99" value="${p.repeat}"></label>
        ${edgeRow('cooldown', '쿨다운')}
        <div class="summary-box">
          <div>${esc(describePreset(p))}</div>
          <small class="muted">예상 ${fmtDuration(est.sec)} · 약 ${fmtKm(est.m, 1)}km</small>
        </div>
        <div class="row">
          <button class="btn primary" id="save">저장</button>
          ${isNew ? '' : '<button class="btn danger" id="remove">삭제</button>'}
        </div>
      </div>
    `;
    bind();
  };

  /** 입력값을 p에 반영. 잘못된 값이 있으면 메시지를 반환 */
  const collect = () => {
    p.name = el.querySelector('#name').value.trim();
    p.repeat = Math.max(1, Math.min(99, Math.round(Number(el.querySelector('#repeat').value)) || 1));
    let error = null;
    el.querySelectorAll('.step').forEach((row) => {
      const s = p.steps[Number(row.dataset.i)];
      const v = readAmount(s.unit, row.querySelector('.svalue').value);
      if (v) s.value = v; else error = '구간 값을 올바르게 입력해 주세요. (시간: 1:30, 거리: 400)';
      const pi = row.querySelector('.space');
      if (pi) {
        const sec = parsePace(pi.value);
        if (pi.value.trim() && !sec) error = '페이스는 6:00 형식으로 입력해 주세요.';
        s.paceSec = sec;
      }
    });
    el.querySelectorAll('.edge').forEach((row) => {
      const e = p[row.dataset.key];
      const input = row.querySelector('.evalue');
      if (e && input) {
        const v = readAmount(e.unit, input.value);
        if (v) e.value = v; else error = '워밍업/쿨다운 값을 올바르게 입력해 주세요.';
      }
    });
    return error;
  };

  const bind = () => {
    const refreshSummary = () => {
      collect();
      const est = estimatePreset(p);
      el.querySelector('.summary-box').innerHTML = `<div>${esc(describePreset(p))}</div><small class="muted">예상 ${fmtDuration(est.sec)} · 약 ${fmtKm(est.m, 1)}km</small>`;
    };
    el.querySelectorAll('input').forEach((i) => { i.onchange = refreshSummary; });
    el.querySelectorAll('.step').forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelector('.kind').onchange = (e) => { collect(); p.steps[i].kind = e.target.value; if (e.target.value === 'rest') p.steps[i].paceSec = null; draw(); };
      row.querySelector('.unitsel').onchange = (e) => {
        collect();
        p.steps[i].unit = e.target.value;
        p.steps[i].value = e.target.value === 'distance' ? 400 : 60;
        draw();
      };
      row.querySelector('.del').onclick = () => { collect(); p.steps.splice(i, 1); draw(); };
    });
    el.querySelectorAll('.edge').forEach((row) => {
      row.querySelector('.eunit').onchange = (e) => {
        collect();
        const v = e.target.value;
        p[row.dataset.key] = v === 'none' ? null : { unit: v, value: v === 'distance' ? 1000 : 300 };
        draw();
      };
    });
    el.querySelector('#add').onclick = () => {
      collect();
      p.steps.push({ kind: 'run', unit: 'time', value: 60, paceSec: null });
      draw();
    };
    el.querySelector('#save').onclick = async () => {
      const error = collect();
      if (error) return toast(error);
      if (!p.name) p.name = describePreset(p).slice(0, 30);
      await savePreset(p);
      toast('저장했습니다.');
      go('#/intervals');
    };
    const remove = el.querySelector('#remove');
    if (remove) {
      remove.onclick = async () => {
        if (!confirm('이 프리셋을 삭제할까요?')) return;
        await deletePreset(p.id);
        go('#/intervals');
      };
    }
  };

  draw();
}
