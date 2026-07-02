/**
 * Wire-protocol types — MIRROR of worker/src/poker/types.ts.
 * Keep the two files in sync when changing the protocol.
 */

export type Card = string; // e.g. "As", "Td"

export type Stage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface SeatView {
  seat: number;
  address: string;
  ensName: string | null;
  avatar: string | null;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  acting: boolean;
  isButton: boolean;
  shownCards?: Card[];
}

export interface TableView {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  minPlayers: number;
  maxPlayers: number;
  stage: Stage;
  handNumber: number;
  community: Card[];
  pot: number;
  currentBet: number;
  minRaiseTo: number;
  seats: SeatView[];
  holeCards: Card[];
  yourSeat: number | null;
  actionDeadline: number | null;
  waitingFor: number;
}

export interface HandResultShare {
  seat: number;
  address: string;
  ensName: string | null;
  amount: number;
  handName: string | null;
  cards?: Card[];
}

export interface ChatMessage {
  address: string;
  ensName: string | null;
  text: string;
  ts: number;
}

export type ClientMessage =
  | { type: 'sit'; seat: number }
  | { type: 'leave' }
  | { type: 'action'; action: ActionType; amount?: number }
  | { type: 'chat'; text: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'state'; state: TableView }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'handResult'; winners: HandResultShare[]; board: Card[] }
  | { type: 'error'; error: string }
  | { type: 'pong' };

export interface LobbyTable {
  id: string;
  name: string;
  smallBlind: number;
  seats: number;
  status: 'waiting' | 'playing';
  createdAt: number;
}

export interface PlayerProfile {
  address: string;
  ensName: string | null;
  bankroll: number;
  netProfit: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
  lastClaim: number;
}

export interface LeaderboardRow {
  address: string;
  ensName: string | null;
  netProfit: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
}
