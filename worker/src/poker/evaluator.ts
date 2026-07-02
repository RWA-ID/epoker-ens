/**
 * Poker hand evaluator.
 *
 * evaluate5() scores exactly five cards; evaluate7() finds the best
 * five-card hand out of seven (2 hole + 5 board) by checking all 21
 * combinations. Scores are plain numbers — a higher score always wins —
 * packed as:
 *
 *   score = category * 16^5 + kicker1 * 16^4 + kicker2 * 16^3 + ...
 *
 * Each kicker is a card rank (2..14), which fits in 4 bits, so base-16
 * packing gives a total ordering identical to standard poker rules.
 *
 * Categories:
 *   8 straight flush   7 four of a kind   6 full house   5 flush
 *   4 straight         3 three of a kind  2 two pair     1 one pair
 *   0 high card
 */
import type { Card } from './types';
import { rankOf, suitOf } from './deck';

export interface HandScore {
  score: number;
  name: string;
  cards: Card[];
}

const CATEGORY_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

/** Pack a category and up to five kicker ranks into one comparable number. */
function pack(category: number, kickers: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (kickers[i] ?? 0);
  return score;
}

/**
 * Detect a straight in a set of distinct, descending ranks.
 * Returns the high card of the straight, or 0. The wheel (A-2-3-4-5)
 * is handled by treating the ace as rank 1, giving a 5-high straight.
 */
function straightHigh(distinctDesc: number[]): number {
  const ranks = [...distinctDesc];
  if (ranks[0] === 14) ranks.push(1); // ace can play low
  let run = 1;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] - 1) {
      run++;
      if (run >= 5) return ranks[i] + 4;
    } else {
      run = 1;
    }
  }
  return 0;
}

/** Score exactly five cards. */
export function evaluate5(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const isFlush = cards.every((c) => suitOf(c) === suitOf(cards[0]));

  // Count occurrences of each rank, then sort groups by (count, rank)
  // descending — this ordering yields the kicker sequence directly.
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const distinct = groups.map(([r]) => r).sort((a, b) => b - a);
  const straight = counts.size === 5 ? straightHigh(distinct) : 0;

  if (isFlush && straight) return pack(8, [straight]);
  if (groups[0][1] === 4) return pack(7, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, [groups[0][0], groups[1][0]]);
  if (isFlush) return pack(5, ranks);
  if (straight) return pack(4, [straight]);
  if (groups[0][1] === 3) return pack(3, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return pack(2, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2)
    return pack(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]);
  return pack(0, ranks);
}

/** Best five-card hand from seven cards (21 combinations). */
export function evaluate7(seven: Card[]): HandScore {
  let best = -1;
  let bestCards: Card[] = [];
  // Iterate over every pair of indices to EXCLUDE from the seven cards.
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      const five = seven.filter((_, i) => i !== a && i !== b);
      const s = evaluate5(five);
      if (s > best) {
        best = s;
        bestCards = five;
      }
    }
  }
  const category = Math.floor(best / 16 ** 5);
  return { score: best, name: CATEGORY_NAMES[category], cards: bestCards };
}
