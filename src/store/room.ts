'use client';
import { create } from 'zustand';
import type { ClientView } from '@/server/view';

export type Phase = 'loading' | 'needs_join' | 'ready' | 'not_found' | 'closed' | 'error';
export type Conn = 'online' | 'reconnecting' | 'offline';

interface RoomStore {
  phase: Phase;
  error: string | null;
  view: ClientView | null;
  /** serverTime - Date.now() at last fetch; informational countdown only. */
  skew: number;
  conn: Conn;
  busy: boolean;
  toast: { id: number; text: string; kind: 'error' | 'info' } | null;
  set: (p: Partial<RoomStore>) => void;
  applyView: (v: ClientView) => void;
  applyPublic: (room: ClientView['room']) => void;
  notify: (text: string, kind?: 'error' | 'info') => void;
  reset: () => void;
}

let toastId = 0;

export const useRoomStore = create<RoomStore>((set, get) => ({
  phase: 'loading',
  error: null,
  view: null,
  skew: 0,
  conn: 'online',
  busy: false,
  toast: null,
  set: (p) => set(p),
  applyView: (v) => {
    const cur = get().view;
    // Never move backwards in time (a slower response must not overwrite a newer broadcast).
    if (cur && v.room.v < cur.room.v) return;
    set({ view: v, skew: v.serverTime - Date.now(), phase: 'ready' });
  },
  applyPublic: (room) => {
    const cur = get().view;
    if (!cur || room.v <= cur.room.v) return;
    // Keep private part until the fresh private view arrives.
    set({ view: { ...cur, room } });
  },
  notify: (text, kind = 'error') => set({ toast: { id: ++toastId, text, kind } }),
  reset: () => set({ phase: 'loading', error: null, view: null, conn: 'online', busy: false, toast: null }),
}));
