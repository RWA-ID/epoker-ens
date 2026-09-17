import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import HomeClient from './HomeClient';

export const metadata: Metadata = pageMetadata({
  title: 'HoodPoker — free Texas Hold’em on Robinhood Chain',
  description:
    'No tokens to hold. No buy-ins. No real value — just the fastest free poker table on Robinhood Chain. Grab a seat, play solo against bots, and run up the leaderboard.',
  path: '/',
});

export default function Page() {
  return <HomeClient />;
}
