import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { EasterEggs } from "../components/EasterEggs";
import { PersistentRadioPlayerProvider } from "../components/PersistentRadioPlayerProvider";
import { SiteHeader } from "../components/SiteHeader";
import { CloudParticles } from "../components/CloudParticles";
import { RadioAtmosphere } from "../components/RadioAtmosphere";

export const metadata: Metadata = {
  metadataBase: new URL("https://rassys.com"),
  title: {
    default: "Ian Rasmussen // Rassy’s dot Com",
    template: "%s | Rassy’s dot Com",
  },
  description:
    "Ian Rasmussen's home on the web, with Mr Rassy Radio, photos, bedtime stories, a listening room, a Minecraft observatory, and a running notebook.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Rassy’s dot Com",
    title: "Ian Rasmussen // Rassy’s dot Com",
    description:
      "A home on the web for Mr Rassy Radio, photos, stories, a listening room, Minecraft, and a running notebook.",
  },
};

function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;

  return (
    <Script
      src={
        process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ||
        "https://umami.rasies.com/script.js"
      }
      data-website-id={websiteId}
      data-domains={process.env.NEXT_PUBLIC_UMAMI_DOMAINS || undefined}
      strategy="afterInteractive"
    />
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased relative">
        <UmamiAnalytics />
        <div className="rave-backdrop" aria-hidden="true" />
        <div
          className="pointer-events-none fixed inset-0 z-[5]"
          aria-hidden="true"
        >
          <CloudParticles />
        </div>
        <PersistentRadioPlayerProvider>
          <RadioAtmosphere />
          <div className="relative z-10">
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <SiteHeader />
            <div id="main-content" tabIndex={-1}>
              {children}
            </div>
            <EasterEggs />
          </div>
        </PersistentRadioPlayerProvider>
      </body>
    </html>
  );
}
