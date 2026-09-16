import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Header } from '@/components/Header';
import { Mark } from '@/components/Mark';

/**
 * Archivo variable, loaded WITH the `wdth` axis — the design leans on
 * `font-stretch: 72–85%` for every display heading, and without that axis the
 * property silently does nothing and the type just looks wrong.
 *
 * (The brief's reference face is Morway, a commercial sporty italic. Archivo
 * is the free stand-in; if Morway is ever licensed, self-host it and keep
 * Archivo as the fallback.)
 */
const display = Archivo({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['wdth'],
  variable: '--font-display',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'HoodPoker — free Texas Hold’em on Robinhood Chain',
  description:
    'No tokens to hold. No buy-ins. No real value — just the fastest free poker table on Robinhood Chain. Grab a seat, stack virtual chips, and run up the leaderboard.',
};

/** The project's only social account. */
const X_URL = 'https://x.com/hoodpokercasino';

const FOOTER_LINKS = [
  {
    heading: 'Play',
    links: [
      { label: 'Lobby', href: '/#lobby' },
      { label: 'Leaderboard', href: '/leaderboard/' },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'GitHub', href: 'https://github.com/RWA-ID/epoker-ens', external: true },
      { label: 'X', href: X_URL, external: true },
      { label: 'Rules', href: '/#how' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms', href: '/terms/' },
      { label: 'Privacy', href: '/privacy/' },
      { label: 'Disclaimer', href: '/disclaimer/' },
    ],
  },
];

/** X (formerly Twitter) glyph — inline so the footer costs no extra request. */
function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>

          <footer className="border-t border-cream/10 px-[22px] pb-[54px] pt-[46px]">
            <div className="mx-auto flex max-w-shell flex-wrap items-start justify-between gap-10">
              <div className="max-w-xl">
                <Mark size={26} />
                <p className="mt-4 font-mono text-[11.5px] leading-[1.75] text-faint">
                  Virtual chips only. No buy-ins, no wagering, no token to hold, no monetary
                  value — a free game built for fun. Independent community project, not
                  affiliated with, endorsed by or connected to Robinhood Markets, Inc.
                </p>
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="HoodPoker on X (@hoodpokercasino)"
                  className="mt-5 inline-flex h-9 w-9 items-center justify-center rounded-btn border border-cream/[0.12] text-dim transition-colors hover:border-acid/40 hover:text-acid"
                >
                  <XIcon />
                </a>
              </div>
              <div className="flex flex-wrap gap-x-11 gap-y-8">
                {FOOTER_LINKS.map((col) => (
                  <div key={col.heading}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ghost">
                      {col.heading}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {col.links.map((l) => (
                        <li key={l.label}>
                          <a
                            href={l.href}
                            {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                            className="font-mono text-[11.5px] text-dim transition-colors hover:text-acid"
                          >
                            {l.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
