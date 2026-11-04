'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Menu as MenuIcon, RefreshCw, RotateCw, ScrollText, WifiOff, X } from 'lucide-react';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useLs, usePhonePortrait } from '@/hooks/useLs';
import { useRoom } from '@/hooks/useRoom';
import { unlockAudio } from '@/lib/sound';
import { useRoomStore } from '@/store/room';
import { useUI } from '@/store/ui';
import { ActionBar } from './ActionBar';
import { ChatBanner, ChatButton, ChatSheet } from './Chat';
import { JokerSheet } from './JokerSheet';
import { Lobby } from './Lobby';
import { SideshowLayer, SideshowResult, TableBanner } from './Sideshow';
import { VariationIntro } from './VariationIntro';
import { RoundEnd } from './Overlays';
import { FeedSheet, LeaveSheet, MenuSheet, PotSheet, SettingsSheet } from './Panels';
import { RulesSheet } from './RulesSheet';
import { StakeLadder } from './StakeLadder';
import { Table } from './Table';

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-[var(--app-h)] place-items-center px-6 text-center">{children}</main>;
}

function JoinForm({ code, onJoin, busy }: { code: string; onJoin: (n: string) => void; busy: boolean }) {
  const [name, setName] = useState('');
  useEffect(() => setName(localStorage.getItem('tp_name') ?? ''), []);
  return (
    <Centered>
      <form className="w-full max-w-sm space-y-3 rounded-2xl border border-line bg-panel p-5 text-left" onSubmit={(e) => { e.preventDefault(); onJoin(name); }}>
        <h1 className="font-display text-2xl text-gold">Join room {code}</h1>
        <label className="block">
          <span className="label">Your name</span>
          <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Rohan" data-testid="join-name" />
        </label>
        <button className="btn btn-gold w-full" disabled={busy || !name.trim()} data-testid="join-btn">{busy ? 'Joining…' : 'Join table'}</button>
        <Link href="/" className="block text-center text-sm text-muted underline">Back</Link>
      </form>
    </Centered>
  );
}

function Toast() {
  const toast = useRoomStore((s) => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !show) return null;
  return (
    <div role="alert" className={`fixed inset-x-4 top-14 z-50 mx-auto max-w-sm rounded-xl px-4 py-3 text-sm shadow-xl ${toast.kind === 'error' ? 'bg-[#3a1b18] text-[#f3b9b2] border border-[#5b2b26]' : 'bg-panel-2 border border-line'}`} data-testid="toast">
      {toast.text}
    </div>
  );
}

function ConnectionBanner({ retry }: { retry: () => void }) {
  const conn = useRoomStore((s) => s.conn);
  if (conn === 'online') return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-[#3a2c12] px-3 py-1.5 text-xs text-gold-soft" role="status" data-testid="conn-banner">
      <WifiOff size={13} /> {conn === 'offline' ? 'You appear to be offline.' : 'Reconnecting…'}
      <button className="underline" onClick={retry}><RefreshCw size={12} className="mr-1 inline" />Retry now</button>
    </div>
  );
}

/** Web pages can't force a phone to rotate, so in portrait we draw the table in landscape for you and say so. */
function RotateHint({ active }: { active: boolean }) {
  const forced = useUI((s) => s.forced);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active || !forced) { setShown(false); return; }
    let seen = false;
    try { seen = sessionStorage.getItem('tp_rotate_seen') === '1'; } catch { /* ignore */ }
    if (seen) return;
    setShown(true);
    try { sessionStorage.setItem('tp_rotate_seen', '1'); } catch { /* ignore */ }
    const t = setTimeout(() => setShown(false), 7000);
    return () => clearTimeout(t);
  }, [active, forced]);
  if (!shown) return null;
  const goFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch { /* iOS Safari can't lock orientation; turning the phone works */ }
  };
  return (
    <div className="fixed inset-x-3 top-12 z-30 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-gold/40 bg-panel/95 px-3 py-2 text-xs shadow-xl backdrop-blur" role="status" data-testid="rotate-hint">
      <RotateCw size={18} className="shrink-0 text-gold" />
      <span className="flex-1">The table is shown sideways. Turn your phone to match for the full screen.</span>
      <button className="rounded-full bg-gold px-3 py-1 font-bold text-ink" onClick={goFullscreen}>Fullscreen</button>
      <button aria-label="Dismiss" onClick={() => setShown(false)}><X size={14} /></button>
    </div>
  );
}

function MyMoney({ view }: { view: NonNullable<ReturnType<typeof useRoomStore.getState>['view']> }) {
  const g = view.room.game;
  const mine = g?.players.find((p) => p.id === view.me.playerId);
  const bal = view.room.players.find((p) => p.id === view.me.playerId)?.balance ?? 0;
  if (!g || !mine) return null;
  return (
    <div className="flex items-baseline justify-between px-1 text-[10.5px] text-[#cdb87a]" data-testid="my-money">
      <span>You put in <b className="num text-[15px] text-gold-soft" data-testid="my-committed">{mine.committed.toLocaleString()}</b></span>
      <span>Chips <b className="num text-[15px] text-paper">{bal.toLocaleString()}</b></span>
    </div>
  );
}

