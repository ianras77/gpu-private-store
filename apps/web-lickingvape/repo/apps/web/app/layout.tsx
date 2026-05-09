import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { serverApiBase } from './lib/api';

const DEFAULT_BODY_FONT = '"Palatino Linotype", "Book Antiqua", Georgia, serif';
const DEFAULT_HEADING_FONT = '"Courier New", "Lucida Sans Typewriter", "Lucida Console", monospace';

export const metadata = {
  title: 'Licking Vape',
  description: 'A dark, feed-first nicotine quit den with a moody curator voice and retro sideblog energy.',
  manifest: '/manifest.webmanifest',
  icons: [
    { rel: 'icon', url: '/icons/icon-192.png', sizes: '192x192' },
    { rel: 'icon', url: '/icons/icon-512.png', sizes: '512x512' },
    { rel: 'apple-touch-icon', url: '/icons/icon-192.png' }
  ]
};

export const viewport = {
  themeColor: '#09060d'
};

function withFallbackFontStack(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.includes(',') ? trimmed : `"${trimmed}", ${fallback}`;
}

function cssVar(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function getTheme() {
  try {
    const res = await fetch(`${serverApiBase()}/site_settings`, { cache: 'no-store' });
    if (!res.ok) return {};
    const data = await res.json();
    return data.theme_json || {};
  } catch {
    return {};
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await getTheme();
  const style = {
    '--max-width': theme.max_width ? `${theme.max_width}px` : undefined,
    '--spacing': theme.spacing ? `${theme.spacing}px` : undefined,
    '--font-body': withFallbackFontStack(theme.body_font, DEFAULT_BODY_FONT),
    '--font-heading': withFallbackFontStack(theme.heading_font, DEFAULT_HEADING_FONT),
    '--bg': cssVar(theme.bg),
    '--bg-2': cssVar(theme.bg_2),
    '--bg-3': cssVar(theme.bg_3),
    '--text': cssVar(theme.text),
    '--muted': cssVar(theme.muted),
    '--accent': cssVar(theme.accent),
    '--accent-2': cssVar(theme.accent_2),
    '--accent-3': cssVar(theme.accent_3),
    '--surface': cssVar(theme.surface),
    '--surface-strong': cssVar(theme.surface_strong),
    '--divider': cssVar(theme.divider),
    fontSize: theme.base_font_size ? `${theme.base_font_size}px` : undefined,
    lineHeight: theme.line_height ? String(theme.line_height) : undefined
  } as CSSProperties;

  return (
    <html lang="en">
      <body style={style}>
        <header className="site-header">
          <div className="masthead">
            <div className="masthead-kicker">LickingVape.com | Night Desk For Nicotine Exit Notes</div>
            <h1>Licking Vape</h1>
            <div className="header-tagline">Post honestly. Archive the weird hour. Quit together.</div>
          </div>
          <div className="site-ribbon">Curated static for striped days</div>
          <nav>
            <Link href="/">Night Scroll</Link>
            <Link href="/submit">Confess</Link>
            <Link href="/#cheshire">Cheshire</Link>
            <Link href="/toolkit">Toolkit</Link>
            <Link href="/timer">Timer</Link>
            <Link href="/about">Lore</Link>
            <Link href="/admin">Desk</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <div className="small">
            Dark little quit-blog energy, stripe-by-stripe survival, and room for nicotine, life,
            and the rest of the tab stack.
          </div>
        </footer>
      </body>
    </html>
  );
}
