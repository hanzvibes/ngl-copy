import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!usernamePattern.test(username)) return NextResponse.json({ error: "That username doesn't look right." }, { status: 400 });
    if (!message || message.length > 500) return NextResponse.json({ error: "Messages must be between 1 and 500 characters." }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: "Message storage isn't configured yet. The site owner needs to connect Supabase first." }, { status: 503 });

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.from("messages").insert({ username, message });
    if (error) {
      console.error("Message insert failed:", error.code);
      return NextResponse.json({ error: "We couldn't save that message. Please try again later." }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request. Please try again." }, { status: 400 });
  }
}