function JokerHint({ view }: { view: NonNullable<ReturnType<typeof useRoomStore.getState>['view']> }) {
  const g = view.room.game;
  const priv = view.me.private;
  if (!g || g.phase === 'ended' || !priv?.inRound || priv.folded) return null;
  if (!(g.jokerRanks.length > 0 || g.lowestCardJoker)) return null;
  const mine = priv.jokers?.indexes.length ?? 0;
  return (
    <p className="rounded-lg bg-[#120c06] px-2 py-1 text-center text-[10px] leading-snug text-paper/85 ring-1 ring-line" data-testid="joker-coach">
      {!priv.cards ? <>🃏 Jokers count as your <b>best card</b> automatically.</> : mine > 0 ? <>🃏 Your joker counts as your best card. <b>Tap it</b> to choose what to announce.</> : <>No jokers in your hand this round.</>}
    </p>
  );
}

export function RoomScreen({ code }: { code: string }) {
  const { join, send, retry } = useRoom(code);
  const { phase, error, view, busy } = useRoomStore();
  const open = useUI((s) => s.open);
  useGameSfx(view);
  const phonePortrait = usePhonePortrait();
  const tableOn = !!view && (view.room.status === 'playing' || view.room.status === 'between') && !!view.room.game;
  const forced = tableOn && phonePortrait;
  useEffect(() => {
    if (forced) document.documentElement.dataset.fl = '1';
    else delete document.documentElement.dataset.fl;
    useUI.getState().setForced(forced);
    return () => { delete document.documentElement.dataset.fl; useUI.getState().setForced(false); };
  }, [forced]);

  useEffect(() => {
    useUI.getState().init();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  if (phase === 'loading') return <Centered><Loader2 className="animate-spin text-gold" /></Centered>;
  if (phase === 'needs_join') return <><Toast /><JoinForm code={code} onJoin={join} busy={busy} /></>;
  if (phase === 'not_found' || phase === 'closed' || phase === 'error') {
    return (
      <Centered>
        <div className="space-y-3">
          <h1 className="font-display text-2xl text-gold">{phase === 'closed' ? 'Room closed' : phase === 'not_found' ? 'Room not found' : 'Something went wrong'}</h1>
          <p className="text-muted">{error}</p>
          {phase === 'error' && <button className="btn btn-ghost" onClick={() => location.reload()}>Try again</button>}
          <Link href="/" className="btn btn-gold inline-flex items-center">Back home</Link>
        </div>
      </Centered>
    );
  }
  if (!view) return <Centered><Loader2 className="animate-spin text-gold" /></Centered>;

  const { room, me } = view;
  const g = room.game;
  const showTable = (room.status === 'playing' || room.status === 'between') && !!g;
  const names = new Map(room.players.map((p) => [p.id, p.name]));
  g?.players.forEach((p) => names.set(p.id, p.name));

  return (
    <div className="fl-root mx-auto flex min-h-[var(--app-h)] max-w-md flex-col ls:h-[var(--app-h)] ls:max-h-[var(--app-h)] ls:min-h-0 ls:max-w-none ls:overflow-hidden" data-testid="app-root">
      <ConnectionBanner retry={retry} />
      <Toast />
      <ChatBanner />
      <header className="flex items-center justify-between px-4 py-2.5 ls:h-11 ls:shrink-0 ls:py-0">
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[15px] font-extrabold tracking-[0.2em] text-gold" data-testid="header-code">{(room.name || 'Teen Patti').toUpperCase()}</p>
          <p className="caps truncate text-[8.5px] text-muted">
            Room {room.code} · {room.status === 'lobby' ? 'Lobby' : room.status === 'between' ? `Round ${room.round} finished` : `Round ${room.round}`}
          </p>
        </div>
        <div className="flex gap-2">
          <ChatButton />
          {showTable && (
            <button aria-label="Table activity" className="medallion-sm grid h-8 w-8 place-items-center text-gold-soft" onClick={() => open('feed')} data-testid="feed-btn"><ScrollText size={15} /></button>
          )}
          <button aria-label="Menu" className="medallion-sm grid h-8 w-8 place-items-center text-gold-soft" onClick={() => open('menu')} data-testid="menu-btn"><MenuIcon size={15} /></button>
        </div>
      </header>

      {!showTable ? (
        <Lobby view={view} send={send} busy={busy} />
      ) : (
        <main className="flex flex-1 flex-col gap-2 px-3 safe-bottom ls:grid ls:min-h-0 ls:flex-1 ls:grid-cols-[minmax(0,1fr)_206px] ls:gap-3 ls:overflow-hidden ls:px-3 ls:pb-2" data-testid="game-main">
          <div className="ls:h-full ls:min-h-0">
            <Table view={view} send={send} busy={busy} />
          </div>
          <div className="flex flex-col gap-1.5 ls:min-h-0 ls:justify-center ls:overflow-y-auto" data-testid="side-panel">
            {g && g.phase !== 'ended' && <StakeLadder game={g} names={names} />}
            <MyMoney view={view} />
            <JokerHint view={view} />
            <SideshowResult view={view} />
            <div data-testid="action-dock"><ActionBar view={view} send={send} busy={busy} /></div>
          </div>
        </main>
      )}
      <RoundEnd view={view} send={send} busy={busy} />

      <RotateHint active={showTable} />
      {showTable && <SideshowLayer view={view} send={send} busy={busy} />}
      {showTable && <TableBanner view={view} />}
      {showTable && <VariationIntro view={view} />}
      <ChatSheet code={code} />
      <MenuSheet view={view} code={code} send={send} />
      <FeedSheet view={view} code={code} />
      <PotSheet view={view} />
      <RulesSheet />
      <LeaveSheet view={view} send={send} />
      <JokerSheet view={view} send={send} busy={busy} />
      <SettingsSheet view={view} send={send} busy={busy} />
    </div>
  );
}
