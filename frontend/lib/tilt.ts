'use client';
/**
 * Full-screen table ("tilt mode").
 *
 * Tilt mode used to switch on only from a media query — a phone held sideways
 * with a short viewport. That never fires inside most wallet in-app browsers,
 * which lock the page to portrait, so there is now an explicit Full screen
 * button. Inside it, "Rotate" turns the table 90° with CSS so a portrait-
 * locked browser still gets a landscape table. Entering full screen in a
 * wallet browser also suggests reopening the table in Safari or Chrome.
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

/**
 * Android Chrome can pin a full-screen page to landscape — the real thing, no
 * CSS rotation needed. Only allowed while in native full screen, and iOS has
 * no such API, so false means "fall back to Rotate".
 */
export async function lockLandscape(): Promise<boolean> {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (!o?.lock) return false;
    await o.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation() {
  try { screen.orientation?.unlock?.(); } catch { /* not locked */ }
}

export async function exitNativeFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* already out */
  }
}

/**
 * A wallet's in-app browser on a phone. These lock the page upright, so tilt
 * mode can't happen there, and the wallet's own toolbar uses up screen space
 * even after Rotate. The UA tokens catch the wallets that announce themselves;
 * an injected provider on a touch device catches the rest, because mobile
 * Safari and Chrome don't inject one. Brave mobile does inject one, but it's a
 * real browser that turns sideways, so it's left out.
 */
export function isWalletBrowser(): boolean {
  try {
    const ua = navigator.userAgent;
    if (/MetaMaskMobile|CoinbaseWallet|Trust\/|Rainbow|Phantom|OKApp|Rabby|TokenPocket|imToken|Bitget|BitKeep|Zerion/i.test(ua)) return true;
    const w = window as unknown as { ethereum?: unknown; phantom?: unknown };
    const brave = !!(navigator as Navigator & { brave?: unknown }).brave;
    return matchMedia('(pointer: coarse)').matches && !brave && !!(w.ethereum || w.phantom);
  } catch {
    return false;
  }
}

/** The browser to suggest instead: what the phone ships with. */
export function nativeBrowserName(): 'Safari' | 'Chrome' {
  try {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Safari' : 'Chrome';
  } catch {
    return 'Chrome';
  }
}

const BROWSER_HINT_KEY = 'epoker:browser-hint-off';

export function readBrowserHintOff(): boolean {
  try { return localStorage.getItem(BROWSER_HINT_KEY) === '1'; } catch { return false; }
}

export function writeBrowserHintOff() {
  try { localStorage.setItem(BROWSER_HINT_KEY, '1'); } catch { /* private mode */ }
}

const ROTATE_KEY = 'epoker:rotate';

/** 0 = upright, 90 = turned clockwise, 270 = anticlockwise. */
export type Rotation = 0 | 90 | 270;

/** The player's last choice, or null if they never pressed Rotate. */
export function readRotatePref(): Rotation | null {
  try {
    const raw = localStorage.getItem(ROTATE_KEY);
    if (raw === null) return null;
    const v = Number(raw);
    return v === 90 || v === 270 ? v : 0;
  } catch {
    return null;
  }
}

export function writeRotatePref(r: Rotation) {
  try { localStorage.setItem(ROTATE_KEY, String(r)); } catch { /* private mode */ }
}

/** Cycle upright → clockwise → anticlockwise, so either way of holding works. */
export function nextRotation(r: Rotation): Rotation {
  return r === 0 ? 90 : r === 90 ? 270 : 0;
}
