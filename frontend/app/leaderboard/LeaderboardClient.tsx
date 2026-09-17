'use client';
/** Global leaderboard by lifetime net chips won: top-3 podium + ranked rows. */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LeaderboardRow } from '@/lib/types';
import { displayName, formatChips, cn } from '@/lib/utils';
import { LeaderboardAvatar } from '@/components/LeaderboardAvatar';

export default function LeaderboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: api.leaderboard,
    refetchInterval: 15000,
  });

  const rows = data?.leaderboard ?? [];
  // The podium needs a full top 3 — with fewer players everyone stays in the list.
  const hasPodium = rows.length >= 3;
  const listRows = hasPodium ? rows.slice(3) : rows;

  return (
    <div className="mx-auto max-w-shell px-[22px] pb-[88px] pt-[74px]">
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-acid">
          03 — Season ranks
        </p>
        <h1 className="hp-display hp-h2 mt-3 text-cream">Leaderboard</h1>
        <p className="mt-4 max-w-[520px] text-[16px] leading-[1.6] text-muted">
          Every hand you win moves the board. Chips are virtual, bragging rights are not.
        </p>
      </div>

      {isLoading && <p className="py-16 text-center text-sm text-dim">Dealing…</p>}
      {!!error && (
        <p className="py-16 text-center text-sm text-red-400">
          Could not load the leaderboard. ({String(error)})
        </p>
      )}
      {rows.length === 0 && !isLoading && !error && (
        <p className="py-16 text-center text-sm text-dim">
          No hands played yet — the first pot writes history.
        </p>
      )}

      {/* Podium — 2nd / 1st / 3rd */}
      {hasPodium && (
        <div className="mt-10 grid items-end gap-4 sm:grid-cols-3">
          {[rows[1], rows[0], rows[2]].map((row, i) => (
            <PodiumCard key={row.address} row={row} place={([2, 1, 3] as const)[i]} />
          ))}
        </div>
      )}

      {/* Ranked rows */}
      {listRows.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-night-850/60">
          {listRows.map((row, i) => {
            const rank = (hasPodium ? 4 : 1) + i;
            return (
              <div
                key={row.address}
                className="flex items-center gap-4 border-b border-white/5 px-5 py-4 transition-colors last:border-0 hover:bg-acid-400/[0.05]"
              >
                <span className="w-8 text-center font-mono text-sm text-dim">#{rank}</span>
                <LeaderboardAvatar handle={row.handle} avatar={row.avatar} address={row.address} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-cream">
                    {displayName(row.handle, row.address)}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-dim">
                    {row.handsWon}/{row.handsPlayed} hands won · biggest pot{' '}
                    {formatChips(row.biggestPot)}
                  </p>
                </div>
                <Net value={row.netProfit} className="text-[15px]" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PLACE_STYLE = {
  1: {
    medal: '🥇',
    card: 'border-acid-400/45 bg-gradient-to-b from-[#141a08]/70 to-night-850/60',
    ring: 'ring-acid-400/80',
    offset: '',
  },
  2: {
    medal: '🥈',
    card: 'border-white/10 bg-night-850/60',
    ring: 'ring-muted/50',
    offset: 'sm:mt-6',
  },
  3: {
    medal: '🥉',
    card: 'border-white/10 bg-night-850/60',
    ring: 'ring-acid/60',
    offset: 'sm:mt-6',
  },
} as const;

function PodiumCard({ row, place }: { row: LeaderboardRow; place: 1 | 2 | 3 }) {
  const s = PLACE_STYLE[place];
  return (
    <div className={cn('rounded-2xl border px-4 pb-5 pt-6 text-center', s.card, s.offset)}>
      <div className="mb-2 text-[26px]">{s.medal}</div>
      <div className={cn('mx-auto w-fit rounded-full ring-2', s.ring)}>
        <LeaderboardAvatar handle={row.handle} avatar={row.avatar} address={row.address} size="lg" />
      </div>
      <p className="mt-3 truncate text-[14.5px] font-semibold text-cream">
        {displayName(row.handle, row.address)}
      </p>
      <Net value={row.netProfit} className="mt-2 block text-base" />
      <p className="mt-1 text-[11.5px] text-dim">
        {row.handsWon}/{row.handsPlayed} hands won
      </p>
    </div>
  );
}

function Net({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono font-semibold tabular-nums',
        value >= 0 ? 'text-green-400' : 'text-red-400',
        className,
      )}
    >
      {value >= 0 ? '+' : ''}
      {formatChips(value)}
    </span>
  );
}
