import { NextResponse } from 'next/server';
import { getSql } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Liveness + database connectivity check. Never returns secrets or connection details. */
export async function GET() {
  try {
    const [r] = await getSql()`select count(*)::int as tables from information_schema.tables where table_schema = 'public' and table_name in ('rooms','players','games','player_hands','game_events','chat_messages')`;
    return NextResponse.json({ ok: true, db: true, tables: r?.tables }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/gi, '[url]').slice(0, 120) : 'unknown';
    return NextResponse.json({ ok: false, db: false, error: msg }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
