'use client';
import { Coins, LogOut, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { play, unlockAudio } from '@/lib/sound';
import type { RoundHistory } from '@/server/service';
import type { PublicEvent, RoundResult } from '@/engine/types';
import type { CommandInput } from '@/hooks/useRoom';
import { useRoomStore } from '@/store/room';
import { useUI, type Theme } from '@/store/ui';
import type { ClientView } from '@/server/view';
import { jokerNote } from '@/lib/cards-ui';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';
import { useInvite } from './Lobby';

export function describeEvent(e: PublicEvent, name: (id?: string) => string): { icon: string; text: string } | null {
  const who = name(e.playerId);
  const other = name(e.otherId);
  switch (e.type) {
    case 'round_started': return { icon: '🃏', text: 'New round, cards dealt' };
    case 'boot': return null;
    case 'seen': return { icon: '👁', text: `${who} looked at their cards` };
    case 'bet': return { icon: '🪙', text: `${who} bet ${e.amount}` };
    case 'raise': return { icon: '🔺', text: `${who} raised the stake to ${e.stake} (paid ${e.amount})` };
    case 'allin': return { icon: '🔥', text: `${who} went all-in with ${e.amount}` };
    case 'pack': return { icon: '🏳', text: `${who} packed` };
    case 'timeout_pack': return { icon: '⏱', text: `${who} ran out of time and packed` };
    case 'broke_pack': return { icon: '💸', text: `${who} couldn't afford the next bet and packed` };
    case 'left': return { icon: '🚪', text: `${who} left the table` };
    case 'sideshow_request': return { icon: '🤝', text: `${who} asked ${other} for a sideshow (paid ${e.amount})` };
    case 'sideshow_declined': return { icon: '✋', text: `${who} declined ${other}'s sideshow` };
    case 'sideshow_timeout': return { icon: '⏱', text: `${who} didn't answer the sideshow` };
    case 'sideshow_accepted': return { icon: '⚔️', text: `${who} accepted ${other}'s sideshow` };
    case 'show': return { icon: '🎴', text: `${who} asked for a show (paid ${e.amount})` };
    case 'reveal': return { icon: '✨', text: `${who} revealed their hand` };
    case 'round_ended': return { icon: '🏆', text: 'Round over' };
    default: return null;
  }
}

export function PotSheet({ view }: { view: ClientView }) {
  const sheet = useUI((s) => s.sheet);
  const close = useUI((s) => s.close);
  const game = view.room.game;
  const rows = [...(game?.players ?? [])].sort((a, b) => b.committed - a.committed);
  const mine = game?.players.find((p) => p.id === view.me.playerId);
  return (
    <Sheet open={sheet === 'pot'} onClose={close} title="The pot" testId="pot-sheet">
      <p className="flex items-center gap-2 font-display text-4xl text-paper"><Coins className="text-gold" /> {game?.pot.toLocaleString() ?? 0}</p>
      {mine && <p className="mt-1 text-sm text-gold-soft">You've put in {mine.committed.toLocaleString()} this round.</p>}
      <ul className="mt-4 divide-y divide-line">
        {rows.map((p) => (
          <li key={p.id} className={`flex items-center gap-3 py-2 ${p.id === view.me.playerId ? 'text-gold-soft' : ''}`}>
            <Avatar name={p.name} size={30} />
            <span className="flex-1 truncate">{p.id === view.me.playerId ? 'You' : p.name}{p.folded && <span className="ml-2 text-xs text-muted">packed</span>}</span>
            <span className="tabular-nums">{p.committed.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function ResultLine({ r, names }: { r: RoundHistory; names: Map<string, string> }) {
  const res = r.result as RoundResult | null;
  return (
    <li className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-center justify-between text-xs text-muted"><span>Round {r.round}</span><span>{r.variation}</span></div>
      <p className="mt-1 text-sm">
        {res?.payouts.map((p) => `${names.get(p.playerId) ?? 'Player'} won ${p.amount}${p.share && p.share !== 'all' ? ` (${p.share})` : ''}`).join(' · ') ?? 'No result'}
      </p>
      {res && res.reveal.length > 0 && (
        <p className="mt-1 text-xs text-paper/70">{res.reveal.map((x) => `${names.get(x.playerId) ?? '?'}: ${x.label}${jokerNote(x.jokerAs) ? ` (${jokerNote(x.jokerAs)})` : ''}`).join(' · ')}</p>
      )}
      <p className="mt-0.5 text-[11px] text-muted">Pot {res?.pot} · {res?.reason === 'show' ? 'decided by a show' : res?.reason === 'showdown' ? 'all-in showdown' : 'everyone else packed'}</p>
    </li>
  );
}

export function FeedSheet({ view, code }: { view: ClientView; code: string }) {
  const sheet = useUI((s) => s.sheet);
  const close = useUI((s) => s.close);
  const [tab, setTab] = useState<'live' | 'rounds' | 'standings'>('live');
  const [hist, setHist] = useState<RoundHistory[] | null>(null);
  useEffect(() => {
    if (sheet === 'feed' && tab === 'rounds') api.history(code).then(setHist).catch(() => setHist([]));
  }, [sheet, tab, code, view.room.round, view.room.status]);
  const names = useMemo(() => {
    const m = new Map(view.room.players.map((p) => [p.id, p.name]));
    view.room.game?.players.forEach((p) => m.set(p.id, p.name));
    hist?.forEach((h) => (h.players as { id: string; name: string }[] | null)?.forEach((p) => m.set(p.id, p.name)));
    return m;
  }, [view.room.players, view.room.game, hist]);
  const nm = (id?: string) => (id ? (id === view.me.playerId ? 'You' : names.get(id) ?? 'Someone') : 'Someone');
  const log = [...(view.room.game?.log ?? [])].reverse();
  return (
    <Sheet open={sheet === 'feed'} onClose={close} title="Table activity" testId="feed-sheet">
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-panel-2 p-1">
        {(['live', 'rounds', 'standings'] as const).map((t) => (
          <button key={t} className={`btn !min-h-9 !px-1 !text-sm ${tab === t ? 'btn-gold' : 'text-muted'}`} onClick={() => setTab(t)} data-testid={`tab-${t}`}>{t === 'live' ? 'This round' : t === 'rounds' ? 'Past rounds' : 'Standings'}</button>
        ))}
      </div>
      {tab === 'standings' ? (
        <div data-testid="standings">
          <ul className="divide-y divide-line">
            {[...view.room.players].sort((a, b) => b.profit - a.profit).map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="w-5 text-xs text-muted">{i + 1}</span>
                <Avatar name={p.name} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.id === view.me.playerId ? 'You' : p.name}</p>
                  <p className="text-[11px] text-muted">bought in {p.buyIn.toLocaleString()}{p.rebuys > 0 ? ` (${p.rebuys} top-up${p.rebuys > 1 ? 's' : ''})` : ''} · now {p.balance.toLocaleString()}</p>
                </div>
                <span className={`font-display text-lg tabular-nums ${p.profit > 0 ? 'text-gold-soft' : p.profit < 0 ? 'text-danger' : 'text-muted'}`} data-testid="profit">{p.profit > 0 ? '+' : ''}{p.profit.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Net result = chips now (including chips in the pot) minus everything you bought in. Top-ups at this table: up to {view.room.settings.maxRebuys}.</p>
        </div>
      ) : tab === 'live' ? (
        <ul className="space-y-1.5" data-testid="feed-list">
          {log.map((e) => {
            const d = describeEvent(e, nm);
            return d ? (
              <li key={e.seq} className="flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2 text-sm"><span>{d.icon}</span><span>{d.text}</span></li>
            ) : null;
          })}
          {!log.length && <li className="text-sm text-muted">Nothing has happened yet.</li>}
        </ul>
      ) : (
        <ul className="space-y-2">
          {hist?.map((h) => <ResultLine key={h.round} r={h} names={names} />)}
          {hist && !hist.length && <li className="text-sm text-muted">No finished rounds yet.</li>}
          {!hist && <li className="text-sm text-muted">Loading…</li>}
        </ul>
      )}
    </Sheet>
  );
}

const THEMES: { id: Theme; name: string; colors: [string, string] }[] = [
  { id: 'classic', name: 'Classic', colors: ['#12604a', '#083826'] },
  { id: 'midnight', name: 'Midnight', colors: ['#1d4a8f', '#0c1c3a'] },
  { id: 'burgundy', name: 'Burgundy', colors: ['#8a2038', '#3a0c18'] },
  { id: 'noir', name: 'Noir', colors: ['#3a3a3e', '#0e0e10'] },
];

export function MenuSheet({ view, code, send }: { view: ClientView; code: string; send: (c: CommandInput) => Promise<boolean> }) {
  const ui = useUI();
  const invite = useInvite(code);
  const { room, me } = view;
  return (
    <Sheet open={ui.sheet === 'menu'} onClose={ui.close} title="Menu" testId="menu-sheet">
      <div className="space-y-2">
        <button className="btn btn-ghost w-full" onClick={invite.copy}>{invite.copied ? 'Copied!' : 'Copy invitation link'}</button>
        <button className="btn btn-ghost w-full" onClick={() => ui.open('feed')}>Activity & past rounds</button>
        <button className="btn btn-ghost w-full" onClick={() => ui.open('rules', room.game?.variation ?? 'classic')}>Game rules</button>
        <Link className="btn btn-ghost flex w-full items-center justify-center text-sm" href="/privacy" target="_blank">Privacy</Link>
      </div>
      <p className="label mt-5">Sound</p>
      <div className="flex items-center gap-3">
        <button
          aria-label={ui.muted ? 'Unmute' : 'Mute'}
          className="grid h-11 w-11 place-items-center rounded-xl bg-panel-2"
          onClick={() => { unlockAudio(); ui.setMuted(!ui.muted); if (ui.muted) setTimeout(() => play('chip'), 30); }}
          data-testid="mute-btn"
        >
          {ui.muted ? <VolumeX size={18} className="text-danger" /> : <Volume2 size={18} className="text-gold" />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={ui.volume} aria-label="Volume" className="flex-1 accent-[#c9a24b]" onChange={(e) => { unlockAudio(); ui.setVolume(Number(e.target.value)); }} onPointerUp={() => play('chip')} />
      </div>
      <p className="label mt-5">Table theme</p>
      <div className="grid grid-cols-4 gap-2">
        {THEMES.map((t) => (
          <button key={t.id} onClick={() => ui.setTheme(t.id)} className={`rounded-xl border p-1.5 text-[11px] ${ui.theme === t.id ? 'border-gold' : 'border-line'}`} aria-pressed={ui.theme === t.id}>
            <span className="mb-1 block h-8 rounded-lg" style={{ background: `radial-gradient(circle, ${t.colors[0]}, ${t.colors[1]})` }} />
            {t.name}
          </button>
        ))}
      </div>
      <div className="mt-6 space-y-2">
        <button className="btn btn-danger flex w-full items-center justify-center gap-2" onClick={() => ui.open('leave')} data-testid="leave-btn"><LogOut size={16} /> Leave table</button>
        {me.isHost && room.status !== 'lobby' && (
          <button className="btn btn-danger w-full" onClick={() => confirm('Close this room for everyone?') && send({ type: 'close_room' })}>Close room for everyone</button>
        )}
      </div>
    </Sheet>
  );
}

export function LeaveSheet({ view, send }: { view: ClientView; send: (c: CommandInput) => Promise<boolean> }) {
  const sheet = useUI((s) => s.sheet);
  const close = useUI((s) => s.close);
  const [busy, setBusy] = useState(false);
  const { room, me } = view;
  const mine = room.game?.players.find((p) => p.id === me.playerId);
  const midRound = room.status === 'playing' && !!mine && !mine.folded && room.game?.phase !== 'ended';
  const bal = room.players.find((p) => p.id === me.playerId)?.balance ?? 0;
  const others = room.players.filter((p) => p.id !== me.playerId);
  return (
    <Sheet open={sheet === 'leave'} onClose={close} title="Leave the table?" testId="leave-sheet">
      <div className="space-y-3 text-sm text-paper/90">
        {midRound ? (
          <p>You'll <b>pack right now</b>. The <b className="text-gold-soft">{mine!.committed.toLocaleString()}</b> chips you've already put in stay in the pot, and you walk away with <b className="text-gold-soft">{bal.toLocaleString()}</b>.</p>
        ) : (
          <p>You'll leave the room with <b className="text-gold-soft">{bal.toLocaleString()}</b> chips. If you come back with the room code you'll have the same chips (leaving doesn't reset your stack).</p>
        )}
        {me.isHost && others.length > 0 && <p className="text-gold-soft">As host, hosting passes to another player.</p>}
        {me.isHost && others.length === 0 && <p className="text-gold-soft">You're the last player, so the room will close.</p>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button className="btn btn-ghost" onClick={close}>Stay</button>
          <button
            className="btn btn-danger"
            disabled={busy}
            data-testid="confirm-leave"
            onClick={async () => {
              setBusy(true);
              const ok = await send({ type: 'leave' });
              setBusy(false);
              if (ok) { useRoomStore.getState().reset(); location.href = '/'; }
            }}
          >
            {busy ? 'Leaving…' : midRound ? 'Pack & leave' : 'Leave'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
