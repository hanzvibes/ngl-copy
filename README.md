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

The second migration adds owner-bound profiles and private inbox access. Public messages are accepted only for a claimed username. Owners can read/delete only their own messages. The API validates Supabase access tokens before performing service-role queries, and the service-role key is server-only.

The submit endpoint limits each hashed client IP to five accepted messages per hour. Raw IP addresses are not stored. This is a baseline abuse control, not a substitute for monitoring and moderation.

In Supabase Auth settings, configure the site's allowed redirect URLs and email confirmation policy before enabling public signups. Use the production domain and localhost for development as appropriate.

## Verification

GitHub Actions runs `npm run typecheck` and `npm run build` on pushes to `main` and pull requests. A green workflow is required before claiming CI verification. End-to-end auth, message submission, inbox isolation, and deletion still need live testing after the environment is configured.

## Deploy to Vercel

Import `https://github.com/hanzvibes/ngl-copy` as a Next.js project. Keep root directory `.` and build command `npm run build`. Add the three environment variables above. Re-check Supabase Auth redirect URLs after the final domain is known.

Until valid Supabase configuration and a claimed username exist, the message form deliberately returns an error rather than pretending a message was saved.
