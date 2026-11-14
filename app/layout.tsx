import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "NGL — Say it anonymously",
  description: "Get anonymous messages from friends. Share your link and see what people really think.",
  openGraph: {
    title: "NGL — Say it anonymously",
    description: "Your friends have something to tell you.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Script id="theme-init" strategy="beforeInteractive">{`try{if(localStorage.getItem('ngl-theme')==='light'){document.documentElement.dataset.theme='light'}}catch(e){}`}</Script>{children}</body></html>;
}
