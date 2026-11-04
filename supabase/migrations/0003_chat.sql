-- In-room chat. Server-only table (RLS on, no client policies); messages reach members via Realtime Broadcast (0004).
create table public.chat_messages (
  id            bigint generated always as identity primary key,
  room_id       uuid not null references public.rooms(id) on delete cascade,
  player_id     uuid references public.players(id) on delete set null,
  display_name  text not null,
  body          text not null check (char_length(body) between 1 and 200),
  created_at    timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages (room_id, id desc);
alter table public.chat_messages enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.chat_messages from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.chat_messages from authenticated;
  end if;
end $$;
