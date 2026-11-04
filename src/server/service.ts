import { randomInt } from 'node:crypto';
import {
  applyAction,
  leaveRound,
  processTimeout,
  startRound,
  type PrivateGameView,
} from '@/engine/game';
import { cryptoRng } from '@/engine/rng';
import type { Action, Card, EngineState, PublicEvent } from '@/engine/types';
import { EngineError } from '@/engine/types';
import {
  roomSettingsSchema,
  rulesFromSettings,
  type Command,
  type RoomSettings,
} from '@/lib/settings';
import { getSql, type Sql, type Tx } from './db';
import { AppError } from './errors';
import {
  buildMe,
  buildPublicRoom,
  computeNextDealer,
  type ClientView,
  type GameRow,
  type PlayerRow,
  type RoomRow,
} from './view';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const STALE_AFTER_SECONDS = 40;
const ROOM_TTL_HOURS = 12;

function newCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

interface Ctx {
  tx: Tx;
  room: RoomRow;
  players: PlayerRow[];
  me: PlayerRow;
  game: GameRow | null;
  engine: EngineState | null;
  nowMs: number;
  events: PublicEvent[];
  engineChanged: boolean;
  bumpGame: boolean;
  newGame: boolean;
  lobbyChanged: boolean;
  nextRoomStatus?: RoomRow['status'];
}

async function dbNow(tx: Tx | Sql): Promise<number> {
  const [r] = await tx`select (extract(epoch from clock_timestamp()) * 1000)::float8 as ms`;
  return Math.floor(Number(r!.ms));
}

const mapRoom = (r: Record<string, unknown>): RoomRow => ({
  ...(r as unknown as RoomRow),
  state_version: Number(r.state_version),
});
const mapPlayer = (r: Record<string, unknown>): PlayerRow => ({
  ...(r as unknown as PlayerRow),
  chip_balance: Number(r.chip_balance),
  total_buy_in: Number(r.total_buy_in),
});

type Mode = 'write' | 'read';

async function loadCtx(tx: Tx, code: string, userId: string, mode: Mode, allHands: boolean): Promise<Ctx> {
  const rooms =
    mode === 'write'
      ? await tx`select * from rooms where room_code = ${code} for update`
      : await tx`select * from rooms where room_code = ${code}`;
  if (rooms.length === 0) throw new AppError('NOT_FOUND', 'That room does not exist.');
  const room = mapRoom(rooms[0]!);
  const players = (await tx`select * from players where room_id = ${room.id} and not has_left order by seat_number`).map(mapPlayer);
  const me = players.find((p) => p.auth_user_id === userId);
  if (!me) throw new AppError('FORBIDDEN', 'You are not a member of this room.');
  const nowMs = await dbNow(tx);
  const games =
    mode === 'write'
      ? await tx`select id, room_id, round_number, variation, status, game_version, ended_at, engine_state from games where room_id = ${room.id} order by round_number desc limit 1 for update`
      : await tx`select id, room_id, round_number, variation, status, game_version, ended_at, engine_state from games where room_id = ${room.id} order by round_number desc limit 1`;
  let game: GameRow | null = null;
  let engine: EngineState | null = null;
  if (games.length) {
    const g = games[0]!;
    game = { ...(g as unknown as GameRow), game_version: Number(g.game_version) };
    const hands: Record<string, Card[]> = {};
    // Write path needs every hand; read path loads ONLY the requesting player's hand.
    const rows = allHands
      ? await tx`select player_id, cards from player_hands where game_id = ${g.id}`
      : await tx`select player_id, cards from player_hands where game_id = ${g.id} and player_id = ${me.id}`;
    for (const h of rows) hands[h.player_id as string] = h.cards as Card[];
    engine = { ...(g.engine_state as EngineState), hands };
  }
  return { tx, room, players, me, game, engine, nowMs, events: [], engineChanged: false, bumpGame: false, newGame: false, lobbyChanged: false };
}

function requireOpen(ctx: Ctx) {
  if (ctx.room.status === 'closed') throw new AppError('ROOM_CLOSED', 'This room was closed by the host.');
  if (ctx.room.expires_at.getTime() < ctx.nowMs) throw new AppError('ROOM_EXPIRED', 'This room has expired.');
}

