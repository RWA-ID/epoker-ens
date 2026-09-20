'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The HoodFi Names widget, embedded as a partner.
 *
 * Served from /hoodfi-widget.js rather than unpkg, which is the whole reason this file
 * exists instead of a one-line script tag. `script-src` here is `'self'` plus inline, and
 * opening it to a CDN would let a compromised npm package execute in the origin that holds
 * Privy passkeys and wallet sessions. A pinned local copy costs 16 KB and keeps the policy
 * untouched. The tradeoff is that the copy goes stale — re-copy it from hoodfi-eth/widget
 * when the package updates, which for a site pinned to IPFS is a re-pin anyway.
 *
 * `fonts: false` for the same reason: the widget otherwise @imports Archivo and Plex Mono
 * from Google, and `style-src`/`font-src` would both need opening. It falls back to the
 * system stack, which reads fine against this site's own type.
 *
 * `accent` is the acid from tailwind.config.ts. The widget derives its own contrast from
 * it — text on the accent is picked by luminance, and the accent used as text is walked
 * until it clears 4.5:1 — so passing the brand colour is all it needs.
 */
const PARTNER = '0x5f11a48230f7CdaB91A2361576239091E4b1165b';
const ACCENT = '#ccff00';

type WidgetApi = { mount: (el: Element, opts: Record<string, unknown>) => void };

export function HoodfiWidget() {
  const slot = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function mount() {
      const api = (window as unknown as { HoodFiWidget?: WidgetApi }).HoodFiWidget;
      if (cancelled || !api || !slot.current) return;
      slot.current.replaceChildren();
      try {
        api.mount(slot.current, {
          partner: PARTNER,
          accent: ACCENT,
          theme: 'dark',
          price: '$4.00',
          fonts: false,
        });
      } catch {
        setFailed(true);
      }
    }

    if ((window as unknown as { HoodFiWidget?: WidgetApi }).HoodFiWidget) {
      mount();
      return;
    }

    const existing = document.getElementById('hoodfi-widget');
    if (existing) {
      existing.addEventListener('load', mount);
      return () => existing.removeEventListener('load', mount);
    }

    const s = document.createElement('script');
    s.id = 'hoodfi-widget';
    s.src = '/hoodfi-widget.js';
    s.onload = mount;
    s.onerror = () => setFailed(true);
    document.head.appendChild(s);

    return () => {
      cancelled = true;
    };
  }, []);

  // A dead slot would leave a headed section with nothing under it. Say so instead.
  if (failed) {
    return (
      <p className="text-[15px] leading-[1.6] text-muted">
        The name widget could not load.{' '}
        <a href="https://www.hoodfi.name/mint/" target="_blank" rel="noreferrer">
          Register at hoodfi.name
        </a>{' '}
        instead.
      </p>
    );
  }

  return <div ref={slot} />;
}
