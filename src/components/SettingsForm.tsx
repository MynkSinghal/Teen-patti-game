'use client';
import { useState } from 'react';
import { VARIATION_LIST } from '@/engine/variations';
import { roomSettingsSchema, type RoomSettings } from '@/lib/settings';

export const DEFAULT_SETTINGS: RoomSettings = roomSettingsSchema.parse({});

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
  </label>
);

export function SettingsForm({
  value,
  onChange,
  startingChipsLocked,
}: {
  value: RoomSettings;
  onChange: (s: RoomSettings) => void;
  startingChipsLocked?: boolean;
}) {
  const [adv, setAdv] = useState(false);
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => onChange({ ...value, [k]: v });
  const num = (k: keyof RoomSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const variation = VARIATION_LIST.find((v) => v.id === value.variation);
  const vo = value.variationOptions;
  const setVO = (patch: Partial<RoomSettings['variationOptions']>) => set('variationOptions', { ...vo, ...patch });

  return (
    <div className="space-y-3" data-testid="settings-form">
      <Field label="Game variation">
        <select className="input" value={value.variation} onChange={(e) => onChange({ ...value, variation: e.target.value as RoomSettings['variation'], variationOptions: {} })} data-testid="variation-select">
          {VARIATION_LIST.map((v) => (
            <option key={v.id} value={v.id}>{v.id === 'dealers_choice' ? "Dealer's Choice (pick every round)" : v.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">{variation?.description}</p>
      </Field>
      {value.variation === 'dealers_choice' && (
        <Field label="Who picks the game each round">
          <select className="input" value={value.variationChooser} onChange={(e) => set('variationChooser', e.target.value as never)} data-testid="chooser-select">
            <option value="dealer">The dealer (rotates every round)</option>
            <option value="host">The host</option>
          </select>
        </Field>
      )}
      {variation?.options.map((o) =>
        o.type === 'select' ? (
          <Field key={o.key} label={o.label}>
            <select className="input" value={String((vo as Record<string, unknown>)[o.key] ?? o.default)} onChange={(e) => setVO({ [o.key]: e.target.value } as never)}>
              {o.choices!.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
        ) : o.type === 'ranks' ? (
          <div key={o.key}>
            <span className="label">{o.label}</span>
            <div className="flex flex-wrap gap-1">
              {o.choices!.map((c) => {
                const sel = (vo.jokerRanks ?? []).includes(Number(c.value));
                return (
                  <button
                    type="button"
                    key={c.value}
                    onClick={() => {
                      const cur = vo.jokerRanks ?? [];
                      const max = vo.jokerMode === 'double' ? 2 : 1;
                      const next = sel ? cur.filter((r) => r !== Number(c.value)) : [...cur, Number(c.value)].slice(-max);
                      setVO({ jokerRanks: next });
                    }}
                    className={`h-9 w-9 rounded-md text-sm font-semibold ${sel ? 'bg-gold text-ink' : 'bg-panel-2 border border-line'}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {o.help && <p className="mt-1 text-xs text-muted">{o.help}</p>}
          </div>
        ) : null,
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Boot amount">
          <input className="input" type="number" inputMode="numeric" min={1} value={value.boot} onChange={num('boot')} data-testid="boot" />
        </Field>
        <Field label="Starting chips">
          <input className="input" type="number" inputMode="numeric" min={100} value={value.startingChips} onChange={num('startingChips')} disabled={startingChipsLocked} data-testid="chips" />
        </Field>
        <Field label="Max players (3–8)">
          <input className="input" type="number" inputMode="numeric" min={3} max={8} value={value.maxPlayers} onChange={num('maxPlayers')} />
        </Field>
        <Field label="Turn seconds">
          <input className="input" type="number" inputMode="numeric" min={10} max={180} value={value.turnSeconds} onChange={num('turnSeconds')} data-testid="turn-seconds" />
        </Field>
      </div>
      <button type="button" className="text-sm text-gold underline underline-offset-2" onClick={() => setAdv(!adv)}>
        {adv ? 'Hide' : 'Show'} betting & house rules
      </button>
      {adv && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max stake (× boot)">
              <input className="input" type="number" min={1} value={value.maxStakeMultiple} onChange={num('maxStakeMultiple')} />
            </Field>
            <Field label="Max sideshows / round">
              <input className="input" type="number" min={0} max={20} value={value.maxSideshowRequests} onChange={num('maxSideshowRequests')} />
            </Field>
            <Field label="Blind chaal × stake">
              <input className="input" type="number" step="0.5" min={0.5} value={value.blindMultiplier} onChange={num('blindMultiplier')} />
            </Field>
            <Field label="Seen chaal × stake">
              <input className="input" type="number" step="0.5" min={1} value={value.seenMultiplier} onChange={num('seenMultiplier')} />
            </Field>
          </div>
          <Field label="Show allowed for">
            <select className="input" value={value.showEligibility} onChange={(e) => set('showEligibility', e.target.value as never)}>
              <option value="any">Blind or seen players</option>
              <option value="seen_only">Seen players only</option>
            </select>
          </Field>
          <Field label="Show costs">
            <select className="input" value={value.showCost} onChange={(e) => set('showCost', e.target.value as never)}>
              <option value="chaal">One chaal</option>
              <option value="free">Free</option>
            </select>
          </Field>
          <Field label="Tie on show / sideshow">
            <select className="input" value={value.tieHandling} onChange={(e) => set('tieHandling', e.target.value as never)}>
              <option value="challenger_loses">Challenger loses</option>
              <option value="split">Split the pot / nobody folds</option>
            </select>
          </Field>
          <Field label="A-2-3 sequence">
            <select className="input" value={value.aceLowSequence} onChange={(e) => set('aceLowSequence', e.target.value as never)}>
              <option value="second">Valid, ranks just below A-K-Q</option>
              <option value="lowest">Valid, lowest sequence</option>
              <option value="none">Not a sequence</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.sideshowEnabled} onChange={(e) => set('sideshowEnabled', e.target.checked)} /> Allow sideshow
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.sideshowWhenTwoLeft} onChange={(e) => set('sideshowWhenTwoLeft', e.target.checked)} /> Allow sideshow with two players left
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.autoNextRound} onChange={(e) => set('autoNextRound', e.target.checked)} /> Start next round automatically ({value.nextRoundDelaySeconds}s)
          </label>
        </div>
      )}
    </div>
  );
}
