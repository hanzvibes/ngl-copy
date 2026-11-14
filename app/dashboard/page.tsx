"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Eye, EyeOff, Heart, Inbox, LogOut, Mail, Palette, RefreshCw, Reply, Share2, Trash2, UserRound } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { shareStoryCard } from "@/lib/share-card";
import { THEMES, THEME_IDS, themeOrDefault, type ThemeId } from "@/lib/themes";

type Message = { id: number; message: string; created_at: string; reply: string | null; liked: boolean; is_read: boolean };
type Profile = { username: string; created_at?: string; bio: string; avatar_url: string; theme: ThemeId };
type Stats = { total: number; today: number; liked: number; unread: number };
type Filter = "all" | "unread" | "liked";

function computeStats(list: Message[]): Stats {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  return {
    total: list.length,
    today: list.filter((m) => new Date(m.created_at) >= todayStart).length,
    liked: list.filter((m) => m.liked).length,
    unread: list.filter((m) => !m.is_read).length,
  };
}

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, today: 0, liked: 0, unread: 0 });
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState("");
  const [themeDraft, setThemeDraft] = useState<ThemeId>("pink");
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [sharingId, setSharingId] = useState<number | null>(null);

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
      const nextProfile = profileData.profile as Profile | null;
      setProfile(nextProfile);
      if (nextProfile) {
        setUsername(nextProfile.username);
        setBioDraft(nextProfile.bio || "");
        setAvatarDraft(nextProfile.avatar_url || "");
        setThemeDraft(themeOrDefault(nextProfile.theme));
      }
      const nextMessages = (inboxData.messages || []) as Message[];
      setMessages(nextMessages);
      setStats(inboxData.stats || computeStats(nextMessages));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data gagal dimuat.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    try {
      const supabase = getSupabaseBrowserClient();
      const preset = new URLSearchParams(window.location.search).get("username");
      if (preset) setUsername(preset.replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 24));
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        setIsAuthenticated(Boolean(data.session));
        if (data.session) void loadPrivateData();
        else setLoading(false);
      }).catch(() => { if (active) setLoading(false); });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setIsAuthenticated(Boolean(session));
        if (session) { setLoading(true); void loadPrivateData(); }
        else { setProfile(null); setMessages([]); setStats({ total: 0, today: 0, liked: 0, unread: 0 }); setLoading(false); }
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
      setBioDraft(data.profile.bio || ""); setAvatarDraft(data.profile.avatar_url || ""); setThemeDraft(themeOrDefault(data.profile.theme));
      setNotice("Link kamu sudah aktif.");
      const inbox = await request("/api/inbox");
      const nextMessages = (inbox.messages || []) as Message[];
      setMessages(nextMessages);
      setStats(inbox.stats || computeStats(nextMessages));
    } catch (e) { setError(e instanceof Error ? e.message : "Username gagal dibuat."); }
    finally { setBusy(false); }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const data = await request("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ bio: bioDraft, avatar_url: avatarDraft, theme: themeDraft }),
      });
      setProfile(data.profile);
      setNotice("Profil diperbarui.");
    } catch (e) { setError(e instanceof Error ? e.message : "Profil gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function updateMessage(id: number, patch: { reply?: string; liked?: boolean; is_read?: boolean }) {
    setError(""); setNotice("");
    try {
      const data = await request("/api/inbox", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
      const updated = data.message as Message;
      const next = messages.map((m) => (m.id === id ? updated : m));
      setMessages(next);
      setStats(computeStats(next));
      if (patch.reply !== undefined) {
        setReplyingId(null);
        setNotice(patch.reply === "" ? "Balasan dihapus." : "Balasan tersimpan.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Pesan gagal disimpan."); }
  }

  async function deleteMessage(id: number) {
    setError(""); setNotice("");
    try {
      await request("/api/inbox", { method: "DELETE", body: JSON.stringify({ id }) });
      const next = messages.filter((message) => message.id !== id);
      setMessages(next);
      setStats(computeStats(next));
      setNotice("Pesan dihapus.");
    } catch (e) { setError(e instanceof Error ? e.message : "Pesan gagal dihapus."); }
  }

  async function shareMessage(message: Message) {
    if (!profile) return;
    setSharingId(message.id); setError(""); setNotice("");
    try {
      const result = await shareStoryCard({
        username: profile.username,
        message: message.message,
        reply: message.reply,
        theme: profile.theme,
      });
      setNotice(result === "shared"
        ? "Story dibagikan. Pilih Instagram di menu share."
        : "Gambar Story diunduh (1080×1920). Upload ke Instagram Story kamu.");
    } catch {
      setError("Gambar Story gagal dibuat di browser ini.");
    } finally { setSharingId(null); }
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

  const filteredMessages = messages.filter((m) =>
    filter === "unread" ? !m.is_read : filter === "liked" ? m.liked : true,
  );

  return <main className="dashboard-page">
    <header className="dashboard-nav"><Link href="/" className="back-link"><ArrowLeft size={17}/><span>ngl.</span></Link><span className="private-tag"><Inbox size={13}/> private inbox</span></header>
    <section className="dashboard-shell">
      <div className="dashboard-heading"><span className="eyebrow">YOUR SPACE, YOUR RULES</span><h1>Your messages.<br/><span className="gradient-text">Your inbox.</span></h1><p>Claim your personal link and manage anonymous messages in one private place.</p></div>
      {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
      {notice && <div className="dashboard-alert success-alert" role="status"><Check size={15}/>{notice}</div>}
      {loading ? <div className="dashboard-panel loading-panel"><RefreshCw className="spin-icon" size={20}/> Loading your space…</div> :
      !profile && !isAuthenticated ? <section className="dashboard-panel">
        <div className="panel-heading"><div className="dashboard-icon"><UserRound size={20}/></div><div><h2>{mode==="signup" ? "Make it yours" : "Welcome back"}</h2><p>Create an account or sign in to reserve a unique username and manage your private inbox.</p></div></div>
        <form onSubmit={authenticate} className="dashboard-form">
          <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
          <label htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode==="signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" required/>
          <button className="primary-button full-button" disabled={busy}>{busy ? "Please wait…" : mode==="signup" ? "Create account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{mode==="signup" ? "Already have an account?" : "New here?"} <button onClick={()=>{setMode(mode==="signup"?"login":"signup");setError("");setNotice("");}}>{mode==="signup"?"Sign in":"Create an account"}</button></p>
        {mode==="signup" && <p className="privacy-note">Email confirmation may be required depending on Supabase Auth settings.</p>}
      </section> :
      !profile ? <section className="dashboard-panel">
        <div className="panel-heading"><div className="dashboard-icon"><UserRound size={20}/></div><div><h2>Claim your username</h2><p>Your username becomes your public anonymous-message link. It can only be claimed once.</p></div></div>
        <form onSubmit={claimProfile} className="dashboard-form">
          <label htmlFor="username">Your username</label><div className="dashboard-username"><span>@</span><input id="username" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g,"").slice(0,24))} placeholder="yourname" required/></div>
          <button className="primary-button full-button" disabled={busy}>Claim username <Check size={16}/></button>
        </form>
        <p className="privacy-note">Signed in securely. Your inbox is private to this account.</p>
        <button className="logout-button" onClick={signOut}><LogOut size={15}/> Sign out</button>
      </section> :
      <>
        <section className="dashboard-panel profile-panel">
          <div className="profile-summary">
            {profile.avatar_url
              ? <img className="send-avatar profile-avatar-img" src={profile.avatar_url} alt={`@${profile.username}`} referrerPolicy="no-referrer"/>
              : <div className="send-avatar" style={{ background: THEMES[themeOrDefault(profile.theme)].gradient }}>{profile.username.slice(0,1).toUpperCase()}</div>}
            <div className="profile-summary-copy"><span className="eyebrow">YOUR PUBLIC LINK</span><h2>@{profile.username}</h2><p>{typeof window !== "undefined" ? window.location.origin : ""}/{profile.username}</p>{profile.bio && <p className="profile-bio">{profile.bio}</p>}</div>
          </div>
          <button className="primary-button full-button" onClick={copyLink}>{copied ? <><Check size={16}/> Copied</> : <><Copy size={16}/> Copy my link</>}</button>
        </section>

        <section className="stats-grid" aria-label="Inbox statistics">
          <div className="stat-card"><strong>{stats.total}</strong><span>Total messages</span></div>
          <div className="stat-card"><strong>{stats.today}</strong><span>Today</span></div>
          <div className="stat-card"><strong>{stats.liked}</strong><span>Liked</span></div>
          <div className="stat-card"><strong>{stats.unread}</strong><span>Unread</span></div>
        </section>

        <section className="dashboard-panel profile-edit-panel">
          <div className="panel-heading"><div className="dashboard-icon"><Palette size={20}/></div><div><h2>Customise your profile</h2><p>Bio, photo and theme show on your public link.</p></div></div>
          <form onSubmit={saveProfile} className="dashboard-form">
            <label htmlFor="bio">Bio</label>
            <textarea id="bio" value={bioDraft} onChange={e=>setBioDraft(e.target.value.slice(0,160))} placeholder="A line about you..." maxLength={160} rows={2}/>
            <span className="field-hint">{bioDraft.length}/160</span>
            <label htmlFor="avatar">Photo URL</label>
            <input id="avatar" type="url" value={avatarDraft} onChange={e=>setAvatarDraft(e.target.value)} placeholder="https://example.com/photo.jpg"/>
            <p className="privacy-note">Paste a direct https image link. Leave empty to use your initial.</p>
            <span className="field-label">Theme</span>
            <div className="theme-picker">
              {THEME_IDS.map((id) => (
                <button type="button" key={id} className={`theme-swatch${themeDraft === id ? " selected" : ""}`} style={{ background: THEMES[id].gradient }} aria-pressed={themeDraft === id} aria-label={THEMES[id].label} title={THEMES[id].label} onClick={()=>setThemeDraft(id)}>
                  {themeDraft === id && <Check size={14}/>}
                </button>
              ))}
            </div>
            <button className="primary-button full-button" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
          </form>
        </section>

        <section className="inbox-section"><div className="inbox-title"><div><span className="eyebrow">STRAIGHT FROM THE HEART</span><h2>Your inbox <span>{messages.length}</span></h2></div><button className="icon-button" aria-label="Refresh inbox" onClick={()=>{setLoading(true);void loadPrivateData();}}><RefreshCw size={16}/></button></div>
          <div className="filter-tabs" role="tablist" aria-label="Filter messages">
            {(["all", "unread", "liked"] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={`filter-tab${filter === f ? " active" : ""}`} onClick={()=>setFilter(f)}>
                {f === "all" ? `All (${stats.total})` : f === "unread" ? `Unread (${stats.unread})` : `Liked (${stats.liked})`}
              </button>
            ))}
          </div>
          {messages.length === 0 ? <div className="dashboard-panel empty-inbox"><div className="empty-icon"><Mail size={22}/></div><h3>Nothing here. Yet.</h3><p>Share your link with friends. Their anonymous messages will show up here.</p><button className="secondary-button" onClick={copyLink}><Copy size={15}/> Share your link</button></div> :
          filteredMessages.length === 0 ? <div className="dashboard-panel empty-inbox"><div className="empty-icon"><Mail size={22}/></div><h3>No messages here.</h3><p>{filter === "unread" ? "You've read everything. Nice." : "No liked messages yet. Tap the heart on a message you love."}</p></div> :
            <div className="inbox-list">{filteredMessages.map(message=><article className={`inbox-message${message.is_read ? " is-read" : ""}`} key={message.id}>
              <div className="message-meta"><span><span className="anonymous-dot"/> ANONYMOUS</span><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
                <button className={`icon-mini${message.liked ? " liked" : ""}`} onClick={()=>void updateMessage(message.id, { liked: !message.liked })} aria-label={message.liked ? "Unlike message" : "Like message"}><Heart size={15} fill={message.liked ? "currentColor" : "none"}/></button>
                <button className="icon-mini" onClick={()=>void updateMessage(message.id, { is_read: !message.is_read })} aria-label={message.is_read ? "Mark as unread" : "Mark as read"}>{message.is_read ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
                <button className="delete-message" onClick={()=>void deleteMessage(message.id)} aria-label="Delete message"><Trash2 size={15}/></button>
              </div>
              <p>{message.message}</p>
              {message.reply && <div className="message-reply"><span>YOUR REPLY</span><p>{message.reply}</p></div>}
              <div className="message-actions">
                <button className="action-button" onClick={()=>{ setReplyingId(replyingId === message.id ? null : message.id); setReplyDrafts((d) => ({ ...d, [message.id]: d[message.id] ?? message.reply ?? "" })); }}><Reply size={14}/> {message.reply ? "Edit reply" : "Reply"}</button>
                <button className="action-button" disabled={sharingId === message.id} onClick={()=>void shareMessage(message)}><Share2 size={14}/> {sharingId === message.id ? "Making image…" : "Share to Story"}</button>
              </div>
              {replyingId === message.id && <div className="reply-editor">
                <textarea value={replyDrafts[message.id] ?? ""} onChange={e=>setReplyDrafts((d) => ({ ...d, [message.id]: e.target.value.slice(0, 500) }))} placeholder="Write your reply..." maxLength={500} rows={3}/>
                <div className="reply-editor-actions">
                  <button className="primary-button" disabled={busy} onClick={()=>void updateMessage(message.id, { reply: replyDrafts[message.id] ?? "" })}>Save reply</button>
                  {message.reply && <button className="secondary-button" onClick={()=>void updateMessage(message.id, { reply: "" })}>Delete reply</button>}
                  <button className="secondary-button" onClick={()=>setReplyingId(null)}>Cancel</button>
                </div>
              </div>}
            </article>)}</div>}
        </section>
        <button className="logout-button" onClick={signOut}><LogOut size={15}/> Sign out</button>
      </>}
    </section>
    <footer className="message-footer">Be kind. Stay curious.</footer>
  </main>;
}
