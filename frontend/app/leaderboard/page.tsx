'use client';
/** Global leaderboard by lifetime net chips won, with ENS identity. */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { displayName, formatChips, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LeaderboardAvatar } from '@/components/LeaderboardAvatar';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: api.leaderboard,
    refetchInterval: 15000,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl text-slate-50">Leaderboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Top players by lifetime net chips won across all tables.
      </p>

      <Card className="mt-6">
        <CardHeader><CardTitle>All-time winners</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <p className="py-10 text-center text-sm text-slate-500">Dealing…</p>}
          {!!error && (
            <p className="py-10 text-center text-sm text-red-400">
              Could not load the leaderboard. ({String(error)})
            </p>
          )}
          {data && data.leaderboard.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">
              No hands played yet — the first pot writes history.
            </p>
          )}
          <ol className="divide-y divide-white/5">
            {data?.leaderboard.map((row, i) => (
              <li key={row.address} className="flex items-center gap-4 py-3">
                <span className="w-8 text-center text-sm text-slate-500">
                  {MEDALS[i] ?? `#${i + 1}`}
                </span>
                <LeaderboardAvatar ensName={row.ensName} address={row.address} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-100">
                    {displayName(row.ensName, row.address)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.handsWon}/{row.handsPlayed} hands won · biggest pot{' '}
                    {formatChips(row.biggestPot)}
                  </p>
                </div>
                <span
                  className={cn(
                    'tabular-nums text-sm font-semibold',
                    row.netProfit >= 0 ? 'text-green-400' : 'text-red-400',
                  )}
                >
                  {row.netProfit >= 0 ? '+' : ''}{formatChips(row.netProfit)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
