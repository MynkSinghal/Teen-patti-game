-- Broadcast each new chat message to the private room channel (members only, see 0002 policy).
create or replace function public.broadcast_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select room_code into v_code from public.rooms where id = new.room_id;
  if v_code is not null then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'pid', new.player_id, 'name', new.display_name, 'body', new.body, 'at', extract(epoch from new.created_at) * 1000),
      'chat',
      'room:' || v_code,
      true
    );
  end if;
  return null;
end $$;
revoke all on function public.broadcast_chat_message() from public, anon, authenticated;

create trigger chat_broadcast after insert on public.chat_messages
  for each row execute function public.broadcast_chat_message();
