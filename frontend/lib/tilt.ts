'use client';
/**
 * Tilt mode — the table page on a phone held sideways.
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
 * Best effort: go full screen and lock landscape. Works on Android Chrome;
 * iPhone Safari supports neither, so there the player just turns the phone.
 */
export async function enterTiltMode(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: 'landscape') => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    /* unsupported — rotating by hand still triggers tilt mode */
  }
}

export function canForceTilt(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenEnabled;
}
