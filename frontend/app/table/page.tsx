import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import TableClient from './TableClient';

// One card for every table: a static export serves the same HTML for every
// ?id=, so a per-table card would need a server.
export const metadata: Metadata = pageMetadata({
  title: 'Pull up a seat — HoodPoker',
  description: 'You’re invited to a free Texas Hold’em table. Play chips only — no buy-in, no token. Tap to join.',
  path: '/table/',
  card: 'table',
});

export default function Page() {
  return <TableClient />;
}
