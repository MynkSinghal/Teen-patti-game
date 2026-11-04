'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tp-auth' },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

/** Returns a valid access token, signing in anonymously once; the session persists across refreshes. */
export async function ensureToken(): Promise<string> {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error || !anon.session) throw new Error(error?.message ?? 'Could not sign in');
  return anon.session.access_token;
}
