import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { containsBadWord } from "@/lib/bad-words";
import { sendPushToUser } from "@/lib/push-server";

export const runtime = "nodejs";

const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;
const MAX_BODY_BYTES = 8_192;

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "";
  return forwarded.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

// Cloudflare Turnstile check. Skipped entirely when no secret key is
// configured (documented in README); when configured, a missing or invalid
// token is rejected. The widget on the send page only renders when the
// public site key is configured.
async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await response.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send the message as JSON." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That message is too large." }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "That message is too large." }, { status: 413 });
    }
    const body = JSON.parse(rawBody);
    const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const mediaUrl = typeof body.media_url === "string" ? body.media_url.trim() : "";
    const mediaKind = body.media_kind === "audio" || body.media_kind === "image" ? body.media_kind : "";
    const parentId = typeof body.parent_id === "number" && Number.isInteger(body.parent_id) ? body.parent_id : null;
    const friendsCode = typeof body.friends_code === "string" ? body.friends_code.trim() : "";

    if (!usernamePattern.test(username)) {
      return NextResponse.json({ error: "That username doesn't look right." }, { status: 400 });
    }
    if (mediaUrl && !mediaKind) {
      return NextResponse.json({ error: "Media tidak dikenal." }, { status: 400 });
    }
    if (!message && !mediaUrl) {
      return NextResponse.json({ error: "Tulis pesan atau rekam pesan suara dulu." }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: "Messages must be between 1 and 500 characters." }, { status: 400 });
    }
    if (message && containsBadWord(message)) {
      return NextResponse.json({ error: "Pesan ini mengandung kata yang tidak diperbolehkan. Coba kata lain." }, { status: 400 });
    }
    const turnstileOk = await verifyTurnstile(
      typeof body.turnstile_token === "string" ? body.turnstile_token : undefined,
    );
    if (!turnstileOk) {
      return NextResponse.json({ error: "Verifikasi anti-bot gagal. Coba lagi." }, { status: 400 });
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
    const { data, error } = await supabase.rpc("submit_ngl_anonymous_message", {
      p_username: username,
      p_message: message,
      p_ip_hash: ipHash,
      p_parent_id: parentId,
      p_media_url: mediaUrl || null,
      p_media_kind: mediaKind || null,
      p_friends_code: friendsCode || null,
    });

    if (error) {
      console.error("Anonymous message submission failed:", error.code);
      return NextResponse.json({ error: "We couldn't save that message. Please try again later." }, { status: 500 });
    }
    if (data?.status === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "Kamu sudah mengirim 5 pesan dalam 1 jam terakhir. Coba lagi nanti." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }
    if (data?.status === "INVALID_INPUT") {
      return NextResponse.json({ error: "That username or message doesn't look right." }, { status: 400 });
    }
    if (data?.status === "PAUSED") {
      return NextResponse.json({ error: "Inbox ini sedang dijeda oleh pemiliknya." }, { status: 403 });
    }
    if (data?.status === "BLOCKED") {
      return NextResponse.json({ error: "Pesan dari kamu diblokir oleh pemilik link ini." }, { status: 403 });
    }
    if (data?.status === "FRIENDS_ONLY") {
      return NextResponse.json({ error: "Link ini khusus teman. Masukkan kode rahasia dari pemiliknya." }, { status: 403 });
    }
    if (data?.status === "BLOCKED_WORD") {
      return NextResponse.json({ error: "Pesan ini mengandung kata yang diblokir pemilik link ini." }, { status: 400 });
    }
    if (data?.status === "USERNAME_NOT_FOUND") {
      return NextResponse.json({ error: "This anonymous link isn't active yet." }, { status: 404 });
    }
    if (data?.status !== "OK") {
      return NextResponse.json({ error: "We couldn't save that message. Please try again later." }, { status: 500 });
    }

    // New message in: nudge the owner on every device that enabled push.
    // Fire-and-forget — a push failure must never fail the send.
    const { data: owner } = await supabase
      .from("ngl_profiles")
      .select("user_id")
      .ilike("username", username)
      .maybeSingle();
    if (owner?.user_id) {
      void sendPushToUser(owner.user_id, {
        title: "ngl. — pesan anonim baru",
        body: mediaKind === "audio" ? "🎤 Ada pesan suara baru." : message ? message.slice(0, 120) : "Ada pesan baru.",
        url: "/dashboard",
      });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request. Please try again." }, { status: 400 });
  }
}
