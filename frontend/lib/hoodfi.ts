'use client';
/**
 * Finding a player's hoodfi.eth handle on Robinhood Chain.
 *
 * The registry is a plain ERC721 (NOT Enumerable) whose token ids are
 * namehashes rather than a sequence, so `tokenOfOwnerByIndex` does not exist
 * and ids cannot be walked. The one log indexed by recipient is ERC721
 * `Transfer(from, to, tokenId)`, so:
 *
 *   1. getLogs Transfer where `to` == player, from the registry's deploy
 *      block, in 9M-block windows (the RPC refuses a range over 10M). Because
 *      `to` is indexed each window is a cheap filtered query, not a wide scan.
 *   2. Re-check `owner(node)` for each hit. A Transfer log says the address
 *      received the name once, not that it still holds it: 6 of 25 names in
 *      the first real scan had since moved on. The index is a candidate list,
 *      never an ownership oracle.
 *   3. Read `names(node)` (DNS-encoded) and the `avatar` text record in the
 *      same pass, decoding the name client-side.
 *
 * Reverse resolution is deliberately not used: a hoodfi subname lives on L2
 * and its holder has no mainnet primary name, so `getEnsName(address)` returns
 * null for every one of them.
 */
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, type Address } from 'viem';
import { robinhood } from './chains';
import {
  HOODFI_REGISTRY,
  HOODFI_REGISTRY_ABI,
  HOODFI_REGISTRY_DEPLOY_BLOCK,
  ROBINHOOD_RPC_URL,
  TRANSFER_EVENT,
} from './config';
import { getLogsInWindows } from './logs';

export interface HoodfiName {
  name: string;
  node: `0x${string}`;
  /** Raw avatar text record, or null. Resolve with lib/avatar.ts. */
  avatar: string | null;
}

export const client = createPublicClient({
  chain: robinhood,
  transport: http(ROBINHOOD_RPC_URL),
});

/** DNS wire format (\x02gm\x06hoodfi\x03eth\x00) -> "gm.hoodfi.eth". */
export function decodeDnsName(hex: string): string | null {
  const bytes = hex.startsWith('0x') ? hex.slice(2) : hex;
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = parseInt(bytes.slice(i, i + 2), 16);
    if (Number.isNaN(len)) return null;
    if (len === 0) break;
    i += 2;
    const label = bytes.slice(i, i + len * 2);
    if (label.length < len * 2) return null;
    let out = '';
    for (let j = 0; j < label.length; j += 2) {
      out += String.fromCharCode(parseInt(label.slice(j, j + 2), 16));
    }
    labels.push(out);
    i += len * 2;
  }
  return labels.length ? labels.join('.') : null;
}

const toNode = (tokenId: bigint) =>
  `0x${tokenId.toString(16).padStart(64, '0')}` as `0x${string}`;

/**
 * Every hoodfi name the address currently owns, best default first: a direct
 * name (michael.hoodfi.eth) before a deeper subname (nft.gm.hoodfi.eth), then
 * the shortest. Sorting on length alone put nft.gm.hoodfi.eth (17 chars)
 * ahead of michael.hoodfi.eth (18) — someone else's subtree as your name.
 */
export async function hoodfiNamesFor(address: Address): Promise<HoodfiName[]> {
  // One query from block 0 started failing once the chain passed the RPC's
  // 10M-block cap — every player lost their name, silently. See lib/logs.ts.
  const logs = await getLogsInWindows(client, HOODFI_REGISTRY_DEPLOY_BLOCK, (fromBlock, toBlock) =>
    client.getLogs({
      address: HOODFI_REGISTRY,
      event: TRANSFER_EVENT,
      args: { to: address },
      fromBlock,
      toBlock,
    }),
  );

  // One address can receive the same name twice (out and back).
  const nodes = [...new Set(logs.map((l) => toNode(l.args.tokenId as bigint)))];
  if (nodes.length === 0) return [];

  const settled = await Promise.all(
    nodes.map(async (node): Promise<HoodfiName | null> => {
      try {
        const owner = await client.readContract({
          address: HOODFI_REGISTRY,
          abi: HOODFI_REGISTRY_ABI,
          functionName: 'owner',
          args: [node],
        });
        // Transferred away since the log — not theirs any more.
        if (owner.toLowerCase() !== address.toLowerCase()) return null;

        const [encoded, avatar] = await Promise.all([
          client.readContract({
            address: HOODFI_REGISTRY,
            abi: HOODFI_REGISTRY_ABI,
            functionName: 'names',
            args: [node],
          }),
          client
            .readContract({
              address: HOODFI_REGISTRY,
              abi: HOODFI_REGISTRY_ABI,
              functionName: 'text',
              args: [node, 'avatar'],
            })
            .catch(() => ''),
        ]);

        const name = decodeDnsName(encoded);
        return name ? { name, node, avatar: avatar || null } : null;
      } catch {
        // A single throttled read shouldn't lose every other name.
        return null;
      }
    }),
  );

  return settled
    .filter((n): n is HoodfiName => n !== null)
    .sort(compareNames);
}

const depth = (name: string) => name.split('.').length;

/** Direct names first, then shortest, then A–Z. */
export function compareNames(a: { name: string }, b: { name: string }): number {
  return depth(a.name) - depth(b.name) || a.name.length - b.name.length || a.name.localeCompare(b.name);
}

export function useHoodfiNames(address: Address | undefined) {
  return useQuery({
    queryKey: ['hoodfi-names', address?.toLowerCase()],
    queryFn: () => hoodfiNamesFor(address!),
    enabled: !!address,
    staleTime: 5 * 60_000,
    // The public RPC throttles; one retry, then fall back to a mainnet name.
    retry: 1,
  });
}
