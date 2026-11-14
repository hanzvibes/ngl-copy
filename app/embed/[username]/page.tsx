"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getDailyQuestion } from "@/lib/questions";
import { THEMES, themeOrDefault, type ThemeId } from "@/lib/themes";

type PublicProfile = { bio: string; avatar_url: string; theme: ThemeId; prompt: string; prompt_auto: boolean };

// Minimal card for embedding on a website or blog via <iframe>.
// Clicking it opens the full public link in a new tab.
export default function EmbedPage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username || "").replace(/^@/, "");
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/public-profile?username=${encodeURIComponent(username)}`)
      .then(async (response) => {
        if (!response.ok || !active) return;
        const data = await response.json();
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [username]);

  const theme = themeOrDefault(profile?.theme);
  const shownPrompt = profile?.prompt_auto ? getDailyQuestion() : profile?.prompt;

  return <main className="embed-page">
    <a className="embed-card" href={`/${encodeURIComponent(username)}`} target="_blank" rel="noreferrer">
      {profile?.avatar_url
        ? <img className="embed-avatar" src={profile.avatar_url} alt={`@${username}`} referrerPolicy="no-referrer"/>
        : <div className="embed-avatar embed-avatar-initial" style={{ background: THEMES[theme].gradient }}>{username.slice(0, 1).toUpperCase()}</div>}
      <div className="embed-copy">
        <strong>@{username}</strong>
        {shownPrompt ? <p>“{shownPrompt}”</p> : <p>Send me an anonymous message.</p>}
        <span>ngl. →</span>
      </div>
    </a>
  </main>;
}
