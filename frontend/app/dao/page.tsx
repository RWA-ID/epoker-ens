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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsBanner } from '@/components/HoldingsBanner';

export default function DaoPage() {
  const { open } = useAppKit();
  const { isConnected } = useAccount();
  const holdings = useEnsHoldings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-500">The vision</p>
      <h1 className="mt-2 font-display text-4xl text-slate-50">
        Play poker. <span className="text-ens-400">Govern ENS.</span>
      </h1>
      <p className="mt-4 leading-relaxed text-slate-400">
        ENS Hold’em exists to grow an engaged community of ENS holders. Every seat at
        the table is an ENS name; every player is a potential DAO voter. The game
        nudges you to <em>keep</em> your $ENS — because tokens that sit in engaged
        hands are votes, and votes are what keep ENS credibly neutral public
        infrastructure.
      </p>

      {isConnected && <div className="mt-6"><HoldingsBanner /></div>}

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader><CardTitle>How holder benefits work</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-slate-400">
            <p>
              We track your wallet’s <strong className="text-slate-200">peak $ENS balance</strong>{' '}
              and compare it to your current balance. Life happens — you can always sell —
              but the game is honest about the trade-off:
            </p>
            <ul className="space-y-2">
              <li>
                <span className="text-ens-300">● Healthy (≥ 50% of your peak)</span> — full
                benefits: “ENS Verified” badge, boosted daily chips (when official rewards
                launch), and full DAO voting power. We even show how much you could safely
                sell without dropping below the line.
              </li>
              <li>
                <span className="text-gold-400">● Reduced (below 50% of peak)</span> — a
                friendly warning that your holder benefits are at risk.
              </li>
              <li>
                <span className="text-red-400">● Sold everything</span> — the badge goes
                away, daily chips drop to the base rate, and you’ve silenced your own vote.
                Buying back restores everything.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Delegate — voting costs nothing</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-slate-400">
            <p>
              Holding $ENS gives you power only if it’s <strong className="text-slate-200">delegated</strong>.
              Delegation is a one-time transaction, the tokens never leave your wallet, and
              you can delegate to yourself. After that, vote on proposals whenever you like.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="https://agora.ensdao.org/delegates" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">Delegate on Agora ↗</Button>
              </a>
              <a href="https://snapshot.box/#/s:ens.eth" target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm">Live proposals ↗</Button>
              </a>
              {isConnected && !holdings.delegated && holdings.isVerifiedHolder && (
                <span className="self-center text-xs text-gold-400">
                  ← your $ENS isn’t delegated yet
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>What comes next: official ENS rewards</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-slate-400">
            <p>
              This MVP runs on virtual chips only. The long-term goal is for the ENS
              community to ship an <strong className="text-slate-200">official ENS token
              distribution / reward contract</strong> that plugs into the hooks already in
              this codebase:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code className="text-ens-300">worker/src/index.ts → /claim</code> — daily chips
                become tiered by verified on-chain $ENS holdings &amp; delegation.
              </li>
              <li>
                <code className="text-ens-300">frontend/lib/ens.ts</code> — the holdings state
                machine becomes the eligibility oracle for reward claims.
              </li>
              <li>
                Leaderboard seasons — top players earn allocations from the distribution
                contract, weighted by holding duration, not just winnings.
              </li>
            </ul>
            <p>
              Until then: play, invite friends, hold, delegate, vote.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 flex justify-center gap-3">
        {!isConnected && <Button onClick={() => open()}>Connect Wallet</Button>}
        <Link href="/"><Button variant="gold">Take a Seat →</Button></Link>
      </div>
    </div>
  );
}
