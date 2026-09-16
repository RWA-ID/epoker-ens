/**
 * The HoodPoker mark: two skewed accent bars, then the wordmark.
 * The same two-slash device is printed on the chair backs and the felt in the
 * table photograph — keep them consistent if either changes.
 */
import { cn } from '@/lib/utils';

export function Mark({
  size = 24,
  className,
}: {
  /** Wordmark font-size in px; the bars scale from it. */
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="flex gap-[3px]"
        style={{ transform: 'skewX(-14deg)' }}
      >
        <span className="block bg-acid" style={{ width: 5, height: size * 0.92 }} />
        <span className="block bg-acid" style={{ width: 5, height: size * 0.92 }} />
      </span>
      <span
        className="hp-display hp-w80 leading-none"
        style={{ fontSize: size, letterSpacing: '-0.02em' }}
      >
        <span className="text-cream">Hood</span>
        <span className="text-acid">Poker</span>
      </span>
    </span>
  );
}
