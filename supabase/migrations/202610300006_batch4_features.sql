-- NGL Copy batch 4: all 20 new-feature suggestions + collaboration.
-- Additive only: existing data untouched. Apply after 202610300005.
-- New profile columns are defaulted, so rows created before this migration
-- keep working. New tables are service_role only (all access goes through
-- the API routes); the media bucket is public-read because voice notes
-- come from anonymous senders.

-- 1. Profile extras: custom blocked words, friends-only mode + code,
-- auto-reply while paused, custom theme colours, Spotify link.
alter table public.ngl_profiles
  add column if not exists blocked_words text[] not null default '{}',
  add column if not exists friends_only boolean not null default false,
  add column if not exists friends_code text not null default '' check (char_length(friends_code) <= 24),
  add column if not exists auto_reply text not null default '' check (char_length(auto_reply) <= 200),
  add column if not exists custom_bg text not null default '' check (char_length(custom_bg) = 0 or char_length(custom_bg) = 7),
  add column if not exists custom_bg2 text not null default '' check (char_length(custom_bg2) = 0 or char_length(custom_bg2) = 7),
  add column if not exists spotify_url text not null default '' check (char_length(spotify_url) <= 500);

-- 2. Messages: follow-up threads, voice/image attachments, reply photos.
alter table public.ngl_messages
  add column if not exists parent_id bigint references public.ngl_messages(id) on delete set null,
  add column if not exists media_url text check (media_url is null or char_length(media_url) <= 500),
  add column if not exists media_kind text check (media_kind is null or media_kind in ('audio', 'image')),
  add column if not exists reply_media_url text check (reply_media_url is null or char_length(reply_media_url) <= 500),
  add column if not exists reply_media_kind text check (reply_media_kind is null or reply_media_kind in ('image'));

create index if not exists ngl_messages_parent_idx
  on public.ngl_messages (parent_id, created_at desc);

-- 3. Polls attached to a reply, and one vote per hashed sender.
create table if not exists public.ngl_polls (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.ngl_messages(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 140),
  options jsonb not null check (jsonb_array_length(options) between 2 and 4),
  created_at timestamptz not null default now(),
  unique (message_id)
);

create table if not exists public.ngl_poll_votes (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.ngl_polls(id) on delete cascade,
  option_index integer not null check (option_index between 0 and 3),
  ip_hash text not null check (char_length(ip_hash) = 64),
  created_at timestamptz not null default now(),
  unique (poll_id, ip_hash)
);

create index if not exists ngl_poll_votes_poll_idx
  on public.ngl_poll_votes (poll_id);

-- 4. Public likes on answered messages (one per hashed sender).
create table if not exists public.ngl_likes (
  message_id bigint not null references public.ngl_messages(id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) = 64),
  created_at timestamptz not null default now(),
  primary key (message_id, ip_hash)
);

create index if not exists ngl_likes_message_idx
  on public.ngl_likes (message_id);

-- 5. Web Push subscriptions (one per device per user).
create table if not exists public.ngl_push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists ngl_push_subscriptions_user_idx
  on public.ngl_push_subscriptions (user_id);

-- 6. Collaborators: another user who may read and reply in your inbox.
create table if not exists public.ngl_collaborators (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collaborator_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, collaborator_id),
  check (owner_id <> collaborator_id)
);

create index if not exists ngl_collaborators_collab_idx
  on public.ngl_collaborators (collaborator_id);

-- RLS on the new tables: service_role only (API routes mediate everything).
alter table public.ngl_polls enable row level security;
alter table public.ngl_poll_votes enable row level security;
alter table public.ngl_likes enable row level security;
alter table public.ngl_push_subscriptions enable row level security;
alter table public.ngl_collaborators enable row level security;
revoke all on table public.ngl_polls from public, anon, authenticated;
revoke all on table public.ngl_poll_votes from public, anon, authenticated;
revoke all on table public.ngl_likes from public, anon, authenticated;
revoke all on table public.ngl_push_subscriptions from public, anon, authenticated;
revoke all on table public.ngl_collaborators from public, anon, authenticated;
grant select, insert, update, delete on table public.ngl_polls to service_role;
grant select, insert, update, delete on table public.ngl_poll_votes to service_role;
grant select, insert, update, delete on table public.ngl_likes to service_role;
grant select, insert, update, delete on table public.ngl_push_subscriptions to service_role;
grant select, insert, update, delete on table public.ngl_collaborators to service_role;

