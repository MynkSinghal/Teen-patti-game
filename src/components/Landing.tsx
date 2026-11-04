'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { roomCodeSchema, type RoomSettings } from '@/lib/settings';
import { DEFAULT_SETTINGS, SettingsForm } from './SettingsForm';

export function Landing() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [roomName, setRoomName] = useState('');
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <div className="mb-8 text-center">
        <p className="text-4xl">♠ ♥ ♦ ♣</p>
        <h1 className="mt-2 font-display text-4xl text-gold">Private Teen Patti</h1>
        <p className="mt-1 text-sm text-muted">A table for you and your friends. Virtual chips only.</p>
      </div>

      <label className="block">
        <span className="label">Your name</span>
        <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohan" data-testid="name-input" />
      </label>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-panel p-1">
        {(['join', 'create'] as const).map((m) => (
          <button key={m} className={`btn !min-h-10 ${mode === m ? 'btn-gold' : 'text-muted'}`} onClick={() => { setMode(m); setErr(null); }} data-testid={`tab-${m}`}>
            {m === 'join' ? 'Join a room' : 'Create a room'}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {mode === 'join' ? (
          <>
            <label className="block">
              <span className="label">Room code</span>
              <input className="input text-center font-display text-2xl uppercase tracking-[0.3em]" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" autoCapitalize="characters" data-testid="code-input" />
            </label>
            <button className="btn btn-gold w-full" disabled={busy || !name.trim() || code.length < 6} onClick={join} data-testid="join-submit">{busy ? 'Joining…' : 'Join table'}</button>
          </>
        ) : (
          <>
            <label className="block">
              <span className="label">Room name (optional)</span>
              <input className="input" value={roomName} maxLength={40} onChange={(e) => setRoomName(e.target.value)} placeholder="Friday night" />
            </label>
            <SettingsForm value={settings} onChange={setSettings} />
            <button className="btn btn-gold w-full" disabled={busy || !name.trim()} onClick={create} data-testid="create-submit">{busy ? 'Creating…' : 'Create room'}</button>
          </>
        )}
        {err && <p role="alert" className="rounded-lg bg-[#3a1b18] px-3 py-2 text-sm text-[#f3b9b2]" data-testid="landing-error">{err}</p>}
      </div>

      <footer className="mt-auto flex justify-center gap-4 pt-10 text-xs text-muted">
        <Link href="/rules" className="underline">Rules</Link>
        <Link href="/privacy" className="underline">Privacy</Link>
      </footer>
    </main>
  );
}
