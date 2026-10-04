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
  /** One-time chip stack, credited once per token ever. */
  chips: number;
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
  { title: '15,000 daily chips', body: 'three times the free drop, claimable every 12 hours instead of 24.' },
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

/**
 * Mint stages. Caps are Hector's 2026-10-01 numbers; the whitelist cap is
 * enforced live by worker/src/whitelist.ts. Allowlist stages are free; public
 * pays PUBLIC_PRICE_ETH toward development, infrastructure and maintenance.
 */
export const MINT_STAGES = [
  {
    name: 'CCFF00 holders',
    cap: '3,333',
    price: 'Free',
    who: `snapshot taken ${CCFF00_SNAPSHOT.date}: the 3,333 longest of ${fmt(CCFF00_SNAPSHOT.holders)} holders, one pass each`,
  },
  { name: 'Whitelist', cap: '2,222', price: 'Free', who: 'one per person — repost our pinned post on X, then sign up with your handle, including CCFF00 holders who missed the cut' },
  { name: 'HoodFi name owners', cap: '1,111', price: 'Free', who: 'own a hoodfi.eth name at the October 13 snapshot' },
  { name: 'Public', cap: '1,111', price: `${PUBLIC_PRICE_ETH} ETH`, who: 'one per wallet, open to anyone. The price funds development, infrastructure and maintenance' },
];
