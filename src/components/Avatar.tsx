'use client';

const EMOJI = ['🦁', '🐯', '🦊', '🐺', '🦅', '🐉', '🦂', '🐍', '🦈', '🐻', '🦉', '🐙', '🦄', '🐲', '🔥', '👑', '🐆', '🦍', '🐘', '🦖'];
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic avatar (emoji) in a gold medallion, with an optional countdown ring. */
export function Avatar({ name, size = 44, progress, danger, crown }: { name: string; size?: number; progress?: number | null; danger?: boolean; crown?: boolean }) {
  const h = hash(name);
  const r = size / 2 + 5;
  const c = 2 * Math.PI * r;
  const box = size + 14;
  return (
    <div className="relative grid place-items-center" style={{ width: box, height: box }}>
      {progress !== undefined && progress !== null && (
        <svg width={box} height={box} className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="3" />
          <circle
            cx={box / 2}
            cy={box / 2}
            r={r}
            fill="none"
            stroke={danger ? '#e0584b' : '#f3dc95'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
            style={{ transition: 'stroke-dashoffset .3s linear, stroke .3s', filter: 'drop-shadow(0 0 4px rgba(243,220,149,.6))' }}
          />
        </svg>
      )}
      <div className="medallion grid place-items-center" style={{ width: size, height: size }} aria-hidden>
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{EMOJI[h % EMOJI.length]}</span>
      </div>
      {crown && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[14px] drop-shadow">👑</span>}
    </div>
  );
}
