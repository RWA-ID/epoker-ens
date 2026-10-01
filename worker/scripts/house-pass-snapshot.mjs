#!/usr/bin/env node
/**
 * House Pass snapshot: builds the OpenSea allowlist CSVs from chain + D1.
 *
 *   node scripts/house-pass-snapshot.mjs                       # report only
 *   node scripts/house-pass-snapshot.mjs --write --rule=longest [--dedupe]
 *
 * Rules for the 3,333 CCFF00 spots (4,296-odd holders, so somebody misses out):
 *   longest  earliest-acquired token still held, oldest first (ties: more held)
 *   largest  most CCFF00 held (ties: longest held)
 *   random   keccak(seed ‖ address) order — pass --seed=<announced block hash>
 *
 * --dedupe  a wallet picked for CCFF00 is dropped from the HoodFi list, so one
 *           person gets one allowlist pass. The whitelist already refuses CCFF00
 *           holders at sign-up; it is re-filtered here because a wallet can buy
 *           one after joining.
 *
 * Ownership comes from replaying every Transfer since genesis, then is checked
 * token by token against ownerOf via Multicall3 — a replay bug would otherwise
 * quietly hand someone else's spot away. The run aborts on any mismatch.
 *
 * Output (gitignored): snapshot-out/<UTC timestamp>/ with one CSV per stage in
 * OpenSea's template format, plus report.json holding the full ranking so the
 * cut can be published and checked.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, encodePacked, getAddress, http, keccak256, parseAbi, parseAbiItem } from 'viem';

const RPC = process.env.ROBINHOOD_RPC ?? 'https://rpc.mainnet.chain.robinhood.com';
const CCFF00 = '0x505A22Ffed8d37ebE580FfD98d2Cdb0021189146';
const HOODFI = '0xf2bABA012244bdD7445129597350054E1B3aEe5C';
const CAPS = { ccff00: 3333, hoodfi: 1111, whitelist: 1111 };
const SPAN = 5_000_000n; // largest getLogs range this RPC accepts (measured 2026-10-01)
const IGNORE = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);
const CSV_HEADER = 'Wallet address,Custom mint limit (optional),Custom price in native token e.g. ETH (optional)';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }),
);
const RULE = args.rule ?? 'longest';
if (!['longest', 'largest', 'random'].includes(RULE)) throw new Error(`unknown --rule=${RULE}`);
if (RULE === 'random' && !args.seed) throw new Error('--rule=random needs --seed=<announced block hash>');

const client = createPublicClient({ transport: http(RPC, { retryCount: 0 }) });
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');

/**
 * Logs for one range. A busy range can time out ("log query timed out") on one
 * run and pass the next, so a failure splits the range in half rather than
 * failing the snapshot.
 */
async function logsIn(address, from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.getLogs({ address, event: TRANSFER, fromBlock: from, toBlock: to });
    } catch (err) {
      const throttled = err?.status === 429 || err?.code === 429 || /Too Many Requests/i.test(String(err?.details));
      // Throttled: same range, after a pause. Splitting would only send more requests.
      if (throttled && attempt < 8) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (throttled || to - from < 1000n) throw err;
      const mid = (from + to) / 2n;
      return [...(await logsIn(address, from, mid)), ...(await logsIn(address, mid + 1n, to))];
    }
  }
}

/** Every Transfer of a contract since genesis, in chain order. */
async function allTransfers(address, head) {
  const logs = [];
  for (let to = head; to >= 0n; to -= SPAN) {
    const from = to - SPAN + 1n > 0n ? to - SPAN + 1n : 0n;
    logs.push(...(await logsIn(address, from, to)));
    if (from === 0n) break;
  }
  return logs.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber)));
}

/** tokenId → { owner, since } by replaying transfers. */
function replay(logs) {
  const tokens = new Map();
  for (const l of logs) tokens.set(l.args.tokenId, { owner: l.args.to.toLowerCase(), since: l.blockNumber });
  for (const [id, t] of tokens) if (IGNORE.has(t.owner)) tokens.delete(id); // burned
  return tokens;
}

/**
 * Abort unless ownerOf agrees with the replay for every token.
 *
 * Checked at LATEST, not at `head`: this RPC keeps no old state, and blocks are
 * fast enough that `head` is unreadable within minutes — every call then fails,
 * which looks like thousands of mismatches. A token that moved after `head`
 * must show a Transfer after `head`; that explains it, and the snapshot (taken
 * at `head`) stands. A call that fails is retried, never counted as a mismatch.
 */
