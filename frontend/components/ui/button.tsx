'use client';
/** shadcn-style button with ENS Hold'em "High Roller" variants. */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  // Gold gradient is the primary CTA treatment across the redesign.
  gold: 'gold-fill text-ink font-semibold shadow-gold hover:-translate-y-0.5 hover:shadow-goldlg',
  primary: 'bg-ens-500 hover:bg-ens-400 text-white shadow-glow',
  outline:
    'border border-gold-500/40 text-gold-200 hover:bg-gold-500/10 hover:border-gold-500/70',
  ghost: 'text-slate-400 hover:text-slate-100 hover:bg-white/5',
  neutral: 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10',
  danger: 'border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20',
} as const;

const SIZES = {
  sm: 'h-9 px-4 text-[13px] rounded-[9px]',
  md: 'h-11 px-5 text-sm rounded-[11px]',
  lg: 'h-[52px] px-7 text-[15px] rounded-xl',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'gold', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200',
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
