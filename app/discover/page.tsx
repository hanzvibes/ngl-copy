"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Compass, Moon, Sun } from "lucide-react";
import { THEMES, themeOrDefault, type ThemeId } from "@/lib/themes";
import { tr, useLang } from "@/lib/i18n";
import { getThemeMode, toggleThemeMode, type ThemeMode } from "@/lib/theme";
import AppTabBar from "@/components/AppTabBar";

type DiscoverProfile = { username: string; bio: string; avatar_url: string; theme: ThemeId; prompt: string };

export default function DiscoverPage() {
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lang, setLang] = useLang();
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  useEffect(() => { setThemeMode(getThemeMode()); }, []);
  const t = (key: string) => tr(lang, key);

  useEffect(() => {
    fetch("/api/discover")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Discover gagal dimuat.");
        setProfiles(data.profiles || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Discover gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);

  return <main className="dashboard-page has-tabbar" id="main" tabIndex={-1}><a className="skip-link" href="#main">{t("a11y.skip")}</a>
    <header className="dashboard-nav"><div className="app-bar-inner"><Link href="/" className="back-link"><ArrowLeft size={17}/><span>ngl.</span></Link><div className="nav-actions"><button className="icon-mini" onClick={() => setThemeMode(toggleThemeMode())} aria-label="Toggle theme">{themeMode === "light" ? <Moon size={15}/> : <Sun size={15}/>}</button><button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>{lang === "id" ? "EN" : "ID"}</button></div></div></header>
    <section className="dashboard-shell">
      <div className="dashboard-heading"><span className="eyebrow">FIND SOMEONE TO ASK</span><h1><span className="gradient-text">{t("nav.discover")}</span></h1><p>{lang === "id" ? "Link yang pemiliknya memilih tampil di sini. Ketuk salah satu untuk mengirim pesan anonim." : "Links whose owners chose to be listed here. Tap one to send an anonymous message."}</p></div>
      {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
      {loading ? <div className="dashboard-panel loading-panel">Loading…</div> :
      profiles.length === 0 ? <div className="dashboard-panel empty-inbox"><div className="empty-icon"><Compass size={22}/></div><h3>{lang === "id" ? "Belum ada yang tampil di sini." : "No one listed here yet."}</h3><p>{lang === "id" ? "Aktifkan “Tampilkan di Discover” dari dashboard profilmu untuk muncul di sini." : "Turn on “Show in Discover” from your profile dashboard to appear here."}</p></div> :
      <div className="discover-grid">{profiles.map((p) => <Link key={p.username} href={`/${encodeURIComponent(p.username)}`} className="discover-card">
        {p.avatar_url
          ? <img className="discover-avatar" src={p.avatar_url} alt={`@${p.username}`} referrerPolicy="no-referrer"/>
          : <div className="discover-avatar discover-avatar-initial" aria-hidden="true" style={{ background: THEMES[themeOrDefault(p.theme)].gradient }}>{p.username.slice(0, 1).toUpperCase()}</div>}
        <strong>@{p.username}</strong>
        {p.prompt && <p className="discover-prompt">“{p.prompt}”</p>}
        {p.bio && <p className="discover-bio">{p.bio}</p>}
      </Link>)}</div>}
    </section>
    <AppTabBar active="discover" lang={lang} />
  </main>;
}
