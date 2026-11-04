import { readFileSync } from 'node:fs';
import postgres from 'postgres';

export const TEST_DB_URL = process.env.TEST_DB_URL ?? 'postgres://postgres:postgres@localhost:5432/tp_test';

export async function freshDb() {
  const sql = postgres(TEST_DB_URL, { prepare: false, max: 10, onnotice: () => {} });
  await sql.unsafe(`
    drop schema if exists public cascade; create schema public;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
  `);
  await sql.unsafe(readFileSync('supabase/migrations/0001_core_schema.sql', 'utf8'));
  await sql.unsafe(readFileSync('supabase/migrations/0003_chat.sql', 'utf8'));
  await sql.unsafe(readFileSync('supabase/migrations/0005_buyins.sql', 'utf8'));
  return sql;
}

export async function dbAvailable() {
  try {
    const s = postgres(TEST_DB_URL, { max: 1, connect_timeout: 2, onnotice: () => {} });
    await s`select 1`;
    await s.end();
    return true;
  } catch {
    return false;
  }
}
