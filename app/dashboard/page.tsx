"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Inbox, LogOut, Mail, RefreshCw, Trash2, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Message = { id: number; message: string; created_at: string };
type Profile = { username: string; created_at?: string };

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(searchParams.get("username") || "");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function request(path: string, init: RequestInit = {}) {
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
    return data;
  }

  async function loadPrivateData() {
    try {
      const [profileData, inboxData] = await Promise.all([request("/api/profile"), request("/api/inbox")]);
      setProfile(profileData.profile);
      setMessages(inboxData.messages || []);
      if (profileData.profile) setUsername(profileData.profile.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data gagal dimuat.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    try {
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        if (data.session) void loadPrivateData();
        else setLoading(false);
      }).catch(() => { if (active) setLoading(false); });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        if (session) { setLoading(true); void loadPrivateData(); }
        else { setProfile(null); setMessages([]); setLoading(false); }
      });
      return () => { active = false; subscription.unsubscribe(); };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Supabase belum dikonfigurasi.");
      setLoading(false);
      return () => { active = false; };
    }
  }, []);

  async function authenticate(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const supabase = getSupabaseBrowserClient();
      const result = mode === "signup"
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setNotice("Akun dibuat. Cek email untuk konfirmasi, lalu login di sini.");
      } else {
        setNotice(mode === "signup" ? "Akun siap. Sekarang pilih username unik." : "Berhasil login.");
        setLoading(true);
        await loadPrivateData();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Autentikasi gagal."); }
    finally { setBusy(false); }
  }

  async function claimProfile(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const data = await request("/api/profile", { method: "POST", body: JSON.stringify({ username }) });
      setProfile(data.profile); setUsername(data.profile.username);
      setNotice("Link kamu sudah aktif.");
      const inbox = await request("/api/inbox");
      setMessages(inbox.messages || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Username gagal dibuat."); }
    finally { setBusy(false); }
  }

  async function deleteMessage(id: number) {
    setError(""); setNotice("");
    try {
      await request("/api/inbox", { method: "DELETE", body: JSON.stringify({ id }) });
      setMessages(current => current.filter(message => message.id !== id));
      setNotice("Pesan dihapus.");
    } catch (e) { setError(e instanceof Error ? e.message : "Pesan gagal dihapus."); }
  }

  async function copyLink() {
    if (!profile) return;
    const link = `${window.location.origin}/${profile.username}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Gagal menyalin link. Salin manual: " + link); }
  }

  async function signOut() {
    try { await getSupabaseBrowserClient().auth.signOut(); setNotice("Kamu sudah logout."); }
    catch { setError("Logout gagal. Coba lagi."); }
  }

  return <main className="dashboard-page">
    <header className="dashboard-nav"><Link href="/" className="back-link"><ArrowLeft size={17}/><span>ngl.</span></Link><span className="private-tag"><Inbox size={13}/> private inbox</span></header>
    <section className="dashboard-shell">
      <div className="dashboard-heading"><span className="eyebrow">YOUR SPACE, YOUR RULES</span><h1>Your messages.<br/><span className="gradient-text">Your inbox.</span></h1><p>Claim your personal link and manage anonymous messages in one private place.</p></div>
      {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
      {notice && <div className="dashboard-alert success-alert" role="status"><Check size={15}/>{notice}</div>}
      {loading ? <div className="dashboard-panel loading-panel"><RefreshCw className="spin-icon" size={20}/> Loading your space…</div> :
      !profile ? <section className="dashboard-panel">
        <div className="panel-heading"><div className="dashboard-icon"><UserRound size={20}/></div><div><h2>{profile ? "Your profile" : "Make it yours"}</h2><p>Sign in or create an account to reserve a unique username.</p></div></div>
        <form onSubmit={authenticate} className="dashboard-form">
          <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
          <label htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode==="signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" required/>
          <button className="primary-button full-button" disabled={busy}>{busy ? "Please wait…" : mode==="signup" ? "Create account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{mode==="signup" ? "Already have an account?" : "New here?"} <button onClick={()=>{setMode(mode==="signup"?"login":"signup");setError("");setNotice("");}}>{mode==="signup"?"Sign in":"Create an account"}</button></p>
        {mode==="signup" && <p className="privacy-note">Email confirmation may be required depending on Supabase Auth settings.</p>}
        <div className="dashboard-divider"><span>THEN RESERVE YOUR LINK</span></div>
        <form onSubmit={claimProfile} className="dashboard-form">
          <label htmlFor="username">Your username</label><div className="dashboard-username"><span>@</span><input id="username" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g,"").slice(0,24))} placeholder="yourname" required/></div>
          <button className="primary-button full-button" disabled={busy}>Claim username <Check size={16}/></button>
        </form>
        <p className="privacy-note">You must sign in before a username can be claimed.</p>
      </section> :
      <>
        <section className="dashboard-panel profile-panel">
          <div className="profile-summary"><div className="send-avatar">{profile.username.slice(0,1).toUpperCase()}</div><div className="profile-summary-copy"><span className="eyebrow">YOUR PUBLIC LINK</span><h2>@{profile.username}</h2><p>{typeof window !== "undefined" ? window.location.origin : ""}/{profile.username}</p></div></div>
          <button className="primary-button full-button" onClick={copyLink}>{copied ? <><Check size={16}/> Copied</> : <><Copy size={16}/> Copy my link</>}</button>
        </section>
        <section className="inbox-section"><div className="inbox-title"><div><span className="eyebrow">STRAIGHT FROM THE HEART</span><h2>Your inbox <span>{messages.length}</span></h2></div><button className="icon-button" aria-label="Refresh inbox" onClick={()=>{setLoading(true);void loadPrivateData();}}><RefreshCw size={16}/></button></div>
          {messages.length === 0 ? <div className="dashboard-panel empty-inbox"><div className="empty-icon"><Mail size={22}/></div><h3>Nothing here. Yet.</h3><p>Share your link with friends. Their anonymous messages will show up here.</p><button className="secondary-button" onClick={copyLink}><Copy size={15}/> Share your link</button></div> :
            <div className="inbox-list">{messages.map(message=><article className="inbox-message" key={message.id}><div className="message-meta"><span><span className="anonymous-dot"/> ANONYMOUS</span><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time><button className="delete-message" onClick={()=>void deleteMessage(message.id)} aria-label="Delete message"><Trash2 size={15}/></button></div><p>{message.message}</p></article>)}</div>}
        </section>
        <button className="logout-button" onClick={signOut}><LogOut size={15}/> Sign out</button>
      </>}
    </section>
    <footer className="message-footer">Be kind. Stay curious.</footer>
  </main>;
}
