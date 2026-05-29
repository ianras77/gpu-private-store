import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { serverApiBase } from './lib/api';

const DEFAULT_BODY_FONT = '"Palatino Linotype", "Book Antiqua", Georgia, serif';
const DEFAULT_HEADING_FONT = '"Courier New", "Lucida Sans Typewriter", "Lucida Console", monospace';

export const metadata = {
  title: 'Licking Vape',
  description:
    'A dark anonymous wall for quitting vaping with moderated community notes and a mode-based Stripe Scribe.',
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
            <div className="masthead-kicker">
              LickingVape.com | Anonymous Wall For Nicotine Exit Notes
            </div>
            <h1>Licking Vape</h1>
            <div className="header-tagline">Thirty striped urges. One wall note at a time.</div>
          </div>
          <div className="site-ribbon">Anon wall / moderated static</div>
          <nav>
            <Link href="/">Night Scroll</Link>
            <Link href="/submit">Confess</Link>
            <Link href="/#scribe">Scribe</Link>
            <Link href="/toolkit">Toolkit</Link>
            <Link href="/timer">Timer</Link>
            <Link href="/about">Lore</Link>
            <Link href="/admin">Desk</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <div className="small">
            Anonymous wall notes, Stripe Scribe mode switches, and enough dark storybook static to
            make the next refusal feel possible.
          </div>
        </footer>
      </body>
    </html>
  );
}
