# Deployment (Vercel Hobby + Supabase Free + GitHub)

Free tiers are rate/usage limited and have no uptime guarantee; a Supabase free project pauses after a week of inactivity.

## 1. Supabase project
1. Create a project at supabase.com (free plan). Note the **Project URL**, the **anon / publishable key**, and set a **database password**.
2. Authentication → Sign In / Providers → enable **Anonymous Sign-Ins**.
3. Apply the migrations in `supabase/migrations/` in order (SQL editor or `supabase db push`):
   * `0001_core_schema.sql` – tables, constraints, RLS (enabled, **no client policies**: tables are server-only).
   * `0003_chat.sql` + `0004_chat_realtime.sql` – in-room chat table and its broadcast trigger.
   * `0002_realtime.sql` – private Realtime Broadcast: membership-checked `realtime.messages` policy and the trigger that broadcasts the public room state.
4. Realtime → Settings: leave **“Allow public access”** off (channels are private).
5. Dashboard → Connect → **Transaction pooler** string (port 6543) → this is `SUPABASE_DB_URL`.

## 2. Environment variables
| Name | Where | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon / publishable key |
| `SUPABASE_DB_URL` | **server only** | transaction pooler URL with the DB password |
`SUPABASE_SERVICE_ROLE_KEY` is not required. Never commit real values (`.env*` is git-ignored).

## 3. GitHub → Vercel
Push to GitHub, “Add New Project” in Vercel, import the repo (framework: Next.js, defaults), add the three variables for Production (and Preview), deploy.

## 4. Test the deployed game
Open the URL on two or three phones (or a normal + a private window each), create a room, join via code/link, ready up, start, play a round.
Check: refresh keeps your seat; only you see your cards; “Reconnecting…” appears if you toggle airplane mode and clears on return.

## Local development
`cp .env.example .env.local`, fill values, `npm i`, `npm run dev`.
Tests: `npm test` (engine + security + service tests; service tests need a local Postgres at `TEST_DB_URL`, default
`postgres://postgres:postgres@localhost:5432/tp_test`, and are skipped otherwise). Browser tests: `npm run build && npm run test:e2e`
(starts a local mock of Supabase Auth, so no cloud project is needed; set `PW_CHROMIUM` to a Chromium binary if Playwright's own isn't installed).
