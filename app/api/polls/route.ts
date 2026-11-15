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

// GET ?message_id= — the poll on one answered message, with live counts
// and which option this visitor voted for (by hashed IP, never stored raw).
export async function GET(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const messageId = new URL(request.url).searchParams.get("message_id") || "";
  if (!/^\d{1,19}$/.test(messageId)) {
    return NextResponse.json({ error: "ID pesan tidak valid." }, { status: 400 });
  }
  const { data: poll } = await c.admin
    .from("ngl_polls")
    .select("id, message_id, question, options")
    .eq("message_id", messageId)
    .maybeSingle();
  if (!poll) return NextResponse.json({ poll: null });
  const { data: votes } = await c.admin
    .from("ngl_poll_votes")
    .select("option_index, ip_hash")
    .eq("poll_id", poll.id);
  const counts = (poll.options as string[]).map(() => 0);
  let votedIndex: number | null = null;
  const ipHash = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY as string)
    .update(getClientIp(request))
    .digest("hex");
  for (const vote of votes ?? []) {
    if (vote.option_index >= 0 && vote.option_index < counts.length) counts[vote.option_index]++;
    if (vote.ip_hash === ipHash) votedIndex = vote.option_index;
  }
  return NextResponse.json({
    poll: { id: poll.id, message_id: poll.message_id, question: poll.question, options: poll.options, counts, total: votes?.length ?? 0, votedIndex },
  });
}

export async function POST(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
  }

  // Create a poll on one of your own answered messages.
  if (typeof body.message_id === "number" && typeof body.question === "string" && Array.isArray(body.options)) {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
    const question = body.question.trim();
    const options = (body.options as unknown[]).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
    if (question.length < 1 || question.length > 140 || options.length < 2) {
      return NextResponse.json({ error: "Polling butuh pertanyaan dan minimal 2 pilihan." }, { status: 400 });
    }
    const { data: message } = await c.admin
      .from("ngl_messages")
      .select("id, owner_user_id")
      .eq("id", body.message_id)
      .maybeSingle();
    if (!message || message.owner_user_id !== user.id) {
      return NextResponse.json({ error: "Pesan tidak ditemukan." }, { status: 404 });
    }
    const { data, error } = await c.admin
      .from("ngl_polls")
      .upsert({ message_id: body.message_id, owner_user_id: user.id, question, options }, { onConflict: "message_id" })
      .select("id, message_id, question, options")
      .single();
    if (error) return NextResponse.json({ error: "Polling gagal disimpan." }, { status: 500 });
    return NextResponse.json({ poll: data }, { status: 201 });
  }

  // Vote on a poll (anonymous, one vote per hashed IP; re-voting moves it).
  if (typeof body.poll_id === "number" && typeof body.option_index === "number") {
    if (!Number.isInteger(body.option_index) || body.option_index < 0 || body.option_index > 3) {
      return NextResponse.json({ error: "Pilihan tidak valid." }, { status: 400 });
    }
    const { data: poll } = await c.admin
      .from("ngl_polls")
      .select("id, options")
      .eq("id", body.poll_id)
      .maybeSingle();
    if (!poll || body.option_index >= (poll.options as string[]).length) {
      return NextResponse.json({ error: "Polling tidak ditemukan." }, { status: 404 });
    }
    const ipHash = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY as string)
      .update(getClientIp(request))
      .digest("hex");
    const { error } = await c.admin.from("ngl_poll_votes").upsert(
      { poll_id: body.poll_id, option_index: body.option_index, ip_hash: ipHash },
      { onConflict: "poll_id,ip_hash" },
    );
    if (error) return NextResponse.json({ error: "Vote gagal disimpan." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
}
