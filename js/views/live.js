import { getSession, clearSession, savedSessionData } from '../tracker.js';
import { saveRun } from '../db.js';
import { beep } from '../audio.js';
import { wakeLockSupported } from '../wakelock.js';
import { cadenceAvailable } from '../cadence.js';
import { KIND_LABEL, fmtAmount } from '../interval.js';
import { esc, fmtDuration, fmtKm, fmtPace, go, toast } from '../util.js';
import { goalText } from '../ui.js';

function title(s) {
  let t = s.type === 'interval' ? (s.preset?.name || '인터벌') : s.type === 'goal' ? `목표 · ${goalText(s.goal)}` : '자유 달리기';
  if (s.indoor) t += ' · 실내';
  return t;
}

function gpsText(s) {
  if (s.indoor) return '실내 모드';
  if (s.gpsError) return `⚠ ${s.gpsError}`;
  if (s.gpsAccuracy == null) return 'GPS 신호 찾는 중…';
  return `GPS ±${Math.round(s.gpsAccuracy)}m`;
}

function lapsTable(laps) {
  if (!laps.length) return '';
  return `
    <table class="table">
      <thead><tr><th>구간</th><th>거리</th><th>시간</th><th>페이스</th></tr></thead>
      <tbody>${laps.map((l) => `<tr><td>${l.index}</td><td>${fmtKm(l.distanceM)}</td><td>${fmtDuration(l.durationSec)}</td><td>${fmtPace(l.paceSec)}</td></tr>`).join('')}</tbody>
    </table>`;
}

