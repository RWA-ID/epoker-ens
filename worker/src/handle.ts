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
 *
 * Avatars are read from the same place the name was proven — the hoodfi
 * registry's `avatar` text record, or the mainnet ENS record — and never
 * taken from the client, so nobody can sit down wearing someone else's face.
 */
import { createPublicClient, http, namehash, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

const HOODFI_REGISTRY = '0xf2bABA012244bdD7445129597350054E1B3aEe5C' as const;

const OWNER_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

const DEFAULT_MAINNET_RPC = 'https://ethereum-rpc.publicnode.com';

/** A verified handle and the avatar record read alongside it. */
export interface VerifiedHandle {
  handle: string;
  avatar: string | null;
}

/**
 * Keep only avatar records the client knows how to render, capped in size.
 * lib/avatar.ts handles https, ipfs and eip155 NFT references.
 */
export function cleanAvatar(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v || v.length > 512) return null;
  return /^(https:\/\/|ipfs:\/\/|eip155:\d+\/erc(721|1155):0x[0-9a-fA-F]{40}\/\d+$)/.test(v) ? v : null;
}

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

/** hoodfi avatar text record; null on any failure. */
async function hoodfiAvatar(name: string, rpcUrl?: string): Promise<string | null> {
  try {
    const client = createPublicClient({
      chain: robinhood,
      transport: http(rpcUrl ?? robinhood.rpcUrls.default.http[0]),
    });
    const record = await client.readContract({
      address: HOODFI_REGISTRY,
      abi: OWNER_ABI,
      functionName: 'text',
      args: [namehash(name), 'avatar'],
    });
    return cleanAvatar(record);
  } catch {
    return null;
  }
}

/**
 * Mainnet: the name must resolve forward to this address. (The frontend only
 * offers a player's primary name, which already passed that check client-side,
 * so an honest player never fails it.)
 */
async function verifyMainnetName(
  address: string,
  name: string,
  rpcUrl?: string,
): Promise<VerifiedHandle | null> {
  try {
    const client = createPublicClient({ chain: mainnet, transport: http(rpcUrl ?? DEFAULT_MAINNET_RPC) });
    const normalized = normalize(name);
    const resolved = await client.getEnsAddress({ name: normalized });
    if (!resolved || resolved.toLowerCase() !== address.toLowerCase()) return null;
    const avatar = await client.getEnsText({ name: normalized, key: 'avatar' }).catch(() => null);
    return { handle: name, avatar: cleanAvatar(avatar) };
  } catch {
    return null; // throttled, unnormalizable, or no resolver
  }
}

/**
 * Validate a handle a client claims for itself.
 *
 * hoodfi names are checked against the Robinhood Chain registry; mainnet names
 * must resolve to the address. Anything else — or a failed check — is null,
 * and the player shows as their address.
 */
export async function verifyHandle(
  address: Address | string,
  claimed: string | null | undefined,
  rpc: { robinhood?: string; mainnet?: string } = {},
): Promise<VerifiedHandle | null> {
  const name = String(claimed ?? '').trim().toLowerCase();
  if (!name || name.length > 100) return null;

  if (name.endsWith('.hoodfi.eth')) {
    if (!(await ownsHoodfiName(address, name, rpc.robinhood))) return null;
    return { handle: name, avatar: await hoodfiAvatar(name, rpc.robinhood) };
  }

  if (/^(?:[a-z0-9-]{1,63}\.)+eth$/.test(name)) {
    return verifyMainnetName(address, name, rpc.mainnet);
  }

  return null;
}
