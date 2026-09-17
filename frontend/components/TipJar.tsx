'use client';
/**
 * Footer credit: tip the builder (copies the address) and a feedback link.
 *
 * TIP_ADDRESS is what ensgiant.eth resolves to (forward and reverse checked
 * 2026-09-17). It is hard-coded on purpose: copying a live resolution would
 * silently follow the name if it were ever transferred. If ensgiant.eth moves
 * to a new wallet, update this constant.
 */
import { useState } from 'react';

const TIP_NAME = 'ensgiant.eth';
const TIP_ADDRESS = '0x2D037f66b9e0EDE90c2080558a7d3FF7BE36E9A1';
const FEEDBACK_HANDLE = 'ensgianteth';

export function TipJar() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TIP_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      /* clipboard blocked — the address is shown in the title */
    }
  };

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2.5">
      <button
        onClick={copy}
        title={`${TIP_NAME} · ${TIP_ADDRESS}`}
        className="group inline-flex items-center gap-2 rounded-btn border border-acid/35 bg-acid/[0.06] px-3 py-2 font-mono text-[11px] text-cream transition-colors hover:border-acid hover:bg-acid/[0.12]"
      >
        <span className="uppercase tracking-[0.14em] text-acid">{copied ? 'Address copied' : 'Tip'}</span>
        <span className="text-dim group-hover:text-cream">
          {copied ? `${TIP_ADDRESS.slice(0, 6)}…${TIP_ADDRESS.slice(-4)}` : TIP_NAME}
        </span>
      </button>
      <a
        href={`https://x.com/${FEEDBACK_HANDLE}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-btn border border-cream/[0.12] px-3 py-2 font-mono text-[11px] text-dim transition-colors hover:border-acid/40 hover:text-acid"
      >
        Feedback &amp; ideas → @{FEEDBACK_HANDLE}
      </a>
      <span aria-live="polite" className="sr-only">
        {copied ? `Copied ${TIP_NAME} address` : ''}
      </span>
    </div>
  );
}