/* ------------------------------------------------------------------ */
/* Persisting                                                          */
/* ------------------------------------------------------------------ */

async function persist(ctx: Ctx): Promise<ClientView> {
  const { tx, room } = ctx;
  let { game } = ctx;
  const engine = ctx.engine;

  if (engine && ctx.engineChanged && game) {
    const { hands: _hands, ...rest } = engine;
    void _hands;
    const stored = { ...rest, hands: {} };
    const version = game.game_version + (ctx.bumpGame ? 1 : 0);
    const ended = engine.phase === 'ended';
    const deadline = engine.turnDeadline;
    await tx`
      update games set
        engine_state = ${tx.json(stored as never)},
        public_state = ${tx.json(buildPublicRoom({ ...room }, ctx.players, { ...game, game_version: version }, engine, 0).game as never)},
        status = ${ended ? 'ended' : 'active'},
        current_turn_player_id = ${engine.turnId},
        pot = ${engine.pot},
        current_bet = ${engine.stake},
        turn_started_at = now(),
        turn_deadline = ${deadline === null ? null : tx`to_timestamp(${deadline / 1000.0})`},
        game_version = ${version},
        ended_at = ${ended ? tx`coalesce(ended_at, now())` : null},
        updated_at = now()
      where id = ${game.id}`;
    game = { ...game, game_version: version, status: ended ? 'ended' : 'active' };
    if (ended) {
      const [{ ended_at }] = (await tx`select ended_at from games where id = ${game.id}`) as unknown as [{ ended_at: Date }];
      game.ended_at = ended_at;
      if (engine.result?.reveal.length) {
        const ids = engine.result.reveal.map((r) => r.playerId);
        await tx`update player_hands set is_revealed = true where game_id = ${game.id} and player_id = any(${ids}::uuid[])`;
      }
    }
    // chips + folded flags
    const ids = engine.players.map((p) => p.id);
    const bals = engine.players.map((p) => p.balance);
    const folds = engine.players.map((p) => p.folded);
    await tx`
      update players p set chip_balance = u.b, is_folded = u.f
      from unnest(${ids}::uuid[], ${bals}::bigint[], ${folds}::boolean[]) as u(id, b, f)
      where p.id = u.id`;
    for (const ep of engine.players) {
      const pl = ctx.players.find((p) => p.id === ep.id);
      if (pl) {
        pl.chip_balance = ep.balance;
        pl.is_folded = ep.folded;
      }
    }
    ctx.game = game;
    if (ended) ctx.nextRoomStatus = 'between';
  }

  const status = ctx.nextRoomStatus ?? room.status;
  const version = room.state_version + 1;
  const updatedRoom: RoomRow = { ...room, status, state_version: version };
  const pub = buildPublicRoom(updatedRoom, ctx.players, ctx.game, engine, version);
  await tx`
    update rooms set
      status = ${status}, settings = ${tx.json(room.settings as never)}, name = ${room.name},
      host_player_id = ${room.host_player_id}, round_number = ${room.round_number}, dealer_seat = ${room.dealer_seat},
      state_version = ${version}, public_state = ${tx.json(pub as never)},
      updated_at = now(), expires_at = now() + ${ROOM_TTL_HOURS + ' hours'}::interval
    where id = ${room.id}`;
  ctx.room = updatedRoom;
  return { room: pub, me: buildMe(pub, ctx.me, engine), serverTime: ctx.nowMs };
}

async function record(ctx: Ctx, type: string, key: string | null, data: unknown) {
  await ctx.tx`
    insert into game_events (room_id, game_id, player_id, event_type, event_data, idempotency_key)
    values (${ctx.room.id}, ${ctx.game?.id ?? null}, (select id from players where id = ${ctx.me.id}), ${type}, ${ctx.tx.json(data as never)}, ${key})`;
}

