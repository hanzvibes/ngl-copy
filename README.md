# NGL Copy

A responsive anonymous-message app inspired by the anonymous Q&A format. Built with Next.js App Router and designed for Vercel.

## Run locally

```bash
npm install
npm run dev
```

## Supabase setup

Use a **dedicated Supabase project for NGL Copy**. Do not apply this schema to unrelated production databases.

1. Open the Supabase SQL Editor for the NGL Copy project.
2. Run the migration at `supabase/migrations/202610300001_messages_and_rate_limit.sql`.
3. In Vercel → Project Settings → Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL`: the project's URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key. Never prefix it with `NEXT_PUBLIC_`.
4. Redeploy after setting the variables.

The migration enables RLS, denies public table access, and uses a server-only RPC to validate messages and limit each hashed IP to five accepted submissions per hour. Raw IP addresses are not stored. This is a baseline abuse control, not a substitute for monitoring and moderation.

## Verification

GitHub Actions runs `npm run typecheck` and `npm run build` on pushes to `main` and pull requests. A green workflow is required before claiming CI verification.

## Deploy to Vercel

Import `https://github.com/hanzvibes/ngl-copy` as a Next.js project. Keep the root directory at `.`, use the default build command `npm run build`, and add the environment variables above only after the dedicated Supabase project is ready.

Until Supabase is configured, the message form deliberately returns a setup error instead of pretending a message was saved.
