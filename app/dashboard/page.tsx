"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, AtSign, Ban, Bell, Check, Copy, Download, Eye, EyeOff, Globe, Heart, Inbox, LogOut, Mail, MessageCircle, Moon, Pin, QrCode, RefreshCw, Reply, Search, Share2, Sun, Trash2, Twitter, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { tap } from "@/lib/vibrate";
import { shareLinkCard } from "@/lib/link-card";
import { downloadBlob, renderStoryCardBlob, type CardStyle } from "@/lib/share-card";
import { THEMES, themeOrDefault, type ThemeId } from "@/lib/themes";
import { getInitialLang, tr, useLang } from "@/lib/i18n";
import { getThemeMode, toggleThemeMode, type ThemeMode } from "@/lib/theme";
import AppTabBar, { type AppTab } from "@/components/AppTabBar";

type Message = { id: number; message: string; created_at: string; reply: string | null; liked: boolean; is_read: boolean; is_public: boolean; archived: boolean; pinned: boolean; reaction: string | null };
type Profile = { username: string; created_at?: string; bio: string; avatar_url: string; theme: ThemeId; prompt: string; paused: boolean; prompt_auto: boolean; discoverable: boolean; bg_url: string; instagram: string; tiktok: string; x_handle: string };
type Stats = { total: number; today: number; liked: number; unread: number; byDay: { date: string; count: number }[] };
type Filter = "all" | "unread" | "liked" | "archived";

const REACTIONS = ["❤️", "😂", "😮", "🔥", "😢", "👍"];

