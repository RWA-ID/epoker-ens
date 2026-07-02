'use client';
/**
 * Avatar for leaderboard rows. The backend only stores names, so the
 * avatar is resolved client-side from the ENS name via wagmi/viem
 * (cached by TanStack Query, resolved through the Alchemy RPC).
 */
import { useEnsAvatar } from 'wagmi';
import { normalize } from 'viem/ens';
import { displayName } from '@/lib/utils';

export function LeaderboardAvatar({
  ensName,
  address,
}: {
  ensName: string | null;
  address: string;
}) {
  let normalized: string | undefined;
  try {
    normalized = ensName ? normalize(ensName) : undefined;
  } catch {
    normalized = undefined;
  }
  const { data: avatar } = useEnsAvatar({
    name: normalized,
    chainId: 1,
    query: { enabled: !!normalized, staleTime: 300_000 },
  });

  return avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ens-800 text-sm text-white">
      {displayName(ensName, address).slice(0, 1).toUpperCase()}
    </span>
  );
}
