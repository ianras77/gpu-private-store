import Link from "next/link";

import type { PublicSiteData } from "@/lib/public-site";

type PublicHeaderProps = { data?: PublicSiteData };

export async function PublicHeader({ data }: PublicHeaderProps = {}) {
  const siteData = data;
  const lead = siteData?.leadStory;
  return (
    <header className="shell clean-header">
      <div className="clean-nav">
        <Link href="/" className="clean-brand" aria-label="Blondes Against Trump home">
          <span className="brand-mini-seal">BAT</span>
          <span><strong>Blondes Against Trump</strong></span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Latest</Link><Link href="/archive">Archive</Link><Link href="/themes">Channels</Link><Link href="/about">About</Link>
        </nav>
        <Link href={lead?.slug ? `/story/${lead.slug}` : "/archive"} className="header-read-link">Read latest <span aria-hidden="true">→</span></Link>
      </div>
      <div className="clean-rule" />
    </header>
  );
}
