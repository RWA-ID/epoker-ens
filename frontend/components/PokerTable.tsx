'use client';
/**
 * The live table: the actual "ENS High Roller Table" art as the felt,
 * with 9 seat pills positioned around the rail, community cards + pot
 * floating over the center, and the "waiting for players" overlay.
 * Seat positions are percentage-based so the table scales fluidly.
 */
import type { TableView, Card } from '@/lib/types';
import { formatChips } from '@/lib/utils';
import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';

/** Percentage positions for up to 9 seats around the rail (seat 0 bottom-center, clockwise). */
const SEAT_POS: Array<{ left: string; top: string }> = [
  { left: '50%', top: '90%' },
  { left: '26%', top: '85%' },
  { left: '11%', top: '62%' },
  { left: '14%', top: '32%' },
  { left: '31%', top: '15%' },
  { left: '50%', top: '11%' },
  { left: '69%', top: '15%' },
  { left: '86%', top: '32%' },
  { left: '89%', top: '62%' },
];

export function PokerTable({
  state,
  onSit,
}: {
  state: TableView;
  onSit: (seat: number) => void;
}) {
  const seatMap = new Map(state.seats.map((s) => [s.seat, s]));
  const inHand = state.stage !== 'waiting';
  const canSit = state.yourSeat === null && state.seats.length < state.maxPlayers;

  return (
    <div className="relative mx-auto w-full max-w-6xl select-none">
      {/* The table art */}
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[26px] border border-gold-500/40 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_30px_70px_rgba(0,0,0,0.6)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/table-live.jpg')" }}
        />

        {/* Pot + community cards, floating over the felt center */}
        <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-[20px] px-5 py-4 [background:radial-gradient(closest-side,rgba(6,10,26,0.72),rgba(6,10,26,0.25))]">
          {state.pot > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-gold-500/35 bg-night-950/70 px-4 py-1.5">
              <span className="text-[13px] text-gold-500">◉</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-gold-300">
                Pot {formatChips(state.pot)}
              </span>
            </div>
          )}
          {state.community.length > 0 && (
            <div className="flex gap-1.5 sm:gap-2">
              {state.community.map((c: Card, i: number) => (
                <PlayingCard key={i} card={c} size="lg" />
              ))}
            </div>
          )}
        </div>

        {/* Waiting overlay — the 4-player minimum is a core product rule */}
        {state.stage === 'waiting' && (
          <div className="absolute inset-x-0 bottom-[26%] flex justify-center">
            <div className="rounded-2xl border border-gold-500/25 bg-night-950/85 px-6 py-4 text-center backdrop-blur-sm">
              {state.waitingFor > 0 ? (
                <>
                  <p className="font-display text-lg font-semibold text-cream">
                    Waiting for {state.waitingFor} more player{state.waitingFor === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Hands start with {state.minPlayers}+ seated — invite frENS by ENS name!
                  </p>
                </>
              ) : (
                <p className="font-display text-lg font-semibold text-gold-300">
                  Shuffling up — dealing shortly…
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Seats around the rail (outside the clipped image so pills never get cut) */}
      {SEAT_POS.map((pos, seatIdx) => (
        <div
          key={seatIdx}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: pos.left, top: pos.top }}
        >
          <Seat
            view={seatMap.get(seatIdx) ?? null}
            holeCards={state.yourSeat === seatIdx ? state.holeCards : undefined}
            isYou={state.yourSeat === seatIdx}
            inHand={inHand}
            deadline={state.actionDeadline}
            onSit={canSit && !seatMap.get(seatIdx) ? () => onSit(seatIdx) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
