"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, Dices, Heart, Instagram, LockKeyhole, Moon, Music2, Send, Sun, Twitter } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { useParams } from "next/navigation";
import { getDailyQuestion, pickRandomQuestion } from "@/lib/questions";
import { THEMES, themeOrDefault, type ThemeId } from "@/lib/themes";
import { tr, useLang } from "@/lib/i18n";
import { getThemeMode, toggleThemeMode, type ThemeMode } from "@/lib/theme";

type PublicProfile = { bio: string; avatar_url: string; theme: ThemeId; prompt: string; prompt_auto: boolean; paused: boolean; bg_url: string; instagram: string; tiktok: string; x_handle: string };
type Answer = { id: number; message: string; reply: string; created_at: string };

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
    fetch(`/api/public-answers?username=${encodeURIComponent(username)}`)
      .then(async (response) => {
        if (!response.ok || !active) return;
        const data = await response.json();
        if (Array.isArray(data.answers)) setAnswers(data.answers);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [username]);

  const theme = themeOrDefault(profile?.theme);
  const shownPrompt = profile?.prompt_auto ? getDailyQuestion() : profile?.prompt;

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
      const response = await fetch("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,message:message.trim(),turnstile_token: tokenEl?.value || undefined})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't send your message.");
      setSent(true); setMessage("");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  return <main className="message-page" id="main" tabIndex={-1} style={profile?.bg_url ? { backgroundImage: `linear-gradient(rgba(12,10,17,.72), rgba(12,10,17,.86)), url("${encodeURI(profile.bg_url)}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><a className="skip-link" href="#main">{t("a11y.skip")}</a><div className="message-page-glow" aria-hidden="true"/><header className="message-nav"><div className="app-bar-inner"><Link href="/" className="back-link"><ArrowLeft size={17}/> <span>ngl.</span></Link><div className="nav-actions"><span className="private-tag"><LockKeyhole size={13}/> {t("send.anonymous")}</span><button className="icon-mini" onClick={() => setThemeMode(toggleThemeMode())} aria-label="Toggle theme">{themeMode === "light" ? <Moon size={15}/> : <Sun size={15}/>}</button><button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>{lang === "id" ? "EN" : "ID"}</button></div></div></header>
    <section className="send-panel">
      {profile?.avatar_url
        ? <img className="send-avatar send-avatar-img" src={profile.avatar_url} alt={`@${username}`} referrerPolicy="no-referrer"/>
        : <div className="send-avatar" style={{ background: THEMES[theme].gradient }}>{username.slice(0,1).toUpperCase()}<span aria-hidden="true">✳</span></div>}
      <span className="eyebrow">{t("send.floor")}</span><h1>Send <span className="gradient-text">@{username}</span><br/>{t("send.titleB")}</h1>
      {shownPrompt ? <p className="send-prompt">“{shownPrompt}”</p> : null}
      {profile?.bio ? <p className="send-bio">{profile.bio}</p> : shownPrompt ? null : <p className="send-subtitle">{t("send.subtitle")}</p>}
      {(profile?.instagram || profile?.tiktok || profile?.x_handle) && <div className="social-links">
        {profile.instagram && <a href={`https://instagram.com/${encodeURIComponent(profile.instagram)}`} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17}/></a>}
        {profile.tiktok && <a href={`https://tiktok.com/@${encodeURIComponent(profile.tiktok)}`} target="_blank" rel="noreferrer" aria-label="TikTok"><Music2 size={17}/></a>}
        {profile.x_handle && <a href={`https://x.com/${encodeURIComponent(profile.x_handle)}`} target="_blank" rel="noreferrer" aria-label="X"><Twitter size={17}/></a>}
      </div>}
      {profile?.paused ? <div className="send-card"><div className="ngl-head">{t("send.cardTitle")}</div><div className="send-card-body"><div className="success-panel" role="status"><h2>{t("send.pausedTitle")}</h2><p>{t("send.pausedDesc")}</p></div></div></div> :
      sent ? <div className="send-card"><div className="ngl-head">{t("send.cardTitle")}</div><div className="send-card-body"><div className="success-panel" role="status"><div className="success-icon"><Check size={24}/></div><h2>{t("send.sent")}</h2><p>{t("send.sentDesc")}</p><button className="primary-button full-button" onClick={()=>setSent(false)}>{t("send.another")} <Send size={16}/></button></div></div></div> :
      <div className="send-card"><div className="ngl-head">{t("send.cardTitle")}</div><div className="send-card-body"><form onSubmit={submit} className="send-form"><label htmlFor="message">{t("send.label")}</label><textarea id="message" value={message} onChange={e=>setMessage(e.target.value.slice(0,500))} placeholder={t("send.placeholder")} maxLength={500} required/><div className="form-meta"><span>{message.length}/500</span><button type="button" className="dice-button" onClick={rollQuestion}><Dices size={13}/> {t("send.roll")}</button></div>{turnstileSiteKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer/><div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark"/></>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full-button" disabled={busy || !message.trim()}>{busy ? t("send.sending") : <>{t("send.send")} <Send size={16}/></>}</button><p className="privacy-note"><LockKeyhole size={12}/> {t("send.privacy")}</p></form></div></div>}
    </section>
    {answers.length > 0 && <section className="answers-section"><div className="answers-heading"><span className="eyebrow">{t("send.answeredEyebrow")}</span><h2>Questions @{username} already answered</h2></div><div className="answers-list">{answers.map((answer) => <article className="answer-card" key={answer.id}><p className="answer-question">{answer.message}</p><div className="message-reply"><span>@{username} {t("send.replied")}</span><p>{answer.reply}</p></div><time dateTime={answer.created_at}>{new Date(answer.created_at).toLocaleDateString()}</time></article>)}</div></section>}
    <footer className="message-footer">A little honesty can go a long way.</footer>
  </main>;
}
