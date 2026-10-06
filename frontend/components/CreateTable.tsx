'use client';
/**
 * "Open your own table" — the lobby's way in.
 *
 * Collapsed, it is a full-width call to action rather than a quiet accordion
 * row; the hero and lobby header also open it (see `open` / `onOpenChange`).
 *
 * Guests are previewed as they are typed — avatar, full name, the wallet it
 * resolves to — so a host can see they have the right friend before adding
 * them. See lib/guest.ts for how a name becomes an address.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnect, useWallet } from '@/lib/wallet';
import { api } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useIdentity } from '@/lib/identity';
import { resolveGuest, type ResolvedGuest } from '@/lib/guest';
import { formatChips, shortAddress, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/Avatar';

const TABLE_NAME_IDEAS = [
  'Hood Degens',
  'Green Candle Club',
  'Paper Hands Only',
  'Diamond Hands',
  'Meme Stonk Lounge',
  'Midnight Margin Call',
  'Late Reg',
  'The Nut Flush',
];

/** The worker keeps 24 whitelist entries, and the host is always one. */
const MAX_GUESTS = 23;

const SOURCE_LABEL: Record<ResolvedGuest['source'], string> = {
  hoodfi: 'HoodFi name · Robinhood Chain',
  ens: 'ENS name · Ethereum',
  address: 'Wallet address',
};

type Preview =
  | { status: 'idle' }
  | { status: 'loading'; input: string }
  | { status: 'ok'; input: string; guest: ResolvedGuest }
  | { status: 'error'; input: string; error: string };

function Label({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <span className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-muted">
        {children}
      </span>
      {aside && <span className="font-mono text-[11.5px] text-faint">{aside}</span>}
    </div>
  );
}

/** "gm.hoodfi.eth" with the label loud and the suffix quiet. */
export function NameText({ handle, address }: { handle: string | null; address: string }) {
  if (!handle) return <>{shortAddress(address)}</>;
  const dot = handle.indexOf('.');
  if (dot <= 0) return <>{handle}</>;
  return (
    <>
      {handle.slice(0, dot)}
      <span className="text-acid/75">{handle.slice(dot)}</span>
    </>
  );
}

function GuestRow({
  guest,
  tag,
  onRemove,
}: {
  guest: Pick<ResolvedGuest, 'address' | 'handle' | 'avatar'> & { source?: ResolvedGuest['source'] };
  tag?: string;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-3.5 rounded-btn border border-cream/[0.12] bg-night-950 px-3.5 py-3">
      <Avatar
        record={guest.avatar}
        handle={guest.handle}
        address={guest.address}
        size={44}
        className="h-11 w-11 text-[18px]"
      />
      <div className="min-w-0 flex-1">
        <p className="hp-display hp-w85 truncate text-[19px] leading-tight text-cream">
          <NameText handle={guest.handle} address={guest.address} />
        </p>
        <p className="mt-0.5 truncate font-mono text-[11.5px] text-faint">
          {guest.handle ? shortAddress(guest.address) : SOURCE_LABEL.address}
          {guest.source && guest.source !== 'address' && ` · ${SOURCE_LABEL[guest.source]}`}
        </p>
      </div>
      {tag && (
        <span className="shrink-0 rounded-full bg-acid/[0.16] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-acid">
          {tag}
        </span>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${guest.handle ?? guest.address}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] text-dim transition-colors hover:bg-red-400/10 hover:text-red-300"
        >
          ✕
        </button>
      )}
    </li>
  );
}

