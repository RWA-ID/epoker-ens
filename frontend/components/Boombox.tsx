'use client';
/**
 * The boombox: play/pause and next are the buttons painted on the deck, the
 * cassette reels turn while it plays, and the track, credit and volume sit
 * underneath.
 *
 * Every hotspot is a percentage of `public/boombox.webp` (cut from a
 * 1483x945 source), so it scales with the box. Swap the art and they all need
 * re-measuring. The maker's logo was painted out of the art; the plate carries
 * our name instead.
 */
import { MUSIC_CREDIT, MUSIC_LICENSE_URL, TRACKS, next, setVolume, togglePlay, useMusic } from '@/lib/music';
import { cn } from '@/lib/utils';

const ART = '/boombox.webp';

/** Centre and diameter of each painted control, as % of the art. */
const PLAY = { left: '43.49%', top: '83.81%', size: '6.74%' };
const NEXT = { left: '55.5%', top: '83.81%', size: '6.74%' };
const REELS = [
  { left: '44.17%', top: '56.61%' },
  { left: '54.96%', top: '56.61%' },
];
const REEL_SIZE = 4.59; // % of the art's width

export function Boombox({ className }: { className?: string }) {
  const music = useMusic();

  return (
    <div className={cn('select-none', className)}>
      <div className="relative aspect-[1483/945] w-full [container-type:inline-size]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, no optimiser */}
        <img src={ART} alt="" draggable={false} className="absolute inset-0 h-full w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]" />

        {/* Name plate, where the maker's logo was */}
        <span
          aria-hidden
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display text-[1.55cqw] font-bold uppercase leading-none tracking-[0.12em] text-[#2b2b2b]"
          style={{ left: '49.83%', top: '41.11%' }}
        >
          HoodPoker
        </span>

        {/* Reels: a circle of the art itself, turned about its own centre */}
        {REELS.map((r, i) => (
          <div
            key={i}
            aria-hidden
            className={cn(
              'absolute aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full',
              music.playing && 'animate-[spin_2.4s_linear_infinite]',
            )}
            style={{ left: r.left, top: r.top, width: `${REEL_SIZE}%` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ART}
              alt=""
              draggable={false}
              className="absolute max-w-none"
              style={{
                width: `${10000 / REEL_SIZE}%`,
                left: `${(-parseFloat(r.left) * 100) / REEL_SIZE + 50}%`,
                top: `${(-parseFloat(r.top) * 100 * (945 / 1483)) / REEL_SIZE + 50}%`,
              }}
            />
          </div>
        ))}

        <DeckButton
          pos={PLAY}
          label={music.playing ? 'Pause music' : 'Play music'}
          onClick={togglePlay}
          active={music.playing}
        >
          {music.playing && (
            // The art only has a play arrow; cover it with a pause glyph.
            <span className="flex h-[62%] w-[62%] items-center justify-center gap-[12%] rounded-full bg-[radial-gradient(circle_at_40%_35%,#f4f4f4,#c9c9c9)]">
              <span className="h-[46%] w-[14%] rounded-[1px] bg-[#1d1d1d]" />
              <span className="h-[46%] w-[14%] rounded-[1px] bg-[#1d1d1d]" />
            </span>
          )}
        </DeckButton>
        <DeckButton pos={NEXT} label="Next song" onClick={() => next()} />
      </div>

      {/* Now playing + volume */}
      <div className="mt-1.5 flex flex-col gap-1 px-1 font-mono text-[10px] leading-tight">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-cream" title={music.track?.title}>
            <span className={cn('mr-1', music.playing ? 'text-acid' : 'text-dim')}>♪</span>
            {music.track ? music.track.title : 'Press play'}
          </p>
          <span className="shrink-0 tabular-nums text-dim">
            {music.position || '–'}/{TRACKS.length}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <a
            href={MUSIC_LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-[9px] text-dim transition-colors hover:text-acid"
          >
            {MUSIC_CREDIT} · CC BY 4.0
          </a>
          {music.volumeWorks ? (
            <label className="flex shrink-0 items-center gap-1.5 text-dim">
              <span className="sr-only">Music volume</span>
              <VolumeIcon level={music.volume} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={music.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1 w-[84px] cursor-pointer accent-acid"
              />
            </label>
          ) : (
            <span className="shrink-0 text-[9px] text-dim">Volume: device buttons</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DeckButton({
  pos,
  label,
  onClick,
  active,
  children,
}: {
  pos: { left: string; top: string; size: string };
  label: string;
  onClick: () => void;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'absolute flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-shadow',
        'hover:shadow-[0_0_0_2px_rgba(204,255,0,0.55)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#ccff00] active:scale-95',
        active && 'shadow-[0_0_0_2px_rgba(204,255,0,0.8),0_0_14px_rgba(204,255,0,0.45)]',
      )}
      style={{ left: pos.left, top: pos.top, width: pos.size }}
    >
      {children}
    </button>
  );
}

function VolumeIcon({ level }: { level: number }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" stroke="none" />
      {level > 0 && <path d="M11 6a3 3 0 0 1 0 4" strokeLinecap="round" />}
      {level > 0.5 && <path d="M12.8 4a6 6 0 0 1 0 8" strokeLinecap="round" />}
    </svg>
  );
}
