import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "NGL — Say it anonymously",
  description: "Get anonymous messages from friends. Share your link and see what people really think.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ngl.", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "NGL — Say it anonymously",
    description: "Your friends have something to tell you.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0a10",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Script id="theme-init" strategy="beforeInteractive">{`try{if(localStorage.getItem('ngl-theme')==='light'){document.documentElement.dataset.theme='light'}if(localStorage.getItem('ngl-lang')==='id'){document.documentElement.lang='id'}}catch(e){}`}</Script>{children}</body></html>;
}
