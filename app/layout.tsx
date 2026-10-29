import type { Metadata } from "next";
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
  return <html lang="en"><body>{children}</body></html>;
}
