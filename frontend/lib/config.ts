/** Central place for env-driven configuration. */

export const REOWN_PROJECT_ID =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '43bdd1b8c477ac4d4a4264a14a8472f8';

export const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_KEY ?? '';

/**
 * Mainnet RPC — Alchemy when a key is configured, public fallback otherwise.
 * Mainnet is read-only here: primary-name lookups for players who have one.
 */
export const RPC_URL = ALCHEMY_KEY
  ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : 'https://ethereum-rpc.publicnode.com';

/** Robinhood Chain RPC — handle lookups against the hoodfi.eth L2 registry. */
export const ROBINHOOD_RPC_URL =
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC ?? 'https://rpc.mainnet.chain.robinhood.com';

/** Cloudflare Worker origin (lobby API + table WebSockets). */
export const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://localhost:8787';

export const WORKER_WS_URL = WORKER_URL.replace(/^http/, 'ws');

/**
 * hoodfi.eth's L2 registry on Robinhood Chain (chain 4663).
 *
 * A Durin `L2Registry`: an ERC721 where `tokenId == uint256(namehash)`, plus
 * onchain resolver records. Note it is NOT ERC721Enumerable and token ids are
 * namehashes rather than a sequence, so there is no `tokenOfOwnerByIndex` —
 * see lib/hoodfi.ts for how names are actually enumerated for an address.
 */
export const HOODFI_REGISTRY = '0xf2bABA012244bdD7445129597350054E1B3aEe5C' as const;

/** Parent name of every subname in that registry. */
export const HOODFI_PARENT = 'hoodfi.eth';

/** Where players go to mint a handle. */
export const HOODFI_MINT_URL = 'https://www.hoodfi.name';

export const HOODFI_REGISTRY_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'names',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes' }],
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

/** ERC721 Transfer — the only log on the registry indexed by recipient. */
export const TRANSFER_EVENT = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'tokenId', type: 'uint256', indexed: true },
  ],
} as const;
