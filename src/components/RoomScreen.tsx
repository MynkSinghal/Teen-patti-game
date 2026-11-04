'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, Loader2, Menu as MenuIcon, RefreshCw, RotateCw, WifiOff, X } from 'lucide-react';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useRoom } from '@/hooks/useRoom';
import { unlockAudio } from '@/lib/sound';
import { useRoomStore } from '@/store/room';
import { useUI } from '@/store/ui';
import { ActionBar } from './ActionBar';
import { ChatBanner, ChatBubble, ChatSheet } from './Chat';
import { Hand } from './Hand';
import { JokerSheet } from './JokerSheet';
import { Lobby } from './Lobby';
import { RoundEnd, SideshowNote } from './Overlays';
import { FeedSheet, LeaveSheet, MenuSheet, PotSheet } from './Panels';
import { RulesSheet } from './RulesSheet';
import { StakeLadder } from './StakeLadder';
import { Table } from './Table';

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center px-6 text-center">{children}</main>;
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

/** Phones play best sideways. Web pages can't force rotation, so nudge, and lock landscape where the browser allows it. */
function RotateHint({ active }: { active: boolean }) {
  const [portrait, setPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(sessionStorage.getItem('tp_rotate_dismissed') === '1'); } catch { setDismissed(false); }
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (!active || !portrait || dismissed) return null;
  const goLandscape = async () => {
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch { /* iOS Safari can't lock; the user can rotate manually */ }
  };
  return (
    <div className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-gold/40 bg-panel/95 px-3 py-2 text-xs shadow-xl backdrop-blur" role="status" data-testid="rotate-hint">
      <RotateCw size={18} className="shrink-0 text-gold" />
      <span className="flex-1">Turn your phone sideways for the best table view.</span>
      <button className="rounded-full bg-gold px-3 py-1 font-bold text-ink" onClick={goLandscape}>Go landscape</button>
      <button aria-label="Dismiss" onClick={() => { setDismissed(true); try { sessionStorage.setItem('tp_rotate_dismissed', '1'); } catch { /* ignore */ } }}><X size={14} /></button>
    </div>
  );
}

function MyMoney({ view }: { view: NonNullable<ReturnType<typeof useRoomStore.getState>['view']> }) {
  const g = view.room.game;
  const mine = g?.players.find((p) => p.id === view.me.playerId);
  const bal = view.room.players.find((p) => p.id === view.me.playerId)?.balance ?? 0;
  if (!g || !mine) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-panel-2 px-3 py-1.5 text-xs" data-testid="my-money">
      <span className="text-muted">You've put in <b className="text-gold-soft tabular-nums" data-testid="my-committed">{mine.committed.toLocaleString()}</b></span>
      <span className="text-muted">Pot <b className="text-paper tabular-nums">{g.pot.toLocaleString()}</b></span>
      <span className="text-muted">Balance <b className="text-paper tabular-nums">{bal.toLocaleString()}</b></span>
    </div>
  );
}

export function RoomScreen({ code }: { code: string }) {
  const { join, send, retry } = useRoom(code);
  const { phase, error, view, busy } = useRoomStore();
  const open = useUI((s) => s.open);
  useGameSfx(view);

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
    <div className={`mx-auto flex min-h-dvh max-w-md flex-col ls:max-w-none ${showTable ? 'ls:h-dvh ls:max-h-dvh ls:min-h-0 ls:overflow-hidden' : ''}`}>
      <ConnectionBanner retry={retry} />
      <Toast />
      <ChatBanner />
      <header className="flex items-center justify-between px-4 py-3 ls:h-11 ls:shrink-0 ls:py-0">
        <div>
          <p className="font-display text-lg leading-tight text-gold" data-testid="header-code">{room.name || 'Teen Patti'} <span className="tracking-widest text-paper/70">· {room.code}</span></p>
          <p className="text-[11px] uppercase tracking-wider text-muted">
            {room.status === 'lobby' ? 'Lobby' : room.status === 'between' ? `Round ${room.round} finished` : `Round ${room.round}`}
          </p>
        </div>
        <div className="flex gap-2">
          {showTable && (
            <button aria-label="Table activity" className="grid h-10 w-10 place-items-center rounded-lg border border-line" onClick={() => open('feed')} data-testid="feed-btn"><Activity size={18} /></button>
          )}
          <button aria-label="Menu" className="grid h-10 w-10 place-items-center rounded-lg border border-line" onClick={() => open('menu')} data-testid="menu-btn"><MenuIcon size={18} /></button>
        </div>
      </header>

      {!showTable ? (
        <Lobby view={view} send={send} busy={busy} />
      ) : (
        <main className="flex flex-1 flex-col gap-2 px-3 safe-bottom ls:grid ls:min-h-0 ls:flex-1 ls:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] ls:gap-3 ls:overflow-hidden ls:px-4 ls:pb-2" data-testid="game-main">
          <div className="ls:h-full ls:min-h-0">
            <Table view={view} />
          </div>
          <div className="mt-auto space-y-2 ls:mt-0 ls:min-h-0 ls:overflow-y-auto ls:pr-1" data-testid="side-panel">
            {g && g.phase !== 'ended' && <StakeLadder game={g} names={names} />}
            <SideshowNote view={view} />
            <Hand view={view} busy={busy} onSee={() => send({ type: 'see' })} />
            <MyMoney view={view} />
            <ActionBar view={view} send={send} busy={busy} />
            <RoundEnd view={view} send={send} busy={busy} />
            {room.status === 'between' && me.isHost && <HostBetween view={view} send={send} busy={busy} />}
          </div>
        </main>
      )}

      <RotateHint active={showTable} />
      <ChatBubble />
      <ChatSheet code={code} />
      <MenuSheet view={view} code={code} send={send} />
      <FeedSheet view={view} code={code} />
      <PotSheet view={view} />
      <RulesSheet />
      <LeaveSheet view={view} send={send} />
      <JokerSheet view={view} send={send} busy={busy} />
    </div>
  );
}

function HostBetween({ view, send, busy }: { view: NonNullable<ReturnType<typeof useRoomStore.getState>['view']>; send: ReturnType<typeof useRoom>['send']; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pb-2 text-center">
      <button className="text-xs text-gold underline" onClick={() => setOpen(!open)} data-testid="between-settings">Edit table rules / remove players</button>
      {open && <div className="mt-2 text-left"><Lobby view={view} send={send} busy={busy} mode="between" /></div>}
    </div>
  );
}
