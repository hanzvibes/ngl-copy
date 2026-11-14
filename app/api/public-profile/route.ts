import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;

// Public profile lookup for the send page: only the fields a sender may see
// (username, bio, avatar, theme). No auth needed. Returns 404 when the link
// isn't claimed yet, so the send page can fall back to its default look.
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  const username = (new URL(request.url).searchParams.get("username") || "")
    .trim()
    .replace(/^@/, "");
  if (!usernamePattern.test(username)) {
    return NextResponse.json({ error: "Username tidak valid." }, { status: 400 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("ngl_profiles")
    .select("username, bio, avatar_url, theme, prompt, prompt_auto, paused, bg_url, instagram, tiktok, x_handle")
    .ilike("username", username)
    .maybeSingle();
  if (error) {
    console.error("NGL public profile read failed:", error.code);
    return NextResponse.json({ error: "Profil gagal dimuat." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Link ini belum aktif." }, { status: 404 });
  return NextResponse.json({ profile: data });
}