export async function render(el) {
  const s = getSession();
  if (!s) {
    if (savedSessionData()) {
      go('#/');
      return;
    }
    el.innerHTML = '<div class="card"><p>진행 중인 러닝이 없습니다.</p><a class="btn" href="#/">홈으로</a></div>';
    return;
  }
  document.body.classList.add('live-mode');

  let shownStatus = null;
  let countdown = null;
  let map = null;
  let mapLine = null;
  let mapLineEdge = null;
  let mapDot = null;
  let mapVisible = false;
  let lastMapKey = '';

  const q = (sel) => el.querySelector(sel);
  const setText = (sel, text) => {
    const n = q(sel);
    if (n && n.textContent !== text) n.textContent = text;
  };

  // ---------- 준비 화면 ----------

  const drawReady = () => {
    el.innerHTML = `
      <div class="live ready">
        <div class="live-title">${esc(title(s))}</div>
        <div class="gps-status" id="gps"></div>
        ${s.indoor ? '' : '<div id="live-map" class="live-map"></div>'}
        <button class="btn primary huge" id="start">시작</button>
        <p class="muted small" id="gps-hint"></p>
        ${wakeLockSupported ? '' : '<p class="warn-text">이 브라우저는 화면 꺼짐 방지를 지원하지 않습니다. 러닝 중 화면이 꺼지면 기록이 멈추니, 아이폰 설정에서 자동 잠금을 "안 함"으로 바꿔 주세요.</p>'}
        <button class="btn" id="cancel">취소</button>
        <div class="countdown" id="countdown" hidden></div>
      </div>`;
    q('#start').onclick = () => {
      if (countdown) return;
      let n = 3;
      const box = q('#countdown');
      box.hidden = false;
      box.textContent = n;
      beep(660, 0.15);
      countdown = setInterval(() => {
        n--;
        if (n > 0) {
          box.textContent = n;
          beep(660, 0.15);
        } else {
          clearInterval(countdown);
          countdown = null;
          beep(1320, 0.4);
          s.start();
        }
      }, 1000);
    };
    q('#cancel').onclick = () => {
      clearSession();
      go('#/');
    };
    map?.remove();
    map = null;
    if (!s.indoor) initMap();
  };

  const updateReady = () => {
    setText('#gps', gpsText(s));
    const good = s.indoor || (s.gpsAccuracy != null && s.gpsAccuracy <= 20);
    q('#gps').className = `gps-status ${good ? 'good' : ''}`;
    setText('#gps-hint', s.indoor || good ? '' : 'GPS가 잡히기 전에 시작하면 처음 거리가 부정확할 수 있습니다. 하늘이 트인 곳에서 잠시 기다려 주세요.');
    updateMap();
  };

  // ---------- 달리는 중 ----------

  const drawRunning = () => {
    const paused = s.status === 'paused';
    el.innerHTML = `
      <div class="live ${paused ? 'paused' : ''}">
        <div class="live-top">
          <span class="live-title">${esc(title(s))}</span>
          <span class="gps-mini" id="gps"></span>
        </div>
        ${paused ? `<div class="paused-label">${s.autoPaused ? '자동 일시정지' : '일시정지됨'}</div>` : ''}
        ${s.steps.length ? '<div class="interval-box" id="ibox"><div class="i-kind" id="i-kind"></div><div class="i-remain" id="i-remain"></div><div class="i-sub" id="i-sub"></div></div>' : ''}
        ${s.goal ? '<div class="goal-box"><div class="progress"><div id="g-bar"></div></div><div class="i-sub" id="g-text"></div></div>' : ''}
        <div class="metric main"><div class="v" id="m-time">00:00</div><div class="l">시간</div></div>
        <div class="metrics">
          ${s.indoor ? '' : `
          <div class="metric"><div class="v" id="m-dist">0.00</div><div class="l">거리 km</div></div>
          <div class="metric"><div class="v" id="m-pace">-'--"</div><div class="l">현재 페이스</div></div>
          <div class="metric"><div class="v" id="m-avg">-'--"</div><div class="l">평균 페이스</div></div>`}
          <div class="metric" id="m-cad-box" hidden><div class="v" id="m-cad">--</div><div class="l">케이던스</div></div>
        </div>
        ${s.indoor ? '' : `<div id="live-map" class="live-map" ${mapVisible ? '' : 'hidden'}></div>`}
        <div class="controls">
          ${paused ? `
            <button class="btn primary huge" id="resume">재개</button>
            <button class="btn danger huge" id="finish">종료</button>
          ` : `
            <button class="btn round" id="lock">잠금</button>
            <button class="btn primary huge" id="pause">일시정지</button>
            ${s.indoor ? (s.steps.length ? '<button class="btn round" id="skip">건너뛰기</button>' : '<span class="round-spacer"></span>') : '<button class="btn round" id="map">지도</button>'}
          `}
        </div>
        ${!paused && !s.indoor && s.steps.length ? '<button class="btn small skip-link" id="skip">다음 구간으로 건너뛰기</button>' : ''}
        <div class="lock-screen" id="lockscreen" hidden>
          <div class="lock-time" id="l-time"></div>
          <div class="lock-dist" id="l-dist"></div>
          <div class="lock-step" id="l-cad"></div>
          <div class="lock-step" id="l-step"></div>
          <div class="lock-map-slot" id="l-map"></div>
          <div class="lock-hint">길게 눌러 잠금 해제</div>
          <div class="lock-bar"><div id="l-bar"></div></div>
        </div>
      </div>`;

    map?.remove();
    map = null;
    if (mapVisible && !s.indoor) initMap();

    q('#pause')?.addEventListener('click', () => s.pause(false));
    q('#resume')?.addEventListener('click', () => s.resume(false));
    q('#finish')?.addEventListener('click', () => {
      if (confirm('러닝을 종료할까요?')) s.finish();
    });
    el.querySelectorAll('#skip').forEach((b) => b.addEventListener('click', () => s.skipStep()));
    q('#map')?.addEventListener('click', () => {
      mapVisible = !mapVisible;
      q('#live-map').hidden = !mapVisible;
      if (mapVisible) initMap();
      else {
        map?.remove();
        map = null;
      }
    });
    q('#lock')?.addEventListener('click', () => setLocked(true));
    bindLock();
  };

  /** 잠금 화면을 켜고 끈다. 지도가 열려 있으면 잠금 화면 안으로 옮겨서 계속 보여 준다 */
  const setLocked = (locked) => {
    const ls = q('#lockscreen');
    const box = q('#live-map');
    if (!ls) return;
    ls.hidden = !locked;
    const withMap = locked && mapVisible && !!box;
    ls.classList.toggle('with-map', withMap);
    if (box) {
      if (withMap) q('#l-map').appendChild(box);
      else if (box.parentElement.id === 'l-map') q('.controls').before(box);
    }
    if (map) {
      setTimeout(() => {
        if (!map) return;
        map.invalidateSize();
        lastMapKey = '';
        updateMap();
      }, 50);
    }
  };

  const bindLock = () => {
    const ls = q('#lockscreen');
    if (!ls) return;
    let holdTimer = null;
    const bar = q('#l-bar');
    const reset = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
      bar.style.transition = 'none';
      bar.style.width = '0%';
    };
    ls.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      bar.style.transition = 'width 1.2s linear';
      bar.style.width = '100%';
      holdTimer = setTimeout(() => {
        setLocked(false);
        reset();
      }, 1200);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => ls.addEventListener(ev, reset));
    ls.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    ls.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  const initMap = () => {
    const box = q('#live-map');
    if (!window.L || !box || map) return;
    map = L.map(box, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapLineEdge = L.polyline([], { color: '#1a1c21', weight: 9, opacity: 0.85 }).addTo(map);
    mapLine = L.polyline([], { color: '#c8ff00', weight: 5 }).addTo(map);
    mapDot = L.circleMarker([0, 0], { radius: 7, color: '#fff', fillColor: '#3498db', fillOpacity: 1, weight: 2 });
    map.setView([37.5665, 126.978], 16);
    setTimeout(() => map && map.invalidateSize(), 50);
    lastMapKey = '';
    updateMap();
  };

  /** 지금까지의 경로(라임 선)와 현재 위치(파란 점)를 그린다 */
  const updateMap = () => {
    if (!map) return;
    const last = s.route[s.route.length - 1];
    const pos = s.lastPos || last;
    const key = `${s.route.length}:${pos ? `${pos.lat},${pos.lng}` : ''}`;
    if (key === lastMapKey) return;
    lastMapKey = key;
    if (s.route.length) {
      const pts = s.route.map((p) => [p.lat, p.lng]);
      mapLineEdge.setLatLngs(pts);
      mapLine.setLatLngs(pts);
    }
    if (!pos) return;
    mapDot.setLatLng([pos.lat, pos.lng]);
    if (!map.hasLayer(mapDot)) mapDot.addTo(map);
    map.setView([pos.lat, pos.lng], map.getZoom() || 16, { animate: false });
  };

  const updateRunning = () => {
    const t = fmtDuration(s.t);
    setText('#gps', gpsText(s));
    setText('#m-time', t);
    setText('#m-dist', fmtKm(s.distanceM));
    setText('#m-pace', fmtPace(s.currentPace));
    setText('#m-avg', fmtPace(s.avgPace));
    setText('#l-time', t);
    setText('#l-dist', s.indoor ? '' : `${fmtKm(s.distanceM)} km`);

    const cadOn = cadenceAvailable();
    const cad = s.cadence;
    const cadBox = q('#m-cad-box');
    if (cadBox && cadBox.hidden === cadOn) {
      cadBox.hidden = !cadOn;
      q('.metrics').classList.toggle('four', cadOn && !s.indoor);
      q('.metrics').classList.toggle('one', cadOn && s.indoor);
    }
    setText('#m-cad', cad ? String(cad) : '--');
    setText('#l-cad', cadOn && cad ? `케이던스 ${cad}` : '');

    if (s.steps.length) {
      const step = s.currentStep;
      const box = q('#ibox');
      if (step) {
        const rem = Math.max(0, s.stepRemaining);
        const remText = step.unit === 'time' ? fmtDuration(Math.ceil(rem)) : `${Math.ceil(rem)}m`;
        const next = s.steps[s.stepIdx + 1];
        const repText = step.rep ? `${step.rep} / ${s.preset.repeat}회` : '';
        const nextText = next ? `다음: ${KIND_LABEL[next.kind]} ${fmtAmount(next.unit, next.value)}` : '마지막 구간';
        setText('#i-kind', KIND_LABEL[step.kind] + (step.paceSec ? ` @${fmtPace(step.paceSec)}` : ''));
        setText('#i-remain', remText);
        setText('#i-sub', [repText, nextText].filter(Boolean).join(' · '));
        setText('#l-step', `${KIND_LABEL[step.kind]} ${remText}`);
        if (box) box.dataset.kind = step.kind;
      } else {
        setText('#i-kind', '인터벌 완료');
        setText('#i-remain', '✓');
        setText('#i-sub', '자유롭게 달리다가 종료하세요');
        setText('#l-step', '인터벌 완료');
        if (box) box.dataset.kind = 'done';
      }
    }
    if (s.goal) {
      const cur = s.goal.kind === 'distance' ? s.distanceM : s.t;
      const pct = Math.min(100, (cur / s.goal.value) * 100);
      const bar = q('#g-bar');
      if (bar) bar.style.width = `${pct}%`;
      const text = s.goal.kind === 'distance'
        ? `${fmtKm(s.distanceM)} / ${fmtKm(s.goal.value)} km`
        : `${fmtDuration(s.t)} / ${fmtDuration(s.goal.value)}`;
      setText('#g-text', `${s.goalDone ? '목표 달성! ' : ''}${text}${s.goal.paceSec ? ` · 목표 ${fmtPace(s.goal.paceSec)}` : ''}`);
    }
    updateMap();
  };

  // ---------- 종료 요약 ----------

  const drawFinished = () => {
    const run = s.toRun();
    el.innerHTML = `
      <h1>러닝 완료</h1>
      <div class="card">
        <div class="card-title">${esc(title(s))}</div>
        <div class="stat-grid">
          <div><b>${s.indoor ? '-' : fmtKm(run.distanceM)}</b><small>거리 km</small></div>
          <div><b>${fmtDuration(run.durationSec)}</b><small>시간</small></div>
          <div><b>${fmtPace(run.avgPaceSec)}</b><small>평균 페이스</small></div>
        </div>
        ${run.avgCadence ? `<p class="muted small">평균 케이던스 ${run.avgCadence} spm · ${run.stepCount.toLocaleString()}걸음</p>` : ''}
      </div>
      <div class="card form">
        ${s.indoor ? '<label>트레드밀 거리 (km)<input type="number" id="indoor-dist" inputmode="decimal" step="0.01" min="0" placeholder="예: 5.2"></label>' : ''}
        <label>메모<textarea id="memo" rows="2" placeholder="컨디션, 날씨 등"></textarea></label>
        <div class="row">
          <button class="btn primary big" id="save">저장</button>
          <button class="btn danger" id="discard">삭제</button>
        </div>
      </div>
      ${run.steps.length ? `<div class="card"><div class="card-title">인터벌 구간</div>
        <table class="table"><thead><tr><th>구간</th><th>거리</th><th>시간</th><th>페이스</th></tr></thead>
        <tbody>${run.steps.map((st) => `<tr class="k-${st.kind}"><td>${esc(st.label)}</td><td>${s.indoor ? '-' : `${st.distanceM}m`}</td><td>${fmtDuration(st.durationSec)}</td><td>${s.indoor || st.distanceM < 20 ? '-' : fmtPace(st.durationSec / (st.distanceM / 1000))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${run.laps.length ? `<div class="card"><div class="card-title">구간 기록</div>${lapsTable(run.laps)}</div>` : ''}
    `;
    q('#save').onclick = async () => {
      let distanceM;
      if (s.indoor) {
        const km = Number(q('#indoor-dist').value);
        if (!(km > 0) && !confirm('거리를 입력하지 않았습니다. 시간만 저장할까요?')) return;
        distanceM = km > 0 ? km * 1000 : 0;
      }
      const final = s.toRun({ distanceM, memo: q('#memo').value.trim(), weightKg: s.settings.weightKg });
      if (!s.indoor && final.distanceM < 100 && !confirm('기록이 너무 짧습니다 (100m 미만). 저장할까요?')) return;
      await saveRun(final);
      clearSession();
      toast('저장했습니다.');
      go(`#/run/${final.id}`);
    };
    q('#discard').onclick = () => {
      if (!confirm('이 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
      clearSession();
      go('#/');
    };
  };

  // ---------- 상태별 화면 전환 ----------

  const update = () => {
    const key = s.status === 'paused' ? `paused-${s.autoPaused}` : s.status;
    if (key !== shownStatus) {
      const wasLocked = q('#lockscreen') && !q('#lockscreen').hidden;
      shownStatus = key;
      if (s.status === 'ready') drawReady();
      else if (s.status === 'finished') {
        document.body.classList.remove('live-mode');
        drawFinished();
      } else {
        drawRunning();
        if (wasLocked && (s.status === 'running' || s.autoPaused)) setLocked(true);
      }
    }
    if (s.status === 'ready') updateReady();
    else if (s.status !== 'finished') updateRunning();
  };

  const unsubscribe = s.onChange(update);
  update();

  return () => {
    unsubscribe();
    clearInterval(countdown);
    map?.remove();
    document.body.classList.remove('live-mode');
  };
}
