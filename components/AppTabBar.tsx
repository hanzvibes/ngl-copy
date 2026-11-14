"use client";

import Link from "next/link";
import { Compass, Home, Inbox, UserRound } from "lucide-react";
import { tr, type Lang } from "@/lib/i18n";

export type AppTab = "home" | "inbox" | "discover" | "profile";

type TabBarProps = {
  active: AppTab;
  unread?: number;
  lang: Lang;
  /** On the dashboard, switching tabs is instant in-page state. Without it, tabs are plain links. */
  onTab?: (tab: AppTab) => void;
};

export default function AppTabBar({ active, unread = 0, lang, onTab }: TabBarProps) {
  const t = (key: string) => tr(lang, key);
  const tabs: { id: AppTab; label: string; icon: React.ReactNode; href: string }[] = [
    { id: "home", label: t("nav.home"), icon: <Home size={22} />, href: "/dashboard" },
    { id: "inbox", label: t("nav.inbox"), icon: <Inbox size={22} />, href: "/dashboard?tab=inbox" },
    { id: "discover", label: t("nav.discover"), icon: <Compass size={22} />, href: "/discover" },
    { id: "profile", label: t("nav.settings"), icon: <UserRound size={22} />, href: "/settings" },
  ];
  return (
    <nav className="tab-bar" aria-label="App navigation">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        const content = (
          <>
            <span className="tab-icon-wrap">
              {tab.icon}
              {tab.id === "inbox" && unread > 0 && (
                <span className="tab-badge" aria-label={`${unread} unread`}>{unread > 99 ? "99+" : unread}</span>
              )}
            </span>
            <span className="tab-label">{tab.label}</span>
          </>
        );
        const className = `tab-bar-item${isActive ? " active" : ""}`;
        if (tab.id === "discover" || tab.id === "profile" || !onTab) {
          return (
            <Link key={tab.id} href={tab.href} className={className} aria-current={isActive ? "page" : undefined}>
              {content}
            </Link>
          );
        }
        return (
          <button key={tab.id} type="button" className={className} aria-current={isActive ? "page" : undefined} onClick={() => onTab(tab.id)}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
