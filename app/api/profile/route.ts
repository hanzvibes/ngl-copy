import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isThemeId } from "@/lib/themes";

export const runtime = "nodejs";
const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;

const PROFILE_COLUMNS = "username, created_at, bio, avatar_url, theme, prompt";

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

function readBody(request: Request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return { error: "Kirim data sebagai JSON.", status: 415 };
  }
  if (Number(request.headers.get("content-length") || 0) > 8_192) {
    return { error: "Request terlalu besar.", status: 413 };
  }
  return null;
}

export async function GET(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });
  // Full columns first; fall back to the pre-migration shape so the dashboard
  // still loads before migration 202610300003 is applied.
  const { data, error } = await c.admin.from("ngl_profiles").select(PROFILE_COLUMNS).eq("user_id", user.id).maybeSingle();
  if (!error) return NextResponse.json({ profile: data });
  const legacy = await c.admin.from("ngl_profiles").select("username, created_at").eq("user_id", user.id).maybeSingle();
  if (legacy.error) return NextResponse.json({ error: "Profil gagal dimuat." }, { status: 500 });
  return NextResponse.json({
    profile: legacy.data
      ? { ...legacy.data, bio: "", avatar_url: "", theme: "pink", prompt: "" }
      : null,
  });
}

export async function POST(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });

  const bodyError = readBody(request);
  if (bodyError) return NextResponse.json({ error: bodyError.error }, { status: bodyError.status });
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

    const { data: existing } = await c.admin.from("ngl_profiles").select(PROFILE_COLUMNS).eq("user_id", user.id).maybeSingle();
    if (existing) return NextResponse.json({ profile: existing }, { status: 200 });

    const { data, error } = await c.admin.from("ngl_profiles").insert({ user_id: user.id, username }).select(PROFILE_COLUMNS).single();
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

// Update the custom profile: bio (max 160 chars), avatar image URL (must be
// https, max 500 chars), theme and custom link question (max 140 chars).
// Username itself cannot change here — it can only be claimed once, via POST.
export async function PATCH(request: Request) {
  const c = clients();
  if (!c) return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Silakan login ulang." }, { status: 401 });

  const bodyError = readBody(request);
  if (bodyError) return NextResponse.json({ error: bodyError.error }, { status: bodyError.status });
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 8_192) {
      return NextResponse.json({ error: "Request terlalu besar." }, { status: 413 });
    }
    const body = JSON.parse(rawBody);
    const updates: { bio?: string; avatar_url?: string; theme?: string; prompt?: string } = {};
    if (typeof body.bio === "string") {
      const bio = body.bio.trim();
      if (bio.length > 160) return NextResponse.json({ error: "Bio maksimal 160 karakter." }, { status: 400 });
      updates.bio = bio;
    }
    if (typeof body.avatar_url === "string") {
      const avatarUrl = body.avatar_url.trim();
      if (avatarUrl !== "" && avatarUrl.length > 500) {
        return NextResponse.json({ error: "URL foto terlalu panjang." }, { status: 400 });
      }
      if (avatarUrl !== "") {
        let parsed: URL;
        try {
          parsed = new URL(avatarUrl);
        } catch {
          return NextResponse.json({ error: "URL foto harus diawali https://." }, { status: 400 });
        }
        if (parsed.protocol !== "https:") {
          return NextResponse.json({ error: "URL foto harus diawali https://." }, { status: 400 });
        }
      }
      updates.avatar_url = avatarUrl;
    }
    if (typeof body.theme === "string") {
      if (!isThemeId(body.theme)) return NextResponse.json({ error: "Tema tidak dikenal." }, { status: 400 });
      updates.theme = body.theme;
    }
    if (typeof body.prompt === "string") {
      const prompt = body.prompt.trim();
      if (prompt.length > 140) return NextResponse.json({ error: "Pertanyaan maksimal 140 karakter." }, { status: 400 });
      updates.prompt = prompt;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Tidak ada perubahan profil." }, { status: 400 });
    }

    const { data, error } = await c.admin.from("ngl_profiles")
      .update(updates).eq("user_id", user.id).select(PROFILE_COLUMNS).maybeSingle();
    if (error) {
      console.error("NGL profile update failed:", error.code);
      return NextResponse.json(
        { error: "Profil belum bisa disimpan. Pastikan migrasi terbaru sudah diterapkan di Supabase." },
        { status: 500 },
      );
    }
    if (!data) return NextResponse.json({ error: "Profil tidak ditemukan. Klaim username dulu." }, { status: 404 });
    return NextResponse.json({ profile: data });
  } catch {
    return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
  }
}
