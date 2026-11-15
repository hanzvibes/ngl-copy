"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Dices, Flame, Heart, Instagram, LockKeyhole, Mic, Moon, Music2, Send, Square, Sun, Twitter } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { useParams } from "next/navigation";
import { getDailyQuestion, pickRandomQuestion } from "@/lib/questions";
import { THEMES, customTheme, themeOrDefault, type ThemeId } from "@/lib/themes";
import { tr, useLang } from "@/lib/i18n";
import { getThemeMode, toggleThemeMode, type ThemeMode } from "@/lib/theme";
import { tap } from "@/lib/vibrate";
import { uploadMedia } from "@/lib/media";

type PublicProfile = { bio: string; avatar_url: string; theme: ThemeId; prompt: string; prompt_auto: boolean; paused: boolean; bg_url: string; instagram: string; tiktok: string; x_handle: string; friends_only: boolean; auto_reply: string; custom_bg: string; custom_bg2: string; spotify_url: string; recent_count: number };
type Poll = { id: number; question: string; options: string[]; counts: number[]; total: number; votedIndex: number | null };
type Followup = { id: number; message: string; reply: string; created_at: string };
type Answer = { id: number; message: string; reply: string; reply_media_url: string | null; created_at: string; likes: number; liked: boolean; poll: Poll | null; followups: Followup[] };

function spotifyEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(\.|^)(open\.)?spotify\.com$/.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") return raw;
    if (parts.length >= 2 && ["track", "playlist", "album", "episode", "show"].includes(parts[0])) {
      return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`;
    }
    return null;
  } catch { return null; }
}

export default function ProfilePage() {
  const params = useParams<{username:string}>();
  const username = decodeURIComponent(params.username || "yourfriend").replace(/^@/,"");
  const [message,setMessage] = useState("");
  const [sent,setSent] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [profile,setProfile] = useState<PublicProfile | null>(null);
  const [answers,setAnswers] = useState<Answer[]>([]);
  const [lang, setLang] = useLang();
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  useEffect(() => { setThemeMode(getThemeMode()); }, []);
  const t = (key: string) => tr(lang, key);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Friends-only link: the code the owner shared with their friends.
  const [friendsCode, setFriendsCode] = useState("");
  // Voice note (max 30 seconds).
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecondsRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  // Public likes, polls and follow-up threads.
  const [followupOpen, setFollowupOpen] = useState<number | null>(null);
  const [followupDrafts, setFollowupDrafts] = useState<Record<number, string>>({});
  const [followupSent, setFollowupSent] = useState<Record<number, boolean>>({});

  async function loadAnswers() {
    try {
      const response = await fetch(`/api/public-answers?username=${encodeURIComponent(username)}`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.answers)) setAnswers(data.answers);
    } catch {}
  }

  // Public profile (bio, photo, theme). If the link isn't claimed or Supabase
  // isn't configured, this fails quietly and the page keeps its default look.
  useEffect(() => {
    let active = true;
    fetch(`/api/public-profile?username=${encodeURIComponent(username)}`)
      .then(async (response) => {
        if (!response.ok || !active) return;
        const data = await response.json();
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => {});
    void loadAnswers();
    return () => { active = false; };
  }, [username]);

  const theme = themeOrDefault(profile?.theme);
  const themeDef = profile?.custom_bg && profile?.custom_bg2 ? customTheme(profile.custom_bg, profile.custom_bg2) : THEMES[theme];
  const shownPrompt = profile?.prompt_auto ? getDailyQuestion() : profile?.prompt;
  const spotifyEmbed = profile?.spotify_url ? spotifyEmbedUrl(profile.spotify_url) : null;

  function rollQuestion() {
    setMessage(pickRandomQuestion(message));
    setError("");
  }

  async function submit(e:FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true); setError("");
    try {
      const tokenEl = document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
      const response = await fetch("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,message:message.trim(),turnstile_token: tokenEl?.value || undefined, friends_code: friendsCode || undefined})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't send your message.");
      tap(); setSent(true); setMessage("");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setVoiceBlob(blob);
        setVoiceUrl(URL.createObjectURL(blob));
      };
      rec.start();
      recorderRef.current = rec;
      recSecondsRef.current = 0;
      setRecSeconds(0);
      setRecording(true);
      setError("");
      recTimerRef.current = setInterval(() => {
        recSecondsRef.current += 1;
        setRecSeconds(recSecondsRef.current);
        if (recSecondsRef.current >= 30) stopRecording();
      }, 1000);
    } catch { setError(t("send.micDenied")); }
  }

  function stopRecording() {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRecording(false);
  }

  async function sendVoice() {
    if (!voiceBlob) return;
    setBusy(true); setError("");
    try {
      const file = new File([voiceBlob], `voice-${Date.now()}.webm`, { type: voiceBlob.type || "audio/webm" });
      const mediaUrl = await uploadMedia(file, "audio");
      const response = await fetch("/api/messages", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ username, message: "", media_url: mediaUrl, media_kind: "audio", friends_code: friendsCode || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't send your message.");
      tap(); setSent(true); setVoiceBlob(null); setVoiceUrl("");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  async function toggleLike(answerId: number) {
    try {
      const response = await fetch("/api/likes", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ message_id: answerId }) });
      if (!response.ok) return;
      const data = await response.json();
      setAnswers((list) => list.map((a) => a.id === answerId ? { ...a, liked: data.liked, likes: a.likes + (data.liked ? 1 : -1) } : a));
    } catch {}
  }

  async function votePoll(pollId: number, optionIndex: number) {
    try {
      const response = await fetch("/api/polls", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ poll_id: pollId, option_index: optionIndex }) });
      if (!response.ok) return;
      await loadAnswers();
    } catch {}
  }

  async function submitFollowup(answerId: number) {
    const text = (followupDrafts[answerId] || "").trim();
    if (!text) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/messages", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ username, message: text, parent_id: answerId, friends_code: friendsCode || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't send your message.");
      setFollowupDrafts((d) => ({ ...d, [answerId]: "" }));
      setFollowupOpen(null);
      setFollowupSent((s) => ({ ...s, [answerId]: true }));
      setTimeout(() => setFollowupSent((s) => ({ ...s, [answerId]: false })), 3000);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  return <main className="message-page" id="main" tabIndex={-1} style={profile?.bg_url ? { backgroundImage: `linear-gradient(rgba(12,10,17,.72), rgba(12,10,17,.86)), url("${encodeURI(profile.bg_url)}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><a className="skip-link" href="#main">{t("a11y.skip")}</a><div className="message-page-glow" aria-hidden="true"/><header className="message-nav"><div className="app-bar-inner"><Link href="/" className="back-link"><ArrowLeft size={17}/> <span>ngl.</span></Link><div className="nav-actions"><span className="private-tag"><LockKeyhole size={13}/> {t("send.anonymous")}</span><button className="icon-mini" onClick={() => setThemeMode(toggleThemeMode())} aria-label="Toggle theme">{themeMode === "light" ? <Moon size={15}/> : <Sun size={15}/>}</button><button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>{lang === "id" ? "EN" : "ID"}</button></div></div></header>
    <section className="send-panel">
      {profile?.avatar_url
        ? <img className="send-avatar send-avatar-img" src={profile.avatar_url} alt={`@${username}`} referrerPolicy="no-referrer"/>
        : <div className="send-avatar" style={{ background: themeDef.gradient }}>{username.slice(0,1).toUpperCase()}<span aria-hidden="true">✳</span></div>}
      <span className="eyebrow">{t("send.floor")}</span><h1>Send <span className="gradient-text">@{username}</span><br/>{t("send.titleB")}</h1>
      {(profile?.recent_count ?? 0) >= 3 && <span className="busy-badge"><Flame size={14}/> {t("send.busyNow")}</span>}
      {shownPrompt ? <p className="send-prompt">“{shownPrompt}”</p> : null}
      {profile?.bio ? <p className="send-bio">{profile.bio}</p> : shownPrompt ? null : <p className="send-subtitle">{t("send.subtitle")}</p>}
      {(profile?.instagram || profile?.tiktok || profile?.x_handle) && <div className="social-links social-rows">
        {profile.instagram && <a className="social-row" href={`https://instagram.com/${encodeURIComponent(profile.instagram)}`} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17}/><span>Instagram</span><strong>@{profile.instagram}</strong></a>}
        {profile.tiktok && <a className="social-row" href={`https://tiktok.com/@${encodeURIComponent(profile.tiktok)}`} target="_blank" rel="noreferrer" aria-label="TikTok"><Music2 size={17}/><span>TikTok</span><strong>@{profile.tiktok}</strong></a>}
        {profile.x_handle && <a className="social-row" href={`https://x.com/${encodeURIComponent(profile.x_handle)}`} target="_blank" rel="noreferrer" aria-label="X"><Twitter size={17}/><span>X</span><strong>@{profile.x_handle}</strong></a>}
      </div>}
      {spotifyEmbed && <div className="spotify-embed"><iframe src={spotifyEmbed} width="100%" height="80" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Spotify" /></div>}
      {profile?.paused ? <div className="send-card"><div className="ngl-head">{t("send.cardTitle")}</div><div className="send-card-body"><div className="success-panel" role="status"><h2>{t("send.pausedTitle")}</h2><p>{profile.auto_reply || t("send.pausedDesc")}</p></div></div></div> :
      sent ? <div className="send-card"><div className="ngl-head">{t("send.cardTitle")}</div><div className="send-card-body"><div className="success-panel" role="status"><div className="success-icon"><Check size={24}/></div><h2>{t("send.sent")}</h2><p>{t("send.sentDesc")}</p><button className="primary-button full-button" onClick={()=>setSent(false)}>{t("send.another")} <Send size={16}/></button></div></div></div> :
      <div className="send-card"><div className="ngl-head">{t("send.cardTitle")}</div><div className="send-card-body"><form onSubmit={submit} className="send-form">
        {profile?.friends_only && <><label htmlFor="friendsCode">{t("send.friendsCode")}</label><input id="friendsCode" type="text" value={friendsCode} onChange={e=>setFriendsCode(e.target.value.replace(/\s+/g, "").slice(0, 24))} placeholder={t("send.friendsCodePh")} maxLength={24}/></>}
        <label htmlFor="message">{t("send.label")}</label><textarea id="message" value={message} onChange={e=>setMessage(e.target.value.slice(0,500))} placeholder={t("send.placeholder")} maxLength={500} required/><div className="form-meta"><span>{message.length}/500</span><button type="button" className="dice-button" onClick={rollQuestion}><Dices size={13}/> {t("send.roll")}</button></div>
        {turnstileSiteKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer/><div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark"/></>}{error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button full-button" disabled={busy || !message.trim()}>{busy ? t("send.sending") : <>{t("send.send")} <Send size={16}/></>}</button>
        <p className="privacy-note"><LockKeyhole size={12}/> {t("send.privacy")}</p>
        <p className="privacy-note">{t("send.rateHint")}</p>
      </form>
      <div className="voice-box">
        {recording ? <div className="voice-recording"><span className="rec-dot" aria-hidden="true"/><span>0:{String(recSeconds).padStart(2, "0")} / 0:30</span><button type="button" className="secondary-button" onClick={stopRecording}><Square size={14}/> {t("send.stopRec")}</button></div>
        : voiceBlob ? <div className="voice-preview"><audio controls src={voiceUrl}/><div className="voice-preview-actions"><button type="button" className="primary-button" disabled={busy} onClick={()=>void sendVoice()}>{busy ? t("send.sending") : <>{t("send.sendVoice")} <Send size={15}/></>}</button><button type="button" className="secondary-button" onClick={()=>{ setVoiceBlob(null); setVoiceUrl(""); }}>{t("send.discardVoice")}</button></div></div>
        : <button type="button" className="voice-button" onClick={()=>void startRecording()}><Mic size={16}/> {t("send.voice")}</button>}
      </div>
      </div></div>}
    </section>
    {answers.length > 0 && <section className="answers-section"><div className="answers-heading"><span className="eyebrow">{t("send.answeredEyebrow")}</span><h2>Questions @{username} already answered</h2></div><div className="answers-list">{answers.map((answer) => <article className="answer-card" key={answer.id}><p className="answer-question">{answer.message}</p><div className="message-reply"><span>@{username} {t("send.replied")}</span><p>{answer.reply}</p>{answer.reply_media_url && <img className="reply-photo" src={answer.reply_media_url} alt="" loading="lazy"/>}</div>
      {answer.poll && <div className="poll-box"><p className="poll-question">{answer.poll.question}</p>{answer.poll.options.map((opt, i) => {
        const pct = answer.poll!.total > 0 ? Math.round((answer.poll!.counts[i] / answer.poll!.total) * 100) : 0;
        return <button key={i} type="button" className={`poll-option${answer.poll!.votedIndex === i ? " voted" : ""}`} onClick={()=>void votePoll(answer.poll!.id, i)}><span className="poll-bar" style={{ width: `${pct}%` }}/><span className="poll-label">{opt}</span><span className="poll-pct">{answer.poll!.total > 0 ? `${pct}%` : ""}</span></button>;
      })}<span className="poll-total">{answer.poll.total} {t("send.pollVotes")}</span></div>}
      <div className="answer-actions">
        <button type="button" className={`like-button${answer.liked ? " liked" : ""}`} onClick={()=>void toggleLike(answer.id)} aria-label={answer.liked ? "Unlike" : "Like"}><Heart size={16} fill={answer.liked ? "currentColor" : "none"}/> {answer.likes > 0 ? answer.likes : ""}</button>
        <button type="button" className="followup-button" onClick={()=>setFollowupOpen(followupOpen === answer.id ? null : answer.id)}>{t("send.followup")}</button>
        {followupSent[answer.id] && <span className="followup-sent">{t("send.followupSent")}</span>}
      </div>
      {followupOpen === answer.id && <div className="followup-form"><textarea value={followupDrafts[answer.id] || ""} onChange={e=>setFollowupDrafts((d) => ({ ...d, [answer.id]: e.target.value.slice(0, 500) }))} placeholder={t("send.followupPh")} maxLength={500} rows={2}/><button type="button" className="primary-button" disabled={busy || !(followupDrafts[answer.id] || "").trim()} onClick={()=>void submitFollowup(answer.id)}>{t("send.send")} <Send size={15}/></button></div>}
      {answer.followups.length > 0 && <div className="followups-list">{answer.followups.map((f) => <div className="followup-item" key={f.id}><p className="answer-question">{f.message}</p><div className="message-reply"><span>@{username} {t("send.replied")}</span><p>{f.reply}</p></div></div>)}</div>}
      <time dateTime={answer.created_at}>{new Date(answer.created_at).toLocaleDateString()}</time></article>)}</div></section>}
    <footer className="message-footer">A little honesty can go a long way.</footer>
  </main>;
}
