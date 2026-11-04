-- Realtime Broadcast: private room channels authorised by room membership,
-- fed by a database trigger that publishes ONLY the public (card-free) room state.

create or replace function public.is_room_member(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.players p
    join public.rooms r on r.id = p.room_id
    where r.room_code = p_code and p.auth_user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_room_member(text) from public;
grant execute on function public.is_room_member(text) to authenticated;

-- Members (and only members) may receive broadcasts on their room topic. No client may send.
drop policy if exists "room members receive room broadcasts" on realtime.messages;
create policy "room members receive room broadcasts" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'room:%'
    and public.is_room_member(substring(realtime.topic() from 6))
  );

create or replace function public.broadcast_room_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.state_version is distinct from old.state_version then
    perform realtime.send(
      jsonb_build_object('v', new.state_version, 'state', new.public_state),
      'state',
      'room:' || new.room_code,
      true
    );
  end if;
  return null;
end $$;

drop trigger if exists rooms_broadcast on public.rooms;
create trigger rooms_broadcast after update on public.rooms
  for each row execute function public.broadcast_room_state();

-- The trigger function must not be callable through the Data API (RPC).
revoke all on function public.broadcast_room_state() from public, anon, authenticated;
