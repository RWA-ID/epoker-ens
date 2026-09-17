import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import LeaderboardClient from './LeaderboardClient';

export const metadata: Metadata = pageMetadata({
  title: 'Leaderboard — HoodPoker',
  description: 'The top HoodPoker players by lifetime play chips won.',
  path: '/leaderboard/',
});

export default function Page() {
  return <LeaderboardClient />;
}
