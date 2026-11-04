# Private Teen Patti

A private, mobile-first, real-time Teen Patti table for friends. Virtual chips only – no real money.

* Next.js (App Router) + TypeScript + Tailwind, Motion animations, Zustand (presentation state only), Zod validation.
* Supabase: anonymous auth, Postgres (server-authoritative, transactions + row locks), Realtime Broadcast (private channels).
* Game engine in `src/engine` – pure TypeScript, no React, secure (`node:crypto`) shuffling, 7 variations.

## Architecture
```
Browser ──command──▶ Next.js route handler ─ verify Supabase JWT ─▶ transaction:
                      lock room row (FOR UPDATE) → idempotency check → process overdue timeouts →
                      engine.applyAction → write game/hands/balances → bump version
                                                         │
          Postgres trigger on rooms ──realtime.send──▶ private channel room:CODE (public state only)
Browser ◀── broadcast (public, card-free) ; GET /state → your private view (your cards, legal actions)
```
* **Public** state (`rooms.public_state`) never contains cards (asserted by tests). **Private** state is built per request for the caller only; a blind player gets no cards until they look.
* Clients have no table privileges (RLS on, no policies); all writes go through the server with a direct DB connection.
* Docs: `docs/GAME_RULES.md`, `docs/VARIATIONS.md`, `docs/DEPLOYMENT.md`.

## Scripts
`npm run dev | build | start | typecheck | test | test:e2e`

## Known limitations
* Free tiers: no uptime guarantee; idle Supabase projects pause.
* Timeouts are enforced when any client is connected or when someone returns (no background workers by design).
* Heartbeat-based presence is approximate (15 s beat / 40 s stale).
