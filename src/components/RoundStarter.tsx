'use client';
import { Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VARIATION_LIST } from '@/engine/variations';
import type { CommandInput } from '@/hooks/useRoom';
import type { ClientView } from '@/server/view';
import { Avatar } from './Avatar';
import { RulesButton } from './RulesSheet';
import { Countdown } from './Countdown';

type Opts = { jokerMode?: 'single' | 'double' | 'lowest'; jokerRanks?: number[]; hiLoMode?: 'split' | 'high' | 'low' | 'alternate' };

/**
 * "Who deals next, and what are we playing?" The dealer picks the variation for their round
 * (host can always step in). Used in the lobby and after every round.
 */
export function RoundStarter({ view, send, busy, canStart = true, startLabel }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean; canStart?: boolean; startLabel?: string }) {
  const { room, me } = view;
  const s = room.settings;
  const dealer = room.players.find((p) => p.id === room.nextDealerId) ?? null;
  const iAmDealer = dealer?.id === me.playerId;
  const dealerPicks = s.variation === 'dealers_choice' && s.variationChooser === 'dealer';
  const [stepIn, setStepIn] = useState(false);
  const [variation, setVariation] = useState('classic');
  const [opts, setOpts] = useState<Opts>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const mayPick = s.variation !== 'dealers_choice' ? me.isHost : dealerPicks ? iAmDealer || (me.isHost && (stepIn || !dealer?.connected)) : me.isHost;
  const slow = !!room.chooseDeadline && now > room.chooseDeadline;
  const picked = VARIATION_LIST.find((v) => v.id === variation);

  const start = () => {
    const variationOptions: Opts = {};
    if (variation === 'joker') {
      variationOptions.jokerMode = opts.jokerMode ?? 'single';
      if (opts.jokerRanks?.length) variationOptions.jokerRanks = opts.jokerRanks;
    }
    if (variation === 'hilo') variationOptions.hiLoMode = opts.hiLoMode ?? 'split';
    return send({ type: 'start_round', ...(s.variation === 'dealers_choice' ? { variation: variation as never, variationOptions } : {}) });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4" data-testid="round-starter">
      {dealer && (
        <div className="flex items-center gap-3">
          <Avatar name={dealer.name} size={38} crown />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted">Dealer this round</p>
            <p className="truncate font-display text-lg leading-tight">{iAmDealer ? 'You' : dealer.name}</p>
          </div>
          {s.variation === 'dealers_choice' && (
            <span className="rounded-full bg-panel-2 px-2.5 py-1 text-[11px] text-gold-soft">
              {dealerPicks ? 'Dealer picks the game' : 'Host picks the game'}
            </span>
          )}
        </div>
      )}

      {s.variation !== 'dealers_choice' ? (
        <div className="flex items-center justify-between rounded-xl bg-panel-2 px-3 py-2">
          <span className="text-sm">{VARIATION_LIST.find((v) => v.id === s.variation)?.name}</span>
          <RulesButton variation={s.variation} />
        </div>
      ) : mayPick ? (
        <>
          {me.isHost && !iAmDealer && dealerPicks && <p className="text-xs text-gold-soft">You're stepping in for {dealer?.name ?? 'the dealer'}.</p>}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Variation">
            {VARIATION_LIST.filter((v) => v.id !== 'dealers_choice').map((v) => (
              <div
                key={v.id}
                role="radio"
                aria-checked={variation === v.id}
                tabIndex={0}
                onClick={() => setVariation(v.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setVariation(v.id)}
                className={`flex cursor-pointer items-center justify-between gap-1 rounded-xl border px-3 py-2.5 text-left text-sm transition ${variation === v.id ? 'border-gold bg-gold/10 text-paper shadow-[0_0_14px_rgba(201,162,75,.25)]' : 'border-line bg-panel-2 text-paper/80'}`}
                data-testid={`pick-${v.id}`}
              >
                <span className="leading-tight">{v.name.replace(' Teen Patti', '')}</span>
                <RulesButton variation={v.id} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">{picked?.description}</p>
          {variation === 'joker' && (
            <label className="block"><span className="label">Joker mode</span>
              <select className="input" value={opts.jokerMode ?? 'single'} onChange={(e) => setOpts({ ...opts, jokerMode: e.target.value as never })}>
                <option value="single">Single joker rank (random)</option>
                <option value="double">Double joker ranks (random)</option>
                <option value="lowest">Lowest card in hand is joker</option>
              </select>
            </label>
          )}
          {variation === 'hilo' && (
            <label className="block"><span className="label">Winning condition</span>
              <select className="input" value={opts.hiLoMode ?? 'split'} onChange={(e) => setOpts({ ...opts, hiLoMode: e.target.value as never })}>
                <option value="split">Split: half high, half low</option>
                <option value="high">High hand wins</option>
                <option value="low">Low hand wins</option>
                <option value="alternate">Alternate high / low</option>
              </select>
            </label>
          )}
        </>
      ) : (
        <div className="rounded-xl bg-panel-2 p-3 text-center text-sm text-muted" data-testid="waiting-dealer">
          <Crown size={16} className="mx-auto mb-1 text-gold" />
          Waiting for <b className="text-paper">{dealer?.name ?? 'the dealer'}</b> to pick the game…
          {room.chooseDeadline && !slow && <> <Countdown deadline={room.chooseDeadline} /></>}
          {me.isHost && dealerPicks && (
            <button className="mt-2 block w-full text-xs text-gold underline" onClick={() => setStepIn(true)}>
              {slow ? 'Dealer is taking a while: pick for them' : 'Pick for them'}
            </button>
          )}
        </div>
      )}

      {mayPick && (
        <button className="btn btn-gold w-full" disabled={busy || !canStart} onClick={start} data-testid={startLabel ? 'next-round' : 'start-round'}>
          {startLabel ?? 'Deal the cards'}
        </button>
      )}
    </div>
  );
}
