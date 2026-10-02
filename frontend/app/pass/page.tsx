import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { MEMBER_PERKS, PASS_SUPPLY, PASS_TIERS, fmt, tierArt } from '@/lib/housePass';
import { MintStages, PassFineprint } from '@/components/PassStages';
import { PassChecker } from '@/components/PassChecker';

export const metadata: Metadata = pageMetadata({
  title: 'House Pass perks — HoodPoker',
  description: `${fmt(PASS_SUPPLY)} House Passes in seven tiers. Every tier, its supply, its one-time chip stack and what every pass unlocks at the tables.`,
  path: '/pass/',
});

const pct = (supply: number) => {
  const p = (supply / PASS_SUPPLY) * 100;
  return `${p < 1 ? p.toFixed(2) : p.toFixed(1)}%`;
};

/**
 * Every tier and what it gets. A server component: tiers and perks are static
 * (lib/house-pass.json), so the page pre-renders; only the checker is client.
 */
export default function PassPage() {
  return (
    <div className="mx-auto max-w-shell px-[22px] pb-[96px] pt-[74px]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-acid">House Pass · perks</p>
      <h1 className="hp-display hp-h2 mt-3 text-cream">
        Seven tiers. <span className="text-acid">One house.</span>
      </h1>
      <p className="mt-5 max-w-[640px] text-[16.5px] leading-[1.6] text-muted">
        {fmt(PASS_SUPPLY)} passes, dealt at random across seven tiers at the reveal. Every pass gets
        the same membership perks. What the tier changes is the chip stack you sit down with, a
        one-time credit that grows with rarity, and the badge on your seat.
      </p>

      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PASS_TIERS.map((tier, i) => {
          const crown = tier.id === 'crown-jewel';
          return (
            <li
              key={tier.id}
              id={tier.id}
              className={
                'scroll-mt-24 overflow-hidden rounded-card border bg-night-900 ' +
                (crown
                  ? 'border-[#e8c56a]/45 sm:col-span-2 sm:grid sm:grid-cols-2 lg:col-span-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]'
                  : 'border-cream/10')
              }
            >
              <img
                src={tierArt(tier.id)}
                alt={`${tier.name} House Pass art`}
                width={720}
                height={720}
                loading={i < 3 ? 'eager' : 'lazy'}
                className="aspect-square w-full"
              />
              <div className={crown ? 'p-5 sm:flex sm:flex-col sm:justify-center sm:p-8 lg:p-12' : 'p-5'}>
                {crown && (
                  <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#e8c56a]">
                    The rarest pass
                  </p>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={'hp-display leading-none ' + (crown ? 'text-[26px] text-[#e8c56a] lg:text-[44px]' : 'text-[26px] text-cream')}>
                    {tier.name}
                  </h2>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                    Rarity {i + 1}/7
                  </span>
                </div>
                <p className="mt-2 font-mono text-[11.5px] tabular-nums text-muted">
                  1 of {fmt(tier.supply)} · {pct(tier.supply)} of passes
                </p>

                <div className="mt-4 rounded-btn border border-acid/25 bg-acid/[0.05] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">One-time chip stack</p>
                  <p className={'mt-1 font-mono tabular-nums leading-none ' + (crown ? 'text-[24px] text-[#e8c56a] lg:text-[36px]' : 'text-[24px] text-acid')}>
                    {fmt(tier.chips)}
                  </p>
                </div>

                <ul className="mt-4 grid gap-2 text-[14px] leading-[1.5]">
                  <li className="flex gap-2.5">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-acid" />
                    <span className="text-cream">
                      {tier.name} badge <span className="text-muted">on your seat, matched to the art.</span>
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-acid" />
                    <span className="text-cream">
                      Every member perk <span className="text-muted">below.</span>
                    </span>
                  </li>
                </ul>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-16 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-acid">Every pass, every tier</p>
          <h2 className="hp-display mt-3 text-[34px] leading-none text-cream">Member perks</h2>
          <ul className="mt-6 grid gap-3">
            {MEMBER_PERKS.map((perk) => (
              <li key={perk.title} className="flex gap-3">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-acid" />
                <p className="text-[15px] leading-[1.55] text-cream">
                  {perk.title}
                  <span className="text-muted"> — {perk.body}</span>
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-card border border-cream/10 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">How the chip stack lands</p>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">
              Perks switch on after the mint, once the collection is revealed. Sign in with the
              wallet holding the pass and its stack is added to your bankroll. Each pass pays out{' '}
              <span className="text-cream">once, ever</span>: it&rsquo;s tracked by token, not by
              wallet, so a pass that changes hands keeps its badge and member perks but not a second
              stack. Hold several passes and each one pays its own stack.
            </p>
          </div>

          <MintStages />
          <PassFineprint />
        </div>

        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-acid">Am I in?</p>
          <h2 className="hp-display mt-3 text-[34px] leading-none text-cream">Check a wallet</h2>
          <PassChecker />
          <p className="mt-4 text-[13.5px] leading-[1.6] text-faint">
            Whitelist sign-ups are on the{' '}
            <Link href="/#pass" className="text-acid underline underline-offset-4">
              home page
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
