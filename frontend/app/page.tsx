'use client';
/**
 * Home = cinematic hero + lobby. Lists open tables, lets a connected
 * wallet create one (with fun ENS-flavored name suggestions), and pushes
 * the "invite friends" loop (hands need 4+).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSignMessage } from 'wagmi';
import { getEnsAddress } from '@wagmi/core';
import { isAddress } from 'viem';
import { normalize } from 'viem/ens';
import { useAppKit } from '@reown/appkit/react';
import { api } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useEnsIdentity } from '@/lib/ens';
import { wagmiConfig } from '@/lib/appkit';
import type { WhitelistEntry } from '@/lib/types';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsBanner } from '@/components/HoldingsBanner';

/** ENS-flavored table names offered when opening a table. */
const TABLE_NAME_IDEAS = [
  'ENS Maxis',
  'frENS Night',
  'ENS Builders',
  'ENS Lovers',
  '999 Table',
  '100K Club',
  'Grails Night',
  "ENS Vision OG's",
];

const SUITS = ['♠', '♣', '♥', '♦'];

const SITE_URL = 'https://epoker.eth.limo';

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

export default function HomePage() {
  const router = useRouter();
  const { open } = useAppKit();
  const { address, isConnected } = useEnsIdentity();
  const { signMessageAsync } = useSignMessage();

  const [creating, setCreating] = useState(false);
  const [tableName, setTableName] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [createError, setCreateError] = useState<string | null>(null);
  // Private-table options: creator-chosen size + ENS guest list.
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [guestInput, setGuestInput] = useState('');
  const [guests, setGuests] = useState<WhitelistEntry[]>([]);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [resolvingGuest, setResolvingGuest] = useState(false);
  // Stable random starting suggestion, cycled by the dice button.
  const startIdea = useMemo(() => Math.floor(Math.random() * TABLE_NAME_IDEAS.length), []);
  const [ideaIdx, setIdeaIdx] = useState(startIdea);
  const suggestion = TABLE_NAME_IDEAS[ideaIdx % TABLE_NAME_IDEAS.length];

  const { data, isLoading, error } = useQuery({
    queryKey: ['tables'],
    queryFn: api.listTables,
    refetchInterval: 5000,
  });

  const scrollToLobby = () => {
    document.getElementById('lobby-tables')?.scrollIntoView({ behavior: 'smooth' });
  };

  /** Resolve an ENS name (or accept a raw 0x address) onto the guest list. */
  const addGuest = async () => {
    const input = guestInput.trim().toLowerCase();
    if (!input) return;
    setGuestError(null);
    setResolvingGuest(true);
    try {
      let entry: WhitelistEntry;
      if (isAddress(input)) {
        entry = { address: input, ensName: null };
      } else {
        const name = input.includes('.') ? input : `${input}.eth`;
        const resolved = await getEnsAddress(wagmiConfig, { name: normalize(name), chainId: 1 });
        if (!resolved) throw new Error(`Couldn’t resolve “${name}” — check the spelling.`);
        entry = { address: resolved.toLowerCase(), ensName: name };
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
      setCreateError('Add at least one frEN to the guest list (or make the table public).');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const sig = await ensureAuth(address, signMessageAsync);
      const { id } = await api.createTable(
        { address, sig },
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

  return (
    <div className="pb-16">
      {/* ============ Hero ============ */}
      <section className="relative flex min-h-[560px] items-center overflow-hidden border-b border-gold-500/15 md:min-h-[640px]">
        <div
          className="absolute inset-0 bg-cover"
          style={{ backgroundImage: "url('/hero-bg.jpg')", backgroundPosition: 'center 38%' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-night-950/95 via-night-950/70 to-night-950/40" />
        <div className="absolute inset-0 bg-gradient-to-b from-night-950/50 via-transparent to-night-950" />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-16 sm:px-7 md:py-20">
          <div className="max-w-xl animate-floatUp">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-gold-500/30 bg-gold-500/5 px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 animate-livePulse rounded-full bg-green-400" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-gold-400">
                Now dealing · epoker.eth
              </span>
            </div>
            <h1 className="mt-5 font-display text-[42px] font-bold leading-[1.05] text-cream sm:text-[54px] md:text-[62px]">
              Texas&nbsp;Hold’em
              <br />
              for the <span className="gold-text italic">ENS</span> community
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-slate-400">
              Your ENS name is your seat at the table. Play with friends, climb the leaderboard,
              and keep your $ENS working in DAO governance while you play.
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <Button size="lg" onClick={() => (isConnected ? scrollToLobby() : open())}>
                Take a Seat
              </Button>
              <Button size="lg" variant="outline" className="bg-white/[0.04]" onClick={scrollToLobby}>
                Browse Tables
              </Button>
              <Link href="/dao/">
                <Button size="lg" variant="ghost">Why hold $ENS? →</Button>
              </Link>
            </div>
            <ul className="mt-11 flex flex-wrap gap-x-6 gap-y-3 text-[13.5px] text-slate-400">
              <li className="flex items-center gap-2.5">
                <span className="text-lg text-gold-500">♠</span> 10,000 free virtual chips
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-lg text-ens-400">♦</span> Hands start at 4 players
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-lg text-gold-500">♣</span> Global leaderboard
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-lg text-ens-400">♥</span> ENS holder perks
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-7">
        <div className="mt-8"><HoldingsBanner /></div>

        {/* ============ Lobby ============ */}
        <section id="lobby-tables" className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
          {/* Open tables */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-2xl">Open Tables</CardTitle>
              <span className="flex items-center gap-2 text-[11.5px] uppercase tracking-[0.16em] text-slate-500">
                <span className="h-1.5 w-1.5 animate-livePulse rounded-full bg-green-400" />
                Refreshes live
              </span>
            </CardHeader>
            <CardContent className="px-3 py-3">
              {isLoading && <p className="py-10 text-center text-sm text-slate-500">Loading tables…</p>}
              {!!error && (
                <p className="py-10 text-center text-sm text-red-400">
                  Lobby unreachable — is the worker running? ({String(error)})
                </p>
              )}
              {data && data.tables.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">
                  No tables yet. Be the first to open one →
                </p>
              )}
              <ul>
                {data?.tables.map((t, i) => {
                  const playing = t.status === 'playing';
                  const invite = `${SITE_URL}/table/?id=${t.id}`;
                  return (
                    <li
                      key={t.id}
                      className="group flex items-center justify-between gap-4 rounded-xl border border-transparent px-3.5 py-4 transition-colors hover:border-gold-500/20 hover:bg-gold-500/5"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-gold-500/30 text-xl text-gold-400 [background:radial-gradient(circle_at_35%_30%,#17346f,#0a1836)]">
                          {SUITS[i % SUITS.length]}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[15.5px] font-semibold text-slate-100">{t.name}</p>
                          <p className="mt-1 truncate font-mono text-xs text-slate-500">
                            Blinds {t.smallBlind} / {t.smallBlind * 2} · Buy-in{' '}
                            {formatChips(t.smallBlind * 2 * 100)} · {t.seats} / 9 seated
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
                            playing
                              ? 'bg-green-400/10 text-green-400'
                              : 'bg-gold-500/10 text-gold-400',
                          )}
                        >
                          {playing ? 'In hand' : `Needs ${Math.max(0, 4 - t.seats)}`}
                        </span>
                        <button
                          title="Share on X"
                          onClick={() =>
                            openOnX(
                              `Join "${t.name}" at the epoker.eth ENS High Roller Table ♠️ Blinds ${t.smallBlind}/${t.smallBlind * 2}.`,
                              invite,
                            )
                          }
                          className="hidden h-9 w-9 items-center justify-center rounded-[9px] border border-white/10 text-slate-400 transition-colors hover:border-gold-500/45 hover:text-gold-200 sm:flex"
                        >
                          <XLogo className="h-3.5 w-3.5" />
                        </button>
                        <Link href={`/table/?id=${t.id}`}>
                          <Button size="sm" variant="outline">Join</Button>
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            {/* Invite frENS */}
            <div className="overflow-hidden rounded-2xl border border-gold-500/25 bg-gradient-to-b from-[#18140c]/60 to-night-850/60">
              <div className="relative h-40 overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: "url('/chips.jpg')" }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-night-850/10 to-night-850/95" />
                <h2 className="absolute bottom-3.5 left-6 font-display text-[23px] font-semibold text-cream">
                  Bring your frENS
                </h2>
              </div>
              <div className="space-y-4 px-6 pb-6 pt-5">
                <p className="text-[13.5px] leading-relaxed text-slate-400">
                  Hands only start with 4+ players at the table. Rally your frENS and deal the
                  next big pot at the ENS High Roller Table.
                </p>
                <Button
                  className="w-full"
                  onClick={() =>
                    openOnX('Bring your frENS to the epoker.eth ENS High Roller Table ♠️', SITE_URL)
                  }
                >
                  <XLogo className="h-4 w-4" />
                  Share on X
                </Button>
              </div>
            </div>

            {/* Create table */}
            <Card>
              <CardHeader><CardTitle>Open a Table</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-500">Table name</label>
                  <div className="flex gap-2">
                    <input
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      placeholder={suggestion}
                      maxLength={40}
                      className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-night-900 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-600 focus:border-gold-500/60"
                    />
                    <button
                      title="Roll a table name"
                      onClick={() => {
                        const next = ideaIdx + 1;
                        setIdeaIdx(next);
                        setTableName(TABLE_NAME_IDEAS[next % TABLE_NAME_IDEAS.length]);
                      }}
                      className="flex w-11 shrink-0 items-center justify-center rounded-[10px] border border-white/10 text-lg text-slate-400 transition-colors hover:border-gold-500/45 hover:text-gold-200"
                    >
                      🎲
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TABLE_NAME_IDEAS.slice(0, 4).map((idea) => (
                      <button
                        key={idea}
                        onClick={() => setTableName(idea)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                          tableName === idea
                            ? 'border-gold-500/60 bg-gold-500/15 text-gold-200'
                            : 'border-white/10 text-slate-500 hover:border-gold-500/40 hover:text-gold-300',
                        )}
                      >
                        {idea}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-500">Stakes (small blind)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 10, 25, 50].map((sb) => (
                      <button
                        key={sb}
                        onClick={() => setSmallBlind(sb)}
                        className={cn(
                          'rounded-[10px] border py-2.5 font-mono text-sm transition-colors',
                          smallBlind === sb
                            ? 'border-gold-500/60 bg-gold-500/15 text-gold-200'
                            : 'border-white/10 bg-night-900 text-slate-400 hover:border-white/25',
                        )}
                      >
                        {sb}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-xs text-slate-600">
                    Buy-in: {formatChips(smallBlind * 2 * 100)} chips (100 big blinds)
                  </p>
                </div>

                {/* Public / Private visibility */}
                <div>
                  <label className="mb-1.5 block text-xs text-slate-500">Visibility</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: false, label: '🌐 Public', hint: 'Listed in the lobby' },
                      { value: true, label: '🔒 Private', hint: 'Invite-only by ENS' },
                    ] as const).map((opt) => (
                      <button
                        key={String(opt.value)}
                        onClick={() => setIsPrivate(opt.value)}
                        className={cn(
                          'rounded-[10px] border px-2 py-2.5 text-center transition-colors',
                          isPrivate === opt.value
                            ? 'border-gold-500/60 bg-gold-500/15 text-gold-200'
                            : 'border-white/10 bg-night-900 text-slate-400 hover:border-white/25',
                        )}
                      >
                        <span className="block text-sm font-medium">{opt.label}</span>
                        <span className="mt-0.5 block text-[10.5px] text-slate-500">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {isPrivate && (
                  <>
                    {/* Table size */}
                    <div>
                      <label className="mb-1.5 block text-xs text-slate-500">Players (table size)</label>
                      <div className="grid grid-cols-8 gap-1.5">
                        {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                          <button
                            key={n}
                            onClick={() => setMaxPlayers(n)}
                            className={cn(
                              'rounded-[9px] border py-2 font-mono text-sm transition-colors',
                              maxPlayers === n
                                ? 'border-gold-500/60 bg-gold-500/15 text-gold-200'
                                : 'border-white/10 bg-night-900 text-slate-400 hover:border-white/25',
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {maxPlayers < 4
                          ? `Hands start as soon as all ${maxPlayers} players are seated.`
                          : 'Hands start at 4 seated players.'}
                      </p>
                    </div>

                    {/* ENS guest list */}
                    <div>
                      <label className="mb-1.5 block text-xs text-slate-500">
                        Guest list (ENS names) — only these wallets can sit
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={guestInput}
                          onChange={(e) => { setGuestInput(e.target.value); setGuestError(null); }}
                          onKeyDown={(e) => e.key === 'Enter' && !resolvingGuest && addGuest()}
                          placeholder="vitalik.eth or 0x…"
                          className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-night-900 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-600 focus:border-gold-500/60"
                        />
                        <button
                          onClick={addGuest}
                          disabled={resolvingGuest || !guestInput.trim()}
                          className="shrink-0 rounded-[10px] border border-gold-500/40 px-4 text-sm text-gold-200 transition-colors hover:bg-gold-500/10 disabled:opacity-40"
                        >
                          {resolvingGuest ? '…' : 'Add'}
                        </button>
                      </div>
                      {guestError && <p className="mt-2 text-xs text-red-400">{guestError}</p>}
                      {guests.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {guests.map((g) => (
                            <span
                              key={g.address}
                              className="flex items-center gap-1.5 rounded-full border border-ens-400/30 bg-ens-400/10 py-1 pl-2.5 pr-1.5 text-[11.5px] text-ens-300"
                            >
                              {displayName(g.ensName, g.address)}
                              <button
                                onClick={() => setGuests((list) => list.filter((x) => x.address !== g.address))}
                                className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                                aria-label={`Remove ${displayName(g.ensName, g.address)}`}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-xs text-slate-600">
                        You’re on the list automatically. Private tables never appear in the
                        lobby — share the table link with your frENS.
                      </p>
                    </div>
                  </>
                )}

                {createError && <p className="text-xs text-red-400">{createError}</p>}
                <Button className="w-full" onClick={createTable} disabled={creating}>
                  {creating
                    ? 'Creating…'
                    : isConnected
                      ? isPrivate ? 'Create Private Table' : 'Create Table'
                      : 'Connect to Create'}
                </Button>
                <p className="text-center text-xs text-slate-600">
                  {isPrivate
                    ? 'Only whitelisted ENS names can take a seat.'
                    : 'Share the table link to invite friends — hands start at 4 players.'}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
