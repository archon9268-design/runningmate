let lock = null;
let wanted = false;

export const wakeLockSupported = 'wakeLock' in navigator;

async function acquire() {
  if (!wakeLockSupported || lock) return !!lock;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
    return true;
  } catch {
    return false;
  }
}

export async function keepAwake(on) {
  wanted = on;
  if (on) return acquire();
  try { await lock?.release(); } catch { /* 이미 해제됨 */ }
  lock = null;
  return false;
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});
