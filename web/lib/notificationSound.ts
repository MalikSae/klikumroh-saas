/**
 * Utility to play notification sound in Next.js Agent Dashboard.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function initAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    try {
      const a = new Audio('/notification-chime.wav');
      a.volume = 0.01;
      a.play()
        .then(() => a.pause())
        .catch(() => {});
    } catch {}

    window.removeEventListener('click', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  window.addEventListener('click', unlock, { capture: true, once: true });
  window.addEventListener('touchstart', unlock, { capture: true, once: true });
  window.addEventListener('keydown', unlock, { capture: true, once: true });

  return () => {
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
}

export function playNotificationSound(): void {
  try {
    const audio = new Audio('/notification-chime.wav');
    audio.volume = 0.85;
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch(() => {
        playWebAudioChime();
      });
    }
  } catch {
    playWebAudioChime();
  }
}

function playWebAudioChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => renderChime(ctx))
        .catch(() => {});
    } else {
      renderChime(ctx);
    }
  } catch (err) {
    console.warn('[NotificationSound] Audio failed:', err);
  }
}

function renderChime(ctx: AudioContext): void {
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.85, now);
  masterGain.connect(ctx.destination);

  // Tone 1: D5 (587.33 Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now);

  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.6, now + 0.015);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  osc1.connect(gain1);
  gain1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + 0.3);

  // Tone 2: A5 (880 Hz)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880, now + 0.08);

  gain2.gain.setValueAtTime(0, now + 0.08);
  gain2.gain.linearRampToValueAtTime(0.75, now + 0.095);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.65);
}
