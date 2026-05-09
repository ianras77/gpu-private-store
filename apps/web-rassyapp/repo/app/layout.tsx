import "./globals.css";

import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const body = Sora({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Rassy Launchpad — Kid-first AI game studio",
  description:
    "A family-friendly AI game studio that wraps Cheshire Cat with guided coaching, build kits, and supervised publishing flows."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-ink-950 font-body text-ink-50">{children}</body>
    </html>
  );
}
