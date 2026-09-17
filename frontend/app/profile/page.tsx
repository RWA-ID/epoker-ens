import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import ProfileClient from './ProfileClient';

export const metadata: Metadata = pageMetadata({
  title: 'Player profile — HoodPoker',
  description: 'Chip stats, hands played and biggest pot for a HoodPoker player.',
  path: '/profile/',
});

export default function Page() {
  return <ProfileClient />;
}
