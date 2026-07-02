'use client';
/**
 * Home = hero + lobby. Lists open tables, lets a connected wallet
 * create one, and pushes the "invite friends" loop (hands need 4+).
 */
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSignMessage } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { api } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { useEnsIdentity } from '@/lib/ens';
import { formatChips } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsBanner } from '@/components/HoldingsBanner';

export default function HomePage() {
  const router = useRouter();
  const { open } = useAppKit();
  const { address, isConnected } = useEnsIdentity();
  const { signMessageAsync } = useSignMessage();

  const [creating, setCreating] = useState(false);
  const [tableName, setTableName] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tables'],
    queryFn: api.listTables,
    refetchInterval: 5000,
  });

  const createTable = async () => {
    if (!address) return open();
    setCreating(true);
    setCreateError(null);
    try {
      const sig = await ensureAuth(address, signMessageAsync);
      const { id } = await api.createTable(
        { address, sig },
        tableName || 'ENS Hold’em Table',
        smallBlind,
      );
      router.push(`/table/?id=${id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      {/* Hero */}
      <section className="grid items-center gap-8 py-10 md:grid-cols-2 md:py-16">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-500">epoker.eth</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-slate-50 md:text-5xl">
            Texas Hold’em for the <span className="text-ens-400">ENS</span> community
          </h1>
          <p className="mt-4 max-w-md text-slate-400">
            Your ENS name is your seat at the table. Play with friends, climb the
            leaderboard, and keep your $ENS working in DAO governance while you play.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!isConnected && <Button size="lg" onClick={() => open()}>Connect Wallet</Button>}
            <Button
              size="lg"
              variant={isConnected ? 'gold' : 'outline'}
              onClick={() => (isConnected ? window.scrollTo({ top: 600, behavior: 'smooth' }) : open())}
            >
              Find a Table
            </Button>
            <Link href="/dao/">
              <Button size="lg" variant="ghost">Why hold $ENS?</Button>
            </Link>
          </div>
          <ul className="mt-8 space-y-2 text-sm text-slate-500">
            <li>♠ 10,000 free virtual chips to start — no real-money gambling</li>
            <li>♦ Hands start at 4 players: bring your frENS</li>
            <li>♣ Global leaderboard by net chips won</li>
            <li>♥ ENS holders get verified badges &amp; bonus perks</li>
          </ul>
        </div>
        <div className="relative overflow-hidden rounded-3xl border border-gold-500/20 shadow-2xl">
          <Image
            src="/hero-table.png"
            alt="The epoker.eth ENS High Roller Table"
            width={1536}
            height={1024}
            priority
            className="h-auto w-full"
          />
        </div>
      </section>

      <div className="mb-8"><HoldingsBanner /></div>

      {/* Lobby */}
      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Open Tables</CardTitle>
            <span className="text-xs text-slate-500">refreshes live</span>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="py-8 text-center text-sm text-slate-500">Loading tables…</p>}
            {!!error && (
              <p className="py-8 text-center text-sm text-red-400">
                Lobby unreachable — is the worker running? ({String(error)})
              </p>
            )}
            {data && data.tables.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">
                No tables yet. Be the first to open one →
              </p>
            )}
            <ul className="divide-y divide-white/5">
              {data?.tables.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-100">{t.name}</p>
                    <p className="text-xs text-slate-500">
                      Blinds {t.smallBlind}/{t.smallBlind * 2} · Buy-in{' '}
                      {formatChips(t.smallBlind * 2 * 100)} · {t.seats}/9 seated
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        t.status === 'playing'
                          ? 'rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] uppercase text-green-400'
                          : 'rounded-full bg-gold-500/10 px-2 py-0.5 text-[10px] uppercase text-gold-400'
                      }
                    >
                      {t.status === 'playing' ? 'In hand' : `Needs ${Math.max(0, 4 - t.seats)}`}
                    </span>
                    <Link href={`/table/?id=${t.id}`}>
                      <Button size="sm" variant="outline">Join</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Create table */}
        <Card className="h-fit">
          <CardHeader><CardTitle>Open a Table</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Table name</label>
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="frENS night 🃏"
                maxLength={40}
                className="w-full rounded-lg border border-white/10 bg-night-950 px-3 py-2 text-sm outline-none focus:border-ens-400/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Stakes (small blind)</label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 25, 50].map((sb) => (
                  <button
                    key={sb}
                    onClick={() => setSmallBlind(sb)}
                    className={`rounded-lg border py-2 text-sm transition-colors ${
                      smallBlind === sb
                        ? 'border-ens-400 bg-ens-950/60 text-ens-200'
                        : 'border-white/10 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    {sb}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Buy-in: {formatChips(smallBlind * 2 * 100)} chips (100 big blinds)
              </p>
            </div>
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <Button className="w-full" onClick={createTable} disabled={creating}>
              {creating ? 'Creating…' : isConnected ? 'Create Table' : 'Connect to Create'}
            </Button>
            <p className="text-center text-xs text-slate-600">
              Share the table link to invite friends — hands start at 4 players.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
