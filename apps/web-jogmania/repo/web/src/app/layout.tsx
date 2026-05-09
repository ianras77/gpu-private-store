import './globals.css';
import type { ReactNode } from 'react';
import { Press_Start_2P, Oxanium } from 'next/font/google';

const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel'
});

const oxanium = Oxanium({
  weight: ['300', '400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-display'
});

export const metadata = {
  title: 'Jogmania — Retro Jogging Adventure',
  description: '80s arcade jogging adventure demo'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${pressStart.variable} ${oxanium.variable} font-display`}>{children}</body>
    </html>
  );
}
