import "./globals.css";
import React from "react";
import Link from "next/link";
import { BrandThemeProvider } from "@astro/ui";
import { brand, brandCopy } from "../lib/brand";

export const metadata = {
  title: brand.name,
  description: brandCopy.hero.subtitle
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BrandThemeProvider brand={brand}>
          <main className="fade-in">
            <div className="astro-site-header-shell">
              <header className="astro-site-header">
                <Link href="/" className="astro-site-brand">
                  {brand.name}
                </Link>
                <nav className="astro-site-nav" aria-label="Primary">
                  <Link href="/intake" className="astro-site-link">
                    Birth Chart
                  </Link>
                  <Link href="/reading" className="astro-site-link">
                    Reading
                  </Link>
                  <Link href="/account" className="astro-site-link astro-site-link-strong">
                    Account
                  </Link>
                </nav>
              </header>
            </div>
            {children}
          </main>
        </BrandThemeProvider>
      </body>
    </html>
  );
}
