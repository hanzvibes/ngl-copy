import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MESSAGE_COLUMNS = "id, message, created_at, reply, liked, is_read, is_public";

type InboxRow = {
  id: number;
  message: string;
  created_at: string;
  reply: string | null;
  liked: boolean;
  is_read: boolean;
  is_public: boolean;
};

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

function statsFor(rows: Pick<InboxRow, "created_at" | "liked" | "is_read">[]) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  return {
    total: rows.length,
    today: rows.filter((row) => new Date(row.created_at) >= todayStart).length,
    liked: rows.filter((row) => row.liked).length,
    unread: rows.filter((row) => !row.is_read).length,
  };
}

export async function GET(request: Request) {
  const { c, user } = await authenticate(request);
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });

  const { data, error } = await c.admin.from("ngl_messages")
    .select(MESSAGE_COLUMNS)
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!error) {
    const rows = (data ?? []) as InboxRow[];
    return NextResponse.json({ messages: rows, stats: statsFor(rows) });
  }
  // Pre-migration fallback: old rows have no reply/liked/is_read columns.
  const legacy = await c.admin.from("ngl_messages")
    .select("id, message, created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (legacy.error) {
    console.error("NGL inbox read failed:", legacy.error.code);
    return NextResponse.json({ error: "Inbox gagal dimuat." }, { status: 500 });
  }
  const rows: InboxRow[] = (legacy.data ?? []).map((row) => ({
    ...row,
    reply: null,
    liked: false,
    is_read: false,
    is_public: false,
  }));
  return NextResponse.json({ messages: rows, stats: statsFor(rows) });
}

// Update one owned message: save/clear a reply (max 500 chars), toggle like,
// mark read/unread, or publish/unpublish it to the public answers feed.
// At least one of the four must be present.
export async function PATCH(request: Request) {
  const { c, user } = await authenticate(request);
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });

  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Kirim data sebagai JSON." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") || 0) > 8_192) {
    return NextResponse.json({ error: "Request terlalu besar." }, { status: 413 });
  }
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 8_192) {
      return NextResponse.json({ error: "Request terlalu besar." }, { status: 413 });
    }
    const body = JSON.parse(rawBody);
    const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "";
    if (!/^\d{1,19}$/.test(id)) return NextResponse.json({ error: "ID pesan tidak valid." }, { status: 400 });

    const updates: { reply?: string | null; liked?: boolean; is_read?: boolean; is_public?: boolean } = {};
    if (typeof body.reply === "string") {
      const reply = body.reply.trim();
      if (reply.length > 500) return NextResponse.json({ error: "Balasan maksimal 500 karakter." }, { status: 400 });
      updates.reply = reply === "" ? null : reply;
    }
    if (typeof body.liked === "boolean") updates.liked = body.liked;
    if (typeof body.is_read === "boolean") updates.is_read = body.is_read;
    if (typeof body.is_public === "boolean") updates.is_public = body.is_public;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Tidak ada perubahan pesan." }, { status: 400 });
    }

    const { data, error } = await c.admin.from("ngl_messages")
      .update(updates).eq("id", id).eq("owner_user_id", user.id)
      .select(MESSAGE_COLUMNS).maybeSingle();
    if (error) {
      console.error("NGL inbox update failed:", error.code);
      return NextResponse.json(
        { error: "Pesan belum bisa disimpan. Pastikan migrasi terbaru sudah diterapkan di Supabase." },
        { status: 500 },
      );
    }
    if (!data) return NextResponse.json({ error: "Pesan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ message: data });
  } catch {
    return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { c, user } = await authenticate(request);
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });

  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Kirim data sebagai JSON." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") || 0) > 8_192) {
    return NextResponse.json({ error: "Request terlalu besar." }, { status: 413 });
  }
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 8_192) {
      return NextResponse.json({ error: "Request terlalu besar." }, { status: 413 });
    }
    const body = JSON.parse(rawBody);
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
