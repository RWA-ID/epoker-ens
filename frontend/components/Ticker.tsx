/**
 * Full-bleed accent ticker.
 *
 * The two halves must be *two identical, separately-laid-out flex rows* with
 * `flex:none`, and the animation translates `calc(-50% - 17px)` — half the
 * container plus half the 34px gap. Sizing the halves with percentages
 * instead (`width:200%` / `width:50%`) makes the content overflow its half
 * and the two collide mid-loop, which reads as a stutter rather than an
 * obvious bug.
 */
const ITEMS = [
  'Free to play',
  'No token',
  'Virtual chips only',
  'Hands deal at 4 players',
  'Season 1 live',
  'Built on Robinhood chain',
];

function Half() {
  return (
    <div className="flex flex-none gap-[34px] whitespace-nowrap py-2.5">
      {ITEMS.map((item) => (
        <span
          key={item}
          className="hp-display hp-w80 flex items-center gap-[34px] text-[15px] tracking-[0.05em] text-ink"
        >
          {item}
          <span aria-hidden className="text-ink/45">◆</span>
        </span>
      ))}
    </div>
  );
}

export function Ticker() {
  return (
    <div className="overflow-hidden border-b border-night-950 bg-acid">
      <div className="flex w-max animate-marquee gap-[34px]">
        <Half />
        <Half />
      </div>
    </div>
  );
}
