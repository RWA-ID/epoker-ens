/**
 * Page metadata in one place.
 *
 * Next REPLACES `openGraph` / `twitter` per page instead of merging them, so
 * a page that set only a title would silently ship a card with no image.
 * Every route goes through pageMetadata() so the image can't be dropped.
 */
import type { Metadata } from 'next';

export const SITE_URL = 'https://epoker.eth.limo';
export const SITE_NAME = 'HoodPoker';
export const X_HANDLE = '@hoodpokercasino';

const CARDS = {
  site: { url: '/og.jpg', alt: 'HoodPoker — free Texas Hold’em on Robinhood Chain' },
  table: { url: '/og-table.jpg', alt: 'Pull up a seat — a free HoodPoker Hold’em table' },
} as const;

export function pageMetadata({
  title,
  description,
  path,
  card = 'site',
}: {
  title: string;
  description: string;
  /** Route path with trailing slash, e.g. "/leaderboard/". */
  path: string;
  card?: keyof typeof CARDS;
}): Metadata {
  const image = CARDS[card];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: path,
      title,
      description,
      images: [{ url: image.url, width: 1200, height: 630, type: 'image/jpeg', alt: image.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      site: X_HANDLE,
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
