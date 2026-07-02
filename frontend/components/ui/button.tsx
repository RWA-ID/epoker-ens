'use client';
/** shadcn-style button with ENS Hold'em variants. */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary: 'bg-ens-500 hover:bg-ens-400 text-white shadow-glow',
  gold: 'bg-gold-500 hover:bg-gold-400 text-night-950 font-semibold shadow-gold',
  outline: 'border border-white/15 hover:border-ens-400/60 hover:bg-ens-950/40 text-slate-200',
  ghost: 'hover:bg-white/5 text-slate-300',
  danger: 'bg-red-600/90 hover:bg-red-500 text-white',
} as const;

const SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
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
