'use client';

const EMOJI = ['🦁', '🐯', '🦊', '🐺', '🦅', '🐉', '🦂', '🐍', '🦈', '🐻', '🦉', '🐙', '🦄', '🐲', '🔥', '👑', '🐆', '🦍', '🐘', '🦖'];
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic avatar (emoji + hue) from a name, with an optional countdown ring. */
export function Avatar({ name, size = 44, progress, danger, crown }: { name: string; size?: number; progress?: number | null; danger?: boolean; crown?: boolean }) {
  const h = hash(name);
  const hue = h % 360;
  const r = size / 2 + 3;
  const c = 2 * Math.PI * r;
  const box = size + 8;
  return (
    <div className="relative grid place-items-center" style={{ width: box, height: box }}>
      {progress !== undefined && progress !== null && (
        <svg width={box} height={box} className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3" />
          <circle
            cx={box / 2}
            cy={box / 2}
            r={r}
            fill="none"
            stroke={danger ? '#e0584b' : '#c9a24b'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
            style={{ transition: 'stroke-dashoffset .3s linear, stroke .3s' }}
          />
        </svg>
      )}
      <div
        className="grid place-items-center rounded-full text-[0px] shadow-inner"
        style={{ width: size, height: size, background: `radial-gradient(circle at 30% 25%, hsl(${hue} 55% 38%), hsl(${(hue + 40) % 360} 60% 16%))`, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.12)' }}
        aria-hidden
      >
        <span style={{ fontSize: size * 0.52, lineHeight: 1 }}>{EMOJI[h % EMOJI.length]}</span>
      </div>
      {crown && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[13px] drop-shadow">👑</span>}
    </div>
  );
}
