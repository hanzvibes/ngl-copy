-- Add owner-bound profiles and a private inbox. All new objects are namespaced.
create table if not exists public.ngl_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username ~ '^[A-Za-z0-9_.]{1,24}$'),
  created_at timestamptz not null default now()
);

create unique index if not exists ngl_profiles_username_ci_idx
  on public.ngl_profiles (lower(username));

alter table public.ngl_profiles enable row level security;
revoke all on table public.ngl_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.ngl_profiles to service_role;

alter table public.ngl_messages
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

-- Existing messages were created before ownership existed. They remain private and are not
-- retroactively assigned to any user.
alter table public.ngl_messages enable row level security;
revoke all on table public.ngl_messages from public, anon;
revoke insert, update on table public.ngl_messages from authenticated;
grant select, delete on table public.ngl_messages to authenticated;
grant select, insert, update, delete on table public.ngl_messages to service_role;

drop policy if exists "Owners can read their own NGL messages" on public.ngl_messages;
create policy "Owners can read their own NGL messages"
  on public.ngl_messages for select to authenticated
  using ((select auth.uid()) = owner_user_id);

drop policy if exists "Owners can delete their own NGL messages" on public.ngl_messages;
create policy "Owners can delete their own NGL messages"
  on public.ngl_messages for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

create index if not exists ngl_messages_owner_created_idx
  on public.ngl_messages (owner_user_id, created_at desc);

create or replace function public.submit_ngl_anonymous_message(
  p_username text,
  p_message text,
  p_ip_hash text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_owner uuid;
begin
  if p_username !~ '^[A-Za-z0-9_.]{1,24}$'
     or p_message is null
     or char_length(btrim(p_message)) < 1
     or char_length(btrim(p_message)) > 500
     or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select user_id into v_owner
  from public.ngl_profiles
  where lower(username) = lower(p_username);

  if v_owner is null then
    return jsonb_build_object('status', 'USERNAME_NOT_FOUND');
  end if;

  insert into public.ngl_message_rate_limits (ip_hash, window_started_at, message_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
  set window_started_at = case
        when public.ngl_message_rate_limits.window_started_at <= now() - interval '1 hour' then now()
        else public.ngl_message_rate_limits.window_started_at
      end,
      message_count = case
        when public.ngl_message_rate_limits.window_started_at <= now() - interval '1 hour' then 1
        else public.ngl_message_rate_limits.message_count + 1
      end
  returning message_count into v_count;

  if v_count > 5 then
    return jsonb_build_object('status', 'RATE_LIMITED');
  end if;

  insert into public.ngl_messages (owner_user_id, username, message)
  values (v_owner, p_username, btrim(p_message));

  return jsonb_build_object('status', 'OK');
end;
$$;

revoke all on function public.submit_ngl_anonymous_message(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_ngl_anonymous_message(text, text, text) to service_role;