-- Collaborators may read and update the owner's messages.
drop policy if exists "Collaborators can read owner's NGL messages" on public.ngl_messages;
create policy "Collaborators can read owner's NGL messages" on public.ngl_messages
  for select using (exists (
    select 1 from public.ngl_collaborators
    where owner_id = ngl_messages.owner_user_id and collaborator_id = auth.uid()
  ));
drop policy if exists "Collaborators can update owner's NGL messages" on public.ngl_messages;
create policy "Collaborators can update owner's NGL messages" on public.ngl_messages
  for update using (exists (
    select 1 from public.ngl_collaborators
    where owner_id = ngl_messages.owner_user_id and collaborator_id = auth.uid()
  ));

-- 7. Media bucket for voice notes and reply photos. Public read; anyone may
-- upload (voice notes come from anonymous senders). The app caps uploads
-- at 5 MB client-side.
insert into storage.buckets (id, name, public)
  values ('ngl-media', 'ngl-media', true)
  on conflict (id) do nothing;

drop policy if exists "Anyone can read NGL media" on storage.objects;
create policy "Anyone can read NGL media" on storage.objects
  for select using (bucket_id = 'ngl-media');
drop policy if exists "Anyone can upload NGL media" on storage.objects;
create policy "Anyone can upload NGL media" on storage.objects
  for insert with check (bucket_id = 'ngl-media');

-- 8. Submit function, extended: friends-only code, custom blocked words,
-- follow-up threads, voice/image attachments. The old 3-argument version
-- is replaced (drop first: create or replace only matches the same
-- signature).
drop function if exists public.submit_ngl_anonymous_message(text, text, text);

create or replace function public.submit_ngl_anonymous_message(
  p_username text,
  p_message text,
  p_ip_hash text,
  p_parent_id bigint default null,
  p_media_url text default null,
  p_media_kind text default null,
  p_friends_code text default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_owner uuid;
  v_paused boolean;
  v_friends_only boolean;
  v_friends_code text;
  v_blocked_words text[];
  v_word text;
  v_parent_owner uuid;
begin
  if p_username !~ '^[A-Za-z0-9_.]{1,24}$'
     or p_message is null
     or char_length(btrim(p_message)) > 500
     or (char_length(btrim(p_message)) < 1 and p_media_url is null)
     or p_ip_hash !~ '^[a-f0-9]{64}$'
     or (p_media_url is not null and (char_length(p_media_url) > 500 or p_media_kind not in ('audio', 'image')))
     or (p_media_kind is not null and p_media_url is null) then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select user_id, paused, friends_only, friends_code, blocked_words
    into v_owner, v_paused, v_friends_only, v_friends_code, v_blocked_words
  from public.ngl_profiles
  where lower(username) = lower(p_username);

  if v_owner is null then
    return jsonb_build_object('status', 'USERNAME_NOT_FOUND');
  end if;

  if v_paused then
    return jsonb_build_object('status', 'PAUSED');
  end if;

  if v_friends_only and (p_friends_code is null or p_friends_code <> v_friends_code) then
    return jsonb_build_object('status', 'FRIENDS_ONLY');
  end if;

  -- Custom blocked words: case-insensitive substring match.
  if v_blocked_words is not null then
    foreach v_word in array v_blocked_words loop
      if v_word <> '' and position(lower(v_word) in lower(p_message)) > 0 then
        return jsonb_build_object('status', 'BLOCKED_WORD');
      end if;
    end loop;
  end if;

  if exists (
    select 1 from public.ngl_blocks
    where owner_user_id = v_owner and ip_hash = p_ip_hash
  ) then
    return jsonb_build_object('status', 'BLOCKED');
  end if;

  if p_parent_id is not null then
    select owner_user_id into v_parent_owner
    from public.ngl_messages where id = p_parent_id;
    if v_parent_owner is null or v_parent_owner <> v_owner then
      return jsonb_build_object('status', 'INVALID_INPUT');
    end if;
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

  insert into public.ngl_messages (owner_user_id, username, message, ip_hash, parent_id, media_url, media_kind)
  values (v_owner, p_username, btrim(p_message), p_ip_hash, p_parent_id, p_media_url, p_media_kind);

  return jsonb_build_object('status', 'OK');
end;
$$;

revoke all on function public.submit_ngl_anonymous_message(text, text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_ngl_anonymous_message(text, text, text, bigint, text, text, text) to service_role;
