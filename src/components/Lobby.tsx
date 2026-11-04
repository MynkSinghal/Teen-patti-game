'use client';
import { useState } from 'react';
import { Check, Copy, Crown, UserX, WifiOff } from 'lucide-react';
import { VARIATION_LIST } from '@/engine/variations';
import type { RoomSettings } from '@/lib/settings';
import type { CommandInput } from '@/hooks/useRoom';
import type { ClientView } from '@/server/view';
import { SettingsForm } from './SettingsForm';

export function useInvite(code: string) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/room/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return { url, copied, copy };
}

export function Lobby({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const invite = useInvite(room.code);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RoomSettings>(room.settings);
  const [dealerPick, setDealerPick] = useState<string>('classic');
  const s = room.settings;
  const variation = VARIATION_LIST.find((v) => v.id === s.variation);
  const meP = room.players.find((p) => p.id === me.playerId);
  const readyCount = room.players.filter((p) => p.ready && p.balance >= s.boot).length;
  const needed = room.round === 0 ? 3 : 2;

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 pb-8" data-testid="lobby">
      <section className="rounded-2xl border border-line bg-panel p-4 text-center">
        <p className="label">Room code</p>
        <p className="font-display text-4xl tracking-[0.3em] text-gold" data-testid="room-code">{room.code}</p>
        <p className="mt-1 break-all text-xs text-muted">{invite.url}</p>
        <button className="btn btn-gold mt-3 inline-flex w-full items-center justify-center gap-2" onClick={invite.copy} data-testid="copy-invite">
          {invite.copied ? <Check size={16} /> : <Copy size={16} />}
          {invite.copied ? 'Copied!' : 'Copy invitation link'}
        </button>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg">Players ({room.players.length}/{s.maxPlayers})</h2>
          <span className="text-xs text-muted">{readyCount} ready · need {needed}</span>
        </div>
        <ul className="divide-y divide-line">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2" data-testid="lobby-player">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-panel-2 text-sm font-semibold">{p.name[0]?.toUpperCase()}</span>
              <span className="flex-1 truncate">
                {p.name}
                {p.id === me.playerId && <span className="text-muted"> (you)</span>}
              </span>
              {p.isHost && <Crown size={14} className="text-gold" aria-label="Host" />}
              {!p.connected && <WifiOff size={14} className="text-danger" aria-label="Disconnected" />}
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${p.ready ? 'bg-felt text-paper' : 'bg-panel-2 text-muted'}`}>{p.ready ? 'Ready' : 'Not ready'}</span>
              <span className="w-14 text-right text-xs tabular-nums text-gold-soft">{p.balance}</span>
              {me.isHost && !p.isHost && (
                <button aria-label={`Remove ${p.name}`} className="p-1 text-muted hover:text-danger" disabled={busy} onClick={() => send({ type: 'kick', playerId: p.id })}>
                  <UserX size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!me.isHost && meP && (
          <button className={`btn mt-3 w-full ${meP.ready ? 'btn-ghost' : 'btn-gold'}`} disabled={busy} onClick={() => send({ type: 'ready', ready: !meP.ready })} data-testid="ready-btn">
            {meP.ready ? 'Not ready' : "I'm ready"}
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Table rules</h2>
          {me.isHost && (
            <button className="text-sm text-gold underline underline-offset-2" onClick={() => { setDraft(s); setEditing(!editing); }} data-testid="edit-settings">
              {editing ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-3 space-y-3">
            <SettingsForm value={draft} onChange={setDraft} startingChipsLocked={room.round > 0} />
            <button className="btn btn-gold w-full" disabled={busy} onClick={async () => { if (await send({ type: 'update_settings', settings: draft })) setEditing(false); }} data-testid="save-settings">
              Save settings
            </button>
          </div>
        ) : (
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Variation</dt><dd>{variation?.name}</dd>
            <dt className="text-muted">Boot</dt><dd>{s.boot}</dd>
            <dt className="text-muted">Starting chips</dt><dd>{s.startingChips}</dd>
            <dt className="text-muted">Turn timer</dt><dd>{s.turnSeconds}s</dd>
            <dt className="text-muted">Sideshow</dt><dd>{s.sideshowEnabled ? 'On' : 'Off'}</dd>
          </dl>
        )}
      </section>

      {me.isHost ? (
        <div className="space-y-2">
          {s.variation === 'dealers_choice' && (
            <label className="block">
              <span className="label">This round’s variation</span>
              <select className="input" value={dealerPick} onChange={(e) => setDealerPick(e.target.value)} data-testid="dealer-pick">
                {VARIATION_LIST.filter((v) => v.id !== 'dealers_choice').map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
          )}
          <button
            className="btn btn-gold w-full"
            disabled={busy || readyCount < needed}
            onClick={() => send({ type: 'start_round', ...(s.variation === 'dealers_choice' ? { variation: dealerPick as never } : {}) })}
            data-testid="start-round"
          >
            Start {room.round === 0 ? 'game' : 'next round'}
          </button>
          {readyCount < needed && <p className="text-center text-xs text-muted">Waiting for at least {needed} ready players with enough chips for the boot.</p>}
          <button className="btn btn-danger w-full" disabled={busy} onClick={() => confirm('Close this room for everyone?') && send({ type: 'close_room' })} data-testid="close-room">
            Close room
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">Waiting for the host to start…</p>
      )}
    </div>
  );
}
