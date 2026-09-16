'use client';
/**
 * Player avatar: renders an ENS/hoodfi `avatar` record through an ordered
 * gateway chain, falling back to a monogram.
 *
 * `size` is the *request* hint — what the gateway is asked to resize to — not
 * the layout. Dimensions come from `className` so callers can size
 * responsively; an inline width/height here would win over those classes.
 *
 * The candidate index is reset *during render* when the record changes rather
 * than in an effect — an effect runs after paint, so a player whose previous
 * avatar exhausted the candidate list would flash the fallback (or never
 * retry) when their record changes.
 */
import { useState } from 'react';
import { avatarUrls } from '@/lib/avatar';
import { displayName, cn } from '@/lib/utils';

export function Avatar({
  record,
  handle,
  address,
  size = 40,
  className,
  monogramClassName,
}: {
  /** Raw avatar text record — NOT a resolved URL. */
  record?: string | null;
  handle?: string | null;
  address: string;
  /** Largest px size this will be drawn at; drives the gateway resize. */
  size?: number;
  /** Must carry the width/height classes. */
  className?: string;
  monogramClassName?: string;
}) {
  // Ask for 2x so the image stays crisp on retina.
  const urls = avatarUrls(record, size * 2);

  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState(record ?? null);
  if (seen !== (record ?? null)) {
    setSeen(record ?? null);
    setIdx(0);
  }

  const src = urls[idx];

  if (!src) {
    return (
      <span
        className={cn(
          'bg-acid flex shrink-0 items-center justify-center rounded-full font-display font-bold leading-none text-ink',
          className,
          monogramClassName,
        )}
        aria-hidden
      >
        {displayName(handle, address).slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn('shrink-0 rounded-full object-cover', className)}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
