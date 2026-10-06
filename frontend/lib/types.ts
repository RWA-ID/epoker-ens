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
  /** Display name: a hoodfi.eth subname, a mainnet ENS name, or null. */
  handle: string | null;
  /** Raw `avatar` text record — NOT a resolved URL. See lib/avatar.ts. */
  avatar: string | null;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  acting: boolean;
  isButton: boolean;
  /** A house bot (practice table only). */
  bot?: boolean;
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
  /** Smallest legal raise target *for you*, capped at your all-in. */
  minRaiseTo: number;
  seats: SeatView[];
  holeCards: Card[];
  yourSeat: number | null;
  actionDeadline: number | null;
  waitingFor: number;
  /** Private tables are unlisted and only whitelisted players may sit. */
  isPrivate: boolean;
  /** Whether YOU are allowed to take a seat (always true on public tables). */
  canSit: boolean;
  /** Guest list — only present on private tables. */
  whitelist?: WhitelistEntry[];
  /** Practice table: bots fill empty seats, no bankroll or leaderboard. */
  practice?: boolean;
  /** The table's voice Space — only on tables created with one. */
  space?: SpaceView;
}

/* ---------- Spaces (voice rooms on a table — see worker/src/space.ts) ---------- */

export type SpaceRole = 'host' | 'cohost' | 'speaker' | 'listener';

export interface SpaceMember {
  address: string;
  handle: string | null;
  avatar: string | null;
  role: SpaceRole;
  /** Holds an audio connection right now. */
  inAudio: boolean;
  /** Publishing a mic track (may still be self-muted). */
  speaking: boolean;
  /** Self-muted, host-muted, or simply not publishing. */
  muted: boolean;
}

/** A live speaker track to pull from the SFU. */
export interface SpaceTrack {
  address: string;
  sessionId: string;
  trackName: string;
}

export interface SpaceView {
  /** The worker has SFU credentials. False = show the Space, but it can't start. */
  enabled: boolean;
  live: boolean;
  startedAt: number | null;
  host: string;
  /** Your role, or null when signed out. */
  you: SpaceRole | null;
  youInAudio: boolean;
  handRaised: boolean;
  /** Private tables: only the guest list may listen. */
  canJoin: boolean;
  /** Host, co-hosts and speakers who are here. */
  stage: SpaceMember[];
  /** Raised hands, oldest first. */
  hands: SpaceMember[];
  listeners: number;
  tracks: SpaceTrack[];
}

/** One invited player on a private table's guest list. */
export interface WhitelistEntry {
  address: string; // lowercase 0x…
  handle: string | null;
}

export interface HandResultShare {
  seat: number;
  address: string;
  handle: string | null;
  amount: number;
  handName: string | null;
  cards?: Card[];
}

export interface ChatMessage {
  address: string;
  handle: string | null;
  text: string;
  ts: number;
}

/** One invited player on a private table's guest list. */
export interface WhitelistEntry {
  address: string; // lowercase 0x…
  handle: string | null;
}

export interface HandResultShare {
  seat: number;
  address: string;
  handle: string | null;
  amount: number;
  handName: string | null;
  cards?: Card[];
}

export interface ChatMessage {
  address: string;
  handle: string | null;
  text: string;
  ts: number;
}

export type ClientMessage =
  | { type: 'sit'; seat: number }
  | { type: 'leave' }
  | { type: 'action'; action: ActionType; amount?: number }
  | { type: 'chat'; text: string }
  | { type: 'ping' }
  | { type: 'space:start' | 'space:end' | 'space:raise' | 'space:lower' | 'space:hangup' }
  | { type: 'space:invite' | 'space:remove' | 'space:mute'; address: string }
  | { type: 'space:cohost'; address: string; on: boolean }
  | { type: 'space:selfmute'; muted: boolean };

/** One line of the hand log: an action, a blind, a street or a win. */
export interface HandLogEntry {
  hand: number;
  /** The player the line is about; null for dealer lines (a new hand, a street). */
  address: string | null;
  handle: string | null;
  /** "posts SB", "folds", "raises to", "wins with Two Pair", "Flop"… */
  text: string;
  amount: number | null;
  cards?: Card[];
  ts: number;
}

export type ServerMessage =
  | { type: 'state'; state: TableView }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'handResult'; winners: HandResultShare[]; board: Card[] }
  | { type: 'log'; entry: HandLogEntry }
  | { type: 'error'; error: string }
  | { type: 'notice'; text: string }
  | { type: 'pong' };

export interface LobbyTable {
  id: string;
  name: string;
  smallBlind: number;
  seats: number;
  status: 'waiting' | 'playing';
  createdAt: number;
  /** The always-on practice table against house bots. */
  practice?: boolean;
}

export interface PlayerProfile {
  address: string;
  handle: string | null;
  /** The name they chose to play under (set from the name picker). */
  handlePick?: string | null;
  avatar: string | null;
  bankroll: number;
  netProfit: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
  lastClaim: number;
}

export interface LeaderboardRow {
  address: string;
  handle: string | null;
  avatar: string | null;
  netProfit: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
}
