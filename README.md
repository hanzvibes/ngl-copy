# NGL Copy

A premium, responsive anonymous-message app inspired by the anonymous Q&A format. Built with Next.js App Router, Supabase Auth/Postgres, and designed for Vercel.

## Run locally

```bash
npm install
npm run dev
```

## Environment variables

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/anon key used by browser auth.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key. Never prefix this with `NEXT_PUBLIC_`.

## Supabase setup

The project currently uses the existing FinanceTracker Supabase project with isolated `ngl_`-prefixed objects. The migrations are additive; they do not modify or delete existing FinanceTracker/Kasir tables or records.

Apply these migrations in order if setting up a fresh environment:
1. `supabase/migrations/202610300001_messages_and_rate_limit.sql`
2. `supabase/migrations/202610300002_profiles_and_inbox.sql`
3. `supabase/migrations/202610300003_new_features.sql`
4. `supabase/migrations/202610300004_custom_prompt_public_answers.sql`

The third migration adds custom profiles (bio, avatar URL, theme), message
replies, likes and read state. It is additive: if it has not been applied yet,
the dashboard and send page keep working with defaults, but saving a reply,
like, read state or profile customisation will fail until it is applied. The
fourth migration adds the custom link question and the public-answers flag,
with the same fallback behaviour.

The second migration adds owner-bound profiles and private inbox access. Public messages are accepted only for a claimed username. Owners can read/delete only their own messages. The API validates Supabase access tokens before performing service-role queries, and the service-role key is server-only.

The submit endpoint limits each hashed client IP to five accepted messages per hour. Raw IP addresses are not stored. This is a baseline abuse control, not a substitute for monitoring and moderation.

In Supabase Auth settings, configure the site's allowed redirect URLs and email confirmation policy before enabling public signups. Use the production domain and localhost for development as appropriate.

## Features

- **Custom profile** — in the dashboard, set a bio (max 160 characters), a
  photo URL (https only) and one of five colour themes. They show on your
  public `/{username}` link.
- **Random questions** — on the send page, "Roll a question" fills the box
  with a prompt, NGL-style, so senders never stare at a blank box.
- **Replies + Story share** — reply to any inbox message from the dashboard,
  then "Share to Story" renders a 1080×1920 card (message + your reply) and
  opens the native share sheet, or downloads the PNG to upload to Instagram.
- **Inbox stats, likes and read state** — totals for all / today / liked /
  unread, filters for All / Unread / Liked, a heart to like a message and a
  toggle to mark it read or unread.
- **Custom link question** — set your own question (max 140 characters) in
  the dashboard; it shows on your public link instead of the generic text.
- **QR link card** — a QR preview lives in the dashboard, and "Download link
  card" renders a 1080×1920 card with your question and QR code to post to
  your story.
- **Public answers feed** — reply to a message, tap Publish, and it appears
  on your public link for everyone to read. Unpublish any time.

## Verification

GitHub Actions runs `npm run typecheck` and `npm run build` on pushes to `main` and pull requests. A green workflow is required before claiming CI verification. End-to-end auth, message submission, inbox isolation, and deletion still need live testing after the environment is configured.

## Deploy to Vercel

Import `https://github.com/hanzvibes/ngl-copy` as a Next.js project. Keep root directory `.` and build command `npm run build`. Add the three environment variables above. Re-check Supabase Auth redirect URLs after the final domain is known.

Until valid Supabase configuration and a claimed username exist, the message form deliberately returns an error rather than pretending a message was saved.
