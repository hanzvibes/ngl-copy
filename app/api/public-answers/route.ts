import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const usernamePattern = /^[a-zA-Z0-9_.]{1,24}$/;

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "";
  return forwarded.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

// Public answers feed for a link: only messages the owner marked public AND
// replied to. No auth needed — everything returned here is explicitly public.
// Returns an empty list (not an error) when the link isn't claimed yet.
// Each answer also carries its public like count, its poll (if any), and
// its answered follow-up questions.
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
    .select("id, message, reply, reply_media_url, created_at")
    .eq("owner_user_id", profile.user_id)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("NGL public answers read failed:", error.code);
    return NextResponse.json({ error: "Jawaban gagal dimuat." }, { status: 500 });
  }
  const answers = (data ?? []).filter((row) => row.reply && row.reply.trim() !== "").slice(0, 20);
  if (answers.length === 0) return NextResponse.json({ answers: [] });
  const ids = answers.map((a) => a.id);
  const ipHash = createHmac("sha256", key).update(getClientIp(request)).digest("hex");

  const [{ data: likeRows }, { data: pollRows }, { data: followupRows }] = await Promise.all([
    supabase.from("ngl_likes").select("message_id, ip_hash").in("message_id", ids),
    supabase.from("ngl_polls").select("id, message_id, question, options").in("message_id", ids),
    supabase.from("ngl_messages").select("id, parent_id, message, reply, created_at").in("parent_id", ids).order("created_at", { ascending: true }),
  ]);

  const likeCounts: Record<number, number> = {};
  const likedByMe = new Set<number>();
  for (const row of likeRows ?? []) {
    likeCounts[row.message_id] = (likeCounts[row.message_id] ?? 0) + 1;
    if (row.ip_hash === ipHash) likedByMe.add(row.message_id);
  }

  const pollByMessage: Record<number, { id: number; question: string; options: string[]; counts: number[]; total: number; votedIndex: number | null }> = {};
  if (pollRows && pollRows.length > 0) {
    const { data: voteRows } = await supabase
      .from("ngl_poll_votes")
      .select("poll_id, option_index, ip_hash")
      .in("poll_id", pollRows.map((p) => p.id));
    for (const poll of pollRows) {
      const options = poll.options as string[];
      const counts = options.map(() => 0);
      let votedIndex: number | null = null;
      for (const vote of voteRows ?? []) {
        if (vote.poll_id !== poll.id) continue;
        if (vote.option_index >= 0 && vote.option_index < counts.length) counts[vote.option_index]++;
        if (vote.ip_hash === ipHash) votedIndex = vote.option_index;
      }
      pollByMessage[poll.message_id] = {
        id: poll.id,
        question: poll.question,
        options,
        counts,
        total: counts.reduce((a, b) => a + b, 0),
        votedIndex,
      };
    }
  }

  const followupsByParent: Record<number, { id: number; message: string; reply: string; created_at: string }[]> = {};
  for (const row of followupRows ?? []) {
    if (!row.reply || row.reply.trim() === "") continue;
    (followupsByParent[row.parent_id] ??= []).push({
      id: row.id,
      message: row.message,
      reply: row.reply,
      created_at: row.created_at,
    });
  }

  return NextResponse.json({
    answers: answers.map((a) => ({
      id: a.id,
      message: a.message,
      reply: a.reply,
      reply_media_url: a.reply_media_url ?? null,
      created_at: a.created_at,
      likes: likeCounts[a.id] ?? 0,
      liked: likedByMe.has(a.id),
      poll: pollByMessage[a.id] ?? null,
      followups: followupsByParent[a.id] ?? [],
    })),
  });
}
