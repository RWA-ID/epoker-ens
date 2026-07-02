/** Central place for env-driven configuration. */

export const REOWN_PROJECT_ID =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '43bdd1b8c477ac4d4a4264a14a8472f8';

export const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_KEY ?? '';

/** Mainnet RPC — Alchemy when a key is configured, public fallback otherwise. */
export const RPC_URL = ALCHEMY_KEY
  ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : 'https://ethereum-rpc.publicnode.com';

/** Cloudflare Worker origin (lobby API + table WebSockets). */
export const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://localhost:8787';

export const WORKER_WS_URL = WORKER_URL.replace(/^http/, 'ws');

/**
 * $ENS governance token (mainnet).
 * ERC20Votes — `delegates(addr)` tells us whether the holder activated
 * their DAO voting power.
 */
export const ENS_TOKEN = '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72' as const;

export const ENS_TOKEN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'delegates',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;
