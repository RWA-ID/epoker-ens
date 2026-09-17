'use client';
/**
 * Synthesized sound effects (WebAudio) — no audio assets to ship over
 * IPFS. Each effect is a tiny envelope-shaped oscillator/noise burst.
 * Toggle state persists in localStorage.
 *
 * Mobile is why this file is fussy. Sounds are triggered by WebSocket
 * messages, and on iOS/Android an AudioContext created or resumed outside a
 * user gesture stays `suspended` forever — so the table was silent on phones.
 * The fix is to unlock the context inside the first tap, and again after the
 * page comes back from the background (iOS parks it as `interrupted`). iOS
 * also routes WebAudio through the ringer switch unless the audio session is
 * declared as playback.
 */

let ctx: AudioContext | null = null;
const MUTE_KEY = 'epoker:muted';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => { /* needs a gesture */ });
  return ctx;
}

/** Call from inside a user gesture: resume and play one silent sample. */
export function unlockAudio() {
  const nav = navigator as AudioSessionNavigator;
  // Safari 16.4+: play through the ringer switch like a media app would.
  try { if (nav.audioSession) nav.audioSession.type = 'playback'; } catch { /* unsupported */ }
  const ac = audio();
  if (!ac) return;
  try {
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, ac.sampleRate);
    src.connect(ac.destination);
    src.start(0);
  } catch { /* nothing to unlock */ }
}

let unlockInstalled = false;
/**
 * Unlock on every tap until the context is running — a single `once`
 * listener isn't enough, because iOS suspends it again after backgrounding.
 */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const onGesture = () => { if (!ctx || ctx.state !== 'running') unlockAudio(); };
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

export function isMuted(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

function tone(freq: number, dur: number, type: OscillatorType, gainPeak = 0.12, delay = 0) {
  const ac = audio();
  if (!ac || isMuted()) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Short filtered-noise click — card hitting felt. */
function click(dur = 0.06, gainPeak = 0.2) {
  const ac = audio();
  if (!ac || isMuted()) return;
  const t0 = ac.currentTime;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  const gain = ac.createGain();
  gain.gain.value = gainPeak;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
}

export const sfx = {
  deal: () => click(0.05, 0.18),
  chips: () => { tone(880, 0.05, 'square', 0.06); tone(1320, 0.05, 'square', 0.05, 0.05); },
  check: () => click(0.04, 0.1),
  fold: () => tone(180, 0.15, 'sine', 0.1),
  yourTurn: () => { tone(660, 0.12, 'sine', 0.12); tone(990, 0.15, 'sine', 0.1, 0.12); },
  win: () => { tone(523, 0.12, 'triangle', 0.12); tone(659, 0.12, 'triangle', 0.12, 0.11); tone(784, 0.25, 'triangle', 0.14, 0.22); },
  allin: () => { tone(440, 0.1, 'sawtooth', 0.08); tone(220, 0.25, 'sawtooth', 0.08, 0.08); },
};
