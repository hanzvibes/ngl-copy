import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;

// Public answers feed for a link: only messages the owner marked public AND
// replied to. No auth needed — everything returned here is explicitly public.
// Returns an empty list (not an error) when the link isn't claimed yet.
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
  const { data: profile, error: profileError } = await supabase
    .from("ngl_profiles")
    .select("user_id")
    .ilike("username", username)
    .maybeSingle();
  if (profileError) {
    console.error("NGL public answers profile read failed:", profileError.code);
    return NextResponse.json({ error: "Jawaban gagal dimuat." }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ answers: [] });

  const { data, error } = await supabase
    .from("ngl_messages")
    .select("id, message, reply, created_at")
    .eq("owner_user_id", profile.user_id)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("NGL public answers read failed:", error.code);
    return NextResponse.json({ error: "Jawaban gagal dimuat." }, { status: 500 });
  }
  const answers = (data ?? []).filter((row) => row.reply && row.reply.trim() !== "").slice(0, 20);
  return NextResponse.json({ answers });
}