function viewOnly(ctx: Ctx): ClientView {
  const pub = buildPublicRoom(ctx.room, ctx.players, ctx.game, ctx.engine, ctx.room.state_version);
  return { room: pub, me: buildMe(pub, ctx.me, ctx.engine), serverTime: ctx.nowMs };
}

/* ------------------------------------------------------------------ */
/* Timeouts / automatic round flow                                     */
/* ------------------------------------------------------------------ */

/** Applies any overdue turn deadline and auto-start of the next round. Returns true if state changed. */
function processOverdue(ctx: Ctx): boolean {
  let changed = false;
  if (ctx.engine && ctx.game?.status === 'active') {
    const r = processTimeout(ctx.engine, ctx.nowMs);
    if (r) {
      ctx.engine = r.state;
      ctx.events.push(...r.events);
      ctx.engineChanged = true;
      ctx.bumpGame = true;
      changed = true;
    }
  }
  return changed;
}

function autoNextDue(ctx: Ctx): boolean {
  const s = ctx.room.settings;
  return (
    ctx.room.status === 'between' &&
    s.autoNextRound &&
    !!ctx.game?.ended_at &&
    ctx.game.ended_at.getTime() + s.nextRoundDelaySeconds * 1000 <= ctx.nowMs
  );
}

function pickParticipants(ctx: Ctx) {
  return ctx.players.filter((p) => (p.is_ready || p.id === ctx.room.host_player_id) && p.chip_balance >= ctx.room.settings.boot);
}

async function beginRound(ctx: Ctx, variation: string, variationOptions: Record<string, unknown>) {
  const { room, tx } = ctx;
  const parts = pickParticipants(ctx);
  const min = room.round_number === 0 ? 3 : 2;
  if (parts.length < min) {
    throw new AppError(
      'NOT_ENOUGH_PLAYERS',
      room.round_number === 0
        ? `Need at least 3 ready players with enough chips for the boot (have ${parts.length}).`
        : `Need at least 2 ready players with enough chips for the boot (have ${parts.length}).`,
    );
  }
  const dealerSeat = computeNextDealer(room, ctx.players)!.seat_number;
  const round = room.round_number + 1;
  const { state, events } = startRound({
    round,
    players: parts.map((p) => ({ id: p.id, name: p.display_name, seat: p.seat_number, balance: p.chip_balance })),
    dealerSeat,
    rules: rulesFromSettings(room.settings),
    variation: variation as never,
    variationOptions,
    rng: cryptoRng,
    now: ctx.nowMs,
  });
  const [g] = await tx`
    insert into games (room_id, round_number, variation, status, engine_state, game_version)
    values (${room.id}, ${round}, ${variation}, 'active', ${tx.json({ ...state, hands: {} } as never)}, 1)
    returning id, room_id, round_number, variation, status, game_version, ended_at`;
  for (const [pid, cards] of Object.entries(state.hands)) {
    await tx`insert into player_hands (game_id, player_id, cards) values (${g!.id}, ${pid}, ${tx.json(cards as never)})`;
  }
  await tx`update players set is_folded = false where room_id = ${room.id}`;
  ctx.players.forEach((p) => (p.is_folded = false));
  ctx.game = { ...(g as unknown as GameRow), game_version: 1 };
  ctx.engine = state;
  ctx.events.push(...events);
  ctx.engineChanged = true;
  ctx.bumpGame = false; // new game already starts at version 1
  ctx.newGame = true;
  ctx.nextRoomStatus = 'playing';
  room.round_number = round;
  room.dealer_seat = dealerSeat;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function createRoom(
  userId: string,
  input: { displayName: string; roomName?: string; settings?: unknown },
  sql: Sql = getSql(),
): Promise<{ code: string; playerId: string }> {
  const parsed = roomSettingsSchema.safeParse(input.settings ?? {});
  if (!parsed.success) throw new AppError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid settings');
  const settings = parsed.data;
  return sql.begin(async (tx) => {
    await tx`select public.cleanup_expired_rooms()`.catch(() => undefined);
    const [{ n }] = (await tx`
      select count(*)::int as n from rooms r join players p on p.id = r.host_player_id
      where p.auth_user_id = ${userId} and r.status <> 'closed' and r.expires_at > now()`) as unknown as [{ n: number }];
    if (n >= 5) throw new AppError('NOT_ALLOWED', 'You already host 5 open rooms. Close one first.');
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = newCode();
      const inserted = await tx`
        insert into rooms (room_code, name, settings) values (${code}, ${input.roomName || null}, ${tx.json(settings as never)})
        on conflict (room_code) do nothing returning *`;
      if (!inserted.length) continue;
      const room = mapRoom(inserted[0]!);
      const [p] = await tx`
        insert into players (room_id, auth_user_id, display_name, seat_number, chip_balance, total_buy_in, is_host, is_ready)
        values (${room.id}, ${userId}, ${input.displayName}, 0, ${settings.startingChips}, ${settings.startingChips}, true, true) returning *`;
      room.host_player_id = p!.id as string;
      const ctx = await buildBareCtx(tx, room, [mapPlayer(p!)], userId);
      await persist(ctx);
      return { code, playerId: p!.id as string };
    }
    throw new AppError('INTERNAL', 'Could not allocate a room code. Try again.');
  });
}

