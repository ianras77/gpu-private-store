import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "TAPECRACK",
  description: "Crack duct-taped data pipelines into repeatable programs."
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
      <body>
        <UmamiAnalytics />
        {children}
      </body>
    </html>
  );
}
