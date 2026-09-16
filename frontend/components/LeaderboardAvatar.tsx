'use client';
/**
 * Avatar for leaderboard rows.
 *
 * The backend stores the handle AND its avatar record (captured at sign-in),
 * so nothing is resolved here — rendering a leaderboard used to fire one ENS
 * avatar lookup per row, and for hoodfi names each of those is a ~29s CCIP +
 * public-gateway round trip that ends in null.
 */
import { Avatar } from './Avatar';
import { cn } from '@/lib/utils';

const SIZES = {
  md: { cls: 'h-10 w-10 text-[15px]', px: 40 },
  lg: { cls: 'h-14 w-14 text-[22px]', px: 56 },
} as const;

export function LeaderboardAvatar({
  handle,
  avatar,
  address,
  size = 'md',
}: {
  handle: string | null;
  avatar?: string | null;
  address: string;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <Avatar
      record={avatar}
      handle={handle}
      address={address}
      size={s.px}
      className={cn(s.cls)}
    />
  );
}
