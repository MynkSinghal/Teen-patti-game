'use client';
import { Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VARIATION_LIST } from '@/engine/variations';
import type { CommandInput } from '@/hooks/useRoom';
import type { ClientView } from '@/server/view';
import { Avatar } from './Avatar';
import { Countdown } from './Countdown';
import { RulesButton } from './RulesSheet';

const SHORT: Record<string, string> = { classic: 'Best hand wins', muflis: 'Lowest wins', ak47: 'A K 4 7 are wild', joker: 'Wild ranks', nine99: 'Closest to 999', ten20: 'Total 10 to 20', hilo: 'High + low split' };

type Opts = { jokerMode?: 'single' | 'double' | 'lowest'; jokerRanks?: number[]; hiLoMode?: 'split' | 'high' | 'low' | 'alternate' };

/** Who deals next and what game it is. The dealer picks (host can step in). Compact 4×2 grid, no scrolling. */
export function RoundStarter({ view, send, busy, canStart = true, startLabel, onStarted }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean; canStart?: boolean; startLabel?: string; onStarted?: () => void }) {
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

  const start = async () => {
    const variationOptions: Opts = {};
    if (variation === 'joker') variationOptions.jokerMode = opts.jokerMode ?? 'single';
    if (variation === 'hilo') variationOptions.hiLoMode = opts.hiLoMode ?? 'split';
    const ok = await send({ type: 'start_round', ...(s.variation === 'dealers_choice' ? { variation: variation as never, variationOptions } : {}) });
    if (ok) onStarted?.();
  };

  return (
    <div className="space-y-2.5" data-testid="round-starter">
      <div className="flex items-center gap-2.5">
        {dealer && <Avatar name={dealer.name} size={32} />}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="caps text-[9px] text-muted">Dealer this round</p>
          <p className="truncate font-display text-[15px] font-semibold text-paper">{iAmDealer ? 'You · choose the game' : dealer?.name ?? '-'}</p>
        </div>
        {s.variation === 'dealers_choice' && <span className="hidden rounded-full bg-[#1a1209] px-2.5 py-1 text-[10px] text-gold-soft ring-1 ring-line sm:inline ls:inline">{dealerPicks ? 'Dealer picks' : 'Host picks'}</span>}
      </div>

      {s.variation !== 'dealers_choice' ? (
        <div className="flex items-center justify-between rounded-lg bg-[#120c06] px-3 py-2 ring-1 ring-line">
          <span className="font-display text-sm">{VARIATION_LIST.find((v) => v.id === s.variation)?.name}</span>
          <RulesButton variation={s.variation} />
        </div>
      ) : mayPick ? (
        <>
          {me.isHost && !iAmDealer && dealerPicks && <p className="text-[11px] text-gold-soft">You're stepping in for {dealer?.name ?? 'the dealer'}.</p>}
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Variation">
            {VARIATION_LIST.filter((v) => v.id !== 'dealers_choice').map((v) => (
              <div
                key={v.id}
                role="radio"
                aria-checked={variation === v.id}
                tabIndex={0}
                onClick={() => setVariation(v.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setVariation(v.id)}
                className={`relative cursor-pointer rounded-lg px-2 py-1.5 text-left transition ${variation === v.id ? 'bg-gradient-to-b from-[#3a2a12] to-[#1c140a] shadow-[inset_0_0_0_1.5px_#f3dc95,0_0_14px_rgba(243,220,149,.2)]' : 'bg-[#120c06] shadow-[inset_0_0_0_1px_rgba(216,180,90,.3)]'}`}
                data-testid={`pick-${v.id}`}
              >
                <span className={`block font-display text-[11.5px] font-extrabold leading-tight ${variation === v.id ? 'text-gold-soft' : 'text-paper'}`}>{v.name.replace(' Teen Patti', '').replace(' (Lowest Wins)', '')}</span>
                <span className="block truncate pr-4 text-[9.5px] text-muted">{SHORT[v.id] ?? ''}</span>
                <span className="absolute right-1 top-1"><RulesButton variation={v.id} className="!h-[18px] !w-[18px]" /></span>
              </div>
            ))}
            {variation === 'joker' ? (
              <select className="input !min-h-0 !py-1 !text-[11px]" value={opts.jokerMode ?? 'single'} onChange={(e) => setOpts({ ...opts, jokerMode: e.target.value as never })} aria-label="Joker mode">
                <option value="single">1 joker rank</option>
                <option value="double">2 joker ranks</option>
                <option value="lowest">Lowest card</option>
              </select>
            ) : variation === 'hilo' ? (
              <select className="input !min-h-0 !py-1 !text-[11px]" value={opts.hiLoMode ?? 'split'} onChange={(e) => setOpts({ ...opts, hiLoMode: e.target.value as never })} aria-label="Hi-Lo mode">
                <option value="split">Split pot</option>
                <option value="high">High wins</option>
                <option value="low">Low wins</option>
                <option value="alternate">Alternate</option>
              </select>
            ) : <span />}
          </div>
        </>
      ) : (
        <div className="rounded-lg bg-[#120c06] p-3 text-center text-[12px] text-muted ring-1 ring-line" data-testid="waiting-dealer">
          <Crown size={14} className="mx-auto mb-1 text-gold" />
          Waiting for <b className="text-paper">{dealer?.name ?? 'the dealer'}</b> to pick the game…
          {room.chooseDeadline && !slow && <> <Countdown deadline={room.chooseDeadline} /></>}
          {me.isHost && dealerPicks && (
            <button className="mt-1 block w-full text-[11px] text-gold underline" onClick={() => setStepIn(true)}>{slow ? 'Dealer is taking a while: pick for them' : 'Pick for them'}</button>
          )}
        </div>
      )}

      {mayPick && (
        <button className="btn btn-gold w-full !min-h-[42px] text-[14px]" disabled={busy || !canStart} onClick={start} data-testid={startLabel ? 'next-round' : 'start-round'}>
          {startLabel ?? 'Deal the cards'}
        </button>
      )}
    </div>
  );
}
