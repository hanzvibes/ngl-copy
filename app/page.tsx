"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Copy, Heart, LockKeyhole, MessageCircle, Sparkles, Zap } from "lucide-react";

export default function Home() {
  const [username, setUsername] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const link = typeof window !== "undefined" ? window.location.origin + "/" + (username.trim().replace(/^@/, "") || "yourname") : "https://ngl-copy.vercel.app/yourname";

  async function copyLink() {
    const cleanUsername = username.trim().replace(/^@/, "");
    if (!cleanUsername) { setShowPreview(true); return; }
    window.location.href = "/dashboard?username=" + encodeURIComponent(cleanUsername);
  }

  return <main className="landing">
    <nav className="nav shell"><a className="wordmark" href="/"><span className="brand-mark">n</span> ngl<span className="dot">.</span></a><a className="nav-link" href="#how">How it works <ArrowUpRight size={15}/></a></nav>
    <section className="hero shell">
      <div className="hero-copy">
        <div className="eyebrow"><span className="pulse-dot"/> YOUR INBOX, UNFILTERED</div>
        <h1>Say it with<br/><span className="gradient-text">no name.</span></h1>
        <p className="hero-description">The place to get the honest messages your friends are too shy to send. Make your link. Share it anywhere. Let the truth slide in.</p>
        <div className="create-card">
          <label htmlFor="username">Claim your link</label>
          <div className="username-input"><span className="at">@</span><input id="username" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g,"").slice(0,24))} placeholder="yourname" onKeyDown={e=>{if(e.key==="Enter")copyLink()}}/><button className="primary-button" onClick={copyLink}>{copied ? <><Check size={17}/> Copied</> : <>Create my link <ArrowUpRight size={17}/></>}</button></div>
          <div className="card-foot"><LockKeyhole size={13}/> Account required to claim your link <span className="secure-dot"/></div>
          {showPreview && <div className="preview-link"><span>{link}</span><button onClick={()=>{navigator.clipboard?.writeText(link);setCopied(true);setShowPreview(false)}} aria-label="Copy link"><Copy size={15}/></button></div>}
        </div>
        <div className="social-proof"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span><span>K</span></div><p><strong>Curiosity looks good on you.</strong><br/>Your friends have things to say.</p></div>
      </div>
      <div className="hero-visual" aria-label="Anonymous message preview">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        <div className="floating-chip chip-top"><Sparkles size={15}/> a little honesty</div>
        <div className="message-window">
          <div className="window-top"><div className="window-dots"><i/><i/><i/></div><span>your inbox</span><span className="inbox-count">03</span></div>
          <div className="profile-row"><div className="profile-avatar">u<span>?</span></div><div><strong>someone's inbox</strong><small>you've got messages</small></div><span className="live-indicator"/></div>
          <div className="message-bubble bubble-one"><span className="bubble-label"><span/> ANONYMOUS</span><p>you have the best music taste, just saying</p><div className="bubble-bottom"><Heart size={14}/> <span>just now</span></div></div>
          <div className="message-bubble bubble-two"><span className="bubble-label"><span/> ANONYMOUS</span><p>lowkey thought you were cute ngl 👀</p><div className="bubble-bottom"><Heart size={14}/> <span>2 min ago</span></div></div>
          <div className="message-bubble bubble-three"><span className="bubble-label"><span/> ANONYMOUS</span><p>we should hang out more</p><div className="bubble-bottom"><Heart size={14}/> <span>5 min ago</span></div></div>
          <div className="reply-hint"><MessageCircle size={15}/> your turn to find out</div>
        </div>
        <div className="floating-chip chip-bottom"><Zap size={15} fill="currentColor"/> zero awkwardness</div>
        <div className="sparkle sparkle-a">✳</div><div className="sparkle sparkle-b">✦</div>
      </div>
    </section>
    <section id="how" className="how shell">
      <div className="section-heading"><span className="eyebrow">THREE STEPS. ZERO PRESSURE.</span><h2>Let the messages<br/>do the talking.</h2></div>
      <div className="steps">
        <article className="step-card"><div className="step-number">01</div><div className="step-icon pink"><MessageCircle size={21}/></div><h3>Make your link</h3><p>Pick a username and get a link that's all yours.</p><span className="step-line"/></article>
        <article className="step-card"><div className="step-number">02</div><div className="step-icon orange"><ArrowUpRight size={21}/></div><h3>Put it out there</h3><p>Drop it in your story, bio, or group chat.</p><span className="step-line"/></article>
        <article className="step-card"><div className="step-number">03</div><div className="step-icon purple"><Heart size={21}/></div><h3>Read the truth</h3><p>Get anonymous messages. No names, no pressure.</p><span className="step-line"/></article>
      </div>
    </section>
    <footer className="footer shell"><a className="wordmark" href="/"><span className="brand-mark">n</span> ngl<span className="dot">.</span></a><span>Built for the things left unsaid.</span><span className="footer-right">Be kind. Stay curious.</span></footer>
  </main>;
}
