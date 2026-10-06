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
import { useEnsName, useEnsText } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useHoodfiNames } from './hoodfi';
import { useWallet, type WalletSource } from './wallet';
import { api } from './api';
import { cachedSession } from './auth';

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
  /** 'appkit' for an external wallet, 'passkey' for a Privy embedded wallet. */
  source: WalletSource | null;
  isConnected: boolean;
  /** True while a stored session is being restored on a fresh page load. */
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

export function useIdentity(): Identity {
  const { address, source, isConnected, isRestoring } = useWallet();

  const { data: hoodfi, isLoading: loadingHoodfi } = useHoodfiNames(address);
  const { data: ensName, isLoading: loadingEns } = useEnsName({ address, chainId: 1 });

  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => setPick(readPick(address)), [address]);

  // The name this wallet chose in the picker, saved by the worker — so a pick
  // made on one device holds on the next. This browser's own pick wins.
  // (Not `profile.handle`: that's whatever name they last sat under, which
  // would carry a bad default forward.)
  const { data: serverHandle } = useQuery({
    queryKey: ['profile-handle', address?.toLowerCase()],
    queryFn: async () => (await api.profile(address!)).profile?.handlePick ?? null,
    enabled: !!address,
    staleTime: 300_000,
  });

  // A pick made before signing in reaches the server the next time a session
  // is around (any page that renders this after sign-in).
  useEffect(() => {
    if (!address || !pick || pick === serverHandle) return;
    const session = cachedSession(address);
    if (session) void api.saveHandle({ address, token: session.token }, pick).catch(() => {});
  }, [address, pick, serverHandle, hoodfi]);

  const owned = hoodfi ?? [];
  // A pick is only honoured while they still own that name.
  const choice = pick ?? serverHandle ?? null;
  const picked = choice && owned.some((n) => n.name === choice) ? choice : null;
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
      // Saved server-side too when already signed in; otherwise the next
      // table join records it (the worker stores the name you sit under).
      const session = cachedSession(address);
      if (name && session) void api.saveHandle({ address, token: session.token }, name).catch(() => {});
    },
    [address],
  );

  return {
    address,
    source,
    isConnected,
    isRestoring,
    handle,
    avatar,
    hoodfiNames: owned.map(({ name, avatar }) => ({ name, avatar })),
    ensName: ensName ?? null,
    isLoadingHandle: loadingHoodfi || loadingEns,
    setHandle,
  };
}
