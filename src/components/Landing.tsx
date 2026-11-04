'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { VARIATION_LIST } from '@/engine/variations';
import { api, ApiError } from '@/lib/api';
import { roomCodeSchema, type RoomSettings } from '@/lib/settings';
import { DEFAULT_SETTINGS, SettingsForm } from './SettingsForm';
import { Sheet } from './Sheet';

export function Landing() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [roomName, setRoomName] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setName(localStorage.getItem('tp_name') ?? ''), []);
  const fail = (e: unknown) => setErr(e instanceof ApiError ? e.message : (e as Error).message);

  async function create() {
    setBusy(true); setErr(null);
    try {
      localStorage.setItem('tp_name', name);
      const r = await api.createRoom(name, settings, roomName || undefined);
      router.push(`/room/${r.code}`);
    } catch (e) { fail(e); setBusy(false); }
  }
  async function join() {
    setErr(null);
    const parsed = roomCodeSchema.safeParse(code);
    if (!parsed.success) return setErr('Room codes are 6 letters/numbers.');
    setBusy(true);
    try {
      localStorage.setItem('tp_name', name);
      await api.join(parsed.data, name);
      router.push(`/room/${parsed.data}`);
    } catch (e) { fail(e); setBusy(false); }
  }
  const variation = VARIATION_LIST.find((v) => v.id === settings.variation);

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-5 py-8 ls:max-w-4xl ls:grid-cols-[1fr_1fr] ls:items-center ls:gap-10 ls:py-4">
      <div className="text-center ls:text-left">
        <p className="text-3xl tracking-[0.3em] text-gold/80">♠ ♥ ♦ ♣</p>
        <h1 className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-[0.18em] text-gold" style={{ textShadow: '0 2px 0 #000' }}>TEEN PATTI</h1>
        <p className="caps mt-2 text-[10px] text-muted">A private table for friends · virtual chips only</p>
        <div className="mt-4 hidden gap-4 text-[11px] text-muted ls:flex">
          <Link href="/rules" className="underline">How to play</Link>
          <Link href="/privacy" className="underline">Privacy</Link>
        </div>
      </div>

      <div className="mh-panel-strong space-y-3 p-5">
        <label className="block">
          <span className="label">Your name</span>
          <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohan" data-testid="name-input" />
        </label>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#0c0804] p-1 ring-1 ring-line">
          {(['join', 'create'] as const).map((m) => (
            <button key={m} className={`btn !min-h-[36px] text-[12px] ${mode === m ? 'btn-gold' : 'text-muted'}`} onClick={() => { setMode(m); setErr(null); }} data-testid={`tab-${m}`}>
              {m === 'join' ? 'Join a room' : 'Create a room'}
            </button>
          ))}
        </div>
        {mode === 'join' ? (
          <>
            <label className="block">
              <span className="label">Room code</span>
              <input className="input text-center font-display !text-2xl uppercase tracking-[0.35em]" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" autoCapitalize="characters" data-testid="code-input" />
            </label>
            <button className="btn btn-gold w-full" disabled={busy || !name.trim() || code.length < 6} onClick={join} data-testid="join-submit">{busy ? 'Joining…' : 'Take a seat'}</button>
          </>
        ) : (
          <>
            <label className="block">
              <span className="label">Room name (optional)</span>
              <input className="input" value={roomName} maxLength={40} onChange={(e) => setRoomName(e.target.value)} placeholder="Friday night" />
            </label>
            <div className="flex items-center gap-2 rounded-lg bg-[#120c06] px-3 py-2 text-[11.5px] text-[#cdb87a] ring-1 ring-line">
              <span className="min-w-0 flex-1 truncate">{variation?.id === 'dealers_choice' ? "Dealer's choice" : variation?.name} · Boot {settings.boot} · {settings.startingChips.toLocaleString()} chips · {settings.turnSeconds}s</span>
              <button className="inline-flex items-center gap-1 text-gold underline" onClick={() => setRulesOpen(true)} data-testid="change-rules"><Settings2 size={13} /> Rules</button>
            </div>
            <button className="btn btn-gold w-full" disabled={busy || !name.trim()} onClick={create} data-testid="create-submit">{busy ? 'Creating…' : 'Open the table'}</button>
          </>
        )}
        {err && <p role="alert" className="rounded-lg bg-[#3a1b18] px-3 py-2 text-sm text-[#f3b9b2]" data-testid="landing-error">{err}</p>}
        <div className="flex justify-center gap-4 pt-1 text-[11px] text-muted ls:hidden">
          <Link href="/rules" className="underline">How to play</Link>
          <Link href="/privacy" className="underline">Privacy</Link>
        </div>
      </div>
      <Sheet open={rulesOpen} onClose={() => setRulesOpen(false)} title="Table rules">
        <SettingsForm value={settings} onChange={setSettings} />
        <button className="btn btn-gold mt-4 w-full" onClick={() => setRulesOpen(false)}>Done</button>
      </Sheet>
    </main>
  );
}
