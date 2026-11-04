'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Menu as MenuIcon, RefreshCw, WifiOff, X } from 'lucide-react';
import { useRoom } from '@/hooks/useRoom';
import { useRoomStore } from '@/store/room';
import { ActionBar } from './ActionBar';
import { Hand } from './Hand';
import { Lobby, useInvite } from './Lobby';
import { RoundEnd, SideshowNote } from './Overlays';
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

export function RoomScreen({ code }: { code: string }) {
  const { join, send, retry } = useRoom(code);
  const { phase, error, view, busy } = useRoomStore();
  const [menu, setMenu] = useState(false);
  const invite = useInvite(code);

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
  const playing = room.status === 'playing' || room.status === 'between';
  const g = room.game;
  const showTable = playing && !!g;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <ConnectionBanner retry={retry} />
      <Toast />
      <header className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-display text-lg leading-tight text-gold" data-testid="header-code">{room.name || 'Teen Patti'} <span className="tracking-widest text-paper/70">· {room.code}</span></p>
          <p className="text-[11px] uppercase tracking-wider text-muted">
            {room.status === 'lobby' ? 'Lobby' : room.status === 'between' ? `Round ${room.round} finished` : `Round ${room.round}`}
          </p>
        </div>
        <button aria-label="Menu" className="grid h-10 w-10 place-items-center rounded-lg border border-line" onClick={() => setMenu(true)} data-testid="menu-btn"><MenuIcon size={18} /></button>
      </header>

      {menu && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setMenu(false)}>
          <div className="ml-auto h-full w-64 space-y-2 bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Close menu" className="mb-2 ml-auto block" onClick={() => setMenu(false)}><X size={18} /></button>
            <button className="btn btn-ghost w-full" onClick={invite.copy}>{invite.copied ? 'Copied!' : 'Copy invite link'}</button>
            <Link className="btn btn-ghost flex w-full items-center justify-center" href="/rules" target="_blank">Game rules</Link>
            {room.status !== 'playing' && (
              <button className="btn btn-danger w-full" onClick={async () => { if (await send({ type: 'leave' })) location.href = '/'; }}>Leave room</button>
            )}
            {me.isHost && room.status !== 'lobby' && (
              <button className="btn btn-danger w-full" onClick={() => confirm('Close this room for everyone?') && send({ type: 'close_room' })}>Close room</button>
            )}
          </div>
        </div>
      )}

      {!showTable ? (
        <Lobby view={view} send={send} busy={busy} />
      ) : (
        <main className="flex flex-1 flex-col gap-2 px-3 safe-bottom">
          <Table view={view} />
          <div className="mt-auto space-y-2">
            <SideshowNote view={view} />
            <Hand view={view} busy={busy} onSee={() => send({ type: 'see' })} />
            <ActionBar view={view} send={send} busy={busy} />
            <RoundEnd view={view} send={send} busy={busy} />
            {room.status === 'between' && me.isHost && <HostBetween view={view} send={send} busy={busy} />}
          </div>
        </main>
      )}
    </div>
  );
}

function HostBetween({ view, send, busy }: { view: ReturnType<typeof useRoomStore.getState>['view'] & object; send: ReturnType<typeof useRoom>['send']; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pb-2 text-center">
      <button className="text-xs text-gold underline" onClick={() => setOpen(!open)} data-testid="between-settings">Edit table rules / remove players</button>
      {open && <div className="mt-2 text-left"><Lobby view={view} send={send} busy={busy} /></div>}
    </div>
  );
}
