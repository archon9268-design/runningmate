import { getSettings, saveSettings, exportAll, importAll, wipeAll } from '../db.js';
import { setAudioSettings, speak, unlockAudio, beep } from '../audio.js';
import { toast, dateKey } from '../util.js';
import { wakeLockSupported } from '../wakelock.js';

const ANNOUNCE_OPTIONS = [
  ['d500', '0.5km마다'],
  ['d1000', '1km마다'],
  ['d2000', '2km마다'],
  ['t300', '5분마다'],
  ['t600', '10분마다'],
];

const ITEMS = [
  ['distance', '거리'],
  ['time', '시간'],
  ['lapPace', '구간 페이스'],
  ['avgPace', '평균 페이스'],
];

export async function render(el) {
  const s = await getSettings();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  el.innerHTML = `
    <h1>설정</h1>
    <div class="card form">
      <div class="card-title">음성 코칭</div>
      <label class="switch-row"><span>음성 안내</span><input type="checkbox" id="voice" ${s.voice ? 'checked' : ''}></label>
      <label>안내 주기
        <select id="announce">${ANNOUNCE_OPTIONS.map(([k, v]) => `<option value="${k}" ${s.announce === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <div class="checks">
        ${ITEMS.map(([k, v]) => `<label class="check"><input type="checkbox" data-item="${k}" ${s.items[k] ? 'checked' : ''}> ${v}</label>`).join('')}
      </div>
      <label class="switch-row"><span>신호음 (인터벌 전환, 카운트다운)</span><input type="checkbox" id="beep" ${s.beep ? 'checked' : ''}></label>
      <button class="btn" id="test">안내 음성 테스트</button>
    </div>

    <div class="card form">
      <div class="card-title">러닝</div>
      <label class="switch-row"><span>자동 일시정지 (멈추면 일시정지)</span><input type="checkbox" id="autopause" ${s.autoPause ? 'checked' : ''}></label>
      <label>체중 (kg, 칼로리 계산용)<input type="number" id="weight" inputmode="decimal" min="20" max="200" value="${s.weightKg ?? ''}"></label>
    </div>

    <div class="card form">
      <div class="card-title">데이터</div>
      <p class="muted small">기록은 이 기기 안에만 저장됩니다. 다른 기기로 옮기거나 백업하려면 내보내기를 사용하세요.</p>
      <div class="row">
        <button class="btn" id="export">내보내기 (JSON)</button>
        <label class="btn file">가져오기<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
      <button class="btn danger" id="wipe">모든 데이터 삭제</button>
    </div>

    <div class="card">
      <div class="card-title">앱 정보</div>
      <ul class="info">
        <li>홈 화면 설치: ${standalone ? '설치됨 ✓' : '<b>설치 안 됨</b> — 아이폰은 Safari 공유 버튼 → "홈 화면에 추가"'}</li>
        <li>데이터 보존 모드: ${persisted === null ? '알 수 없음' : persisted ? '켜짐 ✓' : '꺼짐 (브라우저가 공간 부족 시 지울 수 있음)'}</li>
        <li>화면 꺼짐 방지: ${wakeLockSupported ? '지원 ✓' : '<b>미지원</b> — 러닝 중 자동 잠금을 꺼 주세요'}</li>
        <li>버전: v1.0</li>
      </ul>
    </div>
  `;

  const save = async () => {
    await saveSettings(s);
    setAudioSettings(s);
  };
  const bindCheck = (id, key) => {
    el.querySelector(id).onchange = (e) => { s[key] = e.target.checked; save(); };
  };
  bindCheck('#voice', 'voice');
  bindCheck('#beep', 'beep');
  bindCheck('#autopause', 'autoPause');
  el.querySelector('#announce').onchange = (e) => { s.announce = e.target.value; save(); };
  el.querySelectorAll('[data-item]').forEach((c) => {
    c.onchange = () => { s.items[c.dataset.item] = c.checked; save(); };
  });
  el.querySelector('#weight').onchange = (e) => { s.weightKg = Number(e.target.value) || null; save(); };

  el.querySelector('#test').onclick = () => {
    unlockAudio();
    setAudioSettings(s);
    beep(1320, 0.3);
    speak('1킬로미터. 시간 6분 12초. 구간 페이스 6분 12초', { force: true, interrupt: true });
  };

  el.querySelector('#export').onclick = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `runningmate-${dateKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`러닝 ${data.runs.length}건을 내보냈습니다.`);
  };

  el.querySelector('#import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const includeConfig = confirm('계획, 목표, 설정도 파일 내용으로 덮어쓸까요?\n(취소를 누르면 기록과 인터벌 프리셋만 합칩니다)');
      const added = await importAll(data, includeConfig);
      toast(`새 기록 ${added}건을 가져왔습니다.`);
      render(el);
    } catch (err) {
      alert(`가져오기 실패: ${err.message}`);
    }
  };

  el.querySelector('#wipe').onclick = async () => {
    if (!confirm('모든 기록, 계획, 설정을 삭제할까요? 되돌릴 수 없습니다.')) return;
    if (!confirm('정말 삭제할까요? 먼저 내보내기로 백업하는 것을 권장합니다.')) return;
    await wipeAll();
    toast('모든 데이터를 삭제했습니다.');
    render(el);
  };
}
