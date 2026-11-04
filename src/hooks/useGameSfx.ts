'use client';
import { useEffect, useRef } from 'react';
import { haptic, play } from '@/lib/sound';
import { useRoomStore } from '@/store/room';
import type { ClientView } from '@/server/view';

/** Turns public game events into sound + haptics. Never replays history on first load. */
export function useGameSfx(view: ClientView | null) {
  const seen = useRef<{ round: number; seq: number } | null>(null);
  const prevTurn = useRef<string | null>(null);
  const game = view?.room.game ?? null;
  const me = view?.me.playerId ?? null;

  useEffect(() => {
    if (!game || !me) return;
    const maxSeq = game.log.at(-1)?.seq ?? 0;
    const cur = seen.current;
    if (!cur || cur.round !== game.round) {
      // First sight of this round: play the deal sound only if the round just started (live), not on page load.
      const justStarted = !!cur && cur.round !== game.round;
      seen.current = { round: game.round, seq: justStarted ? 0 : maxSeq };
      if (!justStarted) return;
    }
    const from = seen.current!.seq;
    const fresh = game.log.filter((e) => e.seq > from);
    seen.current = { round: game.round, seq: maxSeq };
    for (const e of fresh) {
      switch (e.type) {
        case 'round_started': play('deal'); break;
        case 'bet': play('chip'); break;
        case 'raise': play('raise'); haptic(18); break;
        case 'pack': case 'timeout_pack': case 'broke_pack': case 'left': play('pack'); break;
        case 'seen': if (e.playerId === me) play('flip'); break;
        case 'sideshow_request': play('sideshow'); break;
        case 'show': play('show'); break;
        case 'round_ended': {
          const won = game.result?.payouts.some((p) => p.playerId === me);
          const inHand = game.players.find((p) => p.id === me && !p.folded);
          if (won) { play('win'); haptic([40, 60, 40, 60, 90]); } else if (inHand) play('lose');
          break;
        }
        default: break;
      }
    }
  }, [game, me]);

  // "Your turn" ping + countdown ticks in the last 5 seconds
  const myTurn = !!game && game.phase !== 'ended' && (game.phase === 'sideshow' ? game.pending?.responderId === me : game.turnId === me);
  useEffect(() => {
    if (myTurn && prevTurn.current !== 'me') {
      play('turn');
      haptic([60, 40, 60]);
    }
    prevTurn.current = myTurn ? 'me' : null;
  }, [myTurn, game?.turnId, game?.pending?.responderId]);

  const deadline = game?.turnDeadline ?? null;
  useEffect(() => {
    if (!myTurn || !deadline) return;
    const t = setInterval(() => {
      const left = Math.ceil((deadline - (Date.now() + useRoomStore.getState().skew)) / 1000);
      if (left > 0 && left <= 5) play('tick');
    }, 1000);
    return () => clearInterval(t);
  }, [myTurn, deadline]);
}
