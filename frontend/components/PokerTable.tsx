'use client';
/**
 * The live table.
 *
 * The felt is the HoodPoker table render from the design bundle
 * (`public/table-live.jpg`, 1536x1024 = 3:2, re-encoded from the 2.9MB PNG to
 * ~408KB JPEG so a fresh IPFS pin stays warm). SEAT_POS is laid round the
 * rail of this exact image — swapping the art means re-checking the positions.
 */
import type { ReactNode } from 'react';
import type { TableView, Card } from '@/lib/types';
import { displayName, formatChips, cn } from '@/lib/utils';
import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';

/**
 * Eight seats spaced evenly round the rail, clockwise from the near-left
 * foreground chair: two in front, two up each side, two across the back.
 * Nothing sits at the back centre — a seat there hung its cards straight
 * onto the board.
 *
 * Each seat's hole cards sit on the side facing the felt (`cards`), never
 * toward the middle of the board: the back pair tuck theirs outward, the
 * sides inward, the front pair above. Side seats are edge-anchored so their
 * pills grow inward and stay on screen. `top` is the centre of the seat.
 */
type SeatAnchor = 'center' | 'left' | 'right';
type CardSide = 'above' | 'left' | 'right';
const SEAT_POS: Array<{ left: string; top: string; anchor: SeatAnchor; cards: CardSide }> = [
  { left: '24%', top: '80%', anchor: 'center', cards: 'above' }, // 0 front left
  { left: '1.5%', top: '64%', anchor: 'left', cards: 'right' },  // 1 left, low
  { left: '3.5%', top: '41%', anchor: 'left', cards: 'right' },  // 2 left, high
  { left: '29%', top: '27%', anchor: 'center', cards: 'left' },  // 3 back left
  { left: '71%', top: '27%', anchor: 'center', cards: 'right' }, // 4 back right
  { left: '96.5%', top: '41%', anchor: 'right', cards: 'left' }, // 5 right, high
  { left: '98.5%', top: '64%', anchor: 'right', cards: 'left' }, // 6 right, low
  { left: '76%', top: '80%', anchor: 'center', cards: 'above' }, // 7 front right
];

const ANCHOR_CLASS: Record<SeatAnchor, string> = {
  center: '-translate-x-1/2',
  left: 'translate-x-0',
  right: '-translate-x-full',
};

/**
 * Which of the 8 seats a smaller private table uses, in clockwise seat order,
 * so a short table spreads round the felt instead of bunching on one side.
 */
const SEAT_LAYOUTS: Record<number, number[]> = {
  2: [0, 4],
  3: [0, 3, 5],
  4: [0, 2, 4, 6],
  5: [0, 2, 3, 5, 6],
  6: [0, 1, 3, 4, 6, 7],
  7: [0, 1, 2, 3, 4, 5, 6],
  8: [0, 1, 2, 3, 4, 5, 6, 7],
};

export function PokerTable({
  state,
  onSit,
  children,
}: {
  state: TableView;
  onSit: (seat: number) => void;
  /** Overlays drawn inside the felt (status chips, toasts, hand result). */
  children?: ReactNode;
}) {
  const seatMap = new Map(state.seats.map((s) => [s.seat, s]));
  const inHand = state.stage !== 'waiting';
  const canSit = state.canSit && state.yourSeat === null && state.seats.length < state.maxPlayers;
  const layout = SEAT_LAYOUTS[Math.min(state.maxPlayers, 8)] ?? SEAT_LAYOUTS[8];

  return (
    <div className="relative mx-auto w-full max-w-6xl select-none">
      {/* The table art */}
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[22px] border border-acid-400/25 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_30px_70px_rgba(0,0,0,0.6)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/table-live.jpg')" }}
        />

        {/* Pot + community cards, over the cleared centre of the felt */}
        <div className="absolute left-1/2 top-[57%] flex -translate-x-1/2 -translate-y-1/2 scale-[0.62] flex-col items-center gap-3 rounded-[20px] px-5 py-4 [background:radial-gradient(closest-side,rgba(4,6,2,0.82),rgba(4,6,2,0.15))] sm:scale-[0.8] md:scale-95 tilt:scale-[0.62]">
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
        {state.stage === 'waiting' && state.practice && state.yourSeat === null && (
          <div className="absolute inset-x-0 top-[62%] flex -translate-y-1/2 justify-center px-[22%]">
            <div className="rounded-2xl border border-acid-400/25 bg-night-950/85 px-3 py-2 text-center backdrop-blur-sm sm:px-6 sm:py-4 tilt:px-3 tilt:py-2">
              <p className="hp-display hp-w85 text-[12px] text-cream sm:text-lg tilt:text-[12px]">
                Take any seat — bots fill the rest
              </p>
              <p className="mt-1 hidden text-xs text-muted sm:block tilt:hidden">
                Practice chips are free and never touch your bankroll or the leaderboard.
              </p>
            </div>
          </div>
        )}
        {state.stage === 'waiting' && !(state.practice && state.yourSeat === null) && (
          <div className="absolute inset-x-0 top-[62%] flex -translate-y-1/2 justify-center px-[22%]">
            <div className="rounded-2xl border border-acid-400/25 bg-night-950/85 px-3 py-2 text-center backdrop-blur-sm sm:px-6 sm:py-4 tilt:px-3 tilt:py-2">
              {state.waitingFor > 0 ? (
                <>
                  <p className="hp-display hp-w85 text-[12px] text-cream sm:text-lg tilt:text-[12px]">
                    Waiting for {state.waitingFor} more player{state.waitingFor === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 hidden text-xs text-muted sm:block tilt:hidden">
                    {state.isPrivate
                      ? `Hands start with ${state.minPlayers}+ seated — share the link with your guest list!`
                      : `Hands start with ${state.minPlayers}+ seated — invite friends by name!`}
                  </p>
                  {/* Guest list lives here, not above the felt, so it can't
                      shove the table down and up as hands start and end. */}
                  {state.isPrivate && !!state.whitelist?.length && (
                    <div className="mt-2 hidden flex-wrap justify-center gap-1 sm:flex">
                      {state.whitelist.map((g) => {
                        const seated = state.seats.some((s) => s.address === g.address);
                        return (
                          <span
                            key={g.address}
                            className={cn(
                              'rounded-full border px-2 py-0.5 font-mono text-[10.5px]',
                              seated ? 'border-acid/40 bg-acid/10 text-acid' : 'border-cream/15 text-dim',
                            )}
                          >
                            {displayName(g.handle, g.address)}
                            {seated && ' ✓'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="hp-display hp-w85 text-[12px] text-acid sm:text-lg tilt:text-[12px]">
                  Shuffling up — dealing shortly…
                </p>
              )}
            </div>
          </div>
        )}

        {children}
      </div>

      {/* Seats, outside the clipped image so pills are never cut off. */}
      {layout.map((posIdx, seatIdx) => {
        const pos = SEAT_POS[posIdx];
        return (
          <div
            key={seatIdx}
            className={cn(
              'absolute z-10 -translate-y-1/2',
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
              cardSide={pos.cards}
              onSit={canSit && !seatMap.get(seatIdx) ? () => onSit(seatIdx) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
