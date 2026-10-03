'use client';
/**
 * The boombox's player: one <audio> element for the whole page.
 *
 * It lives at module level, not in a component, because the table renders
 * the boombox in a different place depending on the layout (docked column,
 * felt popover, full screen), and toggling full screen remounts it. A player
 * owned by the component would cut the song off every time.
 *
 * Tracks are self-hosted from public/music/ (see scripts/fetch-music.mjs):
 * Kevin MacLeod, CC BY 4.0, credited on screen while they play. The order is
 * shuffled once per page load so a table full of players isn't all hearing
 * the same opener.
 */
import { useSyncExternalStore } from 'react';
import playlist from './playlist.json';

export interface Track {
  slug: string;
  title: string;
  file: string;
  seconds: number;
}

export const TRACKS = playlist as Track[];

export const MUSIC_CREDIT = 'Kevin MacLeod (incompetech.com)';
export const MUSIC_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

export interface MusicState {
  playing: boolean;
  /** The current track, or null before anything has been picked. */
  track: Track | null;
  /** 1-based position in this page load's shuffled order. */
  position: number;
  volume: number;
  /** False on iOS, where `audio.volume` is read-only and only the hardware buttons work. */
  volumeWorks: boolean;
}

const VOLUME_KEY = 'hoodpoker:music-volume';
const DEFAULT_VOLUME = 0.5;

const SERVER_STATE: MusicState = {
  playing: false,
  track: null,
  position: 0,
  volume: DEFAULT_VOLUME,
  volumeWorks: true,
};

let state: MusicState = SERVER_STATE;
let audio: HTMLAudioElement | null = null;
let order: number[] = [];
let cursor = 0;
/** Tracks failed back to back. Stops an all-404 deploy skipping forever. */
let failures = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<MusicState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function player(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  const volume = readVolume();
  audio.volume = volume;
  // iOS ignores the write and keeps reporting 1.
  const volumeWorks = Math.abs(audio.volume - volume) < 0.01;
  order = shuffled(TRACKS.length);
  audio.addEventListener('play', () => set({ playing: true }));
  audio.addEventListener('pause', () => set({ playing: false }));
  audio.addEventListener('playing', () => { failures = 0; });
  audio.addEventListener('ended', () => next(true));
  audio.addEventListener('error', () => {
    if (++failures < 3) next(true);
    else set({ playing: false });
  });
  set({ volume, volumeWorks });
  return audio;
}

function load(at: number) {
  const a = player();
  cursor = ((at % order.length) + order.length) % order.length;
  const track = TRACKS[order[cursor]];
  a.src = `/music/${track.slug}.mp3`;
  set({ track, position: cursor + 1 });
}

function start() {
  // Called from a click, so autoplay rules allow it. A rejection here is the
  // browser refusing anyway (or a pause racing the load); the 'pause' and
  // 'error' listeners already keep the state honest.
  player().play().catch(() => {});
}

export function togglePlay() {
  const a = player();
  if (!a.paused) {
    a.pause();
    return;
  }
  if (!state.track) load(0);
  start();
}

/**
 * Skip to the next track. From the button it keeps playing if it was, and
 * otherwise only cues the track up. At the end of a song (`autoplay`) it
 * always rolls on.
 */
export function next(autoplay = false) {
  const wasPlaying = audio !== null && !audio.paused;
  load(cursor + 1);
  if (autoplay || wasPlaying) start();
}

export function setVolume(v: number) {
  const volume = Math.min(1, Math.max(0, v));
  player().volume = volume;
  set({ volume });
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    /* private mode: it just won't be remembered */
  }
}

/** Leaving the table stops the music. */
export function stopMusic() {
  audio?.pause();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMusic(): MusicState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}
