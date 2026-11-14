-- NGL Copy batch 3: moderation, inbox organisation, profile extras.
-- Additive only: existing data untouched. Apply after 202610300004.
-- New columns are defaulted, so rows created before this migration keep
-- working (inbox open, daily prompt off, not discoverable, nothing
-- archived/pinned/reacted, no sender blocked).

-- 1. Profile extras: pause inbox, auto daily prompt, discover opt-in,
-- background photo, social links.
alter table public.ngl_profiles
  add column if not exists paused boolean not null default false,
  add column if not exists prompt_auto boolean not null default false,
  add column if not exists discoverable boolean not null default false,
  add column if not exists bg_url text not null default '' check (char_length(bg_url) <= 500),
  add column if not exists instagram text not null default '' check (char_length(instagram) <= 100),
  add column if not exists tiktok text not null default '' check (char_length(tiktok) <= 100),
  add column if not exists x_handle text not null default '' check (char_length(x_handle) <= 100);

-- 2. Message extras: hashed sender id (for blocking), archive/pin, emoji reaction.
alter table public.ngl_messages
  add column if not exists ip_hash text not null default '' check (char_length(ip_hash) = 0 or char_length(ip_hash) = 64),
  add column if not exists archived boolean not null default false,
  add column if not exists pinned boolean not null default false,
  add column if not exists reaction text check (reaction is null or reaction in ('❤️','😂','😮','🔥','😢','👍'));

-- 3. Blocked senders: owner + hashed IP. Raw IP addresses are never stored.
create table if not exists public.ngl_blocks (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) = 64),
  created_at timestamptz not null default now(),
  unique (owner_user_id, ip_hash)
);

alter table public.ngl_blocks enable row level security;
revoke all on table public.ngl_blocks from public, anon, authenticated;
grant select, insert, delete on table public.ngl_blocks to service_role;

create index if not exists ngl_blocks_owner_idx
  on public.ngl_blocks (owner_user_id, created_at desc);

-- 4. Submit: refuse paused inboxes and blocked senders, store the hashed sender.
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
  v_paused boolean;
begin
  if p_username !~ '^[A-Za-z0-9_.]{1,24}$'
     or p_message is null
     or char_length(btrim(p_message)) < 1
     or char_length(btrim(p_message)) > 500
     or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select user_id, paused into v_owner, v_paused
  from public.ngl_profiles
  where lower(username) = lower(p_username);

  if v_owner is null then
    return jsonb_build_object('status', 'USERNAME_NOT_FOUND');
  end if;

  if v_paused then
    return jsonb_build_object('status', 'PAUSED');
  end if;

  if exists (
    select 1 from public.ngl_blocks
    where owner_user_id = v_owner and ip_hash = p_ip_hash
  ) then
    return jsonb_build_object('status', 'BLOCKED');
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

  insert into public.ngl_messages (owner_user_id, username, message, ip_hash)
  values (v_owner, p_username, btrim(p_message), p_ip_hash);

  return jsonb_build_object('status', 'OK');
end;
$$;

revoke all on function public.submit_ngl_anonymous_message(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_ngl_anonymous_message(text, text, text) to service_role;
