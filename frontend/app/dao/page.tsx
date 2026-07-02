'use client';
/**
 * "ENS & DAO" — the vision page (product requirement #5).
 * Explains why the game rewards holding $ENS, how delegation works,
 * and where the future official ENS distribution contract fits.
 */
import Link from 'next/link';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { useEnsHoldings } from '@/lib/ens';
import { Button } from '@/components/ui/button';
import { HoldingsBanner } from '@/components/HoldingsBanner';
import { cn } from '@/lib/utils';

const CARDS = [
  {
    icon: '♠',
    tone: 'bg-gold-500/10 text-gold-400',
    title: 'Your name is your seat',
    body: 'Connect your wallet and your primary ENS name becomes your identity at every table — no usernames, no sign-ups.',
  },
  {
    icon: '◈',
    tone: 'bg-ens-400/15 text-ens-300',
    title: 'Hold for perks',
    body: 'Verified $ENS holders get a badge, boosted daily chip claims, and priority in future reward seasons.',
  },
  {
    icon: '⚖',
    tone: 'bg-green-400/10 text-green-400',
    title: 'Delegate to vote',
    body: 'Delegating your $ENS activates your DAO voice. It never leaves your wallet — the app only reads your balance.',
  },
];

const TIERS = [
  {
    name: 'Verified',
    tone: 'border-green-400/30 bg-green-400/10 text-green-400',
    perk: 'ENS badge, boosted +5,000 daily claim, and reward-season eligibility.',
    req: '≥ 50% of peak',
  },
  {
    name: 'At risk',
    tone: 'border-gold-500/30 bg-gold-500/10 text-gold-400',
    perk: 'Badge dimmed. Sell more and holder benefits pause until you top back up.',
    req: '< 50% of peak',
  },
  {
    name: 'Base',
    tone: 'border-white/10 bg-white/5 text-slate-400',
    perk: 'Play freely with the base daily chip claim. No holder badge or boosts.',
    req: 'no $ENS held',
  },
];

export default function DaoPage() {
  const { open } = useAppKit();
  const { isConnected } = useAccount();
  const holdings = useEnsHoldings();

  return (
    <div className="pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ens-400/15">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: "url('/poker-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-night-950/70 to-night-950" />
        <div className="relative mx-auto max-w-3xl px-4 pb-14 pt-16 text-center sm:px-7 sm:pt-[72px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-ens-300">
            Play with purpose
          </p>
          <h1 className="mt-4 font-display text-[40px] font-bold leading-[1.08] text-cream sm:text-[52px]">
            Why hold <span className="italic text-ens-300">$ENS</span>?
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-slate-400">
            epoker.eth rewards the players who keep the Ethereum Name Service healthy. Your seat,
            your identity, and your perks all flow from holding and delegating $ENS.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-7">
        {isConnected && <div className="mt-8"><HoldingsBanner /></div>}

        {/* Three pillars */}
        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {CARDS.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-white/[0.07] bg-night-850/60 px-6 py-7 transition-all hover:-translate-y-0.5 hover:border-gold-500/30"
            >
              <span
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-[13px] text-[22px]',
                  c.tone,
                )}
              >
                {c.icon}
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-cream">{c.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{c.body}</p>
            </div>
          ))}
        </section>

        {/* Holder tiers */}
        <section className="mt-10">
          <div className="overflow-hidden rounded-2xl border border-gold-500/20 bg-gradient-to-b from-[#18140c]/50 to-night-850/50">
            <div className="border-b border-white/[0.06] px-7 py-6">
              <h2 className="font-display text-2xl font-semibold text-cream">Holder benefits</h2>
              <p className="mt-1.5 text-[13.5px] text-slate-500">
                Keep ≥ 50% of your peak $ENS balance to stay in the top tier. We track your
                wallet’s peak and compare it to your live balance — nothing is ever taken from
                your wallet.
              </p>
            </div>
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className="flex flex-wrap items-center gap-4 border-b border-white/5 px-7 py-5 last:border-0 sm:flex-nowrap sm:gap-5"
              >
                <span
                  className={cn(
                    'min-w-24 rounded-full border px-3.5 py-1.5 text-center text-xs font-semibold',
                    tier.tone,
                  )}
                >
                  {tier.name}
                </span>
                <p className="flex-1 text-sm text-slate-300">{tier.perk}</p>
                <span className="whitespace-nowrap font-mono text-[13px] text-slate-500">
                  {tier.req}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* What comes next: official ENS rewards */}
        <section className="mt-10">
          <div className="rounded-2xl border border-white/[0.07] bg-night-850/60 px-7 py-6">
            <h2 className="font-display text-2xl font-semibold text-cream">
              What comes next: official ENS rewards
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              This MVP runs on virtual chips only. The long-term goal is for the ENS community to
              ship an <strong className="text-slate-200">official ENS token distribution /
              reward contract</strong> that plugs into the hooks already in this codebase:
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
              <li className="flex gap-3">
                <span className="text-gold-500">1.</span>
                <span>
                  <code className="font-mono text-[13px] text-ens-300">worker/src/index.ts → /claim</code>{' '}
                  — daily chips become tiered by verified on-chain $ENS holdings &amp; delegation.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-gold-500">2.</span>
                <span>
                  <code className="font-mono text-[13px] text-ens-300">frontend/lib/ens.ts</code>{' '}
                  — the holdings state machine becomes the eligibility oracle for reward claims.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-gold-500">3.</span>
                <span>
                  Leaderboard seasons — top players earn allocations from the distribution
                  contract, weighted by holding duration, not just winnings.
                </span>
              </li>
            </ul>
            <p className="mt-4 text-sm text-slate-500">Until then: play, invite frENS, hold, delegate, vote.</p>
          </div>
        </section>

        {/* Delegate CTA */}
        <section className="mx-auto mt-10 max-w-2xl text-center">
          <div className="rounded-2xl border border-ens-400/25 bg-gradient-to-br from-ens-400/10 to-night-800/30 px-8 py-10">
            <h2 className="font-display text-[26px] font-semibold text-cream sm:text-[28px]">
              Delegate your $ENS, activate your voice.
            </h2>
            <p className="mx-auto mt-3.5 max-w-md text-[15px] leading-relaxed text-slate-400">
              Your tokens never leave your wallet. Delegating to yourself or a trusted delegate
              turns holding into governance — and unlocks your full table perks.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <a href="https://agora.ensdao.org/delegates" target="_blank" rel="noreferrer">
                <Button variant="primary">Delegate on Agora ↗</Button>
              </a>
              <a href="https://snapshot.box/#/s:ens.eth" target="_blank" rel="noreferrer">
                <Button variant="ghost">Live proposals ↗</Button>
              </a>
            </div>
            {isConnected && !holdings.delegated && holdings.isVerifiedHolder && (
              <p className="mt-4 text-xs text-gold-400">Your $ENS isn’t delegated yet ↑</p>
            )}
          </div>
        </section>

        <div className="mt-10 flex justify-center gap-3">
          {!isConnected && (
            <Button variant="outline" onClick={() => open()}>Connect Wallet</Button>
          )}
          <Link href="/"><Button>Take a Seat →</Button></Link>
        </div>
      </div>
    </div>
  );
}
