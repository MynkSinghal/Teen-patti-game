import { createClient } from '@supabase/supabase-js';
import { AppError } from './errors';

let anon: ReturnType<typeof createClient> | null = null;

/** Verifies the Supabase access token sent by the browser and returns the auth user id. */
export async function requireUserId(req: Request): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new AppError('UNAUTHENTICATED', 'Please reload the page to sign in again.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new AppError('INTERNAL', 'Server is not configured.');
  anon ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) throw new AppError('UNAUTHENTICATED', 'Your session expired. Reload the page.');
  return data.user.id;
}
