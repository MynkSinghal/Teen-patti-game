'use client';
import { create } from 'zustand';
import { loadSoundPrefs, setMuted as persistMuted, setVolume as persistVolume } from '@/lib/sound';
import type { ChatMessage } from '@/server/service';

export type Theme = 'classic' | 'midnight' | 'burgundy' | 'noir';
export type Sheet = null | 'menu' | 'rules' | 'feed' | 'pot' | 'chat' | 'leave' | 'joker';

interface UIStore {
  muted: boolean;
  volume: number;
  theme: Theme;
  sheet: Sheet;
  rulesFor: string | null;
  jokerIndex: number | null;
  messages: ChatMessage[];
  unread: number;
  banner: ChatMessage | null;
  myPlayerId: string | null;
  /** The table is currently drawn rotated into landscape (phone held in portrait). */
  forced: boolean;
  setForced: (f: boolean) => void;
  init: () => void;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  setTheme: (t: Theme) => void;
  open: (s: Sheet, rulesFor?: string | null) => void;
  openJoker: (index: number) => void;
  close: () => void;
  setMe: (id: string | null) => void;
  mergeMessages: (m: ChatMessage[]) => void;
  addMessage: (m: ChatMessage) => void;
  clearBanner: () => void;
  resetChat: () => void;
}

const THEMES: Theme[] = ['classic', 'midnight', 'burgundy', 'noir'];

export const useUI = create<UIStore>((set, get) => ({
  muted: false,
  volume: 0.7,
  theme: 'classic',
  sheet: null,
  rulesFor: null,
  jokerIndex: null,
  messages: [],
  unread: 0,
  banner: null,
  myPlayerId: null,
  forced: false,
  setForced: (forced) => set({ forced }),
  init: () => {
    const { muted, volume } = loadSoundPrefs();
    let theme: Theme = 'classic';
    try {
      const t = localStorage.getItem('tp_theme') as Theme | null;
      if (t && THEMES.includes(t)) theme = t;
    } catch { /* ignore */ }
    document.documentElement.dataset.theme = theme;
    set({ muted, volume, theme });
  },
  setMuted: (muted) => { persistMuted(muted); set({ muted }); },
  setVolume: (volume) => { persistVolume(volume); set({ volume }); },
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('tp_theme', theme); } catch { /* ignore */ }
    set({ theme });
  },
  open: (sheet, rulesFor = null) => set({ sheet, rulesFor, ...(sheet === 'chat' ? { unread: 0, banner: null } : {}) }),
  openJoker: (jokerIndex) => set({ sheet: 'joker', jokerIndex }),
  close: () => set({ sheet: null, rulesFor: null, jokerIndex: null }),
  setMe: (myPlayerId) => set({ myPlayerId }),
  mergeMessages: (incoming) => {
    const byId = new Map(get().messages.map((m) => [m.id, m]));
    for (const m of incoming) byId.set(m.id, m);
    set({ messages: [...byId.values()].sort((a, b) => a.id - b.id).slice(-100) });
  },
  addMessage: (m) => {
    const { messages, sheet, myPlayerId } = get();
    if (messages.some((x) => x.id === m.id)) return;
    const mine = m.pid !== null && m.pid === myPlayerId;
    set({
      messages: [...messages, m].slice(-100),
      ...(mine || sheet === 'chat' ? {} : { unread: get().unread + 1, banner: m }),
    });
  },
  clearBanner: () => set({ banner: null }),
  resetChat: () => set({ messages: [], unread: 0, banner: null, sheet: null }),
}));
