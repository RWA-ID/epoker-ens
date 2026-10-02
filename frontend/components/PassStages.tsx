/**
 * House Pass mint stages and the play-money fine print, shared by the landing
 * section (#pass) and the perks page (/pass/) so the two can't drift.
 */
import { MINT_STAGES, PUBLIC_PRICE_ETH } from '@/lib/housePass';

export function MintStages() {
  return (
    <div className="mt-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        Four stages · allowlists free · public {PUBLIC_PRICE_ETH} ETH · October 15
      </p>
      <ol className="mt-3 grid gap-2">
        {MINT_STAGES.map((stage, i) => (
          <li key={stage.name} className="flex items-baseline gap-3 rounded-card border border-cream/10 px-4 py-3">
            <span className="font-mono text-[11px] text-faint">0{i + 1}</span>
            <p className="min-w-0 flex-1 text-[14.5px] leading-[1.5] text-cream">
              {stage.name}
              <span className="text-muted"> — {stage.who}</span>
            </p>
            <span className="shrink-0 text-right font-mono text-[12px] tabular-nums leading-[1.5] text-acid">
              {stage.cap}
              <span className="block text-[10.5px] text-faint">{stage.price}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PassFineprint() {
  return (
    <div className="mt-7 rounded-card border border-cream/10 bg-night-900 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Still a for-fun game</p>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">
        The allowlist stages are free, you pay only gas. The public price of {PUBLIC_PRICE_ETH} ETH
        goes to development, infrastructure and maintenance. The chip stack that comes with a pass is play
        money like every other chip: it can&rsquo;t be transferred between players, cashed out or
        turned into a prize, and it&rsquo;s credited once per pass, so reselling one doesn&rsquo;t pay
        out again. Cosmetics never touch a hand, and the leaderboard ranks profit per hand, so a
        bigger stack can&rsquo;t buy rank.
      </p>
    </div>
  );
}
