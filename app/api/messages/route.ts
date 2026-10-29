import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;
const MAX_BODY_BYTES = 8_192;

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "";
  return forwarded.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send the message as JSON." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That message is too large." }, { status: 413 });
  }

  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!usernamePattern.test(username)) {
      return NextResponse.json({ error: "That username doesn't look right." }, { status: 400 });
    }
    if (!message || message.length > 500) {
      return NextResponse.json({ error: "Messages must be between 1 and 500 characters." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { error: "Message storage isn't configured yet. The site owner needs to connect Supabase first." },
        { status: 503 },
      );
    }

    const ipHash = createHmac("sha256", key).update(getClientIp(request)).digest("hex");
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("submit_anonymous_message", {
      p_username: username,
      p_message: message,
      p_ip_hash: ipHash,
    });

    if (error) {
      console.error("Anonymous message submission failed:", error.code);
      return NextResponse.json({ error: "We couldn't save that message. Please try again later." }, { status: 500 });
    }
    if (data?.status === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "You've sent a lot of messages recently. Please try again later." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }
    if (data?.status === "INVALID_INPUT" || data?.status === "INVALID_USERNAME") {
      return NextResponse.json({ error: "That username or message doesn't look right." }, { status: 400 });
    }
    if (data?.status !== "OK") {
      return NextResponse.json({ error: "We couldn't save that message. Please try again later." }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request. Please try again." }, { status: 400 });
  }
}
