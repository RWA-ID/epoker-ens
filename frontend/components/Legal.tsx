/**
 * Shared chrome for the three legal pages (/privacy, /terms, /disclaimer).
 *
 * These are plain server components — no hooks, no wallet, no fetch — so they
 * pre-render to static HTML and stay readable even if the worker is down.
 *
 * Measure is capped at `max-w-faq` (860px) rather than the usual `max-w-shell`:
 * legal copy is read line by line, and the full shell width is far too wide to
 * track comfortably.
 */
import Link from 'next/link';

/** Single source of truth for the "last updated" stamp on all three pages. */
export const LEGAL_UPDATED = '16 September 2026';

const PAGES = [
  { href: '/terms/', label: 'Terms' },
  { href: '/privacy/', label: 'Privacy' },
  { href: '/disclaimer/', label: 'Disclaimer' },
];

export function LegalPage({
  eyebrow,
  title,
  intro,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  /** href of this page, so it renders as the active tab rather than a link. */
  current: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-faq px-[22px] pb-[96px] pt-[74px]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-acid">
        {eyebrow}
      </p>
      <h1 className="hp-display hp-h2 mt-3 text-cream">{title}</h1>

      <p className="mt-5 text-[16px] leading-[1.65] text-muted">{intro}</p>

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        Last updated {LEGAL_UPDATED}
      </p>

      {/* Sibling-page tabs — all three documents lean on each other. */}
      <nav className="mt-7 flex flex-wrap gap-2" aria-label="Legal documents">
        {PAGES.map((p) =>
          p.href === current ? (
            <span
              key={p.href}
              aria-current="page"
              className="rounded-btn border border-acid/60 bg-acid/10 px-3.5 py-2 font-mono text-[11.5px] text-acid"
            >
              {p.label}
            </span>
          ) : (
            <Link
              key={p.href}
              href={p.href}
              className="rounded-btn border border-cream/[0.12] px-3.5 py-2 font-mono text-[11.5px] text-dim transition-colors hover:border-acid/40 hover:text-acid"
            >
              {p.label}
            </Link>
          ),
        )}
      </nav>

      <div className="mt-12">{children}</div>
    </div>
  );
}

/** One numbered clause. The number is decorative — screen readers get the h2. */
export function Clause({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-cream/10 py-9 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span aria-hidden className="font-mono text-[11px] text-acid">
          {String(n).padStart(2, '0')}
        </span>
        <h2 className="hp-display hp-w80 text-[22px] text-cream">{title}</h2>
      </div>
      <div className="mt-4 space-y-4 text-[15.5px] leading-[1.7] text-muted">{children}</div>
    </section>
  );
}

/** Bulleted list with the accent dash the rest of the site uses. */
export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[3px] shrink-0 font-mono text-[13px] text-acid">
            -
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Pulled-out emphasis for the clauses that actually matter to a reader. */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-acid/25 bg-acid/[0.06] px-5 py-4 text-[15px] leading-[1.7] text-cream">
      {children}
    </p>
  );
}
