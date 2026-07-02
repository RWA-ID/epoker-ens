/** A single playing card ("As", "Td") or a face-down card back. */
import { cn } from '@/lib/utils';

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLOR: Record<string, string> = {
  s: 'text-ink', c: 'text-ink',
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
    sm: 'h-10 w-7 text-xs rounded-[5px]',
    md: 'h-[70px] w-[50px] text-[21px] rounded-lg',
    lg: 'h-20 w-14 text-2xl rounded-[9px]',
  }[size];

  if (faceDown || !card) {
    return (
      <div
        className={cn(
          dims,
          'animate-dealIn border border-gold-500/30 bg-gradient-to-br from-[#17376f] to-[#0a1a3e]',
          'flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.55)]',
          className,
        )}
      >
        <span className="text-[0.9em] text-gold-500/40">♠</span>
      </div>
    );
  }

  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];

  return (
    <div
      className={cn(
        dims,
        'animate-dealIn flex items-center justify-center border border-black/10 bg-cream shadow-[0_4px_14px_rgba(0,0,0,0.55)]',
        className,
      )}
    >
      <span className={cn('font-display font-bold leading-none', SUIT_COLOR[suit])}>
        {rank}
        {SUIT_GLYPH[suit]}
      </span>
    </div>
  );
}
