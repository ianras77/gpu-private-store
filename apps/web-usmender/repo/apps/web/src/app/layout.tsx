import './globals.css';
import Script from 'next/script';
import AppChrome from '../components/AppChrome';

export const metadata = {
  title: 'USMender',
  description:
    'A mobile-first repair messenger around a local Matrix core with approved, mediated shared messages.'
};

function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;

  return (
    <Script
      src={process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || 'https://umami.rasies.com/script.js'}
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
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
