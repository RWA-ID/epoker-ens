'use client';
/**
 * HoodPoker landing + lobby.
 *
 * Recreated from the Claude Design handoff
 * (design_handoff_hoodpoker_landing). The prototype's mock arrays are
 * replaced with the real worker API: tables come from `api.listTables()` and
 * the season board from `api.leaderboard()`.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEnsAddress } from '@wagmi/core';
import { isAddress } from 'viem';
import { normalize } from 'viem/ens';
import { useConnect, useWallet } from '@/lib/wallet';
import { api } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useIdentity } from '@/lib/identity';
import { wagmiConfig } from '@/lib/appkit';
import type { WhitelistEntry, LobbyTable } from '@/lib/types';
import { SITE_URL } from '@/lib/seo';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Ticker } from '@/components/Ticker';
import { Faq } from '@/components/Faq';
import { HoodfiWidget } from '@/components/HoodfiWidget';

const CHAIN_NAME = 'Robinhood Chain';

const TABLE_NAME_IDEAS = [
  'Hood Degens',
  'Green Candle Club',
  'Paper Hands Only',
  'Diamond Hands',
  'Meme Stonk Lounge',
  'Midnight Margin Call',
  'Late Reg',
  'The Nut Flush',
];

const BLIND_FILTERS = ['All', '5/10', '10/20', '25/50', '50/100'] as const;

const HOW_STEPS = [
  {
    n: '1',
    title: 'Connect',
    body: 'Sign in with your wallet and your HoodFi name becomes your table handle, checked against Robinhood Chain. 10,000 virtual chips to start. No deposit, ever.',
  },
  {
    n: '2',
    title: 'Sit down',
    body: 'Join an open table or open your own — public for the lobby, private with an invite-only guest list for your group chat.',
  },
  {
    n: '3',
    title: 'Run it up',
    body: "Full Texas Hold'em with side pots, 30-second action timers and table chat. Win hands, climb the season board.",
  },
];

const HERO_STATS = [
  { value: '10,000', label: 'Free starting chips' },
  { value: '8', label: 'Seats per table' },
  { value: '0', label: 'Tokens to hold' },
  { value: '24/7', label: 'Tables running' },
];

function openOnX(text: string, url: string) {
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    '_blank',
    'noopener',
  );
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-acid">{children}</p>
  );
}

export default function HomePage() {
  const router = useRouter();
  const open = useConnect();
  const { address, isConnected, isRestoring } = useIdentity();
  const { signMessage } = useWallet();

  const [stake, setStake] = useState<string>('All');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [tableName, setTableName] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [guestInput, setGuestInput] = useState('');
  const [guests, setGuests] = useState<WhitelistEntry[]>([]);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [resolvingGuest, setResolvingGuest] = useState(false);
  const [copied, setCopied] = useState(false);

  const startIdea = useMemo(() => Math.floor(Math.random() * TABLE_NAME_IDEAS.length), []);
  const [ideaIdx, setIdeaIdx] = useState(startIdea);
  const suggestion = TABLE_NAME_IDEAS[ideaIdx % TABLE_NAME_IDEAS.length];

  const { data, isLoading, error } = useQuery({
    queryKey: ['tables'],
    queryFn: api.listTables,
    refetchInterval: 5000,
  });

  const { data: board } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: api.leaderboard,
    refetchInterval: 30000,
  });

  const tables = data?.tables ?? [];
  const filtered = useMemo(
    () =>
      stake === 'All'
        ? tables
        : tables.filter((t) => `${t.smallBlind}/${t.smallBlind * 2}` === stake),
    [tables, stake],
  );

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const addGuest = async () => {
    const input = guestInput.trim().toLowerCase();
    if (!input) return;
    setGuestError(null);
    setResolvingGuest(true);
    try {
      let entry: WhitelistEntry;
      if (isAddress(input)) {
        entry = { address: input, handle: null };
      } else {
        const name = input.includes('.') ? input : `${input}.eth`;
        // Mainnet resolution also covers hoodfi.eth subnames: the L1 resolver
        // answers them over CCIP, so `gm.hoodfi.eth` resolves here too.
        const resolved = await getEnsAddress(wagmiConfig, { name: normalize(name), chainId: 1 });
        if (!resolved) throw new Error(`Couldn’t resolve “${name}” — check the spelling.`);
        entry = { address: resolved.toLowerCase(), handle: name };
      }
      if (entry.address === address?.toLowerCase()) {
        throw new Error('You’re the host — you’re already on the list.');
      }
      if (guests.some((g) => g.address === entry.address)) {
        throw new Error('Already on the guest list.');
      }
      setGuests((g) => [...g, entry].slice(0, 23));
      setGuestInput('');
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : 'Could not resolve that name');
    } finally {
      setResolvingGuest(false);
    }
  };

  const createTable = async () => {
    if (!address) return open();
    if (isPrivate && guests.length === 0) {
      setCreateError('Add at least one guest to the list (or make the table public).');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const { token } = await ensureAuth(address, signMessage);
      const { id } = await api.createTable(
        { address, token },
        {
          name: tableName || suggestion,
          smallBlind,
          isPrivate,
          maxPlayers: isPrivate ? maxPlayers : undefined,
          whitelist: isPrivate ? guests : undefined,
        },
      );
      router.push(`/table/?id=${id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(SITE_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* ============================ Hero ============================ */}
      <section className="relative flex min-h-[660px] items-end border-b border-acid/[0.14]">
        <div
          className="absolute inset-0 bg-cover"
          style={{ backgroundImage: "url('/table-live.jpg')", backgroundPosition: 'center 62%' }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,0.86)_0%,rgba(5,5,5,0.35)_34%,rgba(5,5,5,0.9)_82%,#050505_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_78%,rgba(204,255,0,0.14),transparent_70%)]" />

        <div className="relative mx-auto w-full max-w-shell animate-rise px-[22px] pb-14 pt-[120px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-acid/45 bg-acid/[0.07] px-[13px] py-[7px]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-acid">
              Now dealing · names on {CHAIN_NAME}
            </span>
          </span>

          <h1 className="hp-display hp-h1 mt-6">
            <span className="hp-outline block">Texas Hold’em,</span>
            <span className="hp-fill block">Hood Style</span>
          </h1>

          <p className="mt-6 max-w-[520px] text-[17.5px] leading-[1.6] text-muted">
            No tokens to hold. No buy-ins. No real value — just the fastest free poker table
            going. Play under your HoodFi name from Robinhood Chain, stack virtual chips, and
            run up the leaderboard.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="shadow-cta" onClick={() => scrollTo('lobby')}>
              {isRestoring ? 'Reconnecting…' : 'Take a Seat →'}
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollTo('how')}>
              How it plays
            </Button>
          </div>

          {/* 1px-gap grid over a hairline background, so the gaps read as rules */}
          <div className="mt-12 grid max-w-[760px] gap-px bg-cream/10 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {HERO_STATS.map((s) => (
              <div key={s.label} className="bg-night-900 px-[18px] py-4">
                <p className="font-mono text-[22px] font-semibold text-acid">{s.value}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Ticker />

      {/* ============================ Lobby ============================ */}
      <section id="lobby" className="mx-auto max-w-shell px-[22px] pt-[74px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <Eyebrow>01 — Live lobby</Eyebrow>
            <h2 className="hp-display hp-h2 mt-3 text-cream">Open Tables</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              Blinds
            </span>
            {BLIND_FILTERS.map((b) => (
              <button
                key={b}
                onClick={() => setStake(b)}
                className={cn(
                  'rounded-full border px-[13px] py-[9px] font-mono text-[11px] tracking-[0.1em] transition-colors',
                  stake === b
                    ? 'border-acid bg-acid/[0.16] text-acid'
                    : 'border-cream/[0.16] text-dim hover:border-acid/50 hover:text-acid',
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
          {filtered.map((t) => (
            <TableCard key={t.id} table={t} />
          ))}
        </div>

        {isLoading && (
          <p className="py-10 text-center font-mono text-[11.5px] text-faint">Loading tables…</p>
        )}
        {!!error && (
          <p className="py-10 text-center font-mono text-[11.5px] text-red-400">
            Lobby unreachable — is the worker running?
          </p>
        )}
        {!isLoading && !error && (
          <p className="mt-6 font-mono text-[11.5px] text-faint">
            {filtered.length === 0
              ? stake === 'All'
                ? 'No tables yet — open one and it lands here instantly.'
                : 'No tables at those blinds yet — open one and it lands here instantly.'
              : `Lobby refreshes live · ${filtered.length} table${filtered.length === 1 ? '' : 's'} matching`}
          </p>
        )}

        {/* Open a table — not in the landing comp, but the lobby has to have a
            way in, so it is styled to match and collapsed by default. */}
        <div className="mt-7 rounded-card border border-cream/[0.12] bg-night-900">
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="flex w-full items-center justify-between gap-4 px-5 py-[18px] text-left"
          >
            <span className="hp-display hp-w85 text-[18px] text-cream">Open your own table</span>
            <span
              className={cn(
                'font-mono text-[20px] leading-none text-acid transition-transform duration-200',
                showCreate && 'rotate-45',
              )}
            >
              +
            </span>
          </button>

          {showCreate && (
            <div className="space-y-4 border-t border-cream/[0.08] px-5 py-5">
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  Table name
                </label>
                <div className="flex gap-2">
                  <input
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder={suggestion}
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-btn border border-cream/[0.16] bg-night-950 px-3.5 py-2.5 text-sm text-cream outline-none transition-colors placeholder:text-ghost focus:border-acid"
                  />
                  <button
                    title="Roll a table name"
                    onClick={() => {
                      const next = ideaIdx + 1;
                      setIdeaIdx(next);
                      setTableName(TABLE_NAME_IDEAS[next % TABLE_NAME_IDEAS.length]);
                    }}
                    className="w-11 shrink-0 rounded-btn border border-cream/[0.16] text-lg text-dim transition-colors hover:border-acid hover:text-acid"
                  >
                    🎲
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  Blind size (play chips)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 25, 50].map((sb) => (
                    <button
                      key={sb}
                      onClick={() => setSmallBlind(sb)}
                      className={cn(
                        'rounded-btn border py-2.5 font-mono text-sm transition-colors',
                        smallBlind === sb
                          ? 'border-acid bg-acid/[0.16] text-acid'
                          : 'border-cream/[0.16] text-dim hover:border-acid/50',
                      )}
                    >
                      {sb}
                    </button>
                  ))}
                </div>
                <p className="mt-2 font-mono text-[11px] text-faint">
                  Start stack: {formatChips(smallBlind * 2 * 100)} chips (100 big blinds)
                </p>
              </div>

              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  Visibility
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: false, label: 'Public', hint: 'Listed in the lobby' },
                    { value: true, label: 'Private', hint: 'Invite-only by name' },
                  ] as const).map((opt) => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setIsPrivate(opt.value)}
                      className={cn(
                        'rounded-btn border px-2 py-2.5 text-center transition-colors',
                        isPrivate === opt.value
                          ? 'border-acid bg-acid/[0.16] text-acid'
                          : 'border-cream/[0.16] text-dim hover:border-acid/50',
                      )}
                    >
                      <span className="hp-display hp-w85 block text-[14px]">{opt.label}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-faint">
                        {opt.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {isPrivate && (
                <>
                  <div>
                    <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                      Players (table size)
                    </label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <button
                          key={n}
                          onClick={() => setMaxPlayers(n)}
                          className={cn(
                            'rounded-btn border py-2 font-mono text-sm transition-colors',
                            maxPlayers === n
                              ? 'border-acid bg-acid/[0.16] text-acid'
                              : 'border-cream/[0.16] text-dim hover:border-acid/50',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-faint">
                      {maxPlayers < 4
                        ? `Hands start as soon as all ${maxPlayers} players are seated.`
                        : 'Hands start at 4 seated players.'}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                      Guest list — only these wallets can sit
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={guestInput}
                        onChange={(e) => { setGuestInput(e.target.value); setGuestError(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && !resolvingGuest && addGuest()}
                        placeholder="gm.hoodfi.eth, vitalik.eth or 0x…"
                        className="min-w-0 flex-1 rounded-btn border border-cream/[0.16] bg-night-950 px-3.5 py-2.5 text-sm text-cream outline-none transition-colors placeholder:text-ghost focus:border-acid"
                      />
                      <button
                        onClick={addGuest}
                        disabled={resolvingGuest || !guestInput.trim()}
                        className="shrink-0 rounded-btn border border-acid/40 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-acid transition-colors hover:bg-acid/10 disabled:opacity-40"
                      >
                        {resolvingGuest ? '…' : 'Add'}
                      </button>
                    </div>
                    {guestError && (
                      <p className="mt-2 font-mono text-[11px] text-red-400">{guestError}</p>
                    )}
                    {guests.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {guests.map((g) => (
                          <span
                            key={g.address}
                            className="flex items-center gap-1.5 rounded-full border border-cream/[0.16] py-1 pl-2.5 pr-1.5 font-mono text-[11px] text-dim"
                          >
                            {displayName(g.handle, g.address)}
                            <button
                              onClick={() => setGuests((l) => l.filter((x) => x.address !== g.address))}
                              className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-cream/10 hover:text-cream"
                              aria-label={`Remove ${displayName(g.handle, g.address)}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {createError && (
                <p className="font-mono text-[11px] text-red-400">{createError}</p>
              )}
              <Button className="w-full" onClick={createTable} disabled={creating}>
                {creating ? 'Creating…' : isConnected ? 'Create table' : 'Sign in to create'}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ========================= How it plays ========================= */}
      <section id="how" className="mx-auto max-w-shell px-[22px] pt-[88px]">
        <Eyebrow>02 — How it plays</Eyebrow>
        <h2 className="hp-display hp-h2 mt-3 text-cream">Three taps to the felt</h2>

        <div className="mt-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
          {HOW_STEPS.map((s) => (
            <div
              key={s.n}
              className="relative overflow-hidden rounded-card border border-cream/[0.12] bg-night-900 px-[22px] pb-7 pt-[26px] transition-colors hover:border-acid/40"
            >
              <span
                aria-hidden
                className="hp-display pointer-events-none absolute -top-[18px] right-2.5 text-[96px] leading-none text-acid/10"
                style={{ fontStretch: '70%' }}
              >
                {s.n}
              </span>
              <h3 className="hp-display hp-w80 relative text-[24px] text-acid">{s.title}</h3>
              <p className="relative mt-3 text-[15px] leading-[1.6] text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================ Ranks ============================ */}
      <section id="ranks" className="mx-auto max-w-shell px-[22px] pt-[88px]">
        <div className="grid items-start gap-[34px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          <div>
            <Eyebrow>03 — Season ranks</Eyebrow>
            <h2 className="hp-display hp-h2 mt-3 text-cream">Leaderboard</h2>
            <p className="mt-4 text-[16px] leading-[1.6] text-muted">
              Ranked by profit per hand, so a fat bankroll can’t buy the top spot. Seasons reset
              monthly — chips are virtual, bragging rights are not.
            </p>

            <div className="mt-6 rounded-card border border-acid/30 bg-acid/[0.05] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                Daily drop
              </p>
              <p className="hp-display hp-w80 mt-2 text-[34px] text-acid">+5,000 chips</p>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted">
                Claim once every 24h. Bust out? You’re never more than a day from the next hand.
              </p>
              <Link href="/profile/" className="mt-4 block">
                <Button className="w-full">Claim daily chips</Button>
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-card bg-night-900">
            <div className="grid gap-2.5 border-b border-cream/10 px-[18px] py-[13px] [grid-template-columns:44px_1fr_92px_84px]">
              {['Rank', 'Player', 'Hands', 'Net'].map((h, i) => (
                <span
                  key={h}
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-[0.16em] text-faint',
                    i >= 2 && 'text-right',
                    i === 2 && 'hidden xs:block',
                  )}
                >
                  {h}
                </span>
              ))}
            </div>

            {(board?.leaderboard ?? []).slice(0, 6).map((row, i) => (
              <div
                key={row.address}
                className="grid items-center gap-2.5 border-b border-cream/[0.06] px-[18px] py-3.5 transition-colors last:border-0 hover:bg-acid/[0.05] [grid-template-columns:44px_1fr_92px_84px]"
              >
                <span
                  className={cn(
                    'font-mono text-[13px] font-semibold',
                    i < 3 ? 'text-acid' : 'text-ghost',
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="hp-display hp-w85 truncate text-[16px] font-extrabold text-cream">
                  {displayName(row.handle, row.address)}
                </span>
                <span className="hidden text-right font-mono text-[13px] text-muted xs:block">
                  {formatChips(row.handsPlayed)}
                </span>
                <span className="text-right font-mono text-[13px] text-acid">
                  {row.netProfit >= 0 ? '+' : ''}
                  {formatChips(row.netProfit)}
                </span>
              </div>
            ))}

            {!board?.leaderboard?.length && (
              <p className="px-[18px] py-10 text-center font-mono text-[11.5px] text-faint">
                No hands played yet — the first pot writes history.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ========================== Invite band ========================== */}
      <section className="relative mt-[88px] overflow-hidden border-y border-acid/[0.16]">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-35 grayscale-[0.6]"
          style={{ backgroundImage: "url('/chips.jpg')" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#050505_8%,rgba(5,5,5,0.72)_52%,rgba(5,5,5,0.4)_100%)]" />
        <div className="relative mx-auto max-w-shell px-[22px] py-[78px]">
          <h2 className="hp-display hp-h2-cta max-w-[760px] text-cream">
            Bring four <span className="text-acid">frens</span> — that’s a hand.
          </h2>
          <p className="mt-5 max-w-[620px] text-[16.5px] leading-[1.6] text-muted">
            Hands deal at four seated players. Drop the invite link in the group chat and the
            table fills itself.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" onClick={copyInvite}>
              {copied ? 'Copied!' : 'Copy invite link'}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-night-950/50"
              onClick={() =>
                openOnX(
                  'Free-chip Texas Hold’em on Robinhood Chain. Come lose to me at HoodPoker ♠️',
                  SITE_URL,
                )
              }
            >
              <XLogo className="h-4 w-4" />
              Share on X
            </Button>
          </div>
        </div>
      </section>

      {/* ============================ NAMES ============================ */}
      <section id="name" className="mx-auto max-w-shell px-[22px] pt-[88px]">
        <Eyebrow>04 — Your table name</Eyebrow>
        <h2 className="hp-display hp-h2 mt-3 text-cream">
          Sit down as a <span className="text-acid">name</span>, not an address.
        </h2>
        <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div>
            <p className="max-w-[560px] text-[16.5px] leading-[1.6] text-muted">
              A HoodFi name is a real ENS name on Robinhood Chain — the same chain the felt
              runs on. Claim one and it shows at the table, in your wallet, and anywhere
              else that reads ENS. Paid once, no renewals.
            </p>
            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.6] text-muted">
              Registration opens on hoodfi.name. HoodPoker earns a small margin on every
              name claimed through here.
            </p>
          </div>
          <HoodfiWidget />
        </div>
      </section>

      {/* ============================= FAQ ============================= */}
      <section id="faq" className="mx-auto max-w-faq px-[22px] pb-[88px] pt-[88px]">
        <Eyebrow>05 — Straight answers</Eyebrow>
        <h2 className="hp-display hp-h2 mt-3 text-cream">FAQ</h2>
        <Faq />
      </section>
    </>
  );
}

/** One table in the lobby grid. */
function TableCard({ table }: { table: LobbyTable }) {
  const max = 8;
  const bigBlind = table.smallBlind * 2;
  const live = table.status === 'playing';
  const needs = Math.max(0, 4 - table.seats);
  const full = table.seats >= max;
  const invite = `${SITE_URL}/table/?id=${table.id}`;
  const practice = !!table.practice;

  return (
    <div
      className={cn(
        'group relative rounded-card border bg-[linear-gradient(170deg,#0d0e0a,#080805)] p-5 transition-colors hover:border-acid/[0.55] hover:bg-[linear-gradient(170deg,#12140c,#0a0b07)]',
        practice ? 'border-acid/[0.35]' : 'border-cream/[0.12]',
      )}
    >
      <span
        className={cn(
          'absolute right-5 top-5 rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em]',
          live || practice ? 'bg-acid/[0.16] text-acid' : 'bg-cream/[0.08] text-muted',
        )}
      >
        {practice ? 'Vs bots' : live ? 'In hand' : `Needs ${needs}`}
      </span>

      <h3 className="hp-display hp-w80 max-w-[70%] truncate text-[22px] text-cream">
        {table.name}
      </h3>
      <p className="mt-1.5 font-mono text-[11.5px] text-faint">
        {practice
          ? 'Play solo any time — bots fill empty seats. Free stacks, off the leaderboard.'
          : `Blinds ${table.smallBlind}/${bigBlind} · Buy-in ${formatChips(bigBlind * 100)} chips`}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <span className="flex gap-1">
          {Array.from({ length: max }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-[9px] w-[9px] rounded-full',
                i < table.seats ? 'bg-acid' : 'bg-cream/[0.16]',
              )}
            />
          ))}
        </span>
        <span className="font-mono text-[11px] text-faint">
          {table.seats}/{max} {practice ? 'players' : 'seated'}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/table/?id=${table.id}`} className="flex-1">
          <Button className="w-full py-3">{practice ? 'Play now' : full ? 'Waitlist' : 'Join table'}</Button>
        </Link>
        <button
          onClick={() =>
            openOnX(
              `Join "${table.name}" at HoodPoker ♠️ Blinds ${table.smallBlind}/${bigBlind}. Play chips, no buy-in.`,
              invite,
            )
          }
          className="rounded-btn border border-cream/[0.16] px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-dim transition-colors hover:border-acid hover:text-acid"
        >
          Share
        </button>
      </div>
    </div>
  );
}