function computeStats(list: Message[]): Stats {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const byDay: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart);
    day.setUTCDate(day.getUTCDate() - i);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    byDay.push({
      date: day.toISOString().slice(0, 10),
      count: list.filter((m) => {
        const created = new Date(m.created_at);
        return created >= day && created < next;
      }).length,
    });
  }
  return {
    total: list.length,
    today: list.filter((m) => new Date(m.created_at) >= todayStart).length,
    liked: list.filter((m) => m.liked).length,
    unread: list.filter((m) => !m.is_read).length,
    byDay,
  };
}

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, today: 0, liked: 0, unread: 0, byDay: [] });
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<AppTab>("home");
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);












  const [qrUrl, setQrUrl] = useState("");
  const [sharingLink, setSharingLink] = useState(false);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [storyPreview, setStoryPreview] = useState<{ url: string; blob: Blob; filename: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cardStyle, setCardStyle] = useState<CardStyle>("classic");

  const [notificationsOn, setNotificationsOn] = useState(false);
  const [lang, setLang] = useLang();
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  useEffect(() => { setThemeMode(getThemeMode()); }, []);
  const t = (key: string) => tr(lang, key);
  const prevTotalRef = useRef(0);

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
      }
      const nextMessages = (inboxData.messages || []) as Message[];
      setMessages(nextMessages);
      setStats(inboxData.stats || computeStats(nextMessages));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data gagal dimuat.");
    } finally { setLoading(false); }
  }

  // QR preview of the public link, regenerated when the profile loads.
  useEffect(() => {
    if (!profile) { setQrUrl(""); return; }
    let active = true;
    const link = `${window.location.origin}/${profile.username}`;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then((url) => { if (active) setQrUrl(url); })
      .catch(() => {});
    return () => { active = false; };
  }, [profile]);

  // New-message notifications while the dashboard is open (browser
  // Notification API, polled once a minute). No email provider needed.
  useEffect(() => {
    if (!notificationsOn || !profile) return;
    prevTotalRef.current = messages.length;
    const timer = setInterval(async () => {
      try {
        const inbox = await request("/api/inbox");
        const next = (inbox.messages || []) as Message[];
        if (next.length > prevTotalRef.current) {
          const diff = next.length - prevTotalRef.current;
          prevTotalRef.current = next.length;
          setMessages(next);
          setStats(inbox.stats || computeStats(next));
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            const nLang = getInitialLang();
            new Notification(tr(nLang, "dash.notifyTitle"), { body: tr(nLang, "dash.notifyBody").replace("{count}", String(diff)) });
          }
        }
      } catch { /* polling failure is silent; the manual refresh still works */ }
    }, 60000);
    return () => clearInterval(timer);
  }, [notificationsOn, profile]);

  useEffect(() => {
    let active = true;
    try {
      const supabase = getSupabaseBrowserClient();
      const preset = new URLSearchParams(window.location.search).get("username");
      if (preset) setUsername(preset.replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 24));
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam === "inbox" || tabParam === "home") setTab(tabParam);
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
        else { setProfile(null); setMessages([]); setStats({ total: 0, today: 0, liked: 0, unread: 0, byDay: [] }); setLoading(false); }
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
      const nextMessages = (inbox.messages || []) as Message[];
      setMessages(nextMessages);
      setStats(inbox.stats || computeStats(nextMessages));
    } catch (e) { setError(e instanceof Error ? e.message : "Username gagal dibuat."); }
    finally { setBusy(false); }
  }

  async function updateMessage(id: number, patch: { reply?: string; liked?: boolean; is_read?: boolean; is_public?: boolean; archived?: boolean; pinned?: boolean; reaction?: string }) {
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

  async function blockSender(messageId: number) {
    setError(""); setNotice("");
    try {
      await request("/api/blocks", { method: "POST", body: JSON.stringify({ messageId }) });
      setNotice("Pengirim diblokir. Pesan darinya tidak akan masuk lagi.");
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal memblokir pengirim."); }
  }

  function exportInbox() {
    const payload = {
      username: profile?.username,
      exported_at: new Date().toISOString(),
      messages: messages.map((m) => ({ id: m.id, message: m.message, reply: m.reply, liked: m.liked, is_read: m.is_read, is_public: m.is_public, archived: m.archived, pinned: m.pinned, reaction: m.reaction, created_at: m.created_at })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ngl-inbox-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setNotice("Inbox diekspor sebagai file JSON.");
  }

  function shareVia(platform: "whatsapp" | "x" | "threads") {
    if (!profile) return;
    const link = `${window.location.origin}/${profile.username}`;
    const text = `Kirim aku pesan anonim di ${link}`;
    const url = platform === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(text)}`
      : platform === "x"
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
        : `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  }

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setError("Browser ini tidak mendukung notifikasi.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsOn(true);
      setNotice("Notifikasi diaktifkan. Kamu akan diberi tahu saat ada pesan baru selagi dashboard terbuka.");
    } else {
      setError("Izin notifikasi ditolak. Aktifkan dari pengaturan browser.");
    }
  }

  async function shareMessage(message: Message) {
    if (!profile) return;
    setSharingId(message.id); setError(""); setNotice("");
    try {
      const rendered = await renderStoryCardBlob({
        username: profile.username,
        message: message.message,
        reply: message.reply,
        theme: profile.theme,
        style: cardStyle,
      });
      const url = URL.createObjectURL(rendered.blob);
      setStoryPreview((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { url, blob: rendered.blob, filename: rendered.filename }; });
    } catch {
      setError("Gambar Story gagal dibuat di browser ini.");
    } finally { setSharingId(null); }
  }

  function closeStoryPreview() {
    setStoryPreview((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
  }

  async function confirmStoryShare() {
    if (!storyPreview) return;
    const file = new File([storyPreview.blob], storyPreview.filename, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My NGL reply" });
        setNotice(t("dash.storyShared"));
      } else {
        downloadBlob(storyPreview.blob, storyPreview.filename);
        setNotice(t("dash.storyDownloaded"));
      }
    } catch {
      // The share sheet was dismissed: keep the preview open.
      return;
    }
    closeStoryPreview();
  }

  useEffect(() => {
    if (!storyPreview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeStoryPreview(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [storyPreview]);

  async function shareLink() {
    tap();
    if (!profile) return;
    setSharingLink(true); setError(""); setNotice("");
    try {
      const result = await shareLinkCard({
        username: profile.username,
        prompt: profile.prompt,
        bio: profile.bio,
        theme: profile.theme,
        origin: window.location.origin,
      });
      setNotice(result === "shared" ? t("dash.cardShared") : t("dash.cardDownloaded"));
    } catch {
      setError("Kartu link gagal dibuat di browser ini.");
    } finally { setSharingLink(false); }
  }

  async function copyLink() {
    if (!profile) return;
    tap();
    const link = `${window.location.origin}/${profile.username}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Gagal menyalin link. Salin manual: " + link); }
  }

  async function copyEmbedCode() {
    if (!profile) return;
    const src = `${window.location.origin}/embed/${profile.username}`;
    const code = `<iframe src="${src}" width="320" height="200" style="border:0;border-radius:16px" loading="lazy" title="Ask @${profile.username} anonymously"></iframe>`;
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Kode embed disalin. Tempel di website atau blog kamu.");
    } catch { setError("Gagal menyalin kode embed."); }
  }

  async function signOut() {
    try { await getSupabaseBrowserClient().auth.signOut(); setNotice("Kamu sudah logout."); }
    catch { setError("Logout gagal. Coba lagi."); }
  }

  const archivedCount = messages.filter((m) => m.archived).length;
  const visibleMessages = messages.filter((m) => filter === "archived" ? m.archived : !m.archived);
  const filteredMessages = visibleMessages.filter((m) => {
    if (filter === "unread" && m.is_read) return false;
    if (filter === "liked" && !m.liked) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!m.message.toLowerCase().includes(q) && !(m.reply || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const maxDayCount = Math.max(1, ...stats.byDay.map((d) => d.count));
  const chartSummary = stats.byDay.map((d) => `${new Date(`${d.date}T00:00:00Z`).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { weekday: "short" })}: ${d.count}`).join(", ");

  return <main className={profile ? "dashboard-page has-tabbar" : "dashboard-page"} id="main" tabIndex={-1}>
    <a className="skip-link" href="#main">{t("a11y.skip")}</a>
    <header className="dashboard-nav"><div className="app-bar-inner">{profile ? <Link href="/settings" className="app-bar-identity" aria-label={t("nav.settings")}>{profile.avatar_url ? <img className="app-bar-avatar" src={profile.avatar_url} alt="" referrerPolicy="no-referrer"/> : <span className="app-bar-avatar app-bar-avatar-initial" style={{ background: THEMES[themeOrDefault(profile.theme)].gradient }}>{profile.username.slice(0, 1).toUpperCase()}</span>}<span>@{profile.username}</span></Link> : <Link href="/" className="back-link"><ArrowLeft size={17}/><span>ngl.</span></Link>}<div className="nav-actions"><span className="private-tag"><Inbox size={13}/> private inbox</span><button className="icon-mini" onClick={() => setThemeMode(toggleThemeMode())} aria-label="Toggle theme">{themeMode === "light" ? <Moon size={15}/> : <Sun size={15}/>}</button><button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>{lang === "id" ? "EN" : "ID"}</button></div></div></header>
    <section className="dashboard-shell" data-tab={tab}>
      <div className="dashboard-heading dash-tab-panel" data-panel="home"><span className="eyebrow">YOUR SPACE, YOUR RULES</span><h1>{t("dash.titleA")}<br/><span className="gradient-text">{t("dash.titleB")}</span></h1><p>{t("dash.sub")}</p></div>
      {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
      {notice && <div className="dashboard-alert success-alert" role="status"><Check size={15}/>{notice}<button type="button" className="notice-dismiss" onClick={()=>setNotice("")} aria-label={t("dash.dismiss")}>×</button></div>}
      {loading ? <div className="dashboard-panel loading-panel ngl-panel"><RefreshCw className="spin-icon" size={20}/> {t("dash.loading")}</div> :
      !profile && !isAuthenticated ? <section className="dashboard-panel ngl-panel">
        <div className="panel-heading"><div className="dashboard-icon"><UserRound size={20}/></div><div><h2>{mode==="signup" ? t("dash.make") : t("dash.welcome")}</h2><p>{t("dash.authDesc")}</p></div></div>
        <form onSubmit={authenticate} className="dashboard-form">
          <label htmlFor="email">{t("dash.email")}</label><input id="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
          <label htmlFor="password">{t("dash.password")}</label><input id="password" type="password" autoComplete={mode==="signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" required/>
          <button className="primary-button full-button" disabled={busy}>{busy ? "Please wait…" : mode==="signup" ? t("dash.createAccount") : t("dash.signin")}</button>
        </form>
        <p className="auth-switch">{mode==="signup" ? t("dash.haveAccount") : t("dash.newHere")} <button onClick={()=>{setMode(mode==="signup"?"login":"signup");setError("");setNotice("");}}>{mode==="signup" ? t("dash.signin") : t("dash.createAccount")}</button></p>
        {mode==="signup" && <p className="privacy-note">{t("dash.confirmHint")}</p>}
      </section> :
      !profile ? <section className="dashboard-panel ngl-panel">
        <div className="panel-heading"><div className="dashboard-icon"><UserRound size={20}/></div><div><h2>{t("dash.claimTitle")}</h2><p>{t("dash.claimDesc")}</p></div></div>
        <form onSubmit={claimProfile} className="dashboard-form">
          <label htmlFor="username">Your username</label><div className="dashboard-username"><span>@</span><input id="username" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g,"").slice(0,24))} placeholder="yourname" required/></div>
          <button className="primary-button full-button" disabled={busy}>{t("dash.claimBtn")} <Check size={16}/></button>
        </form>
        <p className="privacy-note">{t("dash.signedIn")}</p>
        <button className="logout-button" onClick={signOut}><LogOut size={15}/> {t("dash.signOut")}</button>
      </section> :
      <><div className="dash-tab-panel" data-panel="home">
        <section className="dashboard-panel profile-panel ngl-panel">
          <div className="ngl-head">{t("play.sendMe")}</div>
          <div className="profile-summary">
            {profile.avatar_url
              ? <img className="send-avatar profile-avatar-img" src={profile.avatar_url} alt={`@${profile.username}`} referrerPolicy="no-referrer"/>
              : <div className="send-avatar" style={{ background: THEMES[themeOrDefault(profile.theme)].gradient }}>{profile.username.slice(0,1).toUpperCase()}</div>}
            <div className="profile-summary-copy"><span className="eyebrow">{t("dash.yourLink")}</span><h2>@{profile.username}</h2><p>{typeof window !== "undefined" ? window.location.origin : ""}/{profile.username}</p>{profile.bio && <p className="profile-bio">{profile.bio}</p>}</div>
          </div>
          <div className="ngl-step"><span>{t("play.step1")}</span><div className="ngl-link-row"><span>{typeof window !== "undefined" ? window.location.origin : ""}/{profile.username}</span><button className="secondary-button" onClick={copyLink}>{copied ? <><Check size={15}/> {t("dash.copied")}</> : <><Copy size={15}/> {t("dash.copy")}</>}</button></div></div>
          <div className="ngl-step"><span>{t("play.step2")}</span><button className="ngl-share-btn" disabled={sharingLink} onClick={()=>void shareLink()}><Share2 size={17}/> {sharingLink ? t("dash.making") : t("play.share")}</button><div className="share-via"><span>{t("dash.shareVia")}</span><button className="secondary-button" onClick={()=>shareVia("whatsapp")}><MessageCircle size={15}/> WhatsApp</button><button className="secondary-button" onClick={()=>shareVia("x")}><Twitter size={15}/> X</button><button className="secondary-button" onClick={()=>shareVia("threads")}><AtSign size={15}/> Threads</button></div></div>
          <div className="qr-row">
            {qrUrl && <img className="qr-image" src={qrUrl} alt="QR code to your anonymous link"/>}
            <div className="qr-copy"><strong>{t("dash.qrTitle")}</strong><p>{t("dash.qrDesc")}</p><button className="secondary-button" disabled={sharingLink} onClick={()=>void shareLink()}><QrCode size={15}/> {sharingLink ? t("dash.making") : t("dash.qrBtn")}</button></div>
          </div>
          <button className="secondary-button" onClick={()=>void enableNotifications()} disabled={notificationsOn}><Bell size={15}/> {notificationsOn ? t("dash.notifyOn") : t("dash.notify")}</button>
          <button className="secondary-button" onClick={()=>void copyEmbedCode()}><Globe size={15}/> Copy embed code</button>
        </section>

        <section className="stats-grid" aria-label="Inbox statistics">
          <div className="stat-card"><strong>{stats.total}</strong><span>{t("dash.statTotal")}</span></div>
          <div className="stat-card"><strong>{stats.today}</strong><span>{t("dash.statToday")}</span></div>
          <div className="stat-card"><strong>{stats.liked}</strong><span>{t("dash.statLiked")}</span></div>
          <div className="stat-card"><strong>{stats.unread}</strong><span>{t("dash.statUnread")}</span></div>
        </section>

        {stats.byDay.length > 0 && <section className="dashboard-panel week-chart ngl-panel"><h3>{t("dash.weekTitle")}</h3><div className="chart-bars" role="img" aria-label={`${t("dash.weekTitle")}: ${chartSummary}`}>{stats.byDay.map((d) => <div className="chart-bar-col" key={d.date} aria-hidden="true"><div className="chart-bar" style={{ height: `${Math.max(4, Math.round((d.count / maxDayCount) * 72))}px` }} title={`${d.date}: ${d.count}`}/><span>{new Date(`${d.date}T00:00:00Z`).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { weekday: "short" })}</span><strong>{d.count}</strong></div>)}</div></section>}</div><div className="dash-tab-panel" data-panel="inbox">


        <section className="inbox-section"><div className="inbox-title"><div><span className="eyebrow">{t("dash.inboxEyebrow")}</span><h2>{t("dash.inbox")} <span>{messages.length}</span></h2></div><button className="icon-button" aria-label="Refresh inbox" onClick={()=>{setLoading(true);void loadPrivateData();}}><RefreshCw size={16}/></button></div>
          <div className="inbox-tools">
            <div className="search-box"><Search size={15}/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder={t("dash.search")} aria-label={t("dash.search")}/></div>
            <button className="secondary-button" onClick={exportInbox}><Download size={15}/> {t("dash.export")}</button>
            <select className="card-style-select" value={cardStyle} onChange={e=>setCardStyle(e.target.value as CardStyle)} aria-label="Card style">
              <option value="classic">Classic card</option><option value="minimal">Minimal card</option><option value="bold">Bold card</option>
            </select>
          </div>
          <div className="filter-tabs" role="tablist" aria-label="Filter messages">
            {(["all", "unread", "liked", "archived"] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={`filter-tab${filter === f ? " active" : ""}`} onClick={()=>setFilter(f)}>
                {f === "all" ? `${t("dash.all")} (${stats.total - archivedCount})` : f === "unread" ? `${t("dash.unread")} (${stats.unread})` : f === "liked" ? `${t("dash.liked")} (${stats.liked})` : `${t("dash.archived")} (${archivedCount})`}
              </button>
            ))}
          </div>
          {messages.length === 0 ? <div className="dashboard-panel empty-inbox"><div className="empty-icon"><Mail size={22}/></div><h3>{t("dash.emptyTitle")}</h3><p>{t("dash.emptyDesc")}</p><button className="secondary-button" onClick={copyLink}><Copy size={15}/> {t("dash.shareLink")}</button></div> :
          filteredMessages.length === 0 ? <div className="dashboard-panel empty-inbox"><div className="empty-icon"><Mail size={22}/></div><h3>{t("dash.noFilterTitle")}</h3><p>{filter === "unread" ? t("dash.noUnread") : filter === "liked" ? t("dash.noLiked") : filter === "archived" ? t("dash.noArchived") : t("dash.emptyDesc")}</p></div> :
            <div className="inbox-list">{filteredMessages.map(message=><article className={`inbox-message${message.is_read ? " is-read" : ""}${message.archived ? " is-archived" : ""}`} key={message.id}>
              <div className="message-meta"><span><span className="anonymous-dot"/> ANONYMOUS</span><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>{message.is_public && <span className="public-badge">{t("dash.public").toUpperCase()}</span>}{message.pinned && <span className="public-badge">PINNED</span>}
                <button className={`icon-mini${message.liked ? " liked" : ""}`} onClick={()=>{tap();void updateMessage(message.id, { liked: !message.liked });}} aria-label={message.liked ? "Unlike message" : "Like message"}><Heart size={15} fill={message.liked ? "currentColor" : "none"}/></button>
                <button className="icon-mini" onClick={()=>void updateMessage(message.id, { is_read: !message.is_read })} aria-label={message.is_read ? "Mark as unread" : "Mark as read"}>{message.is_read ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
                <button className="delete-message" onClick={()=>void deleteMessage(message.id)} aria-label="Delete message"><Trash2 size={15}/></button>
              </div>
              <p>{message.message}</p>
              {message.reaction && <span className="message-reaction">{message.reaction}</span>}
              {message.reply && <div className="message-reply"><span>{t("dash.yourReply")}</span><p>{message.reply}</p></div>}
              <div className="reaction-row">{REACTIONS.map((emoji) => <button key={emoji} className={`reaction-button${message.reaction === emoji ? " selected" : ""}`} onClick={()=>void updateMessage(message.id, { reaction: message.reaction === emoji ? "" : emoji })} aria-label={`React ${emoji}`}>{emoji}</button>)}</div>
              <div className="message-actions">
                <button className="action-button" onClick={()=>{ setReplyingId(replyingId === message.id ? null : message.id); setReplyDrafts((d) => ({ ...d, [message.id]: d[message.id] ?? message.reply ?? "" })); }}><Reply size={14}/> {message.reply ? t("dash.editReply") : t("dash.reply")}</button>
                <button className="action-button" disabled={sharingId === message.id} onClick={()=>void shareMessage(message)}><Share2 size={14}/> {sharingId === message.id ? t("dash.making") : t("dash.shareStory")}</button>
                <button className={`action-button${message.is_public ? " active" : ""}`} disabled={!message.reply} title={message.reply ? "Show this answer on your public link" : "Reply first to publish"} onClick={()=>void updateMessage(message.id, { is_public: !message.is_public })}><Globe size={14}/> {message.is_public ? t("dash.public") : t("dash.publish")}</button>
                <button className="action-button" onClick={()=>void updateMessage(message.id, { pinned: !message.pinned })}><Pin size={14}/> {message.pinned ? t("dash.unpin") : t("dash.pin")}</button>
                <button className="action-button" onClick={()=>void updateMessage(message.id, { archived: !message.archived })}><Archive size={14}/> {message.archived ? t("dash.unarchive") : t("dash.archive")}</button>
                <button className="action-button" onClick={()=>void blockSender(message.id)}><Ban size={14}/> {t("dash.block")}</button>
              </div>
              {replyingId === message.id && <div className="reply-editor">
                <textarea value={replyDrafts[message.id] ?? ""} onChange={e=>setReplyDrafts((d) => ({ ...d, [message.id]: e.target.value.slice(0, 500) }))} placeholder="Write your reply..." maxLength={500} rows={3}/>
                <div className="reply-editor-actions">
                  <button className="primary-button" disabled={busy} onClick={()=>void updateMessage(message.id, { reply: replyDrafts[message.id] ?? "" })}>{t("dash.saveReply")}</button>
                  {message.reply && <button className="secondary-button" onClick={()=>void updateMessage(message.id, { reply: "" })}>{t("dash.deleteReply")}</button>}
                  <button className="secondary-button" onClick={()=>setReplyingId(null)}>{t("dash.cancel")}</button>
                </div>
              </div>}
            </article>)}</div>}
        </section></div>
      </>}
    </section>
    {profile && <AppTabBar active={tab} unread={stats.unread} lang={lang} onTab={setTab} />}
    <footer className="message-footer">{t("dash.privacy")}</footer>
    {storyPreview && <div className="story-modal" role="dialog" aria-modal="true" aria-label={t("dash.storyPreview")} onClick={(e)=>{ if (e.target === e.currentTarget) closeStoryPreview(); }}>
      <div className="story-modal-card"><div className="sheet-handle" aria-hidden="true"/>
        <h2>{t("dash.storyPreview")}</h2>
        <p>{t("dash.storyPreviewDesc")}</p>
        <img src={storyPreview.url} alt={t("dash.storyPreview")} />
        <div className="story-modal-actions">
          <button className="primary-button" onClick={()=>void confirmStoryShare()}><Share2 size={16}/> {t("dash.shareStory")}</button>
          <button className="secondary-button" onClick={closeStoryPreview}>{t("dash.close")}</button>
        </div>
      </div>
    </div>}
  </main>;
}
