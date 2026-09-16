'use client';
/**
 * Finding a player's hoodfi.eth handle on Robinhood Chain.
 *
 * The registry is a plain ERC721 (NOT Enumerable) whose token ids are
 * namehashes rather than a sequence, so `tokenOfOwnerByIndex` does not exist
 * and ids cannot be walked. The one log indexed by recipient is ERC721
 * `Transfer(from, to, tokenId)`, so:
 *
 *   1. getLogs Transfer where `to` == player, from block 0. Because `to` is
 *      indexed this is a cheap filtered query, not a wide scan — measured at
 *      ~125ms over the whole chain on the public RPC.
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
  ROBINHOOD_RPC_URL,
  TRANSFER_EVENT,
} from './config';

export interface HoodfiName {
  name: string;
  node: `0x${string}`;
  /** Raw avatar text record, or null. Resolve with lib/avatar.ts. */
  avatar: string | null;
}

const client = createPublicClient({
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
 * Every hoodfi name the address currently owns, shortest label first so the
 * punchiest handle wins by default.
 */
export async function hoodfiNamesFor(address: Address): Promise<HoodfiName[]> {
  const logs = await client.getLogs({
    address: HOODFI_REGISTRY,
    event: TRANSFER_EVENT,
    args: { to: address },
    fromBlock: 0n,
    toBlock: 'latest',
  });

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
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
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
