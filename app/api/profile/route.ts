import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;

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

export async function GET(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  const { data, error } = await c.admin.from("ngl_profiles").select("username, created_at").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Profil gagal dimuat." }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function POST(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
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
    const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
    if (!usernamePattern.test(username)) {
      return NextResponse.json({ error: "Username 1–24 karakter: huruf, angka, titik, atau underscore." }, { status: 400 });
    }

    const { data: existing } = await c.admin.from("ngl_profiles").select("username").eq("user_id", user.id).maybeSingle();
    if (existing) return NextResponse.json({ profile: existing }, { status: 200 });

    const { data, error } = await c.admin.from("ngl_profiles").insert({ user_id: user.id, username }).select("username, created_at").single();
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Username sudah dipakai. Coba username lain." }, { status: 409 });
    }
    if (error || !data) {
      console.error("NGL profile creation failed:", error?.code);
      return NextResponse.json({ error: "Profil belum bisa dibuat. Coba lagi." }, { status: 500 });
    }
    return NextResponse.json({ profile: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
  }
}
