import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return {
    auth: createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function getUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const c = clients();
  if (!c) return null;
  const { data, error } = await c.auth.auth.getUser(token);
  return error ? null : data.user;
}

// GET — how many devices this user has push enabled on.
export async function GET(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  const { count } = await c.admin
    .from("ngl_push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  return NextResponse.json({ count: count ?? 0 });
}

// POST — save this device's push subscription (one row per endpoint).
export async function POST(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth || endpoint.length > 1000) {
    return NextResponse.json({ error: "Subscription tidak valid." }, { status: 400 });
  }
  const { error } = await c.admin.from("ngl_push_subscriptions").upsert(
    { user_id: user.id, endpoint, p256dh, auth },
    { onConflict: "user_id,endpoint" },
  );
  if (error) return NextResponse.json({ error: "Subscription gagal disimpan." }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE — remove this device's subscription.
export async function DELETE(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Endpoint tidak valid." }, { status: 400 });
  await c.admin.from("ngl_push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
