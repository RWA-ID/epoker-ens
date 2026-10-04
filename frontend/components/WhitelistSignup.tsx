'use client';
/**
 * House Pass whitelist sign-up: a live counter, a waitlist and a three-field
 * form — X handle (or repost link), wallet, Turnstile.
 *
 * v2 (2026-10-04): no wallet connection. v1 had people sign in with a wallet,
 * which a script beat by signing up 1,999 fresh wallets in 12 minutes. Now the
 * X handle is what's limited — one per handle, one per wallet — and the
 * snapshot keeps only handles that reposted the pinned post. A connected
 * wallet still pre-fills the address field; it just isn't required.
 *
 * Everything that matters is decided by the worker (worker/src/whitelist.ts):
 * parsing, the one-per rules, the 3,333 sign-up limit (2,222 spots + 1,111
 * waitlist) inside the INSERT, and Turnstile. This component only reports.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type WhitelistJoin, type WhitelistStatus } from '@/lib/api';
import { TURNSTILE_SITE_KEY, WHITELIST_POST_URL } from '@/lib/config';
import { useIdentity } from '@/lib/identity';
import { Button } from '@/components/ui/button';

const REFUSED: Record<Extract<WhitelistJoin, { ok: false }>['reason'], string> = {
  full: 'The whitelist and its waitlist are both full.',
  closed: 'Whitelist sign-ups are closed.',
  'handle-taken': 'That X handle is already signed up with a different wallet. One spot per person.',
};

/** The wallet this browser last signed up, so a revisit shows its place. */
const SAVED_KEY = 'hoodpoker.whitelist.wallet';

const n = (x: number) => x.toLocaleString('en-US');

/** What a joined wallet is told about where it stands. */
function standing(position: number, cap: number): string {
  return position <= cap
    ? `You’re #${n(position)} — inside the ${n(cap)} spots.`
    : `You’re #${n(position)} — waitlist #${n(position - cap)}. Spots open up as CCFF00 holders picked for stage 1 are taken off the list.`;
}

// window.turnstile is already typed globally (it arrives with the wallet stack's deps).

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Loads Turnstile once and renders it into `ref`; the token lands in state. */
function useTurnstile(ref: React.RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState<string | null>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (t: string) => setToken(t),
        'expired-callback': () => setToken(null),
        'error-callback': () => setToken(null),
      }) ?? null;
    };
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
      if (!script) {
        script = document.createElement('script');
        script.src = TURNSTILE_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
    }
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [ref]);

  /** A token is single-use: reset after every submit, pass or fail. */
  const reset = () => {
    setToken(null);
    if (widget.current) window.turnstile?.reset(widget.current);
  };
  return { token, reset };
}

const INPUT =
  // 16px on touch screens: iOS zooms the page into any smaller input.
  'w-full rounded-btn border border-cream/[0.16] bg-night-950 px-3.5 py-2.5 font-mono text-[16px] text-cream outline-none transition-colors placeholder:text-ghost focus:border-acid md:text-sm';

