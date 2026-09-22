import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import HomeClient from './HomeClient';

export const metadata: Metadata = pageMetadata({
  title: 'HoodPoker — free Texas Hold’em, played under your name',
  description:
    'No tokens to hold. No buy-ins. No real value — just free Texas Hold’em played under your HoodFi name from Robinhood Chain. Grab a seat, play solo against bots, and run up the leaderboard.',
  path: '/',
});

export default function Page() {
  return <HomeClient />;
}
