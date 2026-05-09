import { QRCodeBlock } from "./QRCode";
import { radioApiLinks } from "../lib/radio-links";
import { Card } from "./ui/card";

export async function FamilyOnboarding() {
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const siteBase =
    (configuredSite || "https://rassys.com").replace(/\/$/, "");
  const site = siteBase;
  const radio = `${siteBase}/radio`;
  const mc = `${siteBase}/mc`;
  const configuredStream = process.env.NEXT_PUBLIC_STREAM_URL?.trim();
  const stream =
    configuredStream && configuredStream.length > 0
      ? configuredStream
      : new URL(radioApiLinks.stream.mp3, siteBase).toString();

  return (
    <section id="family" className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8 flex flex-col gap-3">
        <h2 className="section-title text-3xl">Family Onboarding</h2>
        <p className="text-cloud/80">Three simple steps to get everyone synced.</p>
      </div>
      <Card className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <ol className="flex flex-col gap-4 text-sm text-cloud/80">
          <li>
            <strong className="text-white">1. Bookmark the home base.</strong> Pin the main site so
            the station, stories, and photos are always one tap away.
          </li>
          <li>
            <strong className="text-white">2. Add the radio to speakers.</strong> Use the stream link
            in your favorite player.
          </li>
          <li>
            <strong className="text-white">3. Peek into Minecraft.</strong> The Observatory window is
            always live.
          </li>
        </ol>
        <div className="grid grid-cols-2 gap-4">
          <QRCodeBlock value={site} label="Home Base" />
          <QRCodeBlock value={radio} label="Radio Tower" />
          <QRCodeBlock value={mc} label="Minecraft" />
          <QRCodeBlock value={stream} label="MP3 Stream" />
        </div>
      </Card>
    </section>
  );
}
