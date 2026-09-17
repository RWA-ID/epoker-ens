import { sanitizeChat } from '../src/chat.ts';

// [input, expected]  — MUST_KEEP cases are the control: a filter that eats
// these is worse than no filter, because names are the point of the game.
const BLOCK: [string, string][] = [
  ['check https://evil.example.com/free', 'check [link removed]'],
  ['go to http://a.io', 'go to [link removed]'],
  ['www.scam.net now', '[link removed] now'],
  ['claim at grab-chips.xyz/now', 'claim at [link removed]'],
  ['ipfs://QmDEADBEEF look', '[link removed] look'],
  ['data:text/html,<script>alert(1)</script>', '[link removed]'],
  ['javascript:alert(1)', '[link removed]'],
  ['![pic](https://x.com/a.png)', ''],
  ['[click me](https://evil.com)', 'click me'],
  ['visit example.com.', 'visit [link removed].'],
  // ZWSP is stripped first, so the URL reassembles and is replaced whole.
  ['ht\u200btps://sneaky.com', '[link removed]'],
  ['free money at bit.ly/abc', 'free money at [link removed]'],
];

const MUST_KEEP = [
  'gm.hoodfi.eth nice hand',
  'gg wp',
  'vitalik.eth just sat down',
  'nft.gm.hoodfi.eth is mine',
  'I raised to 1.5k',
  'nh, 3.5 bb',
  'foo.com.eth is a weird name',
  'A.K vs 7.2o',
  'hackathon.hoodfi.eth ships',
];

let fail = 0;
console.log('--- must BLOCK ---');
for (const [input, expected] of BLOCK) {
  const got = sanitizeChat(input);
  const ok = got === expected;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${JSON.stringify(input)} -> ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(expected)})`}`);
}
console.log('\n--- must KEEP verbatim (control) ---');
for (const input of MUST_KEEP) {
  const got = sanitizeChat(input);
  const ok = got === input;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
}
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILURES'}`);
// Without this the suite always exits 0 — `npm test` stays green on failures.
process.exit(fail ? 1 : 0);
