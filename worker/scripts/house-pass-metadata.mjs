#!/usr/bin/env node
/**
 * House Pass metadata: deals the tiers across token ids and writes the files
 * OpenSea's reveal and the worker's perks both read.
 *
 *   node scripts/house-pass-metadata.mjs --seed=<block hash> --image-base=ipfs://<CID>/
 *
 * Tiers, supplies and chip stacks come from ../frontend/lib/house-pass.json —
 * the same file the site renders — so the page can't promise one split while
 * the collection ships another. The run refuses if the supplies don't add up
 * to totalSupply.
 *
 * Fairness: the deal is a Fisher–Yates shuffle driven by sha256(seed ‖ i).
 * Use a seed nobody knows before the mint ends — the hash of a Robinhood Chain
 * block AFTER the last mint, announced in advance by height. Dealt before
 * then, anyone holding the file could time a mint onto a Crown Jewel id. The
 * art stays hidden behind OpenSea's pre-reveal until this runs.
 *
 * Output (gitignored): metadata-out/<seed prefix>/
 *   json/<tokenId>     ERC721 metadata, no extension (a baseURI layout)
 *   metadata.csv       the same, one row per token, for OpenSea Studio's
 *                      bulk upload — check its header against OpenSea's own
 *                      template before uploading; Studio has renamed columns before
 *   assignment.json    { seed, tiers, tokens: { "<id>": "<tier id>" } } — what
 *                      the worker will read to credit each token's chip stack
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }),
);
if (!args.seed) throw new Error('--seed=<hash of a block mined after the mint closes> is required');
const IMAGE_BASE = args['image-base'] ?? 'ipfs://REPLACE_WITH_ART_CID/';
const FIRST_ID = Number(args.start ?? 1); // OpenSea Studio (SeaDrop) mints from token id 1

const { totalSupply, tiers } = JSON.parse(readFileSync(new URL('../../frontend/lib/house-pass.json', import.meta.url), 'utf8'));
const sum = tiers.reduce((n, t) => n + t.supply, 0);
if (sum !== totalSupply) throw new Error(`tier supplies add up to ${sum}, not ${totalSupply} — fix frontend/lib/house-pass.json`);

// One slot per pass, in tier order, then shuffled.
const deck = tiers.flatMap((t) => Array(t.supply).fill(t.id));
const rand = (i) => createHash('sha256').update(`${args.seed}:${i}`).digest().readUIntBE(0, 6); // 48 bits; bias ≈ 1e-11
for (let i = deck.length - 1; i > 0; i--) {
  const j = rand(i) % (i + 1);
  [deck[i], deck[j]] = [deck[j], deck[i]];
}

const byId = Object.fromEntries(tiers.map((t) => [t.id, t]));
const n = (x) => x.toLocaleString('en-US');
const metadata = (tokenId, tier) => ({
  name: `House Pass #${tokenId} — ${tier.name}`,
  description:
    `HoodPoker House Pass: ${tier.name}, 1 of ${n(tier.supply)}. Membership for HoodPoker, free-chip Texas Hold'em on Robinhood Chain. ` +
    `Comes with a one-time ${n(tier.chips)}-chip stack, credited once per pass. Chips are virtual play chips with no cash value — ` +
    'they cannot be sold, transferred, withdrawn or redeemed. Perks: https://hoodpoker.fun/pass/',
  image: `${IMAGE_BASE}${tier.image}`,
  external_url: 'https://hoodpoker.fun/pass/',
  attributes: [
    { trait_type: 'Tier', value: tier.name },
    { trait_type: 'Rarity', value: `1 of ${n(tier.supply)}` },
    { trait_type: 'Chip Stack', value: tier.chips, display_type: 'number' },
    { trait_type: 'Card', value: tier.card },
  ],
});

const dir = join('metadata-out', String(args.seed).replace(/^0x/, '').slice(0, 12));
mkdirSync(join(dir, 'json'), { recursive: true });
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const rows = ['tokenID,name,description,file_name,external_url,attributes[Tier],attributes[Rarity],attributes[Chip Stack],attributes[Card]'];
const tokens = {};
deck.forEach((tierId, i) => {
  const id = FIRST_ID + i;
  const tier = byId[tierId];
  const m = metadata(id, tier);
  tokens[id] = tierId;
  writeFileSync(join(dir, 'json', String(id)), JSON.stringify(m));
  rows.push([id, m.name, m.description, tier.image, m.external_url, tier.name, `1 of ${n(tier.supply)}`, tier.chips, tier.card].map(csvCell).join(','));
});
writeFileSync(join(dir, 'metadata.csv'), rows.join('\n') + '\n');
writeFileSync(join(dir, 'assignment.json'), JSON.stringify({ seed: args.seed, firstId: FIRST_ID, tiers, tokens }, null, 1));

const counts = {};
for (const t of deck) counts[t] = (counts[t] ?? 0) + 1;
console.log(`Dealt ${deck.length} passes (ids ${FIRST_ID}–${FIRST_ID + deck.length - 1}) with seed ${args.seed}`);
for (const t of tiers) console.log(`  ${t.name.padEnd(15)} ${String(counts[t.id]).padStart(5)}  ${n(t.chips).padStart(9)} chips`);
console.log(`Wrote ${dir}/ — json/, metadata.csv, assignment.json`);
