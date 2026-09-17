/**
 * House bots for the practice table.
 *
 * Deliberately simple and a little loose: a bot estimates how strong its hand
 * is (0..1), adds some noise so it isn't a lookup table, and then picks an
 * action that is always legal for the spot it was handed. The table still
 * validates every action — decideBotAction() never gets to bypass the rules.
 */
import type { ActionType, Card } from './types';
import { rankOf, suitOf } from './deck';
import { evaluate5 } from './evaluator';

export interface BotSpot {
  hole: Card[];
  board: Card[];
  stack: number;
  /** Chips this bot already has in on this street. */
  streetBet: number;
  currentBet: number;
  minRaise: number;
  /** Total chips committed to the hand so far, all players. */
  pot: number;
  bigBlind: number;
  /** Other players still in the hand. */
  opponents: number;
}

export interface BotDecision {
  action: ActionType;
  /** TOTAL street bet to raise to — only for bet/raise. */
  amount?: number;
}

export const BOT_NAMES = [
  'Rook', 'Vega', 'Maverick', 'Nova', 'Ledger', 'Pixel', 'Moxie', 'Bishop',
];

/** Best 5-card score from 5–7 cards. */
export function bestScore(cards: Card[]): number {
  if (cards.length < 5) return -1;
  let best = -1;
  const n = cards.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          for (let e = d + 1; e < n; e++) {
            const s = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (s > best) best = s;
          }
        }
      }
    }
  }
  return best;
}

const category = (score: number) => Math.floor(score / 16 ** 5);

/** Rough pre-flop strength, 0..1. */
function preflopStrength(hole: Card[]): number {
  const [hi, lo] = hole.map(rankOf).sort((x, y) => y - x);
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  if (hi === lo) return Math.min(1, 0.5 + (hi - 2) * 0.04); // 22 = .50, AA = .98
  let s = (hi + lo - 4) / 48; // 32o ≈ .02, AKo ≈ .46
  if (suited) s += 0.06;
  if (hi - lo === 1) s += 0.04;
  if (hi >= 13) s += 0.08;
  return Math.min(0.9, s);
}

/** Rough post-flop strength, 0..1. */
function postflopStrength(hole: Card[], board: Card[]): number {
  const cat = category(bestScore([...hole, ...board]));
  // A made hand that lives entirely on the board belongs to everyone.
  const boardCat = board.length === 5 ? category(bestScore(board)) : -1;
  if (cat === boardCat) return 0.15;

  let s = [0.12, 0.45, 0.68, 0.8, 0.86, 0.9, 0.95, 0.99, 1][cat];
  if (cat === 1) {
    // Top pair (or an overpair) beats a pair made with a low board card.
    const top = Math.max(...board.map(rankOf));
    const [h1, h2] = hole.map(rankOf);
    const topPair = h1 === top || h2 === top || (h1 === h2 && h1 > top);
    s += topPair ? 0.12 : -0.05;
  }
  // Four to a flush with cards still to come.
  if (board.length < 5 && cat < 5) {
    const suits = new Map<string, number>();
    for (const c of [...hole, ...board]) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
    const draw = [...suits.entries()].some(([suit, n]) => n === 4 && hole.some((h) => suitOf(h) === suit));
    if (draw) s += 0.15;
  }
  return Math.min(1, s);
}

export function decideBotAction(spot: BotSpot, rng: () => number = Math.random): BotDecision {
  const { stack, streetBet, currentBet, minRaise, pot, bigBlind } = spot;
  const toCall = Math.max(0, currentBet - streetBet);
  const maxTarget = streetBet + stack;

  const raw = spot.board.length === 0
    ? preflopStrength(spot.hole)
    : postflopStrength(spot.hole, spot.board);
  // Noise, and a little respect for crowded pots.
  const s = raw + (rng() - 0.5) * 0.2 - 0.04 * Math.max(0, spot.opponents - 1);

  /** Bet/raise to roughly `size` more than the current bet, legally. */
  const aggress = (size: number): BotDecision => {
    const target = Math.max(currentBet + minRaise, currentBet + Math.round(size / bigBlind) * bigBlind);
    if (target >= maxTarget) return { action: 'allin' };
    return { action: currentBet === 0 ? 'bet' : 'raise', amount: target };
  };

  if (toCall === 0) {
    if (s > 0.72) return aggress(pot * (0.5 + rng() * 0.3));
    if (s > 0.5 && rng() < 0.35) return aggress(pot * 0.5);
    if (rng() < 0.06) return aggress(pot * 0.5); // the occasional bluff
    return { action: 'check' };
  }

  if (s > 0.85 && rng() < 0.6) return aggress(Math.max(pot, bigBlind * 3));
  const potOdds = toCall / (pot + toCall);
  if (s > potOdds + 0.25) return toCall >= stack ? { action: 'allin' } : { action: 'call' };
  if (toCall <= bigBlind && s > 0.25) return { action: 'call' };
  return { action: 'fold' };
}
