/**
 * `eth_getLogs` over a range wider than the RPC will answer in one request.
 *
 * The Robinhood Chain RPC refuses any log query spanning more than 10,000,000 blocks
 * (inclusive) with -32602 "narrow the block range". Blocks come fast enough that every
 * "from the deploy block to latest" query in this repo crossed that line on its own —
 * no code change, just a chain growing past it — and each one failed from then on.
 *
 * So the range is split into fixed windows, read a few at a time, and joined back in
 * block order. Any window failing fails the whole read: a list assembled from the
 * windows that happened to answer would drop names without saying so, which is the
 * failure these callers exist to avoid.
 *
 * Copied from hoodfi-eth/frontend/lib/logs.ts, which hit the same cap first. Keep the
 * two in step.
 */

/** Under the 10M cap with room to spare; also keeps any single response a sane size. */
export const LOG_WINDOW = 9_000_000n;

/** Windows in flight at once. The public RPC rate-limits per IP. */
const CONCURRENCY = 4;

export async function getLogsInWindows<T>(
  client: { getBlockNumber: () => Promise<bigint> },
  fromBlock: bigint,
  read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>
): Promise<T[]> {
  const latest = await client.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let start = fromBlock; start <= latest; start += LOG_WINDOW) {
    const end = start + LOG_WINDOW - 1n;
    ranges.push([start, end < latest ? end : latest]);
  }

  const parts: T[][] = new Array(ranges.length);
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(([a, b]) => read(a, b)));
    results.forEach((logs, j) => (parts[i + j] = logs));
  }
  return parts.flat();
}
