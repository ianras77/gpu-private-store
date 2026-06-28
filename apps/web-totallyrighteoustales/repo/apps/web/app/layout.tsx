import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import Shell from "../components/Shell";

export const metadata: Metadata = {
  title: "Totally Righteous Tales",
  description:
    "A modern Gutenberg storytelling studio for crafted tall tales, story-spine drafting, editorial notes, and heart-powered publication.",
  applicationName: "Totally Righteous Tales",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#160d10",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <UmamiAnalytics />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
