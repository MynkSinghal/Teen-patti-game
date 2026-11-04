'use client';
import type { Command } from '@/lib/settings';
import type { ClientView } from '@/server/view';
import { ensureToken } from './supabase-browser';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const token = await ensureToken();
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('NETWORK', "Can't reach the server. Check your connection and retry.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? 'INTERNAL', body?.error?.message ?? 'Something went wrong.', res.status);
  }
  return body as T;
}

export const api = {
  createRoom: (displayName: string, settings: unknown, roomName?: string) =>
    call<{ code: string; playerId: string }>('/api/rooms', { method: 'POST', body: JSON.stringify({ displayName, settings, roomName }) }),
  join: (code: string, displayName: string) =>
    call<{ code: string; playerId: string }>(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify({ displayName }) }),
  state: (code: string) => call<ClientView>(`/api/rooms/${code}/state`),
  command: (code: string, cmd: Command) => call<ClientView>(`/api/rooms/${code}/command`, { method: 'POST', body: JSON.stringify(cmd) }),
  tick: (code: string) => call<ClientView>(`/api/rooms/${code}/tick`, { method: 'POST' }),
  heartbeat: (code: string) => call<{ ok: true }>(`/api/rooms/${code}/heartbeat`, { method: 'POST' }),
};
