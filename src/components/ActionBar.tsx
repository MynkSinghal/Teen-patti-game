'use client';
import type { ClientView } from '@/server/view';
import type { CommandInput } from '@/hooks/useRoom';
import { Countdown } from './Countdown';

export function ActionBar({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const game = room.game;
  const priv = me.private;
  if (!game || game.phase === 'ended' || !priv?.inRound || priv.folded) return null;
  const l = priv.legal;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? 'Someone';

  if (game.phase === 'sideshow' && game.pending) {
    if (l.respond) {
      return (
        <div className="rounded-xl border border-gold/60 bg-panel p-3" role="alertdialog" aria-label="Sideshow request" data-testid="sideshow-prompt">
          <p className="text-sm">
            <b>{name(game.pending.requesterId)}</b> asks for a sideshow. Your hands will be compared privately; the weaker hand packs. <Countdown deadline={game.turnDeadline} />
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn btn-gold" disabled={busy} onClick={() => send({ type: 'sideshow_respond', accept: true })} data-testid="sideshow-accept">Accept</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => send({ type: 'sideshow_respond', accept: false })} data-testid="sideshow-decline">Decline</button>
          </div>
        </div>
      );
    }
    return (
      <p className="py-3 text-center text-sm text-muted" data-testid="waiting">
        {game.pending.requesterId === me.playerId ? `Waiting for ${name(game.pending.responderId)} to answer your sideshow…` : 'Sideshow in progress…'}
      </p>
    );
  }

  const myTurn = game.turnId === me.playerId;
  if (!myTurn) {
    return (
      <p className="py-3 text-center text-sm text-muted" data-testid="waiting">
        Waiting for {game.turnId ? name(game.turnId) : 'the next turn'}…
      </p>
    );
  }
  const seen = priv.seen;
  return (
    <div className="space-y-2" data-testid="actions">
      <div className="text-center text-xs text-gold-soft">
        Your turn · <Countdown deadline={game.turnDeadline} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {l.bet && (
          <button className="btn btn-gold" disabled={busy} onClick={() => send({ type: 'bet' })} data-testid="btn-bet">
            {seen ? 'Chaal' : 'Blind'} · {l.bet.cost}
          </button>
        )}
        {l.bet?.raiseCost && (
          <button className="btn btn-gold" disabled={busy} onClick={() => send({ type: 'bet', raise: true })} data-testid="btn-raise">
            {seen ? 'Chaal ×2' : 'Blind ×2'} · {l.bet.raiseCost}
          </button>
        )}
        {l.sideshow && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => send({ type: 'sideshow_request' })} data-testid="btn-sideshow">
            Sideshow · {l.sideshow.cost}
          </button>
        )}
        {l.show && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => send({ type: 'show' })} data-testid="btn-show">
            Show · {l.show.cost}
          </button>
        )}
        {l.pack && (
          <button className="btn btn-danger" disabled={busy} onClick={() => send({ type: 'pack' })} data-testid="btn-pack">
            Pack
          </button>
        )}
      </div>
    </div>
  );
}
