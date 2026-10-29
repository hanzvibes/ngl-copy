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

async function authenticate(request: Request) {
  const c = clients();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!c || !token) return { c, user: null };
  const { data, error } = await c.auth.auth.getUser(token);
  return { c, user: error ? null : data.user };
}

export async function GET(request: Request) {
  const { c, user } = await authenticate(request);
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });

  const { data, error } = await c.admin.from("ngl_messages")
    .select("id, message, created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("NGL inbox read failed:", error.code);
    return NextResponse.json({ error: "Inbox gagal dimuat." }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function DELETE(request: Request) {
  const { c, user } = await authenticate(request);
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });

  try {
    const body = await request.json();
    const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "";
    if (!/^\d{1,19}$/.test(id)) return NextResponse.json({ error: "ID pesan tidak valid." }, { status: 400 });

    const { data, error } = await c.admin.from("ngl_messages").delete()
      .eq("id", id).eq("owner_user_id", user.id).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: "Pesan gagal dihapus." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Pesan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
  }
}
