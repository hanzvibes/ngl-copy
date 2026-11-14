-- NGL Copy feature batch: custom profiles, message replies, likes and read
-- state. Additive only: existing FinanceTracker/Kasir and NGL data untouched.
-- Apply after 202610300002_profiles_and_inbox.sql.
-- New columns are nullable / defaulted, so rows created before this migration
-- keep working: bio/avatar/theme fall back to defaults, reply is empty,
-- liked and is_read are false.

-- 1. Custom profile: bio, avatar image URL and colour theme.
alter table public.ngl_profiles
  add column if not exists bio text not null default '' check (char_length(bio) <= 160),
  add column if not exists avatar_url text not null default '' check (char_length(avatar_url) <= 500),
  add column if not exists theme text not null default 'pink'
    check (theme in ('pink', 'purple', 'orange', 'mint', 'midnight'));

-- 2. Message replies, likes and read state.
alter table public.ngl_messages
  add column if not exists reply text check (reply is null or char_length(reply) <= 500),
  add column if not exists liked boolean not null default false,
  add column if not exists is_read boolean not null default false;

-- 3. Owners may update (reply / like / mark read) their own messages.
-- Reads and deletes were already owner-scoped; the API uses the service-role
-- key, this policy keeps direct authenticated access consistent.
drop policy if exists "Owners can update their own NGL messages" on public.ngl_messages;
create policy "Owners can update their own NGL messages"
  on public.ngl_messages for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

grant update on table public.ngl_messages to authenticated;
