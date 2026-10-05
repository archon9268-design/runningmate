let ctx = null;
let settings = { voice: true, beep: true };
let koVoice = null;

export function setAudioSettings(s) {
  settings = s;
}

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  koVoice = voices.find((v) => v.lang === 'ko-KR') || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ko')) || null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

/** iOS는 사용자가 버튼을 누른 순간에 한 번 소리를 내야 이후 음성/신호음이 나온다. 반드시 클릭 핸들러 안에서 호출한다. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !ctx) ctx = new AC();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (ctx) {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch { /* 오디오 미지원 */ }
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

export function beep(freq = 880, duration = 0.15, volume = 0.35) {
  if (!ctx || !settings.beep) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duration);
  } catch { /* 무시 */ }
}

export function speak(text, { force = false, interrupt = false } = {}) {
  if (!('speechSynthesis' in window)) return;
  if (!force && !settings.voice) return;
  if (!koVoice) pickVoice();
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}
