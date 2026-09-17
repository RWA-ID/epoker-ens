'use client';
/**
 * Full-screen table ("tilt mode").
 *
 * Tilt mode used to switch on only from a media query — a phone held sideways
 * with a short viewport. That never fires inside most wallet in-app browsers,
 * which lock the page to portrait, so there is now an explicit Full screen
 * button. Inside it, "Rotate" turns the table 90° with CSS so a portrait-
 * locked browser still gets a landscape table.
 */
import { useEffect, useState } from 'react';

export { TILT_QUERY, PORTRAIT_PHONE_QUERY } from './tilt-query';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * Best effort: native full screen hides the browser chrome where it's
 * supported (Android, desktop). iPhone Safari and most in-app browsers refuse
 * — the fixed full-viewport layer still works there.
 */
export async function requestNativeFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenEnabled || document.fullscreenElement) return !!document.fullscreenElement;
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export async function exitNativeFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* already out */
  }
}

const ROTATE_KEY = 'epoker:rotate';

/** 0 = upright, 90 = turned clockwise, 270 = anticlockwise. */
export type Rotation = 0 | 90 | 270;

export function readRotatePref(): Rotation {
  try {
    const v = Number(localStorage.getItem(ROTATE_KEY));
    return v === 90 || v === 270 ? v : 0;
  } catch {
    return 0;
  }
}

export function writeRotatePref(r: Rotation) {
  try { localStorage.setItem(ROTATE_KEY, String(r)); } catch { /* private mode */ }
}

/** Cycle upright → clockwise → anticlockwise, so either way of holding works. */
export function nextRotation(r: Rotation): Rotation {
  return r === 0 ? 90 : r === 90 ? 270 : 0;
}
