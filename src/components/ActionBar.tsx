'use client';
import type { ClientView } from '@/server/view';
import type { CommandInput } from '@/hooks/useRoom';
import { Avatar } from './Avatar';
import { Countdown } from './Countdown';

const B = 'btn w-full !min-h-[42px] flex flex-col items-center justify-center leading-tight whitespace-nowrap !px-2 text-[13px] short:!min-h-[38px]';

/** One vertical column of the actions you can take right now. Impossible actions aren't shown. */
export function ActionBar({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const game = room.game;
  const priv = me.private;
  if (!game || game.phase === 'ended' || !priv?.inRound || priv.folded) return null;
  const l = priv.legal;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? 'Someone';

  if (game.phase === 'sideshow' && game.pending) {
    return (
      <p className="mh-panel px-3 py-3 text-center text-[12px] text-paper/85" data-testid="waiting">
        {l.respond ? <b className="text-gold-soft">Answer the sideshow request</b> : game.pending.requesterId === me.playerId ? `Waiting for ${name(game.pending.responderId)} to answer…` : 'Sideshow in progress…'}
      </p>
    );
  }

  const myTurn = game.turnId === me.playerId;
  if (!myTurn) {
    const who = game.turnId ? name(game.turnId) : null;
    return (
      <div className="mh-panel flex items-center gap-2 px-2.5 py-2" data-testid="waiting">
        {who && <Avatar name={who} size={30} />}
        <div className="min-w-0 text-[12px] leading-tight">
          <p className="caps text-[9px] text-[#cdb87a]">Waiting for</p>
          <p className="truncate font-display font-semibold text-paper">{who ?? 'the next turn'} <span className="text-gold-soft"><Countdown deadline={game.turnDeadline} /></span></p>
        </div>
      </div>
    );
  }
  const seen = priv.seen;
  return (
    <div className="space-y-1.5" data-testid="actions">
      <div className="caps text-center text-[10px] text-gold-soft">Your turn · <Countdown deadline={game.turnDeadline} /></div>
      {!l.bet && l.allIn && <p className="text-center text-[10.5px] leading-snug text-gold-soft">Not enough for a full bet: go all-in or pack.</p>}
      {l.bet && (
        <button className={`${B} btn-gold`} disabled={busy} onClick={() => send({ type: 'bet' })} data-testid="btn-bet">
          <span>{seen ? 'Chaal' : 'Blind'}</span><small className="text-[10px] opacity-75">pay {l.bet.cost}</small>
        </button>
      )}
      {l.bet?.raiseCost && (
        <button className={`${B} btn-gold`} disabled={busy} onClick={() => send({ type: 'bet', raise: true })} data-testid="btn-raise">
          <span>Raise to {l.bet.raiseTo}</span><small className="text-[10px] opacity-75">pay {l.bet.raiseCost}</small>
        </button>
      )}
      {l.allIn && (
        <button className={`${B} btn-gold`} disabled={busy} onClick={() => send({ type: 'allin' })} data-testid="btn-allin">
          <span>All-in</span><small className="text-[10px] opacity-75">{l.allIn.amount} chips</small>
        </button>
      )}
      {l.show && (
        <button className={`${B} btn-ghost`} disabled={busy} onClick={() => send({ type: 'show' })} data-testid="btn-show">
          <span>{l.show.allIn ? 'Show all-in' : 'Show'}</span><small className="text-[10px] opacity-75">pay {l.show.cost}</small>
        </button>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {l.sideshow ? (
          <button className={`${B} btn-ghost !text-[12px]`} disabled={busy} onClick={() => send({ type: 'sideshow_request' })} data-testid="btn-sideshow">
            <span>Sideshow</span><small className="text-[10px] opacity-75">pay {l.sideshow.cost}</small>
          </button>
        ) : l.sideshowBlocked ? (
          <button className={`${B} btn-ghost !text-[12px] opacity-55`} disabled title={l.sideshowBlocked} data-testid="btn-sideshow-blocked">
            <span>Sideshow</span><small className="max-w-full truncate text-[9px] opacity-90">{l.sideshowBlocked}</small>
          </button>
        ) : <span />}
        {l.pack && (
          <button className={`${B} btn-danger`} disabled={busy} onClick={() => send({ type: 'pack' })} data-testid="btn-pack">Pack</button>
        )}
      </div>
    </div>
  );
}