export function WhitelistSignup() {
  const { address: connected } = useIdentity();
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState('');
  const [wallet, setWallet] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'muted'; text: string } | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { token, reset } = useTurnstile(turnstileRef);

  useEffect(() => {
    try { setSaved(localStorage.getItem(SAVED_KEY)); } catch { /* private mode */ }
  }, []);
  // A connected wallet pre-fills the field once, never over what they typed.
  useEffect(() => {
    if (connected) setWallet((w) => w || connected);
  }, [connected]);

  const watched = saved ?? undefined;
  const { data, isError } = useQuery({
    queryKey: ['whitelist', watched ?? null],
    queryFn: () => api.whitelist(watched),
    refetchInterval: 30000,
  });

  const count = data?.count ?? 0;
  const cap = data?.cap ?? 2222;
  const waitlist = data?.waitlist ?? 1111;
  const spotsTaken = Math.min(count, cap);
  const waitlisted = Math.max(0, count - cap);
  const full = count >= cap + waitlist;
  const closed = !!data && !data.open;
  const joined = data?.joined === true;
  const pct = Math.min(100, (spotsTaken / cap) * 100);

  const join = async () => {
    setJoining(true);
    setMessage(null);
    try {
      const res = await api.joinWhitelist({ address: wallet, handle, turnstile: token ?? '' });
      if (res.ok) {
        const lead = res.already ? 'This wallet is already signed up.' : 'You’re signed up.';
        const holder = res.holdsCcff00
          ? ' This wallet holds CCFF00: if it’s among the 3,333 longest holders at the snapshot, it mints in the CCFF00 stage and this spot passes down the list.'
          : '';
        setMessage({ tone: 'good', text: `${lead} ${standing(res.position, res.cap)}${holder}` });
        const w = wallet.trim().toLowerCase();
        try { localStorage.setItem(SAVED_KEY, w); } catch { /* private mode */ }
        setSaved(w);
        queryClient.setQueryData<WhitelistStatus>(['whitelist', w], {
          count: res.count, cap: res.cap, waitlist: res.waitlist, open: data?.open ?? true,
          joined: true, position: res.position,
        });
      } else {
        setMessage({ tone: 'muted', text: REFUSED[res.reason] });
      }
    } catch (err) {
      setMessage({ tone: 'muted', text: err instanceof Error ? err.message : 'Sign-up failed' });
    } finally {
      reset();
      setJoining(false);
    }
  };

  let label = count >= cap ? 'Join the waitlist' : 'Join the whitelist';
  if (joining) label = 'Signing up…';
  else if (full) label = 'Whitelist full';
  else if (closed) label = 'Sign-ups closed';
  else if (!token) label = 'Waiting for the human check…';

  const canSubmit = !joining && !full && !closed && !!token && handle.trim() !== '' && wallet.trim() !== '';

  return (
    <div className="mt-4 rounded-card border border-cream/10 bg-night-900 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Whitelist</p>
        <p className="font-mono text-[12px] tabular-nums text-cream" aria-live="polite">
          {data ? (
            <>
              <span className="text-acid">{n(spotsTaken)}</span>
              <span className="text-muted"> / {n(cap)} spots taken</span>
              {waitlisted > 0 && <span className="text-muted"> · {n(waitlisted)} waiting</span>}
            </>
          ) : isError ? (
            <span className="text-muted">count unavailable</span>
          ) : (
            <span className="text-muted">loading…</span>
          )}
        </p>
      </div>

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-cream/10"
        role="progressbar"
        aria-label="Whitelist spots taken"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={spotsTaken}
      >
        <div className="h-full rounded-full bg-acid transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[14px] leading-[1.5] text-muted">
        <li>
          Repost{' '}
          <a href={WHITELIST_POST_URL} target="_blank" rel="noopener noreferrer" className="text-cream underline">
            our pinned post on X
          </a>
          , and tag 2 friends.
        </li>
        <li>Paste your X handle (or your repost link) and the wallet to mint with.</li>
      </ol>
      <p className="mt-2 text-[13px] leading-[1.5] text-faint">
        {n(cap)} free mints, one per person, plus a {n(waitlist)} waitlist. Reposts are checked at the
        snapshot, so a handle that didn&rsquo;t repost is dropped then. No wallet connection needed.
      </p>

      {joined && data?.position && !message && (
        <p className="mt-3 text-[14px] leading-[1.5] text-acid" role="status">
          {standing(data.position, cap)}
        </p>
      )}

      <form
        className="mt-3.5 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) join();
        }}
      >
        <label htmlFor="wl-handle" className="sr-only">X handle or repost link</label>
        <input
          id="wl-handle"
          value={handle}
          onChange={(e) => { setHandle(e.target.value); setMessage(null); }}
          placeholder="@yourhandle or your repost link"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={INPUT}
        />
        <label htmlFor="wl-wallet" className="sr-only">Wallet address</label>
        <input
          id="wl-wallet"
          value={wallet}
          onChange={(e) => { setWallet(e.target.value); setMessage(null); }}
          placeholder="0x… wallet to mint with"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={INPUT}
        />
        <div ref={turnstileRef} className="min-h-[65px]" />
        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {label}
        </Button>
      </form>

      {message && (
        <p
          className={message.tone === 'good' ? 'mt-3 text-[14px] leading-[1.5] text-acid' : 'mt-3 text-[14px] leading-[1.5] text-muted'}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
