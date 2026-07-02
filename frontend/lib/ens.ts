'use client';
/**
 * ENS identity + $ENS holding hooks.
 *
 * useEnsIdentity  — primary name + avatar for the connected wallet.
 * useEnsHoldings  — $ENS balance, delegation status, and the DAO
 *                   encouragement state machine (healthy / reduced /
 *                   sold-all / none), tracked against the wallet's peak
 *                   balance stored in localStorage.
 */
import { useEffect, useMemo } from 'react';
import { useAccount, useEnsAvatar, useEnsName, useReadContract } from 'wagmi';
import { formatEther, zeroAddress } from 'viem';
import { ENS_TOKEN, ENS_TOKEN_ABI } from './config';

export function useEnsIdentity() {
  const { address, isConnected } = useAccount();
  const { data: ensName } = useEnsName({ address, chainId: 1 });
  const { data: avatar } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: 1,
  });
  return { address, isConnected, ensName: ensName ?? null, avatar: avatar ?? null };
}

export type HoldingStatus =
  | 'loading'
  | 'none'      // never held $ENS — invite them into the DAO
  | 'healthy'   // holding at/above the benefit threshold
  | 'reduced'   // sold below 50% of their peak — benefits at risk
  | 'sold-all'; // sold everything — penalty applies

export interface EnsHoldings {
  status: HoldingStatus;
  /** Current balance in whole $ENS (float). */
  balance: number;
  /** Highest balance we've ever observed for this wallet. */
  peak: number;
  /** Benefit threshold: keep ≥ 50% of peak to stay "healthy". */
  threshold: number;
  /** How much can be sold while staying healthy (0 when already below). */
  safeToSell: number;
  /** Whether voting power is delegated (DAO-activated). */
  delegated: boolean;
  isVerifiedHolder: boolean;
}

const PEAK_KEY = (address: string) => `epoker:ens-peak:${address.toLowerCase()}`;

export function useEnsHoldings(): EnsHoldings {
  const { address } = useAccount();

  // Balance refreshes every 60s so the notification system reacts to
  // sells/buys that happen while playing.
  const { data: balanceWei, isLoading } = useReadContract({
    address: ENS_TOKEN,
    abi: ENS_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: 1,
    query: { enabled: !!address, refetchInterval: 60_000 },
  });

  const { data: delegatee } = useReadContract({
    address: ENS_TOKEN,
    abi: ENS_TOKEN_ABI,
    functionName: 'delegates',
    args: address ? [address] : undefined,
    chainId: 1,
    query: { enabled: !!address, refetchInterval: 300_000 },
  });

  const balance = balanceWei !== undefined ? Number(formatEther(balanceWei)) : 0;

  // Persist the peak balance so we can detect "sold most/all of it" even
  // across sessions. (Server-side tracking is a future-contract concern —
  // see the FUTURE ENS INTEGRATION POINT in worker/src/index.ts.)
  const peak = useMemo(() => {
    if (!address || typeof window === 'undefined') return 0;
    return Number(localStorage.getItem(PEAK_KEY(address)) ?? '0');
  }, [address, balanceWei]);

  useEffect(() => {
    if (!address || balanceWei === undefined) return;
    if (balance > peak) localStorage.setItem(PEAK_KEY(address), String(balance));
  }, [address, balance, peak, balanceWei]);

  const effectivePeak = Math.max(peak, balance);
  const threshold = effectivePeak * 0.5;

  let status: HoldingStatus;
  if (!address || (isLoading && balanceWei === undefined)) status = 'loading';
  else if (balance === 0 && effectivePeak === 0) status = 'none';
  else if (balance === 0) status = 'sold-all';
  else if (balance < threshold) status = 'reduced';
  else status = 'healthy';

  return {
    status,
    balance,
    peak: effectivePeak,
    threshold,
    safeToSell: Math.max(0, balance - threshold),
    delegated: !!delegatee && delegatee !== zeroAddress,
    isVerifiedHolder: balance > 0,
  };
}
