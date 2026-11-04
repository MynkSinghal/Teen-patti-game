'use client';
import { HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { parseHand } from '@/engine/cards';
import { RANKING_EXAMPLES, VARIATION_DOCS, VARIATION_LIST } from '@/engine/variations';
import { useUI } from '@/store/ui';
import { PlayingCard } from './PlayingCard';
import { Sheet } from './Sheet';

export function RulesButton({ variation, className = '' }: { variation: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Show rules for this variation"
      title="How does this work?"
      onClick={(e) => { e.stopPropagation(); useUI.getState().open('rules', variation); }}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold/50 text-gold hover:bg-gold/10 ${className}`}
      data-testid="rules-btn"
    >
      <HelpCircle size={14} />
    </button>
  );
}

function Hand({ hand, size = 'sm' }: { hand: string; size?: 'xs' | 'sm' }) {
  return <div className="flex gap-0.5">{parseHand(hand).map((c, i) => <PlayingCard key={i} card={c} size={size} />)}</div>;
}

export function RulesSheet() {
  const sheet = useUI((s) => s.sheet);
  const rulesFor = useUI((s) => s.rulesFor);
  const close = useUI((s) => s.close);
  const [override, setOverride] = useState<string | null>(null);
  const id = override ?? rulesFor ?? 'classic';
  const doc = VARIATION_DOCS[id] ?? VARIATION_DOCS.classic!;
  const meta = VARIATION_LIST.find((v) => v.id === id);
  const list = VARIATION_LIST.filter((v) => v.id !== 'dealers_choice');
  return (
    <Sheet open={sheet === 'rules'} onClose={() => { setOverride(null); close(); }} title="Game rules" testId="rules-sheet">
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {[...list, VARIATION_LIST.find((v) => v.id === 'dealers_choice')!].map((v) => (
          <button key={v.id} onClick={() => setOverride(v.id)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${v.id === id ? 'border-gold bg-gold text-ink' : 'border-line text-muted'}`}>
            {v.name.replace(' Teen Patti', '')}
          </button>
        ))}
      </div>
      <h3 className="font-display text-2xl text-paper">{meta?.name}</h3>
      <p className="text-sm text-gold-soft">{doc.tagline}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-paper/90">
        {doc.rules.map((r) => <li key={r} className="flex gap-2"><span className="text-gold">♠</span><span>{r}</span></li>)}
      </ul>
      {doc.examples.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="label">Examples</p>
          {doc.examples.map((ex, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel-2 p-3">
              <div className="flex flex-wrap items-center gap-3">
                {ex.hands.map((h, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Hand hand={h} />
                    {j < ex.hands.length - 1 && <span className="text-xs text-muted">vs</span>}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-paper/80">{ex.note}</p>
            </div>
          ))}
        </div>
      )}
      {id !== 'dealers_choice' && (
        <div className="mt-5">
          <p className="label">Classic ranking, best to worst</p>
          <ol className="space-y-1.5">
            {RANKING_EXAMPLES.map((r, i) => (
              <li key={r.name} className="flex items-center gap-3">
                <span className="w-4 text-xs text-muted">{i + 1}</span>
                <Hand hand={r.hand} />
                <span className="text-sm">{r.name}</span>
              </li>
            ))}
          </ol>
          {id === 'muflis' && <p className="mt-1 text-xs text-muted">In Muflis this order is flipped: the last one wins.</p>}
        </div>
      )}
    </Sheet>
  );
}
