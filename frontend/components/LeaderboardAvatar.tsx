'use client';
/**
 * Avatar for leaderboard rows. The backend only stores names, so the
 * avatar is resolved client-side from the ENS name via wagmi/viem
 * (cached by TanStack Query, resolved through the Alchemy RPC).
 */
import { useEnsAvatar } from 'wagmi';
import { normalize } from 'viem/ens';
import { displayName, cn } from '@/lib/utils';

const SIZES = {
  md: 'h-10 w-10 text-[15px]',
  lg: 'h-14 w-14 text-[22px]',
} as const;

export function LeaderboardAvatar({
  ensName,
  address,
  size = 'md',
}: {
  ensName: string | null;
  address: string;
  size?: keyof typeof SIZES;
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
    <img src={avatar} alt="" className={cn(SIZES[size], 'rounded-full object-cover')} />
  ) : (
    <span
      className={cn(
        SIZES[size],
        'gold-fill flex items-center justify-center rounded-full font-display font-bold text-night-900',
      )}
    >
      {displayName(ensName, address).slice(0, 1).toUpperCase()}
    </span>
  );
}