async function buildBareCtx(tx: Tx, room: RoomRow, players: PlayerRow[], userId: string): Promise<Ctx> {
  return {
    tx, room, players, me: players.find((p) => p.auth_user_id === userId)!, game: null, engine: null,
    nowMs: await dbNow(tx), events: [], engineChanged: false, bumpGame: false, newGame: false, lobbyChanged: true,
  };
}

export async function joinRoom(userId: string, code: string, displayName: string, sql: Sql = getSql()): Promise<{ code: string; playerId: string }> {
  return sql.begin(async (tx) => {
    const rooms = await tx`select * from rooms where room_code = ${code} for update`;
    if (!rooms.length) throw new AppError('NOT_FOUND', "We couldn't find a room with that code.");
    const room = mapRoom(rooms[0]!);
    const everyone = (await tx`select * from players where room_id = ${room.id}`).map(mapPlayer);
    const players = everyone.filter((p) => !p.has_left).sort((a, b) => a.seat_number - b.seat_number);
    const existing = players.find((p) => p.auth_user_id === userId);
    const previous = everyone.find((p) => p.auth_user_id === userId && p.has_left);
    const nowMs = await dbNow(tx);
    if (room.status === 'closed') throw new AppError('ROOM_CLOSED', 'This room was closed by the host.');
    if (room.expires_at.getTime() < nowMs) throw new AppError('ROOM_EXPIRED', 'This room has expired.');
    if (existing) {
      await tx`update players set is_connected = true, last_seen_at = now() where id = ${existing.id}`;
      return { code, playerId: existing.id };
    }
    if (previous?.kicked) throw new AppError('FORBIDDEN', 'The host removed you from this room.');
    if (players.length >= room.settings.maxPlayers) throw new AppError('ROOM_FULL', 'This room is full.');
    const taken = new Set(players.map((p) => p.seat_number));
    let seat = 0;
    while (taken.has(seat)) seat++;
    let name = displayName;
    const names = new Set(players.map((p) => p.display_name.toLowerCase()));
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${displayName.slice(0, 17)} ${i}`;
    if (previous) {
      // Coming back: same chips, same buy-in history. No fresh stack.
      const [back] = await tx`
        update players set has_left = false, seat_number = ${seat}, display_name = ${name}, is_connected = true, is_ready = false, is_host = false, last_seen_at = now()
        where id = ${previous.id} returning *`;
      const all = [...players, mapPlayer(back!)];
      const ctx: Ctx = { ...(await buildBareCtx(tx, room, all, userId)) };
      await persist(await loadGameForBare(tx, ctx));
      return { code, playerId: previous.id };
    }
    const [p] = await tx`
      insert into players (room_id, auth_user_id, display_name, seat_number, chip_balance, total_buy_in)
      values (${room.id}, ${userId}, ${name}, ${seat}, ${room.settings.startingChips}, ${room.settings.startingChips}) returning *`;
    const all = [...players, mapPlayer(p!)];
    const ctx: Ctx = { ...(await buildBareCtx(tx, room, all, userId)) };
    const gameCtx = await loadGameForBare(tx, ctx);
    await persist(gameCtx);
    return { code, playerId: p!.id as string };
  });
}

/** Attach the latest game (if any) to a bare context so persist() republishes a complete public state. */
async function loadGameForBare(tx: Tx, ctx: Ctx): Promise<Ctx> {
  const games = await tx`select id, room_id, round_number, variation, status, game_version, ended_at, engine_state from games where room_id = ${ctx.room.id} order by round_number desc limit 1`;
  if (games.length) {
    const g = games[0]!;
    ctx.game = { ...(g as unknown as GameRow), game_version: Number(g.game_version) };
    ctx.engine = { ...(g.engine_state as EngineState), hands: {} };
  }
  return ctx;
}

/** Read the current state for the caller. Applies overdue timeouts first (in their own transaction). */
export async function getState(userId: string, code: string, sql: Sql = getSql()): Promise<ClientView> {
  const overdue = await sql`
    select 1 from games g join rooms r on r.id = g.room_id
    where r.room_code = ${code} and g.status = 'active' and g.turn_deadline is not null and g.turn_deadline <= now()
    union all
    select 1 from games g join rooms r on r.id = g.room_id
    where r.room_code = ${code} and r.status = 'between' and (r.settings->>'autoNextRound')::boolean
      and g.ended_at + ((r.settings->>'nextRoundDelaySeconds')::int * interval '1 second') <= now()
    limit 1`;
  if (overdue.length) await tick(userId, code, sql);
  return sql.begin('isolation level repeatable read read only', async (tx) => {
    const ctx = await loadCtx(tx, code, userId, 'read', false);
    requireOpen(ctx);
    return viewOnly(ctx);
  });
}

/** Authenticated timeout processing + automatic next round. Safe to call at any time. */
export async function tick(userId: string, code: string, sql: Sql = getSql()): Promise<ClientView> {
  return sql.begin(async (tx) => {
    const ctx = await loadCtx(tx, code, userId, 'write', true);
    requireOpen(ctx);
    let changed = processOverdue(ctx);
    if (autoNextDue(ctx)) {
      const lastVariation = ctx.game?.variation ?? ctx.room.settings.variation;
      const v = ctx.room.settings.variation === 'dealers_choice' ? lastVariation : ctx.room.settings.variation;
      try {
        await beginRound(ctx, v, ctx.room.settings.variationOptions as Record<string, unknown>);
        changed = true;
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'NOT_ENOUGH_PLAYERS')) throw e;
      }
    }
    if (!changed) return viewOnly(ctx);
    if (ctx.events.length) await record(ctx, 'tick', null, ctx.events);
    return persist(ctx);
  });
}

export async function heartbeat(userId: string, code: string, sql: Sql = getSql()): Promise<{ ok: true }> {
  const changed = await sql.begin(async (tx) => {
    const rows = await tx`
      select p.id, p.is_connected, r.id as room_id from players p join rooms r on r.id = p.room_id
      where r.room_code = ${code} and p.auth_user_id = ${userId} and not p.has_left`;
    if (!rows.length) throw new AppError('FORBIDDEN', 'You are not a member of this room.');
    const was = rows[0]!.is_connected as boolean;
    await tx`update players set last_seen_at = now(), is_connected = true where id = ${rows[0]!.id}`;
    const stale = await tx`
      update players set is_connected = false
      where room_id = ${rows[0]!.room_id} and not has_left and is_connected and id <> ${rows[0]!.id}
        and last_seen_at < now() - ${STALE_AFTER_SECONDS + ' seconds'}::interval returning id`;
    return !was || stale.length > 0;
  });
  if (changed) {
    await sql.begin(async (tx) => {
      const ctx = await loadCtx(tx, code, userId, 'write', false);
      if (ctx.room.status === 'closed') return;
      await persist(ctx);
    });
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

const GAME_COMMANDS = new Set(['see', 'bet', 'pack', 'show', 'sideshow_request', 'sideshow_respond', 'reveal', 'set_joker', 'allin']);

export async function runCommand(userId: string, code: string, cmd: Command, sql: Sql = getSql()): Promise<ClientView> {
  // Process overdue deadlines first in their own transaction so they persist even if this command is rejected.
  await getStateTickOnly(userId, code, sql);
  return sql.begin(async (tx) => {
    const ctx = await loadCtx(tx, code, userId, 'write', true);
    requireOpen(ctx);

    // Idempotency: a replayed command key never re-applies.
    const dup = await tx`select 1 from game_events where room_id = ${ctx.room.id} and player_id = ${ctx.me.id} and idempotency_key = ${cmd.idempotencyKey}`;
    if (dup.length) return viewOnly(ctx);

    processOverdue(ctx);

    if (GAME_COMMANDS.has(cmd.type)) {
      await runGameCommand(ctx, cmd);
    } else {
      await runRoomCommand(ctx, cmd);
    }
    await record(ctx, `cmd:${cmd.type}`, cmd.idempotencyKey, { events: ctx.events });
    return persist(ctx);
  });
}

async function getStateTickOnly(userId: string, code: string, sql: Sql) {
  const overdue = await sql`
    select 1 from games g join rooms r on r.id = g.room_id
    where r.room_code = ${code} and g.status = 'active' and g.turn_deadline is not null and g.turn_deadline <= now()`;
  if (overdue.length) await tick(userId, code, sql);
}

async function runGameCommand(ctx: Ctx, cmd: Command) {
  if (cmd.type === 'reveal') {
    if (!ctx.engine || !ctx.game) throw new AppError('ROUND_ENDED', 'There is no round to reveal.');
    try {
      const r = applyAction(ctx.engine, ctx.me.id, { type: 'reveal' }, ctx.nowMs);
      ctx.engine = r.state;
      ctx.events.push(...r.events);
      ctx.engineChanged = true;
      ctx.bumpGame = true;
    } catch (e) {
      if (e instanceof EngineError) throw new AppError(e.code, e.message);
      throw e;
    }
    return;
  }
  if (!ctx.engine || !ctx.game || ctx.game.status !== 'active') throw new AppError('ROUND_ENDED', 'There is no round in progress.');
  if ('gameVersion' in cmd && cmd.gameVersion !== undefined && cmd.gameVersion !== ctx.game.game_version) {
    throw new AppError('STALE_STATE', 'The table changed while you were acting. Check the table and try again.');
  }
  let action: Action;
  switch (cmd.type) {
    case 'see': action = { type: 'see' }; break;
    case 'set_joker': action = { type: 'set_joker', index: cmd.index, as: cmd.as }; break;
    case 'bet': action = { type: 'bet', raise: cmd.raise }; break;
    case 'pack': action = { type: 'pack' }; break;
    case 'allin': action = { type: 'allin' }; break;
    case 'show': action = { type: 'show' }; break;
    case 'sideshow_request': action = { type: 'sideshow_request' }; break;
    case 'sideshow_respond': action = { type: 'sideshow_respond', accept: cmd.accept }; break;
    default: throw new AppError('INVALID_INPUT', 'Unknown command');
  }
  try {
    const r = applyAction(ctx.engine, ctx.me.id, action, ctx.nowMs);
    ctx.engine = r.state;
    ctx.events.push(...r.events);
    ctx.engineChanged = true;
    ctx.bumpGame = cmd.type !== 'see' && cmd.type !== 'set_joker';
  } catch (e) {
    if (e instanceof EngineError) throw new AppError(e.code, e.message);
    throw e;
  }
}

function requireHost(ctx: Ctx) {
  if (ctx.me.id !== ctx.room.host_player_id) throw new AppError('FORBIDDEN', 'Only the host can do that.');
}
const roundActive = (ctx: Ctx) => ctx.room.status === 'playing' && ctx.game?.status === 'active';

async function runRoomCommand(ctx: Ctx, cmd: Command) {
  const { tx, room, me } = ctx;
  switch (cmd.type) {
    case 'update_settings': {
      requireHost(ctx);
      if (roundActive(ctx)) throw new AppError('NOT_ALLOWED', 'Settings can only change between rounds.');
      if (cmd.settings.maxPlayers < ctx.players.length) throw new AppError('NOT_ALLOWED', 'Max players cannot be below the current player count.');
      const resetChips = room.round_number === 0 && cmd.settings.startingChips !== room.settings.startingChips;
      room.settings = cmd.settings;
      if (cmd.roomName !== undefined) room.name = cmd.roomName || null;
      if (resetChips) {
        await tx`update players set chip_balance = ${cmd.settings.startingChips}, total_buy_in = ${cmd.settings.startingChips} where room_id = ${room.id}`;
        ctx.players.forEach((p) => { p.chip_balance = cmd.settings.startingChips; p.total_buy_in = cmd.settings.startingChips; });
      }
      return;
    }
    case 'ready': {
      await tx`update players set is_ready = ${cmd.ready} where id = ${me.id}`;
      me.is_ready = cmd.ready;
      return;
    }
    case 'kick': {
      requireHost(ctx);
      if (roundActive(ctx)) throw new AppError('NOT_ALLOWED', 'Players can only be removed between rounds.');
      if (cmd.playerId === me.id) throw new AppError('NOT_ALLOWED', 'You cannot remove yourself.');
      const target = ctx.players.find((p) => p.id === cmd.playerId);
      if (!target) throw new AppError('NOT_FOUND', 'That player is not in the room.');
      await tx`update players set has_left = true, kicked = true, seat_number = null, is_ready = false where id = ${target.id}`;
      ctx.players = ctx.players.filter((p) => p.id !== target.id);
      return;
    }
    case 'leave': {
      // Mid-round: pack immediately; chips already in the pot stay there.
      if (ctx.engine && roundActive(ctx) && ctx.engine.players.some((p) => p.id === me.id && !p.folded)) {
        const r = leaveRound(ctx.engine, me.id, ctx.nowMs);
        ctx.engine = r.state;
        ctx.events.push(...r.events);
        ctx.engineChanged = true;
        ctx.bumpGame = true;
      }
      const others = ctx.players.filter((p) => p.id !== me.id);
      if (others.length === 0) {
        room.host_player_id = null;
        ctx.nextRoomStatus = 'closed';
      } else if (me.id === room.host_player_id) {
        const next = others.find((p) => p.is_connected) ?? others[0]!;
        await tx`update players set is_host = true, is_ready = true where id = ${next.id}`;
        room.host_player_id = next.id;
        next.is_host = true;
      }
      await tx`update rooms set host_player_id = ${room.host_player_id} where id = ${room.id}`;
      // Keep the row (chips + buy-in history) so a rejoin can't be used to reset your stack.
      await tx`update players set has_left = true, seat_number = null, is_ready = false, is_host = false where id = ${me.id}`;
      ctx.players = others;
      return;
    }
    case 'rebuy': {
      if (ctx.engine && roundActive(ctx) && ctx.engine.players.some((p) => p.id === me.id)) {
        throw new AppError('NOT_ALLOWED', 'You can top up between rounds.');
      }
      const full = room.settings.startingChips;
      if (me.chip_balance >= full) throw new AppError('NOT_ALLOWED', 'You already have a full stack.');
      if (me.rebuys >= room.settings.maxRebuys) {
        throw new AppError('NOT_ALLOWED', room.settings.maxRebuys === 0 ? 'Top-ups are turned off at this table.' : `No top-ups left (limit ${room.settings.maxRebuys}).`);
      }
      const added = full - me.chip_balance;
      await tx`update players set chip_balance = ${full}, total_buy_in = total_buy_in + ${added}, rebuys = rebuys + 1 where id = ${me.id}`;
      me.chip_balance = full;
      me.total_buy_in += added;
      me.rebuys += 1;
      return;
    }
    case 'close_room': {
      requireHost(ctx);
      ctx.nextRoomStatus = 'closed';
      return;
    }
    case 'start_round': {
      const dealer = computeNextDealer(room, ctx.players);
      const dealerMayStart = room.settings.variationChooser === 'dealer' && dealer?.id === me.id;
      if (me.id !== room.host_player_id && !dealerMayStart) throw new AppError('FORBIDDEN', 'Only the dealer or the host can start the round.');
      if (roundActive(ctx)) throw new AppError('NOT_ALLOWED', 'A round is already in progress.');
      let variation = room.settings.variation as string;
      let options = room.settings.variationOptions as Record<string, unknown>;
      if (variation === 'dealers_choice') {
        if (!cmd.variation) throw new AppError('INVALID_INPUT', "Dealer's Choice: pick a variation for this round.");
        variation = cmd.variation;
        options = cmd.variationOptions ?? {};
      }
      await beginRound(ctx, variation, options);
      return;
    }
    default:
      throw new AppError('INVALID_INPUT', 'Unknown command');
  }
}

export type { ClientView, PrivateGameView };

/* ------------------------------------------------------------------ */
/* Chat & history                                                      */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: number;
  pid: string | null;
  name: string;
  body: string;
  at: number;
}

async function memberOf(tx: Tx | Sql, userId: string, code: string) {
  const rows = await tx`
    select p.id, p.display_name, r.id as room_id, r.status, r.expires_at
    from players p join rooms r on r.id = p.room_id
    where r.room_code = ${code} and p.auth_user_id = ${userId} and not p.has_left`;
  if (!rows.length) {
    const exists = await tx`select 1 from rooms where room_code = ${code}`;
    throw exists.length ? new AppError('FORBIDDEN', 'You are not a member of this room.') : new AppError('NOT_FOUND', 'That room does not exist.');
  }
  return rows[0]!;
}

const mapChat = (r: Record<string, unknown>): ChatMessage => ({
  id: Number(r.id),
  pid: (r.player_id as string | null) ?? null,
  name: r.display_name as string,
  body: r.body as string,
  at: new Date(r.created_at as string).getTime(),
});

export async function getChat(userId: string, code: string, sql: Sql = getSql()): Promise<ChatMessage[]> {
  const m = await memberOf(sql, userId, code);
  const rows = await sql`select id, player_id, display_name, body, created_at from chat_messages where room_id = ${m.room_id} order by id desc limit 50`;
  return rows.map(mapChat).reverse();
}

export async function sendChat(userId: string, code: string, body: string, sql: Sql = getSql()): Promise<ChatMessage> {
  const m = await memberOf(sql, userId, code);
  if (m.status === 'closed') throw new AppError('ROOM_CLOSED', 'This room was closed by the host.');
  const recent = await sql`select 1 from chat_messages where player_id = ${m.id} and created_at > now() - interval '700 milliseconds'`;
  if (recent.length) throw new AppError('RATE_LIMITED', 'Slow down a little.');
  const [row] = await sql`
    insert into chat_messages (room_id, player_id, display_name, body) values (${m.room_id}, ${m.id}, ${m.display_name}, ${body})
    returning id, player_id, display_name, body, created_at`;
  // keep only the latest 100 messages per room
  await sql`
    delete from chat_messages where room_id = ${m.room_id}
      and id < coalesce((select id from chat_messages where room_id = ${m.room_id} order by id desc offset 99 limit 1), 0)`;
  return mapChat(row!);
}

export interface RoundHistory {
  round: number;
  variation: string;
  endedAt: number | null;
  result: unknown;
  players: unknown;
  log: unknown;
}

/** Finished rounds, public data only (never hands that weren't revealed, never private notes). */
export async function getHistory(userId: string, code: string, sql: Sql = getSql()): Promise<RoundHistory[]> {
  const m = await memberOf(sql, userId, code);
  const rows = await sql`
    select round_number, ended_at,
           engine_state->'ctx'->>'name' as variation_name,
           engine_state->'result' as result,
           engine_state->'players' as players,
           engine_state->'log' as log
    from games where room_id = ${m.room_id} and status = 'ended' order by round_number desc limit 15`;
  return rows.map((r) => ({
    round: Number(r.round_number),
    variation: r.variation_name as string,
    endedAt: r.ended_at ? new Date(r.ended_at as string).getTime() : null,
    result: r.result,
    players: r.players,
    log: r.log,
  }));
}
