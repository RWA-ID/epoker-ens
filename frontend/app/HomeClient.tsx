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
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useIdentity } from '@/lib/identity';
import type { LobbyTable } from '@/lib/types';
import { SITE_URL } from '@/lib/seo';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CreateTable } from '@/components/CreateTable';
import { Invites } from '@/components/Invites';
import { Ticker } from '@/components/Ticker';
import { Faq } from '@/components/Faq';
import { HoodfiWidget } from '@/components/HoodfiWidget';
import { PassChecker } from '@/components/PassChecker';
import { WhitelistSignup } from '@/components/WhitelistSignup';
import { MEMBER_PERKS, PASS_SUPPLY, PASS_TIERS, fmt, tierArt } from '@/lib/housePass';
import { MintStages, PassFineprint } from '@/components/PassStages';

const CHAIN_NAME = 'Robinhood Chain';

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
  const { isRestoring } = useIdentity();

  const [stake, setStake] = useState<string>('All');
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(false);

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

  // The hero and lobby header both jump straight to an open create form.
  const openCreate = () => {
    setShowCreate(true);
    requestAnimationFrame(() => scrollTo('create'));
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
            <Button size="lg" variant="outline" onClick={openCreate}>
              + Open a table
            </Button>
            <Button size="lg" variant="ghost" onClick={() => scrollTo('how')}>
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
            <Button onClick={openCreate} className="mr-2 px-5 py-3 text-[15px]">
              + Open a table
            </Button>
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

        <Invites />

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
                ? 'No tables yet — open one below and it lands here instantly.'
                : 'No tables at those blinds yet — open one below and it lands here instantly.'
              : `Lobby refreshes live · ${filtered.length} table${filtered.length === 1 ? '' : 's'} matching`}
          </p>
        )}

        <CreateTable open={showCreate} onOpenChange={setShowCreate} />
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

      {/* ========================== House Pass ========================== */}
      <section id="pass" className="mx-auto max-w-shell px-[22px] pt-[88px]">
        <Eyebrow>05 — House Pass</Eyebrow>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="hp-display hp-h2 text-cream">
            Membership <span className="text-acid">NFT</span>
          </h2>
          <span className="rounded-full border border-acid/45 bg-acid/[0.07] px-3 py-[6px] font-mono text-[10.5px] uppercase tracking-[0.2em] text-acid">
            Coming soon
          </span>
          <span className="rounded-full border border-cream/15 px-3 py-[6px] font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">
            {fmt(PASS_SUPPLY)} passes
          </span>
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div>
            <img
              src={tierArt('crown-jewel')}
              alt="Crown Jewel House Pass — a diamond inside a gold poker chip, edition of 77"
              width={720}
              height={720}
              loading="lazy"
              className="w-full rounded-[3%] border border-[#e8c56a]/30 shadow-[0_18px_60px_rgba(0,0,0,0.6)]"
            />
            <PassChecker />
            <WhitelistSignup />
          </div>

          <div>
            <p className="max-w-[560px] text-[16.5px] leading-[1.6] text-muted">
              {fmt(PASS_SUPPLY)} passes in seven tiers. Every pass is a membership: more table
              time and more ways to play with your people — never better cards. The rarer the
              tier, the bigger the chip stack it comes with, up to a million for the 77 Crown
              Jewels.
            </p>

            <ul className="mt-6 grid grid-cols-2 gap-2 xs:grid-cols-4 sm:grid-cols-7 md:grid-cols-4 lg:grid-cols-7">
              {PASS_TIERS.map((tier) => (
                <li key={tier.id}>
                  <Link href={`/pass/#${tier.id}`} className="group block">
                    <img
                      src={tierArt(tier.id)}
                      alt={`${tier.name} House Pass`}
                      width={720}
                      height={720}
                      loading="lazy"
                      className="w-full rounded-[6%] border border-cream/10 transition-colors group-hover:border-acid/50"
                    />
                    <p className="mt-1.5 truncate text-[12.5px] leading-tight text-cream">{tier.name}</p>
                    <p className="font-mono text-[10.5px] tabular-nums text-faint">
                      {fmt(tier.supply)} · {fmt(tier.chips)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
              Supply · one-time chip stack ·{' '}
              <Link href="/pass/" className="text-acid underline underline-offset-4">
                every tier&rsquo;s perks
              </Link>
            </p>

            <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              Every pass, every tier
            </p>
            <ul className="mt-3 grid gap-3">
              {MEMBER_PERKS.map((perk) => (
                <li key={perk.title} className="flex gap-3">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-acid" />
                  <p className="text-[15px] leading-[1.55] text-cream">
                    {perk.title}
                    <span className="text-muted"> — {perk.body}</span>
                  </p>
                </li>
              ))}
            </ul>

            <MintStages />

            <PassFineprint />

            <p className="mt-5 text-[13.5px] leading-[1.6] text-faint">
              Minting opens October 15 on OpenSea; stage times and the link go out on X first.
              Follow{' '}
              <a
                href="https://x.com/hoodpokercasino"
                target="_blank"
                rel="noopener noreferrer"
                className="text-acid underline underline-offset-4"
              >
                @hoodpokercasino
              </a>{' '}
              for the announcement.
            </p>
          </div>
        </div>
      </section>

      {/* ============================= FAQ ============================= */}
      <section id="faq" className="mx-auto max-w-faq px-[22px] pb-[88px] pt-[88px]">
        <Eyebrow>06 — Straight answers</Eyebrow>
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
