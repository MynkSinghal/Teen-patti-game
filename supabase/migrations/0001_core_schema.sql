-- Private Teen Patti: core schema.
-- All tables are reachable ONLY through the Next.js server (direct Postgres connection).
-- RLS is enabled and no policies are granted to anon/authenticated, so clients can never
-- read or write these tables through the Supabase Data API.

create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  room_code       text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_player_id  uuid,
  name            text check (name is null or char_length(name) <= 40),
  status          text not null default 'lobby' check (status in ('lobby','playing','between','closed')),
  settings        jsonb not null,
  round_number    integer not null default 0,
  dealer_seat     integer not null default -1,
  state_version   bigint not null default 0,
  public_state    jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '12 hours'
);
create index rooms_expires_at_idx on public.rooms (expires_at);

create table public.players (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,
  auth_user_id   uuid not null,
  display_name   text not null check (char_length(display_name) between 1 and 20),
  seat_number    integer not null check (seat_number between 0 and 7),
  chip_balance   bigint not null check (chip_balance >= 0),
  is_host        boolean not null default false,
  is_connected   boolean not null default true,
  is_ready       boolean not null default false,
  is_folded      boolean not null default false,
  player_status  text not null default 'active' check (player_status in ('active','sitting_out')),
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (room_id, auth_user_id),
  unique (room_id, seat_number)
);
create index players_auth_user_idx on public.players (auth_user_id);
alter table public.rooms
  add constraint rooms_host_fk foreign key (host_player_id) references public.players(id) on delete set null deferrable initially deferred;

create table public.games (
  id                     uuid primary key default gen_random_uuid(),
  room_id                uuid not null references public.rooms(id) on delete cascade,
  round_number           integer not null,
  variation              text not null,
  status                 text not null default 'active' check (status in ('active','ended')),
  current_turn_player_id uuid references public.players(id) on delete set null,
  pot                    bigint not null default 0 check (pot >= 0),
  current_bet            bigint not null default 0 check (current_bet >= 0),
  turn_started_at        timestamptz,
  turn_deadline          timestamptz,
  game_version           integer not null default 0,
  -- Safe to show every player in the room (no cards).
  public_state           jsonb not null default '{}'::jsonb,
  -- Server-only engine state (no hands; hands live in player_hands). Never selected into responses.
  engine_state           jsonb not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  ended_at               timestamptz,
  unique (room_id, round_number)
);
create index games_room_idx on public.games (room_id, round_number desc);

create table public.player_hands (
  game_id      uuid not null references public.games(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  cards        jsonb not null,
  is_revealed  boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (game_id, player_id)
);

create table public.game_events (
  id               bigint generated always as identity primary key,
  room_id          uuid not null references public.rooms(id) on delete cascade,
  game_id          uuid references public.games(id) on delete cascade,
  player_id        uuid references public.players(id) on delete set null,
  event_type       text not null,
  event_data       jsonb not null default '{}'::jsonb,
  idempotency_key  text check (idempotency_key is null or char_length(idempotency_key) between 8 and 80),
  created_at       timestamptz not null default now()
);
create unique index game_events_idem_idx on public.game_events (room_id, player_id, idempotency_key)
  where idempotency_key is not null;
create index game_events_game_idx on public.game_events (game_id, id);

-- Row level security: enabled everywhere, with NO client policies (server-only access).
alter table public.rooms        enable row level security;
alter table public.players      enable row level security;
alter table public.games        enable row level security;
alter table public.player_hands enable row level security;
alter table public.game_events  enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.rooms, public.players, public.games, public.player_hands, public.game_events from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.rooms, public.players, public.games, public.player_hands, public.game_events from authenticated;
  end if;
end $$;

-- Cleanup policy: remove rooms that expired more than a day ago (cascades to everything).
create or replace function public.cleanup_expired_rooms() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.rooms where expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cleanup_expired_rooms() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.cleanup_expired_rooms() from anon, authenticated;
  end if;
end $$;
