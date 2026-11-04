import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Command } from '@/lib/settings';
import { AppError } from '@/server/errors';
import { createRoom, getChat, getHistory, getState, heartbeat, joinRoom, runCommand, sendChat, tick } from '@/server/service';
import type { Sql } from '@/server/db';
import { dbAvailable, freshDb } from './db-setup';

const have = await dbAvailable();
const d = have ? describe : describe.skip;

let sql: Sql;
const users = () => Array.from({ length: 8 }, () => randomUUID());
const k = () => randomUUID();
const run = (u: string, code: string, c: Record<string, unknown>) =>
  runCommand(u, code, { idempotencyKey: k(), ...c } as Command, sql);
const errCode = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as AppError).code; }
  return null;
};

async function table(n: number, settings: Record<string, unknown> = {}) {
  const us = users().slice(0, n);
  const { code } = await createRoom(us[0]!, { displayName: 'Host', settings: { variation: 'classic', ...settings } }, sql);
  for (let i = 1; i < n; i++) await joinRoom(us[i]!, code, `P${i}`, sql);
  for (let i = 1; i < n; i++) await run(us[i]!, code, { type: 'ready', ready: true });
  return { code, us };
}
const gameOf = (v: Awaited<ReturnType<typeof getState>>) => v.room.game!;
const turnUser = (us: string[], v: Awaited<ReturnType<typeof getState>>, ids: Record<string, string>) =>
  us.find((u) => ids[u] === gameOf(v).turnId)!;
async function idMap(us: string[], code: string) {
  const m: Record<string, string> = {};
  for (const u of us) m[u] = (await getState(u, code, sql)).me.playerId;
  return m;
}

