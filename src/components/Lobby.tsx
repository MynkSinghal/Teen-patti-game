'use client';
import { useState } from 'react';
import { Check, Copy, Settings2, WifiOff } from 'lucide-react';
import { VARIATION_LIST } from '@/engine/variations';
import type { CommandInput } from '@/hooks/useRoom';
import { useUI } from '@/store/ui';
import type { ClientView } from '@/server/view';
import { Avatar } from './Avatar';
import { RoundStarter } from './RoundStarter';

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

/** Lobby: left = room code, invite, players. Right = the dealer's game choice and Deal. Rules live in a sheet. */
export function Lobby({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const invite = useInvite(room.code);
  const s = room.settings;
  const meP = room.players.find((p) => p.id === me.playerId);
  const readyCount = room.players.filter((p) => p.ready && p.balance >= s.boot).length;
  const needed = room.round === 0 ? 3 : 2;
  const variation = VARIATION_LIST.find((v) => v.id === s.variation);
  const many = room.players.length > 4;

  return (
    <div className="mx-auto grid w-full max-w-md gap-3 px-3 pb-6 ls:max-w-none ls:flex-1 ls:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] ls:overflow-hidden ls:pb-3" data-testid="lobby">
      <section className="mh-panel flex flex-col p-3.5 ls:min-h-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="caps text-[9px] text-muted">Room code</p>
            <p className="font-display text-[30px] font-extrabold leading-none tracking-[0.22em] text-gold-soft" data-testid="room-code">{room.code}</p>
          </div>
          <button className="btn btn-gold inline-flex shrink-0 items-center gap-1.5 !min-h-[38px] !px-3 text-[12px]" onClick={invite.copy} data-testid="copy-invite">
            {invite.copied ? <Check size={14} /> : <Copy size={14} />}{invite.copied ? 'Copied' : 'Invite'}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="caps text-[9.5px] text-[#cdb87a]">Players {room.players.length}/{s.maxPlayers}</p>
          <p className="text-[10.5px] text-muted">{readyCount} ready · need {needed}</p>
        </div>
        <ul className={`mt-1.5 grid gap-1.5 ls:min-h-0 ls:overflow-y-auto ${many ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-[rgba(255,255,255,.03)] px-2 py-0.5 shadow-[inset_0_0_0_1px_rgba(216,180,90,.22)]" data-testid="lobby-player">
              <Avatar name={p.name} size={20} />
              <span className="min-w-0 flex-1 truncate font-display text-[11.5px] font-semibold">{p.name}{p.id === me.playerId && <span className="text-muted"> (you)</span>}{p.isHost && ' 👑'}</span>
              {!p.connected && <WifiOff size={11} className="text-danger" aria-label="Disconnected" />}
              {many ? (
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.ready ? 'bg-gold shadow-[0_0_6px_#d8b45a]' : 'bg-[#3a2e1a]'}`} title={p.ready ? 'Ready' : 'Not ready'} />
              ) : (
                <span className={`rounded-full px-1.5 text-[9px] font-bold ${p.ready ? 'tag-gold' : 'bg-[#1a1209] text-muted ring-1 ring-line'}`}>{p.ready ? 'READY' : 'WAIT'}</span>
              )}
              {!many && <span className="num w-12 text-right text-[14px] text-gold-soft">{p.balance.toLocaleString()}</span>}
            </li>
          ))}
        </ul>
        {!me.isHost && meP && (
          <button className={`btn mt-3 w-full !min-h-[40px] ${meP.ready ? 'btn-ghost' : 'btn-gold'}`} disabled={busy} onClick={() => send({ type: 'ready', ready: !meP.ready })} data-testid="ready-btn">
            {meP.ready ? "I'm not ready" : "I'm ready"}
          </button>
        )}
      </section>

      <section className="mh-panel flex flex-col gap-2.5 p-3.5 ls:min-h-0">
        <RoundStarter view={view} send={send} busy={busy} canStart={readyCount >= needed} />
        {readyCount < needed && <p className="text-center text-[11px] text-muted">Waiting for at least {needed} ready players with enough chips.</p>}
        <div className="mt-auto flex items-center gap-2 rounded-lg bg-[#120c06] px-3 py-1.5 text-[11px] text-[#cdb87a] ring-1 ring-line">
          <span className="min-w-0 flex-1 truncate">
            {variation?.id === 'dealers_choice' ? (s.variationChooser === 'dealer' ? "Dealer's choice" : "Host's choice") : variation?.name} · Boot {s.boot} · {s.startingChips.toLocaleString()} chips · {s.turnSeconds}s turns
          </span>
          {me.isHost && (
            <button className="inline-flex items-center gap-1 text-gold underline" onClick={() => useUI.getState().open('settings')} data-testid="edit-settings"><Settings2 size={13} /> Rules</button>
          )}
        </div>
      </section>
    </div>
  );
}
