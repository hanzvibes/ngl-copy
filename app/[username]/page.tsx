"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, Check, Heart, LockKeyhole, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProfilePage() {
  const params = useParams<{username:string}>();
  const username = decodeURIComponent(params.username || "yourfriend").replace(/^@/,"");
  const [message,setMessage] = useState("");
  const [sent,setSent] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");

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
    <section className="send-panel"><div className="send-avatar">{username.slice(0,1).toUpperCase()}<span>✳</span></div><span className="eyebrow">THE FLOOR IS YOURS</span><h1>Send <span className="gradient-text">@{username}</span><br/>an anonymous message.</h1><p className="send-subtitle">Be real. Be kind. They won't know it's you.</p>
      {sent ? <div className="success-panel"><div className="success-icon"><Check size={24}/></div><h2>Message sent!</h2><p>Your words are on their way. Your identity stays a secret.</p><button className="primary-button full-button" onClick={()=>setSent(false)}>Send another <Send size={16}/></button></div> :
      <form onSubmit={submit} className="send-form"><label htmlFor="message">Your message</label><textarea id="message" value={message} onChange={e=>setMessage(e.target.value.slice(0,500))} placeholder="Type something you’ve always wanted to say..." maxLength={500} required/><div className="form-meta"><span>{message.length}/500</span><span>Keep it respectful <Heart size={12}/></span></div>{error && <p className="form-error">{error}</p>}<button className="primary-button full-button" disabled={busy || !message.trim()}>{busy ? "Sending..." : <>Send anonymously <Send size={16}/></>}</button><p className="privacy-note"><LockKeyhole size={12}/> Your name is never attached to your message.</p></form>}
    </section><footer className="message-footer">A little honesty can go a long way.</footer>
  </main>;
}
