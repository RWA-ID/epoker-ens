'use client';
/**
 * Synthesized sound effects (WebAudio) — no audio assets to ship over
 * IPFS. Each effect is a tiny envelope-shaped oscillator/noise burst.
 * Toggle state persists in localStorage.
 */

let ctx: AudioContext | null = null;
const MUTE_KEY = 'epoker:muted';

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
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
