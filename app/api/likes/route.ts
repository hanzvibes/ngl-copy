import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "";
  return forwarded.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ipHash(request: Request): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY as string)
    .update(getClientIp(request))
    .digest("hex");
}

// GET ?message_id= — like count and whether this visitor liked it.
export async function GET(request: Request) {
  const supabase = admin();
  if (!supabase) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const messageId = new URL(request.url).searchParams.get("message_id") || "";
  if (!/^\d{1,19}$/.test(messageId)) {
    return NextResponse.json({ error: "ID pesan tidak valid." }, { status: 400 });
  }
  const { data, count } = await supabase
    .from("ngl_likes")
    .select("ip_hash", { count: "exact", head: false })
    .eq("message_id", messageId);
  const hash = ipHash(request);
  return NextResponse.json({ count: count ?? data?.length ?? 0, liked: (data ?? []).some((row) => row.ip_hash === hash) });
}

// POST {message_id} — toggle this visitor's like (one per hashed IP).
export async function POST(request: Request) {
  const supabase = admin();
  if (!supabase) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const messageId = typeof body?.message_id === "number" ? body.message_id : NaN;
  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ error: "ID pesan tidak valid." }, { status: 400 });
  }
  const { data: message } = await supabase
    .from("ngl_messages")
    .select("id, is_public, reply")
    .eq("id", messageId)
    .maybeSingle();
  if (!message || !message.is_public || !message.reply) {
    return NextResponse.json({ error: "Pesan tidak ditemukan." }, { status: 404 });
  }
  const hash = ipHash(request);
  const { data: existing } = await supabase
    .from("ngl_likes")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("ip_hash", hash)
    .maybeSingle();
  if (existing) {
    await supabase.from("ngl_likes").delete().eq("message_id", messageId).eq("ip_hash", hash);
    return NextResponse.json({ liked: false });
  }
  const { error } = await supabase.from("ngl_likes").insert({ message_id: messageId, ip_hash: hash });
  if (error) return NextResponse.json({ error: "Like gagal disimpan." }, { status: 500 });
  return NextResponse.json({ liked: true });
}
