/** A single playing card ("As", "Td") or a face-down card back. */
import { cn } from '@/lib/utils';

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLOR: Record<string, string> = {
  s: 'text-night-950', c: 'text-night-950',
  h: 'text-red-600', d: 'text-red-600',
};

export function PlayingCard({
  card,
  size = 'md',
  faceDown = false,
  className,
}: {
  card?: string;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  className?: string;
}) {
  const dims = {
    sm: 'h-10 w-7 text-[10px] rounded',
    md: 'h-14 w-10 text-sm rounded-md',
    lg: 'h-20 w-14 text-lg rounded-lg',
  }[size];

  if (faceDown || !card) {
    return (
      <div
        className={cn(
          dims,
          'animate-dealIn border border-ens-300/30 bg-gradient-to-br from-ens-800 to-ens-950',
          'flex items-center justify-center shadow-md',
          className,
        )}
      >
        <span className="font-display text-gold-500/70 text-[0.9em]">◆</span>
      </div>
    );
  }

  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];

  return (
    <div
      className={cn(
        dims,
        'animate-dealIn flex flex-col items-center justify-center bg-slate-50 shadow-md',
        SUIT_COLOR[suit],
        className,
      )}
    >
      <span className="font-bold leading-none">{rank}</span>
      <span className="leading-none">{SUIT_GLYPH[suit]}</span>
    </div>
  );
}
