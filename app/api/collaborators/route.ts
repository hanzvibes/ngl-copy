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

// GET — who I added as collaborators, and whose inbox I collaborate on.
export async function GET(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  const { data: mine } = await c.admin
    .from("ngl_collaborators")
    .select("id, collaborator_id, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const { data: inboxOf } = await c.admin
    .from("ngl_collaborators")
    .select("id, owner_id, created_at")
    .eq("collaborator_id", user.id)
    .order("created_at", { ascending: false });
  const userIds = [...new Set([...(mine ?? []).map((r) => r.collaborator_id), ...(inboxOf ?? []).map((r) => r.owner_id)])];
  const names: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await c.admin.from("ngl_profiles").select("user_id, username").in("user_id", userIds);
    for (const p of profiles ?? []) names[p.user_id] = p.username;
  }
  return NextResponse.json({
    mine: (mine ?? []).map((r) => ({ id: r.id, username: names[r.collaborator_id] ?? "?", created_at: r.created_at })),
    inboxOf: (inboxOf ?? []).map((r) => ({ id: r.id, owner_id: r.owner_id, username: names[r.owner_id] ?? "?", created_at: r.created_at })),
  });
}

// POST {username} — add a collaborator to my inbox.
export async function POST(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().replace(/^@/, "") : "";
  if (!/^[a-zA-Z0-9_.]{1,24}$/.test(username)) {
    return NextResponse.json({ error: "Username tidak valid." }, { status: 400 });
  }
  const { data: target } = await c.admin
    .from("ngl_profiles")
    .select("user_id, username")
    .ilike("username", username)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Username tidak ditemukan." }, { status: 404 });
  if (target.user_id === user.id) {
    return NextResponse.json({ error: "Itu username kamu sendiri." }, { status: 400 });
  }
  const { error } = await c.admin.from("ngl_collaborators").insert({ owner_id: user.id, collaborator_id: target.user_id });
  if (error?.code === "23505") {
    return NextResponse.json({ error: "Sudah jadi kolaborator." }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: "Kolaborator gagal ditambahkan." }, { status: 500 });
  return NextResponse.json({ ok: true, username: target.username }, { status: 201 });
}

// DELETE {id} — remove a collaborator I added.
export async function DELETE(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "number" ? body.id : NaN;
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  const { data } = await c.admin
    .from("ngl_collaborators")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Kolaborator tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
