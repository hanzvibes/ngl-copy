-- NGL Copy batch 2: custom link prompt + public answers feed. Additive only:
-- existing FinanceTracker/Kasir and NGL data untouched. Apply after
-- 202610300003_new_features.sql. New columns are defaulted, so rows created
-- before this migration keep working: prompt is empty, is_public is false.

-- 1. Custom question shown on the owner's public link (max 140 chars).
alter table public.ngl_profiles
  add column if not exists prompt text not null default '' check (char_length(prompt) <= 140);

-- 2. Owner-chosen public answers: only messages the owner marked public AND
-- replied to are shown on the public feed. Default false = stays private.
alter table public.ngl_messages
  add column if not exists is_public boolean not null default false;

create index if not exists ngl_messages_public_idx
  on public.ngl_messages (owner_user_id, created_at desc) where is_public;
