-- NGL Copy additive schema for the shared FinanceTracker Supabase project.
-- Namespaced objects only: existing FinanceTracker/Kasir data and schema are untouched.
create table if not exists public.ngl_messages (
  id bigint generated always as identity primary key,
  username text not null check (char_length(username) between 1 and 24),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.ngl_messages enable row level security;
revoke all on table public.ngl_messages from public, anon, authenticated;
grant select, insert on table public.ngl_messages to service_role;

create table if not exists public.ngl_message_rate_limits (
  ip_hash text primary key check (char_length(ip_hash) = 64),
  window_started_at timestamptz not null default now(),
  message_count integer not null default 1 check (message_count >= 0)
);

alter table public.ngl_message_rate_limits enable row level security;
revoke all on table public.ngl_message_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.ngl_message_rate_limits to service_role;

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
begin
  if p_username !~ '^[A-Za-z0-9_.]{1,24}$'
     or p_message is null
     or char_length(btrim(p_message)) < 1
     or char_length(btrim(p_message)) > 500
     or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'INVALID_INPUT');
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

  insert into public.ngl_messages (username, message)
  values (p_username, btrim(p_message));

  return jsonb_build_object('status', 'OK');
end;
$$;

revoke all on function public.submit_ngl_anonymous_message(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_ngl_anonymous_message(text, text, text) to service_role;
