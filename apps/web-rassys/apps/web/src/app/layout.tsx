import type { Metadata } from "next";
import "./globals.css";
import { EasterEggs } from "../components/EasterEggs";
import { PersistentRadioPlayerProvider } from "../components/PersistentRadioPlayerProvider";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Ian Rasmussen // Rassy // Mr Rassy Radio",
  description:
    "Ian Rasmussen's home on the web, with Mr Rassy Radio, photos, bedtime stories, a listening room, a Minecraft observatory, and a running notebook.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased relative">
        <div className="rave-backdrop" aria-hidden="true" />
        <PersistentRadioPlayerProvider>
          <div className="relative z-10">
            <SiteHeader />
            {children}
            <EasterEggs />
          </div>
        </PersistentRadioPlayerProvider>
      </body>
    </html>
  );
}
