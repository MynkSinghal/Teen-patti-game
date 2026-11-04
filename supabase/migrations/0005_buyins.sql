-- Track buy-ins so rebuys can be limited and net profit shown, and keep a player's row when they leave
-- (rejoining restores their chips instead of handing out a fresh stack).
alter table public.players
  add column total_buy_in bigint not null default 0,
  add column rebuys integer not null default 0,
  add column has_left boolean not null default false,
  add column kicked boolean not null default false;

alter table public.players alter column seat_number drop not null;
alter table public.players drop constraint if exists players_seat_number_check;
alter table public.players add constraint players_seat_number_check check (seat_number is null or seat_number between 0 and 7);

update public.players p
   set total_buy_in = coalesce((r.settings->>'startingChips')::bigint, 0)
  from public.rooms r where r.id = p.room_id;
