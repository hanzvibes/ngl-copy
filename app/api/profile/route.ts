import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isThemeId } from "@/lib/themes";

export const runtime = "nodejs";
const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;

const PROFILE_COLUMNS = "username, created_at, bio, avatar_url, theme, prompt, paused, prompt_auto, discoverable, bg_url, instagram, tiktok, x_handle, blocked_words, friends_only, friends_code, auto_reply, custom_bg, custom_bg2, spotify_url";

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
      ? { ...legacy.data, bio: "", avatar_url: "", theme: "pink", prompt: "", paused: false, prompt_auto: false, discoverable: false, bg_url: "", instagram: "", tiktok: "", x_handle: "", blocked_words: [], friends_only: false, friends_code: "", auto_reply: "", custom_bg: "", custom_bg2: "", spotify_url: "" }
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
// https, max 500 chars), theme, custom link question (max 140 chars), inbox
// pause, auto daily prompt, Discover opt-in, background photo and social
// handles. Username CAN change here (unique, case-insensitive); the old
// public link stops working after a change.
function cleanHandle(value: string): string | null {
  let handle = value.trim().replace(/^@/, "");
  const fromUrl = handle.match(/(?:instagram\.com|tiktok\.com|(?:x|twitter)\.com)\/@?([^/?#]+)/i);
  if (fromUrl) handle = fromUrl[1];
  handle = handle.replace(/\/$/, "");
  if (handle === "") return "";
  return /^[a-zA-Z0-9_.]{1,100}$/.test(handle) ? handle : null;
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
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
    const updates: { bio?: string; avatar_url?: string; theme?: string; prompt?: string; username?: string; paused?: boolean; prompt_auto?: boolean; discoverable?: boolean; bg_url?: string; instagram?: string; tiktok?: string; x_handle?: string; blocked_words?: string[]; friends_only?: boolean; friends_code?: string; auto_reply?: string; custom_bg?: string; custom_bg2?: string; spotify_url?: string } = {};
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
    if (typeof body.username === "string") {
      const newUsername = body.username.trim().replace(/^@/, "");
      if (!usernamePattern.test(newUsername)) {
        return NextResponse.json({ error: "Username 1–24 karakter: huruf, angka, titik, atau underscore." }, { status: 400 });
      }
      const { data: taken } = await c.admin.from("ngl_profiles")
        .select("user_id").ilike("username", escapeLike(newUsername)).maybeSingle();
      if (taken && taken.user_id !== user.id) {
        return NextResponse.json({ error: "Username sudah dipakai. Coba username lain." }, { status: 409 });
      }
      updates.username = newUsername;
    }
    if (typeof body.paused === "boolean") updates.paused = body.paused;
    if (typeof body.prompt_auto === "boolean") updates.prompt_auto = body.prompt_auto;
    if (typeof body.discoverable === "boolean") updates.discoverable = body.discoverable;
    if (typeof body.bg_url === "string") {
      const bgUrl = body.bg_url.trim();
      if (bgUrl !== "" && bgUrl.length > 500) {
        return NextResponse.json({ error: "URL background terlalu panjang." }, { status: 400 });
      }
      if (bgUrl !== "") {
        let parsed: URL;
        try {
          parsed = new URL(bgUrl);
        } catch {
          return NextResponse.json({ error: "URL background harus diawali https://." }, { status: 400 });
        }
        if (parsed.protocol !== "https:") {
          return NextResponse.json({ error: "URL background harus diawali https://." }, { status: 400 });
        }
      }
      updates.bg_url = bgUrl;
    }
    if (typeof body.blocked_words === "string") {
      const words = body.blocked_words.split(",").map((w: string) => w.trim().toLowerCase()).filter((w: string) => w !== "").slice(0, 20);
      if (words.some((w: string) => w.length > 30)) return NextResponse.json({ error: "Satu kata blokir maksimal 30 karakter." }, { status: 400 });
      updates.blocked_words = words;
    }
    if (typeof body.friends_only === "boolean") updates.friends_only = body.friends_only;
    if (typeof body.friends_code === "string") {
      const code = body.friends_code.trim().replace(/\s+/g, "");
      if (code.length > 24) return NextResponse.json({ error: "Kode teman maksimal 24 karakter." }, { status: 400 });
      updates.friends_code = code;
    }
    if (typeof body.auto_reply === "string") {
      const autoReply = body.auto_reply.trim();
      if (autoReply.length > 200) return NextResponse.json({ error: "Balasan otomatis maksimal 200 karakter." }, { status: 400 });
      updates.auto_reply = autoReply;
    }
    for (const field of ["custom_bg", "custom_bg2"] as const) {
      if (typeof body[field] === "string") {
        const color = body[field].trim();
        if (color !== "" && !/^#[0-9a-fA-F]{6}$/.test(color)) {
          return NextResponse.json({ error: "Warna kustom harus format #RRGGBB." }, { status: 400 });
        }
        updates[field] = color;
      }
    }
    if (typeof body.spotify_url === "string") {
      const spotifyUrl = body.spotify_url.trim();
      if (spotifyUrl !== "" && spotifyUrl.length > 500) {
        return NextResponse.json({ error: "Link Spotify terlalu panjang." }, { status: 400 });
      }
      if (spotifyUrl !== "") {
        let parsed: URL;
        try { parsed = new URL(spotifyUrl); } catch {
          return NextResponse.json({ error: "Link Spotify harus diawali https://." }, { status: 400 });
        }
        if (parsed.protocol !== "https:" || !/(^|\.)spotify\.com$/.test(parsed.hostname) && !/(^|\.)open\.spotify\.com$/.test(parsed.hostname)) {
          return NextResponse.json({ error: "Link Spotify harus dari open.spotify.com." }, { status: 400 });
        }
      }
      updates.spotify_url = spotifyUrl;
    }
    for (const field of ["instagram", "tiktok", "x_handle"] as const) {
      if (typeof body[field] === "string") {
        const cleaned = cleanHandle(body[field]);
        if (cleaned === null) {
          return NextResponse.json({ error: "Username sosmed tidak valid." }, { status: 400 });
        }
        updates[field] = cleaned;
      }
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