async function verifyOwners(address, tokens, head) {
  const ids = [...tokens.keys()];
  const abi = parseAbi(['function ownerOf(uint256) view returns (address)']);
  const differs = [];
  for (let i = 0; i < ids.length; i += 250) {
    const batch = ids.slice(i, i + 250);
    for (let attempt = 0; ; attempt++) {
      const res = await client.multicall({
        contracts: batch.map((id) => ({ address, abi, functionName: 'ownerOf', args: [id] })),
        multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11', // Multicall3, deployed on chain 4663
      }).catch(() => null);
      if (!res || res.some((r) => r.status !== 'success')) {
        if (attempt >= 8) throw new Error(`ownerOf calls kept failing for ${address} — RPC unavailable, not a mismatch`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      res.forEach((r, j) => { if (r.result.toLowerCase() !== tokens.get(batch[j]).owner) differs.push(batch[j]); });
      break;
    }
  }
  if (!differs.length) return 0;
  const latest = await client.getBlockNumber();
  const movedSince = new Set((await logsIn(address, head + 1n, latest)).map((l) => l.args.tokenId));
  const unexplained = differs.filter((id) => !movedSince.has(id));
  for (const id of unexplained.slice(0, 5)) console.error(`  ✗ token ${id}: replay says ${tokens.get(id).owner}, ownerOf disagrees, and it has not moved since the snapshot`);
  if (unexplained.length) throw new Error(`${unexplained.length} unexplained ownerOf mismatches for ${address} — not writing anything`);
  return differs.length; // moved after the snapshot block; the snapshot stands
}

/** address → { held, since } (since = earliest block among tokens still held). */
function holders(tokens) {
  const by = new Map();
  for (const { owner, since } of tokens.values()) {
    const h = by.get(owner) ?? { held: 0, since };
    h.held++;
    if (since < h.since) h.since = since;
    by.set(owner, h);
  }
  return by;
}

function rank(by) {
  const rows = [...by].map(([address, h]) => ({ address, ...h }));
  const byAddr = (a, b) => (a.address < b.address ? -1 : 1);
  if (RULE === 'longest') rows.sort((a, b) => (a.since === b.since ? b.held - a.held || byAddr(a, b) : Number(a.since - b.since)));
  if (RULE === 'largest') rows.sort((a, b) => b.held - a.held || Number(a.since - b.since) || byAddr(a, b));
  if (RULE === 'random') {
    const key = (a) => keccak256(encodePacked(['string', 'address'], [String(args.seed), a]));
    rows.sort((a, b) => (key(a.address) < key(b.address) ? -1 : 1));
  }
  return rows;
}

function whitelistFromD1() {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'epoker', '--remote', '--json', '--command',
    'SELECT address, created_at FROM whitelist ORDER BY created_at, address'], { encoding: 'utf8' });
  return JSON.parse(out)[0].results.map((r) => r.address.toLowerCase());
}

const csv = (addresses) => [CSV_HEADER, ...addresses.map((a) => `${getAddress(a)},1,0`)].join('\n') + '\n';

// ---------------------------------------------------------------------------

const head = await client.getBlockNumber();
console.log(`Snapshot at Robinhood Chain block ${head} · rule=${RULE}${args.dedupe ? ' · dedupe' : ''}`);

const ccTokens = replay(await allTransfers(CCFF00, head));
const ccMoved = await verifyOwners(CCFF00, ccTokens, head);
const cc = holders(ccTokens);
const ccRanked = rank(cc);
const ccPicked = ccRanked.slice(0, CAPS.ccff00);
const ccPickedSet = new Set(ccPicked.map((r) => r.address));
console.log(`CCFF00: ${ccTokens.size} tokens held by ${cc.size} wallets (ownerOf verified${ccMoved ? `; ${ccMoved} moved since` : ''}) → ${ccPicked.length} picked, ${cc.size - ccPicked.length} left out`);

const hfTokens = replay(await allTransfers(HOODFI, head));
const hfMoved = await verifyOwners(HOODFI, hfTokens, head);
const hf = holders(hfTokens);
const hfAll = [...hf.keys()].sort();
const hfOverlap = hfAll.filter((a) => ccPickedSet.has(a));
const hfList = (args.dedupe ? hfAll.filter((a) => !ccPickedSet.has(a)) : hfAll).slice(0, CAPS.hoodfi);
console.log(`HoodFi: ${hfTokens.size} names held by ${hf.size} wallets (ownerOf verified${hfMoved ? `; ${hfMoved} moved since` : ''}); ${hfOverlap.length} also picked for CCFF00 → list ${hfList.length}`);

const wlAll = whitelistFromD1();
const wlNowHolders = wlAll.filter((a) => cc.has(a));
const wlList = wlAll.filter((a) => !cc.has(a)).slice(0, CAPS.whitelist);
console.log(`Whitelist: ${wlAll.length} sign-ups; ${wlNowHolders.length} hold CCFF00 now → list ${wlList.length}`);

const heldDist = {};
for (const h of cc.values()) heldDist[h.held] = (heldDist[h.held] ?? 0) + 1;
console.log('CCFF00 wallets by number held:', heldDist);
if (ccRanked.length > CAPS.ccff00) {
  const last = ccRanked[CAPS.ccff00 - 1], next = ccRanked[CAPS.ccff00];
  console.log(`Cut line: #${CAPS.ccff00} ${last.address} (held ${last.held}, since block ${last.since}) | first out ${next.address} (held ${next.held}, since ${next.since})`);
}

if (!args.write) {
  console.log('\nReport only. Re-run with --write to produce the CSVs.');
  process.exit(0);
}

const dir = join('snapshot-out', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'ccff00.csv'), csv(ccPicked.map((r) => r.address)));
writeFileSync(join(dir, 'hoodfi.csv'), csv(hfList));
writeFileSync(join(dir, 'whitelist.csv'), csv(wlList));
writeFileSync(join(dir, 'report.json'), JSON.stringify({
  block: head.toString(), rule: RULE, seed: args.seed ?? null, dedupe: !!args.dedupe, caps: CAPS,
  ccff00: ccRanked.map((r, i) => ({ rank: i + 1, address: r.address, held: r.held, since: r.since.toString(), picked: i < CAPS.ccff00 })),
  hoodfi: { owners: hfAll.length, overlapWithCcff00: hfOverlap, listed: hfList.length },
  whitelist: { signups: wlAll.length, removedAsCcff00Holders: wlNowHolders, listed: wlList.length },
}, null, 2));
console.log(`\nWrote ${dir}/ — ccff00.csv, hoodfi.csv, whitelist.csv, report.json`);
