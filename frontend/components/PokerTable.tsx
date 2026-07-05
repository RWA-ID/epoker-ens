'use client';
/**
 * The live table: the actual "ENS High Roller Table" art as the felt,
 * with 9 seat pills positioned around the rail, community cards + pot
 * floating over the center, and the "waiting for players" overlay.
 * Seat positions are percentage-based so the table scales fluidly.
 */
import type { TableView, Card } from '@/lib/types';
import { formatChips, cn } from '@/lib/utils';
import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';

/**
 * Percentage positions for up to 9 seats around the rail (seat 0
 * bottom-center, clockwise), each pill sitting on top of a chair in the
 * table art. Side seats are edge-anchored (`left`/`right`) so their pills
 * grow inward and always stay inside the table.
 */
type SeatAnchor = 'center' | 'left' | 'right';
const SEAT_POS: Array<{ left: string; top: string; anchor: SeatAnchor }> = [
  { left: '50%', top: '84%', anchor: 'center' }, // 0 bottom center
  { left: '25%', top: '79%', anchor: 'center' }, // 1 bottom left
  { left: '4%', top: '55%', anchor: 'left' },    // 2 left low
  { left: '5%', top: '27%', anchor: 'left' },    // 3 left high
  { left: '30%', top: '12%', anchor: 'center' }, // 4 top left
  { left: '50%', top: '9%', anchor: 'center' },  // 5 top center
  { left: '70%', top: '12%', anchor: 'center' }, // 6 top right
  { left: '95%', top: '27%', anchor: 'right' },  // 7 right high
  { left: '96%', top: '55%', anchor: 'right' },  // 8 right low
];

const ANCHOR_CLASS: Record<SeatAnchor, string> = {
  center: '-translate-x-1/2',
  left: 'translate-x-0',
  right: '-translate-x-full',
};

/**
 * Which of the 9 rail positions are used for a given table size, in
 * clockwise seat order — smaller private tables spread out evenly
 * instead of clustering.
 */
const SEAT_LAYOUTS: Record<number, number[]> = {
  2: [0, 5],
  3: [0, 3, 7],
  4: [0, 2, 5, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 7, 8],
  7: [0, 1, 2, 4, 5, 6, 8],
  8: [0, 1, 2, 3, 4, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

export function PokerTable({
  state,
  onSit,
}: {
  state: TableView;
  onSit: (seat: number) => void;
}) {
  const seatMap = new Map(state.seats.map((s) => [s.seat, s]));
  const inHand = state.stage !== 'waiting';
  const canSit = state.canSit && state.yourSeat === null && state.seats.length < state.maxPlayers;
  const layout = SEAT_LAYOUTS[state.maxPlayers] ?? SEAT_LAYOUTS[9];

  return (
    <div className="relative mx-auto w-full max-w-6xl select-none">
      {/* The table art */}
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[26px] border border-gold-500/40 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_30px_70px_rgba(0,0,0,0.6)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/table-live.jpg')" }}
        />

        {/* Pot + community cards, floating over the felt center */}
        <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 scale-[0.68] flex-col items-center gap-3 rounded-[20px] px-5 py-4 [background:radial-gradient(closest-side,rgba(6,10,26,0.72),rgba(6,10,26,0.25))] sm:scale-90 md:scale-100">
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
          <div className="absolute inset-x-0 bottom-[26%] flex justify-center px-10">
            <div className="rounded-2xl border border-gold-500/25 bg-night-950/85 px-4 py-2.5 text-center backdrop-blur-sm sm:px-6 sm:py-4">
              {state.waitingFor > 0 ? (
                <>
                  <p className="font-display text-sm font-semibold text-cream sm:text-lg">
                    Waiting for {state.waitingFor} more player{state.waitingFor === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 hidden text-xs text-slate-400 sm:block">
                    {state.isPrivate
                      ? `Hands start with ${state.minPlayers}+ seated — share the link with your guest list!`
                      : `Hands start with ${state.minPlayers}+ seated — invite frENS by ENS name!`}
                  </p>
                </>
              ) : (
                <p className="font-display text-sm font-semibold text-gold-300 sm:text-lg">
                  Shuffling up — dealing shortly…
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Seats around the rail (outside the clipped image so pills never get
          cut). The pill anchors on top of each chair; cards hang below it
          toward the felt. */}
      {layout.map((posIdx, seatIdx) => {
        const pos = SEAT_POS[posIdx];
        return (
          <div
            key={seatIdx}
            className={cn(
              'absolute z-10 -translate-y-[22px] sm:-translate-y-[28px]',
              ANCHOR_CLASS[pos.anchor],
            )}
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
        );
      })}
    </div>
  );
}
