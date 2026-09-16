'use client';
/** HoodPoker button — uppercase italic label, accent fill or hairline outline. */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  acid: 'bg-acid text-ink hover:bg-acid-hover',
  outline:
    'border border-cream/[0.22] bg-cream/[0.05] text-cream hover:border-acid hover:text-acid',
  ghost: 'text-dim hover:text-acid',
  neutral: 'border border-cream/[0.16] bg-transparent text-dim hover:border-acid hover:text-acid',
  danger: 'border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20',
} as const;

const SIZES = {
  sm: 'px-[13px] py-[9px] text-[11px] rounded-btn tracking-[0.1em]',
  md: 'px-[18px] py-[11px] text-[13px] rounded-btn tracking-[0.04em]',
  lg: 'px-[28px] py-[16px] text-[16px] rounded-cta tracking-[0.03em]',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'acid', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        // `whitespace-nowrap` matters: the CTA band's two buttons wrap their
        // labels onto two lines at narrow widths without it.
        'hp-display hp-w85 inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
