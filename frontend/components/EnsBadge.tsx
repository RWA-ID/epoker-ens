/** "ENS Verified" badge shown next to wallets that hold $ENS. */
import { cn } from '@/lib/utils';

export function EnsBadge({ className }: { className?: string }) {
  return (
    <span
      title="This wallet holds $ENS — verified DAO participant"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-ens-500/15 px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wide text-ens-300 ring-1 ring-ens-400/40',
        className,
      )}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
      </svg>
      ENS Verified
    </span>
  );
}