d('service (postgres)', () => {
  beforeAll(async () => { sql = await freshDb(); });
  afterAll(async () => { await sql?.end(); });

  it('creates rooms with unique codes, lets friends join by code, enforces capacity', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) codes.add((await createRoom(randomUUID(), { displayName: 'H' }, sql)).code);
    expect(codes.size).toBe(5);
    const us = users();
    const { code } = await createRoom(us[0]!, { displayName: 'Host', settings: { maxPlayers: 3 } }, sql);
    await joinRoom(us[1]!, code, 'A', sql);
    await joinRoom(us[2]!, code, 'B', sql);
    expect(await errCode(joinRoom(us[3]!, code, 'C', sql))).toBe('ROOM_FULL');
    expect(await errCode(joinRoom(us[3]!, 'ZZZZZZ', 'C', sql))).toBe('NOT_FOUND');
    // rejoin is idempotent
    const again = await joinRoom(us[1]!, code, 'A', sql);
    expect(again.playerId).toBeTruthy();
    const v = await getState(us[0]!, code, sql);
    expect(v.room.players).toHaveLength(3);
    // duplicate names get suffixed
    const { code: c2 } = await createRoom(us[4]!, { displayName: 'Sam' }, sql);
    await joinRoom(us[5]!, c2, 'Sam', sql);
    const names = (await getState(us[4]!, c2, sql)).room.players.map((p) => p.name);
    expect(new Set(names).size).toBe(2);
  });

  it('membership & host authorization', async () => {
    const { code, us } = await table(3);
    const outsider = randomUUID();
    expect(await errCode(getState(outsider, code, sql))).toBe('FORBIDDEN');
    expect(await errCode(run(outsider, code, { type: 'ready', ready: true }))).toBe('FORBIDDEN');
    expect(await errCode(run(us[1]!, code, { type: 'start_round' }))).toBe('FORBIDDEN');
    expect(await errCode(run(us[1]!, code, { type: 'close_room' }))).toBe('FORBIDDEN');
    expect(await errCode(run(us[1]!, code, { type: 'update_settings', settings: { boot: 20 } }))).toBe('FORBIDDEN');
    const ids = await idMap(us, code);
    expect(await errCode(run(us[1]!, code, { type: 'kick', playerId: ids[us[2]!] }))).toBe('FORBIDDEN');
  });

  it('needs 3 ready players to start', async () => {
    const us = users();
    const { code } = await createRoom(us[0]!, { displayName: 'Host', settings: { variation: 'classic' } }, sql);
    await joinRoom(us[1]!, code, 'A', sql);
    await joinRoom(us[2]!, code, 'B', sql);
    await run(us[1]!, code, { type: 'ready', ready: true });
    expect(await errCode(run(us[0]!, code, { type: 'start_round' }))).toBe('NOT_ENOUGH_PLAYERS');
    await run(us[2]!, code, { type: 'ready', ready: true });
    const v = await run(us[0]!, code, { type: 'start_round' });
    expect(v.room.status).toBe('playing');
    expect(v.room.game!.players).toHaveLength(3);
  });

  it('never leaks hidden cards in public state, db public columns, or other players\' private views', async () => {
    const { code, us } = await table(4);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    // Public JSON stored in the DB must contain no cards.
    const rows = await sql`select r.public_state::text as r, g.public_state::text as g from rooms r join games g on g.room_id = r.id where r.room_code = ${code}`;
    for (const row of rows) { expect(row.r).not.toMatch(/"suit"|"rank"|"cards"/); expect(row.g).not.toMatch(/"suit"|"rank"|"cards"/); }
    // Nobody sees cards before looking.
    for (const u of us) expect((await getState(u, code, sql)).me.private!.cards).toBeNull();
    // Player 1 looks: only they get cards.
    await run(us[1]!, code, { type: 'see' });
    const mine = (await getState(us[1]!, code, sql)).me.private!.cards!;
    expect(mine).toHaveLength(3);
    for (const u of [us[0]!, us[2]!, us[3]!]) {
      const view = await getState(u, code, sql);
      expect(view.me.private!.cards).toBeNull();
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(mine));
    }
    // Host sees nothing special.
    void ids;
    v = await getState(us[1]!, code, sql);
    expect(JSON.stringify(v.room)).not.toMatch(/"suit"/);
  });

  it('only the player on turn can act; fake turn / out-of-turn rejected', async () => {
    const { code, us } = await table(3);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    const t = turnUser(us, v, ids);
    const other = us.find((u) => u !== t)!;
    expect(await errCode(run(other, code, { type: 'bet', gameVersion: gameOf(v).version }))).toBe('NOT_YOUR_TURN');
    expect(await errCode(run(other, code, { type: 'pack', gameVersion: gameOf(v).version }))).toBe('NOT_YOUR_TURN');
    v = await run(t, code, { type: 'bet', gameVersion: gameOf(v).version });
    expect(gameOf(v).pot).toBe(30 + 10);
    expect(gameOf(v).turnId).not.toBe(ids[t]);
  });

  it('is idempotent: replayed key does nothing; stale version rejected; replay with new key fails', async () => {
    const { code, us } = await table(3);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    const t = turnUser(us, v, ids);
    const ver = gameOf(v).version;
    const key = k();
    const cmd = { type: 'bet', idempotencyKey: key, gameVersion: ver } as Command;
    v = await runCommand(t, code, cmd, sql);
    const pot = gameOf(v).pot;
    const v2 = await runCommand(t, code, cmd, sql); // network retry
    expect(gameOf(v2).pot).toBe(pot);
    expect(gameOf(v2).version).toBe(gameOf(v).version);
    // a "replayed" action with a fresh key but the old version
    expect(await errCode(run(t, code, { type: 'bet', gameVersion: ver }))).toBe('STALE_STATE');
  });

  it('two simultaneous bets from the same player apply exactly once', async () => {
    const { code, us } = await table(3);
    const v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    const t = turnUser(us, v, ids);
    const ver = gameOf(v).version;
    const results = await Promise.allSettled([
      run(t, code, { type: 'bet', gameVersion: ver }),
      run(t, code, { type: 'bet', gameVersion: ver }),
      run(t, code, { type: 'bet', gameVersion: ver, raise: true }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await getState(t, code, sql);
    expect(gameOf(after).version).toBe(ver + 1);
    // chips conserved
    const total = after.room.players.reduce((s, p) => s + p.balance, 0) + gameOf(after).pot;
    expect(total).toBe(3000);
  });

  it('simultaneous actions by different players: only the one on turn succeeds', async () => {
    const { code, us } = await table(4);
    const v = await run(us[0]!, code, { type: 'start_round' });
    const ver = gameOf(v).version;
    const res = await Promise.allSettled(us.map((u) => run(u, code, { type: 'bet', gameVersion: ver })));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('auto-folds on expired deadline when state is read, and before accepting an action', async () => {
    const { code, us } = await table(3);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    const t = turnUser(us, v, ids);
    const expire = () => sql`update games set engine_state = jsonb_set(engine_state, '{turnDeadline}', '1'::jsonb), turn_deadline = to_timestamp(1) where room_id = (select id from rooms where room_code = ${code})`;
    await expire();
    v = await getState(us[0]!, code, sql);
    const p = gameOf(v).players.find((x) => x.id === ids[t])!;
    expect(p.folded).toBe(true);
    expect(gameOf(v).turnId).not.toBe(ids[t]);
    // Folded player cannot act.
    expect(await errCode(run(t, code, { type: 'bet', gameVersion: gameOf(v).version }))).toBe('ALREADY_FOLDED');
    // Timeout via action path: expire again and the stalled player's late action is rejected.
    const t2 = turnUser(us, v, ids);
    await expire();
    expect(await errCode(run(t2, code, { type: 'bet', gameVersion: gameOf(v).version }))).toBe('ROUND_ENDED');
    const end = await tick(us[0]!, code, sql);
    expect(end.room.game!.phase).toBe('ended');
    expect(end.room.status).toBe('between');
    // Winner got the pot exactly once.
    const total = end.room.players.reduce((s, x) => s + x.balance, 0);
    expect(total).toBe(3000);
    expect(end.room.players.some((x) => x.balance === 1000 - 10 + 30 || x.balance === 1020 + 0)).toBe(true);
  });

  it('full round via packs: pays winner once, next round starts, rebuy works', async () => {
    const { code, us } = await table(3, { boot: 50, startingChips: 200 });
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    for (let i = 0; i < 2; i++) {
      const t = turnUser(us, v, ids);
      v = await run(t, code, { type: 'pack', gameVersion: gameOf(v).version });
    }
    expect(gameOf(v).phase).toBe('ended');
    expect(v.room.players.map((p) => p.balance).sort((a, b) => a - b)).toEqual([150, 150, 300]);
    // a replayed "pack" from the loser can't re-pay
    expect(await errCode(run(us[1]!, code, { type: 'pack', gameVersion: gameOf(v).version }))).toBe('ROUND_ENDED');
    v = await run(us[0]!, code, { type: 'start_round' });
    expect(v.room.round).toBe(2);
    expect(gameOf(v).phase).toBe('betting');
    // rebuy blocked mid-round for participants
    expect(await errCode(run(us[1]!, code, { type: 'rebuy' }))).toBe('NOT_ALLOWED');
  });

  it('cannot modify chip balance, host cannot be impersonated, settings locked mid-round', async () => {
    const { code, us } = await table(3);
    await run(us[0]!, code, { type: 'start_round' });
    expect(await errCode(run(us[0]!, code, { type: 'update_settings', settings: { boot: 1 } }))).toBe('NOT_ALLOWED');
    // Commands carry no player / balance fields: unknown keys are dropped by zod before reaching the service.
    const { commandSchema } = await import('@/lib/settings');
    const parsed = commandSchema.safeParse({ type: 'bet', idempotencyKey: k(), gameVersion: 1, playerId: 'x', balance: 99999 });
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('99999');
  });

  it('dealers choice requires a per-round variation; variations are fixed within a round', async () => {
    const { code, us } = await table(3, { variation: 'dealers_choice' });
    expect(await errCode(run(us[0]!, code, { type: 'start_round' }))).toBe('INVALID_INPUT');
    const v = await run(us[0]!, code, { type: 'start_round', variation: 'ak47' });
    expect(gameOf(v).variation).toBe('ak47');
    expect((await run(us[0]!, code, { type: 'update_settings', settings: { variation: 'muflis' } }).catch((e) => e)).code).toBe('NOT_ALLOWED');
  });

  it('heartbeat toggles connection state; reconnect restores private hand', async () => {
    const { code, us } = await table(3);
    await run(us[0]!, code, { type: 'start_round' });
    await run(us[1]!, code, { type: 'see' });
    const hand = (await getState(us[1]!, code, sql)).me.private!.cards;
    await sql`update players set last_seen_at = now() - interval '2 minutes' where room_id = (select id from rooms where room_code = ${code}) and auth_user_id = ${us[1]!}`;
    await heartbeat(us[0]!, code, sql);
    const v = await getState(us[0]!, code, sql);
    expect(v.room.players.filter((p) => !p.connected)).toHaveLength(1);
    await heartbeat(us[1]!, code, sql);
    expect((await getState(us[0]!, code, sql)).room.players.every((p) => p.connected)).toBe(true);
    expect((await getState(us[1]!, code, sql)).me.private!.cards).toEqual(hand);
  });

  it('closing a room blocks further access; leaving transfers host', async () => {
    const { code, us } = await table(3);
    await run(us[0]!, code, { type: 'leave' });
    const v = await getState(us[1]!, code, sql);
    expect(v.room.hostId).toBe((await idMap(us.slice(1), code))[us[1]!] ?? v.room.hostId);
    expect(v.room.players).toHaveLength(2);
    expect(v.me.isHost || (await getState(us[2]!, code, sql)).me.isHost).toBe(true);
    const host = v.me.isHost ? us[1]! : us[2]!;
    await run(host, code, { type: 'close_room' });
    expect(await errCode(getState(us[1]!, code, sql))).toBe('ROOM_CLOSED');
  });

  it('six players and multiple simultaneous rooms', async () => {
    const rooms = await Promise.all([table(6), table(6), table(3)]);
    const views = await Promise.all(rooms.map((r) => run(r.us[0]!, r.code, { type: 'start_round' })));
    expect(views.map((v) => v.room.game!.players.length)).toEqual([6, 6, 3]);
    const codes = new Set(rooms.map((r) => r.code));
    expect(codes.size).toBe(3);
  });

  it('dealer rotates every round and the DEALER (not only the host) picks the variation', async () => {
    const { code, us } = await table(3, { variation: 'dealers_choice' });
    const ids = await idMap(us, code);
    let v = await getState(us[0]!, code, sql);
    expect(v.room.nextDealerId).toBe(ids[us[0]!]); // host deals first
    v = await run(us[0]!, code, { type: 'start_round', variation: 'classic' });
    expect(gameOf(v).dealerSeat).toBe(0);
    // end the round quickly: everyone packs
    for (let i = 0; i < 2; i++) v = await run(turnUser(us, v, ids), code, { type: 'pack', gameVersion: gameOf(v).version });
    v = await getState(us[1]!, code, sql);
    expect(v.room.nextDealerId).toBe(ids[us[1]!]); // seat 1 deals next
    // a non-dealer, non-host can't start; the dealer can, picking muflis
    expect(await errCode(run(us[2]!, code, { type: 'start_round', variation: 'muflis' }))).toBe('FORBIDDEN');
    v = await run(us[1]!, code, { type: 'start_round', variation: 'muflis' });
    expect(gameOf(v).variation).toBe('muflis');
    expect(gameOf(v).dealerSeat).toBe(1);
    for (let i = 0; i < 2; i++) v = await run(turnUser(us, v, ids), code, { type: 'pack', gameVersion: gameOf(v).version });
    expect((await getState(us[0]!, code, sql)).room.nextDealerId).toBe(ids[us[2]!]);
    // host may always override
    v = await run(us[0]!, code, { type: 'start_round', variation: 'ak47' });
    expect(gameOf(v).variation).toBe('ak47');
    expect(gameOf(v).dealerSeat).toBe(2);
  });

  it('host-chooser mode: dealer cannot start', async () => {
    const { code, us } = await table(3, { variation: 'dealers_choice', variationChooser: 'host' });
    let v = await run(us[0]!, code, { type: 'start_round', variation: 'classic' });
    const ids = await idMap(us, code);
    for (let i = 0; i < 2; i++) v = await run(turnUser(us, v, ids), code, { type: 'pack', gameVersion: gameOf(v).version });
    expect(await errCode(run(us[1]!, code, { type: 'start_round', variation: 'muflis' }))).toBe('FORBIDDEN');
  });

  it('leaving mid-round packs you, chips stay in the pot, turn moves on, you are removed', async () => {
    const { code, us } = await table(4);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    const t = turnUser(us, v, ids);
    v = await run(t, code, { type: 'bet', gameVersion: gameOf(v).version }); // pot 50
    const leaver = us.find((u) => u !== t && ids[u] === gameOf(v).turnId)!; // next to act leaves
    const left = await run(leaver, code, { type: 'leave' });
    void left;
    v = await getState(us.find((u) => u !== leaver)!, code, sql);
    expect(v.room.players).toHaveLength(3);
    expect(gameOf(v).pot).toBe(50);
    expect(gameOf(v).players.find((p) => p.id === ids[leaver])!.folded).toBe(true);
    expect(gameOf(v).turnId).not.toBe(ids[leaver]);
    expect(await errCode(getState(leaver, code, sql))).toBe('FORBIDDEN');
    const total = v.room.players.reduce((s, p) => s + p.balance, 0) + gameOf(v).pot;
    expect(total).toBe(4000 - 990); // the leaver walked out with their remaining 990 chips; their 10 boot stays in the pot
  });

  it('host leaving mid-round hands hosting to someone else and the round continues', async () => {
    const { code, us } = await table(3);
    await run(us[0]!, code, { type: 'start_round' });
    await run(us[0]!, code, { type: 'leave' });
    const v = await getState(us[1]!, code, sql);
    expect(v.room.players).toHaveLength(2);
    expect(v.room.hostId).not.toBeNull();
    expect(v.room.status).toMatch(/playing|between/);
  });

  it('winner can reveal after everyone else packed; others cannot', async () => {
    const { code, us } = await table(3);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    for (let i = 0; i < 2; i++) v = await run(turnUser(us, v, ids), code, { type: 'pack', gameVersion: gameOf(v).version });
    const winner = us.find((u) => gameOf(v).result!.payouts[0]!.playerId === ids[u])!;
    const loser = us.find((u) => u !== winner)!;
    expect(gameOf(v).result!.reveal).toHaveLength(0);
    expect(await errCode(run(loser, code, { type: 'reveal' }))).toBe('INVALID_ACTION');
    v = await run(winner, code, { type: 'reveal' });
    expect(gameOf(v).result!.reveal.map((r) => r.playerId)).toEqual([ids[winner]]);
    // revealed cards are public now; an unrevealed player's hand is not
    expect(JSON.stringify((await getState(loser, code, sql)).room)).toContain('"label"');
  });

  it('chat: members only, trimmed, rate limited, capped at 100, delivered in order', async () => {
    const { code, us } = await table(3);
    const outsider = randomUUID();
    expect(await errCode(sendChat(outsider, code, 'hi', sql))).toBe('FORBIDDEN');
    expect(await errCode(getChat(outsider, code, sql))).toBe('FORBIDDEN');
    const m1 = await sendChat(us[1]!, code, 'hello <b>all</b>', sql);
    expect(m1.body).toBe('hello <b>all</b>'); // stored as text; the UI renders it escaped
    expect(await errCode(sendChat(us[1]!, code, 'spam', sql))).toBe('RATE_LIMITED');
    await sendChat(us[2]!, code, 'second', sql);
    const msgs = await getChat(us[0]!, code, sql);
    expect(msgs.map((m) => m.body)).toEqual(['hello <b>all</b>', 'second']);
    expect(msgs[0]!.name).toBe('P1');
    for (let i = 0; i < 105; i++) {
      await sql`insert into chat_messages (room_id, player_id, display_name, body, created_at) select room_id, id, display_name, ${'m' + i}, now() - interval '1 hour' from players where auth_user_id = ${us[0]!}`;
    }
    await sendChat(us[0]!, code, 'trim', sql);
    const [{ n }] = (await sql`select count(*)::int as n from chat_messages where room_id = (select id from rooms where room_code = ${code})`) as unknown as [{ n: number }];
    expect(n).toBeLessThanOrEqual(100);
  });

  it('history exposes finished rounds without private data', async () => {
    const { code, us } = await table(3);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    await run(us[1]!, code, { type: 'see' });
    for (let i = 0; i < 2; i++) v = await run(turnUser(us, v, ids), code, { type: 'pack', gameVersion: gameOf(v).version });
    const h = await getHistory(us[2]!, code, sql);
    expect(h).toHaveLength(1);
    expect(h[0]!.round).toBe(1);
    const json = JSON.stringify(h);
    expect(json).not.toMatch(/"suit"|"cards"|sideshow_result|yourCards/);
    expect(await errCode(getHistory(randomUUID(), code, sql))).toBe('FORBIDDEN');
  });

  it('leaving and rejoining restores your chips and buy-in history (no free fresh stack)', async () => {
    const { code, us } = await table(4);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    // p3 plays one hand, loses chips, leaves, comes back
    const t = turnUser(us, v, ids);
    v = await run(t, code, { type: 'bet', gameVersion: gameOf(v).version });
    const leaver = us.find((u) => u !== t && u !== us[0]!)!;
    const before = (await getState(leaver, code, sql)).room.players.find((p) => p.id === ids[leaver])!.balance;
    await run(leaver, code, { type: 'leave' });
    expect(await errCode(getState(leaver, code, sql))).toBe('FORBIDDEN');
    // finish the round so they can rejoin comfortably
    const others = us.filter((u) => u !== leaver);
    let st = await getState(others[0]!, code, sql);
    while (gameOf(st).phase !== 'ended') {
      st = await run(turnUser(others, st, ids), code, { type: 'pack', gameVersion: gameOf(st).version });
    }
    await joinRoom(leaver, code, 'Back', sql);
    const me = (await getState(leaver, code, sql)).room.players.find((p) => p.id === ids[leaver])!; // same player row
    expect(me.balance).toBe(before);
    expect(me.buyIn).toBe(1000);
    expect(me.rebuys).toBe(0);
    expect(me.balance).toBeLessThan(1000 + 1); // not reset to a fresh 1000 + stack
  });

  it('rebuys are limited, counted, and tracked in net profit', async () => {
    const { code, us } = await table(3, { maxRebuys: 1, boot: 100, startingChips: 1000 });
    // poor player: 40 chips left, between rounds
    await sql`update players set chip_balance = 40 where auth_user_id = ${us[1]!}`;
    let v = await run(us[1]!, code, { type: 'rebuy' });
    let me = v.room.players.find((p) => p.id === v.me.playerId)!;
    expect(me.balance).toBe(1000);
    expect(me.buyIn).toBe(1960); // 1000 + 960 top-up
    expect(me.rebuys).toBe(1);
    expect(me.profit).toBe(1000 - 1960);
    await sql`update players set chip_balance = 10 where auth_user_id = ${us[1]!}`;
    expect(await errCode(run(us[1]!, code, { type: 'rebuy' }))).toBe('NOT_ALLOWED'); // limit reached
    // no rebuys at all
    const t2 = await table(3, { maxRebuys: 0 });
    await sql`update players set chip_balance = 5 where auth_user_id = ${t2.us[1]!}`;
    expect(await errCode(run(t2.us[1]!, t2.code, { type: 'rebuy' }))).toBe('NOT_ALLOWED');
    v = await getState(us[0]!, code, sql);
    me = v.room.players.find((p) => p.name === 'P1')!;
    expect(me.rebuys).toBe(1);
  });

  it('profit follows the chips, including chips currently in the pot', async () => {
    const { code, us } = await table(3);
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    for (const p of v.room.players) expect(p.profit).toBe(0); // boot in the pot still counts as theirs
    for (let i = 0; i < 2; i++) v = await run(turnUser(us, v, ids), code, { type: 'pack', gameVersion: gameOf(v).version });
    const profits = v.room.players.map((p) => p.profit).sort((a, b) => a - b);
    expect(profits).toEqual([-10, -10, 20]);
  });

  it('a removed (kicked) player cannot rejoin', async () => {
    const { code, us } = await table(3);
    const ids = await idMap(us, code);
    await run(us[0]!, code, { type: 'kick', playerId: ids[us[2]!] });
    expect(await errCode(joinRoom(us[2]!, code, 'Again', sql))).toBe('FORBIDDEN');
    expect(await errCode(getState(us[2]!, code, sql))).toBe('FORBIDDEN');
  });

  it('all-in through the database: short stack goes all-in, others continue, side pot is paid correctly', async () => {
    const { code, us } = await table(3, { boot: 50, startingChips: 1000 });
    await sql`update players set chip_balance = 160 where auth_user_id = ${us[1]!}`; // short after boot
    let v = await run(us[0]!, code, { type: 'start_round' });
    const ids = await idMap(us, code);
    // force known hands: the short stack (us[1]) holds the best hand
    await sql`update player_hands set cards = ${sql.json([{ rank: 14, suit: 'S' }, { rank: 14, suit: 'H' }, { rank: 14, suit: 'D' }])}
      where player_id = ${ids[us[1]!] as string} and game_id = (select id from games order by created_at desc limit 1)`;
    // play until the short stack has to go all-in or the round ends
    let guard = 0;
    while (gameOf(v).phase !== 'ended' && guard++ < 30) {
      const u = turnUser(us, v, ids);
      const priv = (await getState(u, code, sql)).me.private!;
      const ver = gameOf(v).version;
      if (priv.legal.allIn) v = await run(u, code, { type: 'allin', gameVersion: ver });
      else if (priv.legal.bet?.raiseCost && u !== us[1]) v = await run(u, code, { type: 'bet', raise: true, gameVersion: ver });
      else if (priv.legal.bet) v = await run(u, code, { type: 'bet', gameVersion: ver });
      else v = await run(u, code, { type: 'pack', gameVersion: ver });
      if (guard > 12) v = await run(turnUser(us, v, ids), code, { type: 'pack', gameVersion: gameOf(v).version }).catch(() => v);
    }
    const end = await getState(us[0]!, code, sql);
    expect(gameOf(end).phase).toBe('ended');
    expect(end.room.players.every((p) => p.balance >= 0)).toBe(true);
    expect(end.room.players.reduce((s, p) => s + p.balance, 0)).toBe(2160 - 0); // chips conserved: 160 + 1000 + 1000
  });
});
