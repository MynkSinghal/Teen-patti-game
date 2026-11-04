'use client';
/**
 * Tiny synthesized sound kit (Web Audio). No audio files, no network, works offline.
 * Browsers only allow audio after a user gesture, so call unlockAudio() from a tap handler.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.7;

export type Sfx =
  | 'deal' | 'flip' | 'chip' | 'raise' | 'turn' | 'tick' | 'pack' | 'sideshow' | 'show'
  | 'win' | 'lose' | 'chat' | 'error' | 'click';

export function loadSoundPrefs() {
  try {
    muted = localStorage.getItem('tp_muted') === '1';
    const v = Number(localStorage.getItem('tp_volume'));
    if (!Number.isNaN(v) && localStorage.getItem('tp_volume') !== null) volume = Math.min(1, Math.max(0, v));
  } catch { /* storage unavailable */ }
  return { muted, volume };
}
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('tp_muted', m ? '1' : '0'); } catch { /* ignore */ }
}
export function setVolume(v: number) {
  volume = v;
  if (master) master.gain.value = v;
  try { localStorage.setItem('tp_volume', String(v)); } catch { /* ignore */ }
}

export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

interface Tone { f: number; t?: number; d?: number; type?: OscillatorType; g?: number; to?: number }
function tone({ f, t = 0, d = 0.15, type = 'sine', g = 0.2, to }: Tone) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const gain = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(gain).connect(master);
  o.start(t0);
  o.stop(t0 + d + 0.02);
}
function noise({ t = 0, d = 0.08, g = 0.15, f = 2500, q = 0.8, type = 'bandpass' as BiquadFilterType }) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + t;
  const len = Math.max(1, Math.floor(ctx.sampleRate * d));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = f;
  filt.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(g, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  src.connect(filt).connect(gain).connect(master);
  src.start(t0);
}

const SFX: Record<Sfx, () => void> = {
  click: () => tone({ f: 620, d: 0.04, type: 'triangle', g: 0.08 }),
  deal: () => { for (let i = 0; i < 3; i++) noise({ t: i * 0.11, d: 0.07, f: 3200, g: 0.12 }); },
  flip: () => { noise({ d: 0.09, f: 4200, g: 0.14 }); tone({ f: 330, t: 0.05, d: 0.06, type: 'triangle', g: 0.07 }); },
  chip: () => {
    tone({ f: 2400, d: 0.05, type: 'square', g: 0.05 });
    tone({ f: 1800, t: 0.045, d: 0.06, type: 'square', g: 0.05 });
    noise({ d: 0.05, f: 6000, g: 0.07, type: 'highpass' });
  },
  raise: () => {
    SFX.chip();
    tone({ f: 392, t: 0.08, d: 0.12, type: 'triangle', g: 0.12 });
    tone({ f: 587, t: 0.16, d: 0.18, type: 'triangle', g: 0.12 });
  },
  turn: () => { tone({ f: 660, d: 0.14, type: 'sine', g: 0.16 }); tone({ f: 990, t: 0.12, d: 0.2, type: 'sine', g: 0.16 }); },
  tick: () => tone({ f: 1100, d: 0.03, type: 'square', g: 0.05 }),
  pack: () => { tone({ f: 260, d: 0.22, type: 'sawtooth', g: 0.07, to: 120 }); noise({ d: 0.12, f: 900, g: 0.06 }); },
  sideshow: () => { tone({ f: 300, d: 0.35, type: 'triangle', g: 0.12, to: 600 }); tone({ f: 450, t: 0.1, d: 0.3, type: 'triangle', g: 0.08, to: 900 }); },
  show: () => { tone({ f: 196, d: 0.4, type: 'sawtooth', g: 0.1 }); tone({ f: 294, d: 0.4, type: 'sawtooth', g: 0.08 }); noise({ d: 0.3, f: 1200, g: 0.08 }); },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * 0.11, d: 0.35, type: 'triangle', g: 0.16 }));
    [1568, 2093].forEach((f, i) => tone({ f, t: 0.45 + i * 0.1, d: 0.5, type: 'sine', g: 0.06 }));
  },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone({ f, t: i * 0.14, d: 0.3, type: 'sine', g: 0.1 })); },
  chat: () => { tone({ f: 880, d: 0.09, type: 'sine', g: 0.1 }); tone({ f: 1320, t: 0.07, d: 0.1, type: 'sine', g: 0.08 }); },
  error: () => tone({ f: 160, d: 0.18, type: 'square', g: 0.06 }),
};

export function play(name: Sfx) {
  if (muted || !ctx || !master) return;
  try { SFX[name](); } catch { /* audio is best-effort */ }
}

export function haptic(pattern: number | number[]) {
  if (muted) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
