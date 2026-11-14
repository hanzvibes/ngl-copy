"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, Dices, Heart, LockKeyhole, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pickRandomQuestion } from "@/lib/questions";
import { THEMES, themeOrDefault, type ThemeId } from "@/lib/themes";

type PublicProfile = { bio: string; avatar_url: string; theme: ThemeId; prompt: string };
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

  function rollQuestion() {
    setMessage(pickRandomQuestion(message));
    setError("");
  }

  async function submit(e:FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,message:message.trim()})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't send your message.");
      setSent(true); setMessage("");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  return <main className="message-page"><div className="message-page-glow"/><header className="message-nav"><Link href="/" className="back-link"><ArrowLeft size={17}/> <span>ngl.</span></Link><span className="private-tag"><LockKeyhole size={13}/> anonymous</span></header>
    <section className="send-panel">
      {profile?.avatar_url
        ? <img className="send-avatar send-avatar-img" src={profile.avatar_url} alt={`@${username}`} referrerPolicy="no-referrer"/>
        : <div className="send-avatar" style={{ background: THEMES[theme].gradient }}>{username.slice(0,1).toUpperCase()}<span>✳</span></div>}
      <span className="eyebrow">THE FLOOR IS YOURS</span><h1>Send <span className="gradient-text">@{username}</span><br/>an anonymous message.</h1>
      {profile?.prompt ? <p className="send-prompt">“{profile.prompt}”</p> : null}
      {profile?.bio ? <p className="send-bio">{profile.bio}</p> : profile?.prompt ? null : <p className="send-subtitle">Be real. Be kind. They won't know it's you.</p>}
      {sent ? <div className="success-panel"><div className="success-icon"><Check size={24}/></div><h2>Message sent!</h2><p>Your words are on their way. Your identity stays a secret.</p><button className="primary-button full-button" onClick={()=>setSent(false)}>Send another <Send size={16}/></button></div> :
      <form onSubmit={submit} className="send-form"><label htmlFor="message">Your message</label><textarea id="message" value={message} onChange={e=>setMessage(e.target.value.slice(0,500))} placeholder="Type something you’ve always wanted to say..." maxLength={500} required/><div className="form-meta"><span>{message.length}/500</span><button type="button" className="dice-button" onClick={rollQuestion}><Dices size={13}/> Roll a question</button></div>{error && <p className="form-error">{error}</p>}<button className="primary-button full-button" disabled={busy || !message.trim()}>{busy ? "Sending..." : <>Send anonymously <Send size={16}/></>}</button><p className="privacy-note"><LockKeyhole size={12}/> Your name is never attached to your message.</p></form>}
    </section>
    {answers.length > 0 && <section className="answers-section"><div className="answers-heading"><span className="eyebrow">ANSWERED</span><h2>Questions @{username} already answered</h2></div><div className="answers-list">{answers.map((answer) => <article className="answer-card" key={answer.id}><p className="answer-question">{answer.message}</p><div className="message-reply"><span>@{username} REPLIED</span><p>{answer.reply}</p></div><time dateTime={answer.created_at}>{new Date(answer.created_at).toLocaleDateString()}</time></article>)}</div></section>}
    <footer className="message-footer">A little honesty can go a long way.</footer>
  </main>;
}