function Choice({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-btn border transition-colors',
        active
          ? 'border-acid bg-acid/[0.16] text-acid'
          : 'border-cream/[0.16] text-dim hover:border-acid/50 hover:text-cream',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CreateTable({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const connect = useConnect();
  const { address, isConnected, handle: myHandle, avatar: myAvatar } = useIdentity();
  const { signMessage } = useWallet();

  const [tableName, setTableName] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [guestInput, setGuestInput] = useState('');
  const [guests, setGuests] = useState<ResolvedGuest[]>([]);
  const [preview, setPreview] = useState<Preview>({ status: 'idle' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const startIdea = useMemo(() => Math.floor(Math.random() * TABLE_NAME_IDEAS.length), []);
  const [ideaIdx, setIdeaIdx] = useState(startIdea);
  const suggestion = TABLE_NAME_IDEAS[ideaIdx % TABLE_NAME_IDEAS.length];

  // Live lookup as the host types. `latest` drops answers to stale input.
  const latest = useRef('');
  useEffect(() => {
    const input = guestInput.trim();
    latest.current = input;
    if (input.length < 2) {
      setPreview({ status: 'idle' });
      return;
    }
    setPreview({ status: 'loading', input });
    const timer = setTimeout(async () => {
      try {
        const guest = await resolveGuest(input);
        if (latest.current === input) setPreview({ status: 'ok', input, guest });
      } catch (err) {
        if (latest.current === input) {
          setPreview({
            status: 'error',
            input,
            error: err instanceof Error ? err.message : 'Could not resolve that name',
          });
        }
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [guestInput]);

  const guestProblem = (g: ResolvedGuest): string | null => {
    if (g.address === address?.toLowerCase()) return 'You’re the host — you’re already on the list.';
    if (guests.some((x) => x.address === g.address)) return 'Already on the guest list.';
    if (guests.length >= MAX_GUESTS) return `The guest list holds ${MAX_GUESTS} wallets.`;
    return null;
  };

  const addGuest = async () => {
    const input = guestInput.trim();
    if (!input) return;
    let guest: ResolvedGuest;
    if (preview.status === 'ok' && preview.input === input) {
      guest = preview.guest;
    } else if (preview.status === 'loading') {
      return; // Enter mid-lookup: the preview lands in a moment.
    } else {
      try {
        guest = await resolveGuest(input);
      } catch (err) {
        setPreview({ status: 'error', input, error: err instanceof Error ? err.message : 'Could not resolve that name' });
        return;
      }
    }
    const problem = guestProblem(guest);
    if (problem) {
      setPreview({ status: 'error', input, error: problem });
      return;
    }
    setGuests((g) => [...g, guest]);
    setGuestInput('');
  };

  const createTable = async () => {
    if (!address) return connect();
    if (isPrivate && guests.length === 0) {
      setCreateError('Add at least one guest to the list (or make the table public).');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const { token } = await ensureAuth(address, signMessage);
      const { id } = await api.createTable(
        { address, token },
        {
          name: tableName || suggestion,
          smallBlind,
          isPrivate,
          maxPlayers: isPrivate ? maxPlayers : undefined,
          whitelist: isPrivate
            ? guests.map(({ address, handle }) => ({ address, handle }))
            : undefined,
        },
      );
      router.push(`/table/?id=${id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  const previewProblem = preview.status === 'ok' ? guestProblem(preview.guest) : null;

  return (
    <div
      id="create"
      className="mt-8 scroll-mt-6 overflow-hidden rounded-card border border-acid/35 bg-[linear-gradient(160deg,#12160a,#0a0b07_55%)] shadow-[0_0_0_1px_rgba(204,255,0,0.04),0_24px_70px_-30px_rgba(204,255,0,0.25)]"
    >
      <button
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-5 px-6 py-7 text-left sm:px-8"
      >
        <span className="min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-acid">
            Host a game
          </span>
          <span className="hp-display hp-w85 mt-2 block text-[30px] leading-[1.05] text-cream sm:text-[38px]">
            Open your own table
          </span>
          <span className="mt-2 block max-w-[520px] text-[15.5px] leading-[1.55] text-muted">
            Public in the lobby, or private for your group chat — invite friends by their HoodFi
            name.
          </span>
        </span>
        <span
          className={cn(
            'hp-display hp-w85 inline-flex shrink-0 items-center gap-2.5 rounded-cta px-7 py-4 text-[17px] transition-colors',
            open
              ? 'border border-cream/[0.22] text-cream hover:border-acid hover:text-acid'
              : 'bg-acid text-ink shadow-cta hover:bg-acid-hover',
          )}
        >
          <span
            aria-hidden
            className={cn('text-[22px] leading-none transition-transform duration-200', open && 'rotate-45')}
          >
            +
          </span>
          {open ? 'Close' : 'Open a table'}
        </span>
      </button>

      {open && (
        <div className="space-y-7 border-t border-cream/[0.1] px-6 py-7 sm:px-8">
          <div>
            <Label>Table name</Label>
            <div className="flex gap-2.5">
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder={suggestion}
                maxLength={40}
                className="min-w-0 flex-1 rounded-btn border border-cream/[0.16] bg-night-950 px-4 py-3.5 text-[16px] text-cream outline-none transition-colors placeholder:text-ghost focus:border-acid"
              />
              <button
                title="Roll a table name"
                aria-label="Roll a table name"
                onClick={() => {
                  const next = ideaIdx + 1;
                  setIdeaIdx(next);
                  setTableName(TABLE_NAME_IDEAS[next % TABLE_NAME_IDEAS.length]);
                }}
                className="w-14 shrink-0 rounded-btn border border-cream/[0.16] text-xl text-dim transition-colors hover:border-acid hover:text-acid"
              >
                🎲
              </button>
            </div>
          </div>

          <div>
            <Label aside={`Start stack ${formatChips(smallBlind * 2 * 100)} chips · 100 BB`}>
              Blinds (play chips)
            </Label>
            <div className="grid grid-cols-2 gap-2.5 xs:grid-cols-4">
              {[5, 10, 25, 50].map((sb) => (
                <Choice
                  key={sb}
                  active={smallBlind === sb}
                  onClick={() => setSmallBlind(sb)}
                  className="py-4 font-mono text-[17px]"
                >
                  {sb}/{sb * 2}
                </Choice>
              ))}
            </div>
          </div>

          <div>
            <Label>Who can sit</Label>
            <div className="grid gap-2.5 xs:grid-cols-2">
              {([
                { value: false, label: 'Public', hint: 'Listed in the lobby — anyone can sit' },
                { value: true, label: 'Private', hint: 'Unlisted — only your guest list can sit' },
              ] as const).map((opt) => (
                <Choice
                  key={String(opt.value)}
                  active={isPrivate === opt.value}
                  onClick={() => setIsPrivate(opt.value)}
                  className="px-4 py-4 text-left"
                >
                  <span className="hp-display hp-w85 block text-[20px]">{opt.label}</span>
                  <span className="mt-1 block text-[13.5px] text-faint">{opt.hint}</span>
                </Choice>
              ))}
            </div>
          </div>

          {isPrivate && (
            <>
              <div>
                <Label
                  aside={
                    maxPlayers < 4
                      ? `Deals once all ${maxPlayers} are seated`
                      : 'Deals at 4 seated players'
                  }
                >
                  Seats
                </Label>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <Choice
                      key={n}
                      active={maxPlayers === n}
                      onClick={() => setMaxPlayers(n)}
                      className="py-3.5 font-mono text-[17px]"
                    >
                      {n}
                    </Choice>
                  ))}
                </div>
              </div>

              <div>
                <Label aside={`${guests.length} / ${MAX_GUESTS}`}>Guest list</Label>
                <div className="flex gap-2.5">
                  <input
                    value={guestInput}
                    onChange={(e) => setGuestInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addGuest()}
                    placeholder="HoodFi name (gm), name.eth or 0x…"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-btn border border-cream/[0.16] bg-night-950 px-4 py-3.5 text-[16px] text-cream outline-none transition-colors placeholder:text-ghost focus:border-acid"
                  />
                  <Button
                    onClick={addGuest}
                    disabled={preview.status !== 'ok' || !!previewProblem}
                    className="shrink-0 px-6 text-[15px]"
                  >
                    Add
                  </Button>
                </div>
                <p className="mt-2 text-[13px] text-faint">
                  Type just the name — <span className="text-dim">gm</span> finds{' '}
                  <span className="text-dim">gm.hoodfi.eth</span> first.
                </p>

                {preview.status === 'loading' && (
                  <p className="mt-3 animate-pulse font-mono text-[12px] text-faint">
                    Looking up {preview.input}…
                  </p>
                )}
                {preview.status === 'error' && (
                  <p className="mt-3 text-[14px] text-red-400">{preview.error}</p>
                )}
                {preview.status === 'ok' && (
                  <div
                    className={cn(
                      'mt-3 flex items-center gap-4 rounded-btn border px-4 py-4',
                      previewProblem
                        ? 'border-cream/[0.12] bg-night-950'
                        : 'border-acid/45 bg-acid/[0.07]',
                    )}
                  >
                    <Avatar
                      record={preview.guest.avatar}
                      handle={preview.guest.handle}
                      address={preview.guest.address}
                      size={56}
                      className="h-14 w-14 text-[22px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="hp-display hp-w85 truncate text-[22px] leading-tight text-cream">
                        <NameText handle={preview.guest.handle} address={preview.guest.address} />
                      </p>
                      <p className="mt-1 truncate font-mono text-[11.5px] text-faint">
                        {shortAddress(preview.guest.address)} · {SOURCE_LABEL[preview.guest.source]}
                      </p>
                      {previewProblem ? (
                        <p className="mt-1 text-[13px] text-dim">{previewProblem}</p>
                      ) : (
                        <p className="mt-1 text-[13px] text-acid">✓ Press Add or Enter</p>
                      )}
                    </div>
                  </div>
                )}

                <ul className="mt-4 space-y-2">
                  {address && (
                    <GuestRow
                      guest={{ address: address.toLowerCase(), handle: myHandle, avatar: myAvatar }}
                      tag="You · host"
                    />
                  )}
                  {guests.map((g) => (
                    <GuestRow
                      key={g.address}
                      guest={g}
                      onRemove={() => setGuests((l) => l.filter((x) => x.address !== g.address))}
                    />
                  ))}
                </ul>
                {guests.length === 0 && (
                  <p className="mt-3 text-[13.5px] text-faint">
                    No guests yet — add at least one. They’ll need the invite link too.
                  </p>
                )}
              </div>
            </>
          )}

          {createError && <p className="text-[14px] text-red-400">{createError}</p>}
          <Button size="lg" className="w-full py-5 text-[18px] shadow-cta" onClick={createTable} disabled={creating}>
            {creating
              ? 'Creating…'
              : !isConnected
                ? 'Sign in to create'
                : isPrivate
                  ? `Create private table · ${guests.length + 1} on the list`
                  : 'Create table'}
          </Button>
        </div>
      )}
    </div>
  );
}
