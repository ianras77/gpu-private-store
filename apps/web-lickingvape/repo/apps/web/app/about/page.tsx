import ReactMarkdown from 'react-markdown';
import { aboutFallbackMd, shoutoutFallback } from '../content';
import { serverApiBase } from '../lib/api';

async function getAbout() {
  try {
    const res = await fetch(`${serverApiBase()}/site_settings`, { cache: 'no-store' });
    if (!res.ok) {
      return { about_md: '', shoutout_md: '' };
    }
    return res.json();
  } catch {
    return { about_md: '', shoutout_md: '' };
  }
}

export default async function AboutPage() {
  const data = await getAbout();
  const storedAbout = String(data.about_md || '');
  const isLegacyAbout =
    storedAbout.includes('calm, public notebook') ||
    storedAbout.includes('small, repeatable steps') ||
    storedAbout.includes('retro internet den') ||
    storedAbout.includes('Dr. Seuss');
  const about = !storedAbout || isLegacyAbout ? aboutFallbackMd : storedAbout;

  const storedShoutout = String(data.shoutout_md || '');
  const isLegacyShoutout =
    storedShoutout === 'Origin spark: Dr. Seuss, I Can Lick 30 Tigers Today!' ||
    storedShoutout.includes('Dr. Seuss') ||
    storedShoutout.includes('One tiger or one stripe');
  const shoutout = !storedShoutout || isLegacyShoutout ? shoutoutFallback : storedShoutout;

  return (
    <section className="stack page-shell">
      <div className="page-hero">
        <div className="eyebrow">Lore</div>
        <h2>The moodboard behind the quit feed.</h2>
        <p className="muted">
          This place is supposed to feel like an old sideblog that accidentally became useful.
        </p>
      </div>

      <div className="card markdown-shell">
        <div className="markdown-body">
          <ReactMarkdown>{about}</ReactMarkdown>
        </div>
      </div>

      <div className="divider" />
      <div className="small">{shoutout}</div>
    </section>
  );
}
