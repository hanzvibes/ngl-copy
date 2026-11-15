"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Heart, LockKeyhole, MessageCircle, Moon, Sparkles, Sun, Zap } from "lucide-react";
import { tr, useLang } from "@/lib/i18n";
import { GAMES } from "@/lib/questions";
import { tap } from "@/lib/vibrate";
import { getThemeMode, toggleThemeMode, type ThemeMode } from "@/lib/theme";

export default function Home() {
  const [username, setUsername] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [lang, setLang] = useLang();
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  useEffect(() => { setThemeMode(getThemeMode()); }, []);
  const t = (key: string) => tr(lang, key);
  const link = typeof window !== "undefined" ? window.location.origin + "/" + (username.trim().replace(/^@/, "") || "yourname") : "https://ngl-copy-five.vercel.app/yourname";

  async function copyLink() {
    const cleanUsername = username.trim().replace(/^@/, "");
    if (!cleanUsername) { setShowPreview(true); return; }
    window.location.href = "/dashboard?username=" + encodeURIComponent(cleanUsername);
  }

  return <main className="landing" id="main" tabIndex={-1}><a className="skip-link" href="#main">{t("a11y.skip")}</a>
    <nav className="nav shell"><a className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">n</span> ngl<span className="dot">.</span></a><div className="nav-actions"><a className="nav-link" href="/discover">{t("nav.discover")}</a><a className="nav-link nav-link-how" href="#how">{t("nav.how")} <ArrowUpRight size={15}/></a><button className="icon-mini" onClick={() => setThemeMode(toggleThemeMode())} aria-label="Toggle theme">{themeMode === "light" ? <Moon size={15}/> : <Sun size={15}/>}</button><button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>{lang === "id" ? "EN" : "ID"}</button></div></nav>
    <section className="hero shell">
      <div className="hero-copy">
        <div className="eyebrow"><span className="pulse-dot" aria-hidden="true"/> {t("hero.eyebrow")}</div>
        <h1>{t("hero.titleA")}<br/><span className="gradient-text">{t("hero.titleB")}</span></h1>
        <p className="hero-description">{t("hero.desc")}</p>
        <div className="create-card">
          <label htmlFor="username">{t("hero.claim")}</label>
          <div className="username-input"><span className="at">@</span><input id="username" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g,"").slice(0,24))} placeholder={t("hero.placeholder")} onKeyDown={e=>{if(e.key==="Enter")copyLink()}}/><button className="primary-button" onClick={copyLink}>{copied ? <><Check size={17}/> {t("dash.copied")}</> : <>{t("hero.create")} <ArrowUpRight size={17}/></>}</button></div>
          <div className="card-foot"><LockKeyhole size={13}/> {t("hero.account")} <span className="secure-dot" aria-hidden="true"/></div>
          {showPreview && <div className="preview-link"><span>{link}</span><button onClick={()=>{navigator.clipboard?.writeText(link);setCopied(true);setShowPreview(false)}} aria-label="Copy link"><Copy size={15}/></button></div>}
        </div>
        <div className="social-proof"><div className="avatar-stack" aria-hidden="true"><span>J</span><span>M</span><span>A</span><span>K</span></div><p><strong>{t("hero.proof")}</strong><br/>{t("hero.proof2")}</p></div>
      </div>
      <div className="hero-visual">
        <div className="orbit orbit-one" aria-hidden="true"/><div className="orbit orbit-two" aria-hidden="true"/>
        <div className="floating-chip chip-top" aria-hidden="true"><Sparkles size={15}/> a little honesty</div>
        <div className="message-window">
          <div className="window-top"><div className="window-dots" aria-hidden="true"><i/><i/><i/></div><span>your inbox</span><span className="inbox-count">03</span></div>
          <div className="profile-row"><div className="profile-avatar">u<span aria-hidden="true">?</span></div><div><strong>someone's inbox</strong><small>you've got messages</small></div><span className="live-indicator" aria-hidden="true"/></div>
          <div className="message-bubble bubble-one"><span className="bubble-label"><span/> ANONYMOUS</span><p>you have the best music taste, just saying</p><div className="bubble-bottom"><Heart size={14}/> <span>just now</span></div></div>
          <div className="message-bubble bubble-two"><span className="bubble-label"><span/> ANONYMOUS</span><p>lowkey thought you were cute ngl 👀</p><div className="bubble-bottom"><Heart size={14}/> <span>2 min ago</span></div></div>
          <div className="message-bubble bubble-three"><span className="bubble-label"><span/> ANONYMOUS</span><p>we should hang out more</p><div className="bubble-bottom"><Heart size={14}/> <span>5 min ago</span></div></div>
          <div className="reply-hint"><MessageCircle size={15}/> your turn to find out</div>
        </div>
        <div className="floating-chip chip-bottom" aria-hidden="true"><Zap size={15} fill="currentColor"/> zero awkwardness</div>
        <div className="sparkle sparkle-a" aria-hidden="true">✳</div><div className="sparkle sparkle-b" aria-hidden="true">✦</div>
      </div>
    </section>
    <section className="games shell">
      <div className="section-heading"><span className="eyebrow">{t("games.eyebrow")}</span><h2>{t("games.title")}</h2></div>
      <p className="games-sub">{t("games.sub")}</p>
      <div className="games-grid">
        {GAMES.map((g) => (
          <button key={g.id} type="button" className={`game-card${openGame === g.id ? " open" : ""}`} onClick={() => { tap(); setOpenGame(openGame === g.id ? null : g.id); }} aria-expanded={openGame === g.id}>
            <div className="game-gradient" style={{ background: g.gradient }} aria-hidden="true"/>
            <h3>{g.title}</h3>
            <p>{g.examples[0]}</p>
            <ul>{g.examples.map((q) => <li key={q}>{q}</li>)}</ul>
          </button>
        ))}
      </div>
    </section>
    <section id="how" className="how shell">
      <div className="section-heading"><span className="eyebrow">{t("how.eyebrow")}</span><h2>{t("how.titleA")}<br/>{t("how.titleB")}</h2></div>
      <div className="steps">
        <article className="step-card"><div className="step-number">01</div><div className="step-icon pink"><MessageCircle size={21}/></div><h3>{t("step1.title")}</h3><p>{t("step1.desc")}</p><span className="step-line"/></article>
        <article className="step-card"><div className="step-number">02</div><div className="step-icon orange"><ArrowUpRight size={21}/></div><h3>{t("step2.title")}</h3><p>{t("step2.desc")}</p><span className="step-line"/></article>
        <article className="step-card"><div className="step-number">03</div><div className="step-icon purple"><Heart size={21}/></div><h3>{t("step3.title")}</h3><p>{t("step3.desc")}</p><span className="step-line"/></article>
      </div>
    </section>
    <footer className="footer shell"><a className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">n</span> ngl<span className="dot">.</span></a><span>{t("footer.tag")}</span><span className="footer-right">{t("footer.right")}</span></footer>
  </main>;
}
