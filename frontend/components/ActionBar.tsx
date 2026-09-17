'use client';
/**
 * Betting dock under the felt: raise sizing on top, Fold / Call / Raise /
 * All-in below (layout from the Claude Design table handoff).
 *
 * It is ALWAYS rendered at the same height. It used to swap between a one-line
 * "Waiting for other players…" note, the full controls, and nothing at all
 * (folded / all-in), so every turn change shoved the buttons up and down the
 * page — on a phone, off the bottom of the screen. Now only the top row's
 * text changes and the buttons disable when it isn't your turn.
 */
import { useEffect, useMemo, useState } from 'react';
import type { TableView, ActionType } from '@/lib/types';
import { displayName, formatChips, cn } from '@/lib/utils';

export function ActionBar({
  state,
  onAct,
  compact = false,
  columns = 'auto',
}: {
  state: TableView;
  onAct: (action: ActionType, amount?: number) => void;
  /** Full-screen table: shorter buttons, no presets. */
  compact?: boolean;
  /** Button grid: 2×2, one row of 4, or 2×2 on phones and 4 from `sm`. */
  columns?: 2 | 4 | 'auto';
}) {
  const me = state.seats.find((s) => s.seat === state.yourSeat);
  const acting = state.seats.find((s) => s.acting);
  const isMyTurn = !!me?.acting && !me.folded && !me.allIn;

  const toCall = me ? Math.min(state.currentBet - me.bet, me.stack) : 0;
  const canCheck = toCall <= 0;
  const maxTo = me ? me.bet + me.stack : 0; // all-in target
  const minTo = Math.min(state.minRaiseTo, maxTo);
  const isOpening = state.currentBet === 0;
  const canRaise = isMyTurn && maxTo > state.currentBet;

  const [raiseTo, setRaiseTo] = useState(minTo);
  useEffect(() => setRaiseTo(minTo), [minTo, state.handNumber, state.stage]);
  const amount = Math.max(minTo, Math.min(raiseTo, maxTo));

  const presets = useMemo(() => {
    const pot = state.pot;
    return [
      { label: '½ pot', value: state.currentBet + Math.floor(pot / 2) },
      { label: '¾ pot', value: state.currentBet + Math.floor((pot * 3) / 4) },
      { label: 'Pot', value: state.currentBet + pot },
      { label: '2× pot', value: state.currentBet + pot * 2 },
    ].filter((p) => p.value > minTo && p.value < maxTo);
  }, [state.pot, state.currentBet, minTo, maxTo]);

  const status = (() => {
    if (!me) {
      if (state.isPrivate && !state.canSit) return 'Invite-only table — you can watch and chat';
      return state.seats.length >= state.maxPlayers ? 'Table full — watching' : 'Pick an open seat to play';
    }
    if (state.stage === 'waiting') {
      return state.waitingFor > 0
        ? `Waiting for ${state.waitingFor} more player${state.waitingFor === 1 ? '' : 's'}`
        : 'Hand starting soon…';
    }
    if (state.stage === 'showdown') return 'Showdown';
    if (me.folded) return 'You folded — next hand soon';
    if (me.allIn) return 'You’re all-in';
    if (acting) return `${displayName(acting.handle, acting.address)} to act…`;
    return 'Waiting…';
  })();

  const fillPct = maxTo > minTo ? ((amount - minTo) / (maxTo - minTo)) * 100 : 0;
  const btn = cn(
    'hp-display hp-w80 flex items-center justify-center whitespace-nowrap rounded-lg px-2 uppercase transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-35',
    compact ? 'h-11 text-[15px]' : 'h-12 text-[16px] sm:h-14 sm:text-[19px]',
  );

  return (
    <div
      className={cn(
        'flex w-full flex-col rounded-xl border border-cream/[0.12] bg-gradient-to-b from-[#0e1009] to-[#080805]',
        compact ? 'gap-2 p-2' : 'gap-2.5 px-3 pb-3 pt-2.5 sm:px-3.5',
      )}
    >
      {/* Top row: fixed height whatever it holds */}
      <div className={cn('flex min-w-0 items-center gap-3', compact ? 'h-9' : 'h-11 sm:h-12')}>
        {canRaise ? (
          <>
            <span className="flex min-w-[64px] flex-col leading-none sm:min-w-[92px]">
              <span className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-dim sm:text-[9.5px]">
                {isOpening ? 'Bet' : 'Raise to'}
              </span>
              <span className={cn('hp-display hp-w80 tabular-nums text-acid', compact ? 'text-[20px]' : 'text-[22px] sm:text-[30px]')}>
                {formatChips(amount)}
              </span>
            </span>
            <input
              type="range"
              min={minTo}
              max={maxTo}
              step={state.smallBlind}
              value={amount}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              className="hp-bet min-w-0 flex-1"
              style={{ '--fill': `${fillPct}%` } as React.CSSProperties}
              aria-label="Raise amount"
            />
            {!compact && presets.length > 0 && (
              <div className="hidden gap-1.5 md:flex">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setRaiseTo(p.value)}
                    className="whitespace-nowrap rounded-btn border border-cream/20 bg-cream/[0.05] px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#c9cdc2] transition-colors hover:border-acid hover:text-acid"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
            {isMyTurn ? (
              <span className="truncate text-acid">Your turn — call or fold</span>
            ) : (
              <>
                {acting && me && !me.folded && state.stage !== 'showdown' && (
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-acid" />
                )}
                <span className="truncate">{status}</span>
              </>
            )}
          </p>
        )}
      </div>

      <div
        className={cn(
          'grid gap-2',
          columns === 2 && 'grid-cols-2',
          columns === 4 && 'grid-cols-4',
          columns === 'auto' && 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        <button
          className={cn(btn, 'bg-[#ff3b52] text-white hover:bg-[#ff5566]')}
          disabled={!isMyTurn}
          onClick={() => onAct('fold')}
        >
          Fold
        </button>
        <button
          className={cn(btn, 'border-2 border-acid bg-acid/10 text-acid hover:bg-acid/[0.22]')}
          disabled={!isMyTurn}
          onClick={() => onAct(canCheck ? 'check' : 'call')}
        >
          {canCheck || !isMyTurn ? 'Check' : `Call ${formatChips(toCall)}`}
        </button>
        <button
          className={cn(
            btn,
            'bg-acid text-ink shadow-[0_0_0_1px_rgba(204,255,0,0.4),0_8px_24px_rgba(204,255,0,0.22)] hover:bg-acid-hover',
          )}
          disabled={!canRaise}
          onClick={() => onAct(isOpening ? 'bet' : 'raise', amount)}
        >
          {canRaise ? `${isOpening ? 'Bet' : 'Raise'} ${formatChips(amount)}` : 'Raise'}
        </button>
        <button
          className={cn(btn, 'border-2 border-cream/45 bg-cream/[0.07] text-cream hover:bg-cream hover:text-ink')}
          disabled={!isMyTurn}
          onClick={() => onAct('allin')}
        >
          All-in
        </button>
      </div>
    </div>
  );
}
