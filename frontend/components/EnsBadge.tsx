/** "ENS Verified" badge shown next to wallets that hold $ENS. */
import { cn } from '@/lib/utils';

export function EnsBadge({ className }: { className?: string }) {
  return (
    <span
      title="This wallet holds $ENS — verified DAO participant"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-ens-400/30 bg-ens-400/10',
        'px-2.5 py-1 text-[11px] font-semibold text-ens-300',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ens-logo.jpg" alt="" className="h-3.5 w-3.5 rounded-[3px]" />
      ENS Verified
    </span>
  );
}
