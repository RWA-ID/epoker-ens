'use client';

/**
 * Countdown to the House Pass mint plus the OpenSea link. Walks MINT_STAGES:
 * before the first stage it counts to the open, during a stage it names the
 * stage and counts to the next change, after the public stage it says closed.
 * The time renders only after mount — a static export has no "now", so a
 * server-rendered number would mismatch on hydration.
 */
import { useEffect, useState } from 'react';
import { MINT_STAGES, OPENSEA_URL } from '@/lib/housePass';

const stages = MINT_STAGES.map((s) => ({ name: s.name, start: Date.parse(s.start), end: Date.parse(s.end) }));

function split(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: 'days', value: Math.floor(t / 86400) },
    { label: 'hrs', value: Math.floor((t % 86400) / 3600) },
    { label: 'min', value: Math.floor((t % 3600) / 60) },
    { label: 'sec', value: t % 60 },
  ];
}

export function MintCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const first = stages[0];
  const last = stages[stages.length - 1];
  const live = now === null ? undefined : stages.find((s) => now >= s.start && now < s.end);

  let heading = 'Mint opens in';
  let target: number | null = first.start;
  if (now !== null && now >= last.end) {
    heading = 'The mint is closed';
    target = null;
  } else if (live) {
    const next = stages[stages.indexOf(live) + 1];
    heading = next ? `${live.name} minting now · ${next.name} in` : `${live.name} mint live · closes in`;
    target = next ? next.start : live.end;
  }
  const open = now !== null && now >= first.start;

  return (
    <div className="mt-7 rounded-card border border-acid/30 bg-acid/[0.05] p-5">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-acid">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />}
        {heading}
      </p>
      {target !== null && (
        <div className="mt-3 grid grid-cols-4 gap-2" aria-live="off">
          {split(now === null ? 0 : target - now).map((u) => (
            <div key={u.label} className="rounded-btn border border-cream/10 bg-night-900 px-2 py-2.5 text-center">
              <span className="block font-mono text-[22px] tabular-nums leading-none text-cream">
                {now === null ? '--' : String(u.value).padStart(2, '0')}
              </span>
              <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">{u.label}</span>
            </div>
          ))}
        </div>
      )}
      <a
        href={OPENSEA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-btn bg-acid px-4 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-acid-hover"
      >
        <img src="/opensea.png" alt="" width={20} height={20} className="h-5 w-5 rounded-[4px]" />
        {open ? 'Mint on OpenSea' : 'View the drop on OpenSea'} →
      </a>
      <p className="mt-2.5 text-center text-[12px] leading-[1.5] text-faint">
        The only official mint. Times are AST (UTC−4); the countdown uses your clock.
      </p>
    </div>
  );
}
