'use client';
/**
 * Who a player is at the table.
 *
 * Handle priority:
 *   1. a hoodfi.eth name they own on Robinhood Chain (their pick, if they made one)
 *   2. their mainnet ENS primary name
 *   3. the truncated address
 *
 * hoodfi wins because that is the chain the game runs on, but mainnet names
 * are kept so nobody has to mint anything to sit down.
 *
 * Avatars are exposed as the RAW text record, never a resolved URL — see
 * lib/avatar.ts for why resolving it eagerly costs ~29s and usually fails.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useEnsName, useEnsText } from 'wagmi';
import { useHoodfiNames } from './hoodfi';

const PICK_KEY = (address: string) => `epoker:handle:${address.toLowerCase()}`;

function readPick(address: string | undefined): string | null {
  if (!address || typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PICK_KEY(address));
  } catch {
    return null;
  }
}

export interface Identity {
  address: `0x${string}` | undefined;
  /** wagmi's four-state status — 'reconnecting' is NOT 'disconnected'. */
  status: 'connecting' | 'reconnecting' | 'connected' | 'disconnected';
  isConnected: boolean;
  /** True while wagmi is restoring a stored session on a fresh page load. */
  isRestoring: boolean;
  /** The name to show, or null to fall back to the address. */
  handle: string | null;
  /** Raw `avatar` text record for `handle`, or null. */
  avatar: string | null;
  /** Every hoodfi name this wallet owns, shortest first. */
  hoodfiNames: { name: string; avatar: string | null }[];
  /** Mainnet primary name, if they set one. */
  ensName: string | null;
  /** Still resolving names — show a placeholder rather than the address. */
  isLoadingHandle: boolean;
  /** Choose which owned name to play under. */
  setHandle: (name: string | null) => void;
}

/**
 * How long to believe a `connecting`/`reconnecting` status before treating the
 * visitor as disconnected.
 *
 * wagmi does not reliably settle to `disconnected` when there is nothing to
 * restore: observed on a clean profile with `wagmi.store.current === null` and
 * zero connections, the status stayed `reconnecting` indefinitely, so a
 * first-time visitor saw "Reconnecting…" instead of "Connect Wallet" forever.
 * Real restores are much faster than this — measured at ~520ms warm and
 * ~1290ms cold — so the bound costs a genuine reconnect nothing.
 */
const RESTORE_TIMEOUT_MS = 3000;

export function useIdentity(): Identity {
  const { address, status } = useAccount();

  const [restoreExpired, setRestoreExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRestoreExpired(true), RESTORE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const { data: hoodfi, isLoading: loadingHoodfi } = useHoodfiNames(address);
  const { data: ensName, isLoading: loadingEns } = useEnsName({ address, chainId: 1 });

  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => setPick(readPick(address)), [address]);

  const owned = hoodfi ?? [];
  // A stored pick is only honoured while they still own that name.
  const picked = pick && owned.some((n) => n.name === pick) ? pick : null;
  const hoodfiHandle = picked ?? owned[0]?.name ?? null;
  const handle = hoodfiHandle ?? ensName ?? null;

  // Mainnet avatar record — only fetched when the handle is a mainnet name.
  const { data: ensAvatar } = useEnsText({
    name: handle && !hoodfiHandle ? handle : undefined,
    key: 'avatar',
    chainId: 1,
    query: { enabled: !!handle && !hoodfiHandle, staleTime: 300_000 },
  });

  const avatar = hoodfiHandle
    ? (owned.find((n) => n.name === hoodfiHandle)?.avatar ?? null)
    : (ensAvatar ?? null);

  const setHandle = useCallback(
    (name: string | null) => {
      if (!address) return;
      try {
        if (name) localStorage.setItem(PICK_KEY(address), name);
        else localStorage.removeItem(PICK_KEY(address));
      } catch {
        /* private mode — the pick just won't persist */
      }
      setPick(name);
    },
    [address],
  );

  return {
    address,
    status,
    isConnected: status === 'connected',
    isRestoring:
      (status === 'reconnecting' || status === 'connecting') && !restoreExpired,
    handle,
    avatar,
    hoodfiNames: owned.map(({ name, avatar }) => ({ name, avatar })),
    ensName: ensName ?? null,
    isLoadingHandle: loadingHoodfi || loadingEns,
    setHandle,
  };
}
