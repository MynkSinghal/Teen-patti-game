'use client';
import { useCallback, useEffect, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { ensureToken, supabase } from '@/lib/supabase-browser';
import type { Command } from '@/lib/settings';
import { useRoomStore } from '@/store/room';
import type { ClientView } from '@/server/view';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CommandInput = DistributiveOmit<Command, 'idempotencyKey' | 'gameVersion'>;

const uuid = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-xxxxxxxx`);

export function useRoom(code: string) {
  const s = useRoomStore;
  const fetchingRef = useRef(false);
  const queuedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) {
      queuedRef.current = true;
      return;
    }
    fetchingRef.current = true;
    try {
      const v = await api.state(code);
      s.getState().applyView(v);
      s.getState().set({ conn: s.getState().conn === 'offline' ? 'online' : s.getState().conn });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'FORBIDDEN') s.getState().set({ phase: 'needs_join' });
      else if (err.code === 'NOT_FOUND') s.getState().set({ phase: 'not_found', error: err.message });
      else if (err.code === 'ROOM_CLOSED' || err.code === 'ROOM_EXPIRED') s.getState().set({ phase: 'closed', error: err.message });
      else if (err.code === 'NETWORK') s.getState().set({ conn: 'offline' });
      else if (!s.getState().view) s.getState().set({ phase: 'error', error: err.message });
    } finally {
      fetchingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void refresh();
      }
    }
  }, [code, s]);

  // Boot: sign in, load state.
  useEffect(() => {
    s.getState().reset();
    let cancelled = false;
    (async () => {
      try {
        await ensureToken();
        if (!cancelled) await refresh();
      } catch {
        if (!cancelled) s.getState().set({ phase: 'error', error: "Couldn't sign you in. Check your connection and retry." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, refresh, s]);

  const phase = useRoomStore((x) => x.phase);

  // Realtime subscription (private broadcast channel) once we are a member.
  const channelRef = useRef<ReturnType<ReturnType<typeof supabase>['channel']> | null>(null);
  const subscribe = useCallback(async () => {
    const sb = supabase();
    if (channelRef.current) {
      await sb.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const token = await ensureToken();
    await sb.realtime.setAuth(token);
    const ch = sb
      .channel(`room:${code}`, { config: { private: true } })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        const p = payload as { v: number; state: ClientView['room'] };
        const cur = s.getState().view;
        if (!cur || p.v <= cur.room.v) return;
        s.getState().applyPublic(p.state);
        void refresh(); // fetch our private part (cards, legal actions)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          s.getState().set({ conn: 'online' });
          void refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          s.getState().set({ conn: 'reconnecting' });
        }
      });
    channelRef.current = ch;
  }, [code, refresh, s]);

  useEffect(() => {
    if (phase !== 'ready') return;
    void subscribe();
    return () => {
      if (channelRef.current) void supabase().removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [phase, subscribe]);

  // Heartbeat + visibility/online recovery + fallback polling while the realtime link is down.
  useEffect(() => {
    if (phase !== 'ready') return;
    const beat = () => api.heartbeat(code).catch(() => undefined);
    void beat();
    const hb = setInterval(beat, 15000);
    const poll = setInterval(() => {
      if (s.getState().conn !== 'online') void refresh();
    }, 5000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void beat();
        void refresh();
      }
    };
    const onOnline = () => {
      void subscribe();
      void refresh();
    };
    const onOffline = () => s.getState().set({ conn: 'offline' });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(hb);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [phase, code, refresh, subscribe, s]);

  // Server-side timeout processing: when a deadline passes, ask the server to enforce it.
  const view = useRoomStore((x) => x.view);
  const deadline =
    view?.room.game && view.room.game.phase !== 'ended'
      ? view.room.game.turnDeadline
      : view?.room.nextRoundAt ?? null;
  useEffect(() => {
    if (!deadline || phase !== 'ready') return;
    const wait = Math.max(0, deadline - (Date.now() + s.getState().skew)) + 700;
    const t = setTimeout(async () => {
      try {
        s.getState().applyView(await api.tick(code));
      } catch {
        /* next tick or broadcast will retry */
      }
    }, wait);
    return () => clearTimeout(t);
  }, [deadline, phase, code, s]);

  const join = useCallback(
    async (name: string) => {
      try {
        s.getState().set({ busy: true });
        await api.join(code, name);
        localStorage.setItem('tp_name', name);
        s.getState().set({ phase: 'loading' });
        await refresh();
      } catch (e) {
        const err = e as ApiError;
        if (err.code === 'NOT_FOUND') s.getState().set({ phase: 'not_found', error: err.message });
        else if (err.code === 'ROOM_CLOSED' || err.code === 'ROOM_EXPIRED') s.getState().set({ phase: 'closed', error: err.message });
        else {
          s.getState().notify(err.message);
          s.getState().set({ phase: 'needs_join' });
        }
      } finally {
        s.getState().set({ busy: false });
      }
    },
    [code, refresh, s],
  );

  const send = useCallback(
    async (cmd: CommandInput): Promise<boolean> => {
      if (s.getState().busy) return false;
      s.getState().set({ busy: true });
      try {
        const gv = s.getState().view?.room.game?.version;
        const full = { ...cmd, idempotencyKey: uuid() } as Record<string, unknown>;
        if (['bet', 'pack', 'show', 'sideshow_request', 'sideshow_respond'].includes(cmd.type) && gv !== undefined) full.gameVersion = gv;
        const v = await api.command(code, full as Command);
        s.getState().applyView(v);
        return true;
      } catch (e) {
        const err = e as ApiError;
        s.getState().notify(err.message);
        if (err.code === 'STALE_STATE' || err.code === 'NETWORK' || err.status >= 500) void refresh();
        if (err.code === 'ROOM_CLOSED') s.getState().set({ phase: 'closed', error: err.message });
        return false;
      } finally {
        s.getState().set({ busy: false });
      }
    },
    [code, refresh, s],
  );

  const retry = useCallback(() => {
    s.getState().set({ conn: 'reconnecting' });
    void subscribe();
    void refresh();
  }, [subscribe, refresh, s]);

  return { join, send, retry, refresh };
}
