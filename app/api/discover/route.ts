import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Public Discover feed: profiles whose owner opted in (discoverable = true).
// Only public fields are returned, newest first, max 20.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("ngl_profiles")
    .select("username, bio, avatar_url, theme, prompt")
    .eq("discoverable", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("NGL discover read failed:", error.code);
    return NextResponse.json({ error: "Discover gagal dimuat." }, { status: 500 });
  }
  return NextResponse.json({ profiles: data ?? [] });
}
