import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import { Orbitron, Space_Grotesk, Press_Start_2P } from "next/font/google";
import Script from "next/script";

const displayFont = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"]
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"]
});

const pixelFont = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-pixel",
  weight: "400"
});

export const metadata = {
  title: "Jogmania",
  description: "Retro-future running adventures powered by your real-world workouts."
};

function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;

  return (
    <Script
      src={process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || "https://umami.rasies.com/script.js"}
      data-website-id={websiteId}
      data-domains={process.env.NEXT_PUBLIC_UMAMI_DOMAINS || undefined}
      strategy="afterInteractive"
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${pixelFont.variable} font-body`}>
        <UmamiAnalytics />
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
