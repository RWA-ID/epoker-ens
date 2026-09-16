/**
 * Verifying a claimed table handle.
 *
 * The client resolves its own hoodfi name and sends it along with the sign-in
 * signature. The signature proves the wallet, NOT the name — without a check
 * anybody could sit down as `vitalik.hoodfi.eth`. So the server re-derives the
 * namehash and asks the registry who owns it.
 *
 * This is one `eth_call`, deliberately: enumerating a player's names needs a
 * `getLogs`, and the public Robinhood RPC throttles Cloudflare Workers hard
 * (measured elsewhere at 2/12 success on a wide query). Verification only
 * needs the cheap direction — "does this name belong to this address?" — and
 * the answer is cached in D1 by the caller.
 *
 * A failed verification returns null rather than throwing: a throttled RPC
 * should cost a player their name for one session, not their seat.
 */
import { createPublicClient, http, namehash, type Address } from 'viem';

const HOODFI_REGISTRY = '0xf2bABA012244bdD7445129597350054E1B3aEe5C' as const;

const OWNER_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const robinhood = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
} as const;

/** Labels only, must end in .hoodfi.eth, any depth, sane length. */
const HOODFI_NAME_RE = /^(?:[a-z0-9-]{1,63}\.)+hoodfi\.eth$/;

export function isHoodfiName(name: string): boolean {
  return HOODFI_NAME_RE.test(name) && name.length <= 100;
}

/**
 * Returns the name if this address really owns it, otherwise null.
 * Non-hoodfi names (mainnet ENS) are not checked here — see verifyHandle.
 */
export async function ownsHoodfiName(
  address: string,
  name: string,
  rpcUrl?: string,
): Promise<boolean> {
  if (!isHoodfiName(name)) return false;
  try {
    const client = createPublicClient({
      chain: robinhood,
      transport: http(rpcUrl ?? robinhood.rpcUrls.default.http[0]),
    });
    const owner = await client.readContract({
      address: HOODFI_REGISTRY,
      abi: OWNER_ABI,
      functionName: 'owner',
      args: [namehash(name)],
    });
    return owner.toLowerCase() === address.toLowerCase();
  } catch {
    // Throttled or unreachable — treat as unverified, never as a pass.
    return false;
  }
}

/**
 * Validate a handle a client claims for itself.
 *
 * hoodfi names are verified on-chain. Anything else is accepted only in the
 * shape of a name and is treated as cosmetic — it cannot impersonate a hoodfi
 * player because hoodfi names are the ones that get the on-chain check, and a
 * mainnet name that isn't theirs resolves to someone else's address anyway.
 *
 * Returns the handle to store, or null to store none.
 */
export async function verifyHandle(
  address: Address | string,
  claimed: string | null | undefined,
  rpcUrl?: string,
): Promise<string | null> {
  const name = String(claimed ?? '').trim().toLowerCase();
  if (!name || name.length > 100) return null;

  if (name.endsWith('.hoodfi.eth')) {
    return (await ownsHoodfiName(address, name, rpcUrl)) ? name : null;
  }

  // Plain ENS-shaped name: allow, but never let it masquerade as a hoodfi one.
  if (/^(?:[a-z0-9-]{1,63}\.)+eth$/.test(name)) return name;

  return null;
}
