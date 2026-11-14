"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, LogOut, Moon, Palette, RefreshCw, Sun } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { THEMES, THEME_IDS, themeOrDefault, type ThemeId } from "@/lib/themes";
import { tr, useLang } from "@/lib/i18n";
import { getThemeMode, toggleThemeMode, type ThemeMode } from "@/lib/theme";
import AppTabBar from "@/components/AppTabBar";

type Profile = { username: string; created_at?: string; bio: string; avatar_url: string; theme: ThemeId; prompt: string; paused: boolean; prompt_auto: boolean; discoverable: boolean; bg_url: string; instagram: string; tiktok: string; x_handle: string };
type Block = { ip_hash: string; created_at: string };

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState("");
  const [themeDraft, setThemeDraft] = useState<ThemeId>("pink");
  const [promptDraft, setPromptDraft] = useState("");
  const [bgDraft, setBgDraft] = useState("");
  const [instagramDraft, setInstagramDraft] = useState("");
  const [tiktokDraft, setTiktokDraft] = useState("");
  const [xDraft, setXDraft] = useState("");
  const [pausedDraft, setPausedDraft] = useState(false);
  const [promptAutoDraft, setPromptAutoDraft] = useState(false);
  const [discoverableDraft, setDiscoverableDraft] = useState(false);
  const [newUsernameDraft, setNewUsernameDraft] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [lang, setLang] = useLang();
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  useEffect(() => { setThemeMode(getThemeMode()); }, []);
  const t = (key: string) => tr(lang, key);

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

  async function loadSettings() {
    try {
      const profileData = await request("/api/profile");
      const nextProfile = profileData.profile as Profile | null;
      setProfile(nextProfile);
      if (nextProfile) {
        setBioDraft(nextProfile.bio || "");
        setAvatarDraft(nextProfile.avatar_url || "");
        setThemeDraft(themeOrDefault(nextProfile.theme));
        setPromptDraft(nextProfile.prompt || "");
        setBgDraft(nextProfile.bg_url || "");
        setInstagramDraft(nextProfile.instagram || "");
        setTiktokDraft(nextProfile.tiktok || "");
        setXDraft(nextProfile.x_handle || "");
        setPausedDraft(Boolean(nextProfile.paused));
        setPromptAutoDraft(Boolean(nextProfile.prompt_auto));
        setDiscoverableDraft(Boolean(nextProfile.discoverable));
        setNewUsernameDraft(nextProfile.username);
      }
      try {
        const blocksData = await request("/api/blocks");
        setBlocks(blocksData.blocks || []);
      } catch { setBlocks([]); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data gagal dimuat.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) { router.replace("/dashboard"); return; }
      void loadSettings();
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const data = await request("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ bio: bioDraft, avatar_url: avatarDraft, theme: themeDraft, prompt: promptDraft, bg_url: bgDraft, instagram: instagramDraft, tiktok: tiktokDraft, x_handle: xDraft, paused: pausedDraft, prompt_auto: promptAutoDraft, discoverable: discoverableDraft }),
      });
      setProfile(data.profile);
      setNotice("Profil diperbarui.");
    } catch (e) { setError(e instanceof Error ? e.message : "Profil gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function changeUsername(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const data = await request("/api/profile", { method: "PATCH", body: JSON.stringify({ username: newUsernameDraft }) });
      setProfile(data.profile); setNewUsernameDraft(data.profile.username);
      setNotice(`Username diganti jadi @${data.profile.username}. Link lama sudah tidak aktif.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Username gagal diganti."); }
    finally { setBusy(false); }
  }

  async function unblock(ipHash: string) {
    setError(""); setNotice("");
    try {
      await request(`/api/blocks?ip_hash=${encodeURIComponent(ipHash)}`, { method: "DELETE" });
      setBlocks(blocks.filter((b) => b.ip_hash !== ipHash));
      setNotice("Blokir dibuka.");
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal membuka blokir."); }
  }

  async function signOut() {
    try { await getSupabaseBrowserClient().auth.signOut(); router.replace("/dashboard"); }
    catch { setError("Logout gagal. Coba lagi."); }
  }

  return <main className="dashboard-page has-tabbar" id="main" tabIndex={-1}>
    <a className="skip-link" href="#main">{t("a11y.skip")}</a>
    <header className="dashboard-nav"><div className="app-bar-inner"><Link href="/" className="back-link"><ArrowLeft size={17}/><span>ngl.</span></Link><div className="nav-actions"><button className="icon-mini" onClick={() => setThemeMode(toggleThemeMode())} aria-label="Toggle theme">{themeMode === "light" ? <Moon size={15}/> : <Sun size={15}/>}</button><button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>{lang === "id" ? "EN" : "ID"}</button></div></div></header>
    <section className="dashboard-shell">
      <div className="dashboard-heading"><span className="eyebrow">YOUR PROFILE, YOUR RULES</span><h1>{t("settings.title")}</h1><p>{t("settings.sub")}</p></div>
      {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
      {notice && <div className="dashboard-alert success-alert" role="status"><Check size={15}/>{notice}<button type="button" className="notice-dismiss" onClick={()=>setNotice("")} aria-label={t("dash.dismiss")}>×</button></div>}
      {loading ? <div className="dashboard-panel loading-panel ngl-panel"><RefreshCw className="spin-icon" size={20}/> {t("dash.loading")}</div> :
      !profile ? <section className="dashboard-panel ngl-panel"><div className="panel-heading"><div className="dashboard-icon"><Palette size={20}/></div><div><h2>{t("settings.title")}</h2><p>{t("settings.noProfile")}</p></div></div><Link className="primary-button full-button" href="/dashboard">{t("settings.goDashboard")}</Link></section> :
      <>
        <section className="dashboard-panel profile-edit-panel ngl-panel">
          <div className="panel-heading"><div className="dashboard-icon"><Palette size={20}/></div><div><h2>{t("dash.customise")}</h2><p>{t("dash.customiseDesc")}</p></div></div>
          <form onSubmit={saveProfile} className="dashboard-form">
            <label htmlFor="bio">{t("dash.bio")}</label>
            <textarea id="bio" value={bioDraft} onChange={e=>setBioDraft(e.target.value.slice(0,160))} placeholder="A line about you..." maxLength={160} rows={2}/>
            <span className="field-hint">{bioDraft.length}/160</span>
            <label htmlFor="avatar">{t("dash.photo")}</label>
            <input id="avatar" type="url" value={avatarDraft} onChange={e=>setAvatarDraft(e.target.value)} placeholder="https://example.com/photo.jpg"/>
            <p className="privacy-note">{t("dash.photoHint")}</p>
            <label htmlFor="bg">{t("dash.bg")}</label>
            <input id="bg" type="url" value={bgDraft} onChange={e=>setBgDraft(e.target.value)} placeholder="https://example.com/background.jpg"/>
            <p className="privacy-note">{t("dash.bgHint")}</p>
            <span className="field-label">{t("dash.theme")}</span>
            <div className="theme-picker">
              {THEME_IDS.map((id) => (
                <button type="button" key={id} className={`theme-swatch${themeDraft === id ? " selected" : ""}`} style={{ background: THEMES[id].gradient }} aria-pressed={themeDraft === id} aria-label={THEMES[id].label} title={THEMES[id].label} onClick={()=>setThemeDraft(id)}>
                  {themeDraft === id && <Check size={14}/>}
                </button>
              ))}
            </div>
            <label htmlFor="prompt">{t("dash.question")}</label>
            <input id="prompt" value={promptDraft} onChange={e=>setPromptDraft(e.target.value.slice(0,140))} placeholder="Ask me anything..." maxLength={140}/>
            <span className="field-hint">{promptDraft.length}/140 — {t("dash.questionHint")}</span>
            <label className="toggle-row"><input type="checkbox" checked={promptAutoDraft} onChange={e=>setPromptAutoDraft(e.target.checked)}/><span>{t("dash.daily")}</span></label>
            <label className="toggle-row"><input type="checkbox" checked={pausedDraft} onChange={e=>setPausedDraft(e.target.checked)}/><span>{t("dash.pause")}</span></label>
            <label className="toggle-row"><input type="checkbox" checked={discoverableDraft} onChange={e=>setDiscoverableDraft(e.target.checked)}/><span>{t("dash.discoverable")}</span></label>
            <span className="field-label">{t("dash.socials")}</span>
            <label htmlFor="instagram">Instagram</label>
            <input id="instagram" value={instagramDraft} onChange={e=>setInstagramDraft(e.target.value)} placeholder="username" maxLength={100}/>
            <label htmlFor="tiktok">TikTok</label>
            <input id="tiktok" value={tiktokDraft} onChange={e=>setTiktokDraft(e.target.value)} placeholder="username" maxLength={100}/>
            <label htmlFor="x">X</label>
            <input id="x" value={xDraft} onChange={e=>setXDraft(e.target.value)} placeholder="username" maxLength={100}/>
            <button className="primary-button full-button" disabled={busy}>{busy ? t("dash.saving") : t("dash.save")}</button>
          </form>
          <form onSubmit={changeUsername} className="dashboard-form username-change">
            <label htmlFor="newUsername">{t("dash.newUsername")}</label>
            <div className="dashboard-username"><span>@</span><input id="newUsername" value={newUsernameDraft} onChange={e=>setNewUsernameDraft(e.target.value.replace(/[^a-zA-Z0-9_.]/g,"").slice(0,24))} placeholder={profile.username} required/></div>
            <button className="secondary-button" disabled={busy}>{t("dash.changeUsername")}</button>
          </form>
        </section>

        <section className="dashboard-panel blocked-panel ngl-panel">
          <h3>{t("dash.blockedTitle")} <span>({blocks.length})</span></h3>
          {blocks.length === 0 ? <p className="privacy-note">{t("dash.noBlocked")}</p> :
            <ul className="blocked-list">{blocks.map((b) => <li key={b.ip_hash}><code>{b.ip_hash.slice(0, 12)}…</code><span>{new Date(b.created_at).toLocaleDateString()}</span><button className="secondary-button" onClick={()=>void unblock(b.ip_hash)}>{t("dash.unblock")}</button></li>)}</ul>}
        </section>
        <button className="logout-button" onClick={signOut}><LogOut size={15}/> {t("dash.signOut")}</button>
      </>}
    </section>
    <AppTabBar active="profile" lang={lang} />
    <footer className="message-footer">{t("dash.privacy")}</footer>
  </main>;
}
