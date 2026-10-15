/**
 * House Pass: tiers, perks and mint stages, shared by the landing section
 * (#pass) and the perks page (/pass/).
 *
 * Tier numbers live in house-pass.json, which worker/scripts/house-pass-metadata.mjs
 * also reads to deal the collection, so the page and the NFTs can't disagree.
 *
 * Perks are still promises, not behaviour: the worker grants every player the
 * same DAILY_CHIPS today and reads nothing about passes. Hector's call
 * (2026-09-22): build them into the worker when the collection is live and
 * its contract address and reveal are known.
 */
import data from './house-pass.json';

export interface PassTier {
  id: string;
  name: string;
  supply: number;
  /** One-time chip stack, credited once per token per wallet. */
  chips: number;
  /** Chips this token pays every 12 hours. */
  claimChips: number;
  /** The caption printed on the card art. */
  card: string;
}

/** Rarest first. */
export const PASS_TIERS: PassTier[] = data.tiers;
export const PASS_SUPPLY = data.totalSupply;
export const PUBLIC_PRICE_ETH = data.publicPriceEth;

export const fmt = (x: number) => x.toLocaleString('en-US');
export const tierArt = (id: string) => `/pass/${id}.jpg`;

/**
 * What every pass gets, whatever its tier. All table time, hosting or
 * cosmetics — nothing changes the cards, the odds or the leaderboard
 * (which ranks profit per hand). DAILY_CHIPS is 5,000 on a 24h cooldown today.
 */
export const MEMBER_PERKS = [
  { title: 'Chips every 12 hours', body: 'a flat 15,000 per pass from mint day; at the reveal each pass switches to its tier’s drop, from 15,000 to 100,000. On top of the free daily chips, and each pass you hold pays.' },
  { title: 'Bust-out top-up', body: 'run your stack to zero and get back in once a day, without waiting for the drop.' },
  { title: 'Team tournaments', body: 'build a team and host bracket nights. Anyone can play in them — members run them.' },
  { title: 'A room that stays', body: 'a permanent private table with your name on it, reserved seats and a spectator link.' },
  { title: 'Member cosmetics', body: 'a tier badge on your seat, alternate card backs and felt tints. Never an edge in a hand.' },
  { title: 'Your numbers', body: 'full hand history export, per-opponent stats and season flair on the board.' },
  { title: 'First through the door', body: 'new modes — sit-and-go, Omaha — open to passes before anyone else.' },
];

/** CCFF00 cut, taken early and published: public/pass/ccff00-snapshot.json. */
export const CCFF00_SNAPSHOT = {
  date: 'October 2',
  block: 78244737,
  holders: 4343,
  cap: 3333,
  url: '/pass/ccff00-snapshot.json',
};

/** Whitelist and HoodFi names are snapshotted on this day; sign-ups close then. */
export const SNAPSHOT_DATE = 'October 14';

/** Sign-ups closed at the snapshot (worker WHITELIST_OPEN=0, 2026-10-14). */
export const WHITELIST_CLOSED = true;

/**
 * Mint stages, back to back on OpenSea, times in AST (UTC-4). Caps are
 * Hector's 2026-10-01 numbers; the whitelist cap is enforced live by
 * worker/src/whitelist.ts. Allowlist stages are free; public pays
 * PUBLIC_PRICE_ETH toward development, infrastructure and maintenance. The
 * team stage (100 to one wallet, for giveaways) runs 5:00–5:30pm first and
 * isn't listed.
 */
/** The drop on OpenSea. Linked from the countdown in #pass and on /pass/. */
export const OPENSEA_URL = 'https://opensea.io/collection/hoodpoker/overview';

export const MINT_STAGES = [
  {
    name: 'CCFF00 holders',
    cap: '3,333',
    price: 'Free',
    when: 'Oct 15 · 5:30pm, 2 hours',
    start: '2026-10-15T17:30:00-04:00',
    end: '2026-10-15T19:30:00-04:00',
    who: `snapshot taken ${CCFF00_SNAPSHOT.date}: the 3,333 longest of ${fmt(CCFF00_SNAPSHOT.holders)} holders, one pass each`,
  },
  {
    name: 'Whitelist',
    cap: '2,222',
    price: 'Free',
    when: 'Oct 15 · 7:30pm, 2 hours',
    start: '2026-10-15T19:30:00-04:00',
    end: '2026-10-15T21:30:00-04:00',
    who: `one per person, signed up before the ${SNAPSHOT_DATE} snapshot, including CCFF00 holders who missed the cut`,
  },
  {
    name: 'HoodFi name owners',
    cap: '1,111',
    price: 'Free',
    when: 'Oct 15 · 9:30pm, 2 hours',
    start: '2026-10-15T21:30:00-04:00',
    end: '2026-10-15T23:30:00-04:00',
    who: `two per wallet that owns a hoodfi.eth name at the ${SNAPSHOT_DATE} snapshot`,
  },
  {
    name: 'Public',
    cap: '1,111',
    price: `${PUBLIC_PRICE_ETH} ETH`,
    when: 'Oct 15 · 11:30pm, until Jan 1 · 6:37am',
    start: '2026-10-15T23:30:00-04:00',
    end: '2027-01-01T06:37:00-04:00',
    who: 'one per wallet, open to anyone, for 77 days, 7 hours and 7 minutes. The price funds development, infrastructure and maintenance',
  },
];

/**
 * HoodFi bonuses: for name owners, pass or no pass. Unlike the pass perks
 * these are live in the worker (POST /bonus/hoodfi-weekly, /bonus/widget).
 */
export const HOODFI_WEEKLY_CHIPS = 50_000;
export const WIDGET_BONUS_CHIPS = 100_000;
export const HOODFI_BONUSES = [
  { title: `${fmt(HOODFI_WEEKLY_CHIPS)} chips every Friday`, body: 'for any wallet that owns a hoodfi.eth name. A new week opens each Friday at midnight AST; claim it any time before the next one.' },
  { title: `${fmt(WIDGET_BONUS_CHIPS)} chips, once`, body: 'register a hoodfi.eth name through the widget here on HoodPoker and that wallet gets a one-time bonus.' },
];
