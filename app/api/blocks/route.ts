import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Blocked senders: the owner blocks the (hashed) sender of one of their
// messages; future messages from that sender are refused by the submit RPC
// with status BLOCKED. Raw IP addresses are never stored or returned —
// only the sha256 hash, which the owner cannot reverse.
async function authenticate(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { admin: supabase, user: data.user };
}

const ipHashPattern = /^[a-f0-9]{64}$/;

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ error: "Login dulu ya." }, { status: 401 });
  const { data, error } = await auth.admin
    .from("ngl_blocks")
    .select("ip_hash, created_at")
    .eq("owner_user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("NGL blocks read failed:", error.code);
    return NextResponse.json({ error: "Daftar blokir gagal dimuat." }, { status: 500 });
  }
  return NextResponse.json({ blocks: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ error: "Login dulu ya." }, { status: 401 });
  let body: { messageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }
  const messageId = typeof body.messageId === "number" ? body.messageId : NaN;
  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ error: "messageId tidak valid." }, { status: 400 });
  }
  const { data: message, error: messageError } = await auth.admin
    .from("ngl_messages")
    .select("ip_hash")
    .eq("id", messageId)
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (messageError) {
    console.error("NGL block message read failed:", messageError.code);
    return NextResponse.json({ error: "Pesan gagal dibaca." }, { status: 500 });
  }
  if (!message) return NextResponse.json({ error: "Pesan tidak ditemukan." }, { status: 404 });
  if (!message.ip_hash || !ipHashPattern.test(message.ip_hash)) {
    return NextResponse.json({ error: "Pengirim pesan lama tidak bisa diblokir (tidak ada jejak pengirim)." }, { status: 400 });
  }
  const { error } = await auth.admin.from("ngl_blocks").upsert(
    { owner_user_id: auth.user.id, ip_hash: message.ip_hash },
    { onConflict: "owner_user_id,ip_hash" },
  );
  if (error) {
    console.error("NGL block insert failed:", error.code);
    return NextResponse.json({ error: "Gagal memblokir pengirim." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ error: "Login dulu ya." }, { status: 401 });
  const ipHash = (new URL(request.url).searchParams.get("ip_hash") || "").trim();
  if (!ipHashPattern.test(ipHash)) {
    return NextResponse.json({ error: "ip_hash tidak valid." }, { status: 400 });
  }
  const { error } = await auth.admin
    .from("ngl_blocks")
    .delete()
    .eq("owner_user_id", auth.user.id)
    .eq("ip_hash", ipHash);
  if (error) {
    console.error("NGL block delete failed:", error.code);
    return NextResponse.json({ error: "Gagal membuka blokir." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
