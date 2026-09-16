'use client';
/**
 * The live table.
 *
 * The felt is the HoodPoker table render from the design bundle
 * (`public/table-live.jpg`, 1536x1024 = 3:2, re-encoded from the 2.9MB PNG to
 * ~408KB JPEG so a fresh IPFS pin stays warm). Seat pills are positioned over
 * the chairs in that photograph, so SEAT_POS is tied to this exact image —
 * swapping the art means re-measuring the positions.
 */
import type { TableView, Card } from '@/lib/types';
import { formatChips, cn } from '@/lib/utils';
import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';

/**
 * Percentage positions of the nine chairs in table-live.jpg, clockwise from
 * the near-left foreground seat. The table is shot at an angle, so these are
 * measured off the image rather than derived from an ellipse: the back row
 * sits high and tight, the two foreground chairs low and wide.
 *
 * Side chairs are edge-anchored so their pills grow inward and stay on screen.
 */
type SeatAnchor = 'center' | 'left' | 'right';
const SEAT_POS: Array<{ left: string; top: string; anchor: SeatAnchor }> = [
  { left: '18%', top: '85%', anchor: 'center' }, // 0 near left (foreground)
  { left: '3%', top: '52%', anchor: 'left' },    // 1 left side
  { left: '16%', top: '42%', anchor: 'center' }, // 2 back far left
  { left: '32%', top: '39%', anchor: 'center' }, // 3 back left
  { left: '54%', top: '38%', anchor: 'center' }, // 4 back centre
  { left: '74%', top: '39%', anchor: 'center' }, // 5 back right
  { left: '90%', top: '42%', anchor: 'center' }, // 6 back far right
  { left: '98%', top: '49%', anchor: 'right' },  // 7 right side
  { left: '80%', top: '84%', anchor: 'center' }, // 8 near right (foreground)
];

const ANCHOR_CLASS: Record<SeatAnchor, string> = {
  center: '-translate-x-1/2',
  left: 'translate-x-0',
  right: '-translate-x-full',
};

/**
 * Which of the 9 chairs are used for a given table size, in clockwise seat
 * order — smaller private tables spread out around the table instead of
 * clustering on one side.
 */
const SEAT_LAYOUTS: Record<number, number[]> = {
  2: [0, 5],
  3: [0, 3, 6],
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
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[22px] border border-acid-400/25 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_30px_70px_rgba(0,0,0,0.6)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/table-live.jpg')" }}
        />

        {/* Pot + community cards, over the cleared centre of the felt */}
        <div className="absolute left-1/2 top-[57%] flex -translate-x-1/2 -translate-y-1/2 scale-[0.62] flex-col items-center gap-3 rounded-[20px] px-5 py-4 [background:radial-gradient(closest-side,rgba(4,6,2,0.82),rgba(4,6,2,0.15))] sm:scale-[0.8] md:scale-95">
          {state.pot > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-acid-400/40 bg-night-950/80 px-4 py-1.5">
              <span className="text-[13px] text-acid-400">◉</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-acid">
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
          <div className="absolute inset-x-0 bottom-[16%] flex justify-center px-10">
            <div className="rounded-2xl border border-acid-400/25 bg-night-950/85 px-4 py-2.5 text-center backdrop-blur-sm sm:px-6 sm:py-4">
              {state.waitingFor > 0 ? (
                <>
                  <p className="hp-display hp-w85 text-sm text-cream sm:text-lg">
                    Waiting for {state.waitingFor} more player{state.waitingFor === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 hidden text-xs text-muted sm:block">
                    {state.isPrivate
                      ? `Hands start with ${state.minPlayers}+ seated — share the link with your guest list!`
                      : `Hands start with ${state.minPlayers}+ seated — invite friends by name!`}
                  </p>
                </>
              ) : (
                <p className="hp-display hp-w85 text-sm text-acid sm:text-lg">
                  Shuffling up — dealing shortly…
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Seats, positioned over the chairs (outside the clipped image so pills
          are never cut off). The pill sits on the chair; cards hang below it
          toward the felt. */}
      {layout.map((posIdx, seatIdx) => {
        const pos = SEAT_POS[posIdx];
        return (
          <div
            key={seatIdx}
            className={cn(
              'absolute z-10 -translate-y-[18px] sm:-translate-y-[24px]',
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
