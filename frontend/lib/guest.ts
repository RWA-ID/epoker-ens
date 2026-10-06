'use client';
/**
 * Turning what a host types into a private-table guest: a hoodfi name, a
 * mainnet ENS name, or a raw address.
 *
 * hoodfi names are read straight from the registry on Robinhood Chain rather
 * than through mainnet ENS. That is one fast eth_call instead of a CCIP round
 * trip, and `owner(node)` is the same check the worker makes before it lets
 * someone sit under a name — so the address we whitelist is the wallet that
 * will actually show up.
 *
 * A bare label ("gm") is tried as gm.hoodfi.eth first and gm.eth second: the
 * table is on Robinhood Chain, so the hoodfi name is far more likely to be the
 * friend the host means.
 */
import { getEnsAddress, getEnsText } from '@wagmi/core';
import { isAddress, zeroAddress } from 'viem';
import { namehash, normalize } from 'viem/ens';
import { wagmiConfig } from './appkit';
import { HOODFI_REGISTRY, HOODFI_REGISTRY_ABI } from './config';
import { client as robinhood } from './hoodfi';

export interface ResolvedGuest {
  address: string; // lowercase 0x…
  handle: string | null;
  /** Raw avatar text record — render with <Avatar record=…>. */
  avatar: string | null;
  /** Where the name lives, for the preview badge. */
  source: 'hoodfi' | 'ens' | 'address';
}

const HOODFI_SUFFIX = '.hoodfi.eth';

async function resolveHoodfi(name: string): Promise<ResolvedGuest | null> {
  const node = namehash(name);
  const owner = await robinhood.readContract({
    address: HOODFI_REGISTRY,
    abi: HOODFI_REGISTRY_ABI,
    functionName: 'owner',
    args: [node],
  });
  if (!owner || owner === zeroAddress) return null;
  const avatar = await robinhood
    .readContract({
      address: HOODFI_REGISTRY,
      abi: HOODFI_REGISTRY_ABI,
      functionName: 'text',
      args: [node, 'avatar'],
    })
    .catch(() => '');
  return { address: owner.toLowerCase(), handle: name, avatar: avatar || null, source: 'hoodfi' };
}

async function resolveEns(name: string): Promise<ResolvedGuest | null> {
  const address = await getEnsAddress(wagmiConfig, { name, chainId: 1 });
  if (!address) return null;
  // The avatar is a nicety: a slow or failed read must not block the add.
  const avatar = await Promise.race([
    getEnsText(wagmiConfig, { name, key: 'avatar', chainId: 1 }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]);
  return { address: address.toLowerCase(), handle: name, avatar: avatar ?? null, source: 'ens' };
}

/** Resolve a typed guest, or throw a message fit to show the host. */
export async function resolveGuest(raw: string): Promise<ResolvedGuest> {
  const input = raw.trim().toLowerCase();
  if (isAddress(input)) {
    return { address: input, handle: null, avatar: null, source: 'address' };
  }

  let name: string;
  try {
    name = normalize(input);
  } catch {
    throw new Error(`“${raw.trim()}” isn’t a valid name.`);
  }

  if (!name.includes('.')) {
    // An unowned name reads as the zero address, so a throw here is the RPC
    // failing — never fall through to gm.eth then, it may be someone else.
    const hoodfi = await resolveHoodfi(`${name}${HOODFI_SUFFIX}`).catch(() => {
      throw new Error('Robinhood Chain didn’t answer — try again in a moment.');
    });
    if (hoodfi) return hoodfi;
    const ens = await resolveEns(`${name}.eth`).catch(() => null);
    if (ens) return ens;
    throw new Error(`No one holds ${name}${HOODFI_SUFFIX} or ${name}.eth.`);
  }

  const found = name.endsWith(HOODFI_SUFFIX)
    ? await resolveHoodfi(name)
    : await resolveEns(name);
  if (!found) throw new Error(`Couldn’t resolve “${name}” — check the spelling.`);
  return found;
}
