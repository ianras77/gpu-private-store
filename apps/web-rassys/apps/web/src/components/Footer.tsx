import { DJStatusBadge } from "./DJStatusBadge";
import { radioApiLinks } from "../lib/radio-links";

const buildDirectStreamLink = (quality: "mp3" | "lossless") => {
  const explicit =
    quality === "lossless"
      ? process.env.NEXT_PUBLIC_STREAM_LOSSLESS_URL?.trim()
      : process.env.NEXT_PUBLIC_STREAM_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const icecastBase = process.env.ICECAST_PUBLIC_URL?.trim();
  if (icecastBase) {
    try {
      return new URL(
        quality === "lossless" ? "/live-lossless.ogg" : "/live.mp3",
        icecastBase,
      ).toString();
    } catch {
      return quality === "lossless"
        ? radioApiLinks.stream.lossless
        : radioApiLinks.stream.mp3;
    }
  }

  return quality === "lossless"
    ? radioApiLinks.stream.lossless
    : radioApiLinks.stream.mp3;
};

const directMp3Stream = buildDirectStreamLink("mp3");
const directLosslessStream = buildDirectStreamLink("lossless");

const footerColumns = [
  {
    eyebrow: "Listen Direct",
    title: "Keep the station nearby.",
    body: "Pull the line straight into your player whenever you want the room open.",
    links: [
      { href: directMp3Stream, label: "Direct MP3" },
      { href: directLosslessStream, label: "Direct lossless" },
      { href: radioApiLinks.channel.m3u.mp3, label: "MP3 channel M3U" },
      {
        href: radioApiLinks.channel.m3u.lossless,
        label: "Lossless channel M3U",
      },
      { href: radioApiLinks.channel.pls.mp3, label: "MP3 PLS file" },
      {
        href: radioApiLinks.channel.pls.lossless,
        label: "Lossless PLS file",
      },
      {
        href: "/real-life-bedtime-stories/feed.xml",
        label: "Podcast feed XML",
      },
    ],
  },
  {
    eyebrow: "More of My World",
    title: "Wander a little farther.",
    body: "The radio is the live center, but the rest of the house is close by.",
    links: [
      { href: "/radio", label: "Mr Rassy radio" },
      { href: "/photos", label: "Family gallery" },
      { href: "/listening-room", label: "Listening room" },
      { href: "/real-life-bedtime-stories", label: "Bedtime stories" },
      { href: "/radio/notes", label: "Notes from Mr Rassy" },
      { href: "/mc", label: "Minecraft world" },
      { href: "/thoughts", label: "Thoughts log" },
      { href: "/admin", label: "Admin console" },
      { href: "https://rasies.com", label: "Rasies Services" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-12">
      <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,241,128,0.16),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(66,245,255,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,79,216,0.14),transparent_34%),linear-gradient(145deg,rgba(7,10,24,0.95),rgba(27,9,36,0.9))] px-6 py-7 shadow-[0_28px_90px_rgba(0,0,0,0.38)] md:px-8">
        <div
          className="absolute -left-10 top-6 h-28 w-28 rounded-full bg-glow/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute right-0 top-0 h-36 w-36 rounded-full bg-aurora/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-comet/15 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="text-[11px] uppercase tracking-[0.45em] text-cloud/60">
                Ian Rasmussen // Rassy
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
                Thanks for spending time here.
              </h2>
              <p className="mt-3 text-sm leading-6 text-cloud/78">
                The station stays live, the shelves keep moving, and the rest of
                the house is here whenever you feel like wandering a little longer.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <DJStatusBadge />
              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/60">
                <span className="rave-chip rounded-full px-3 py-2">
                  Live booth
                </span>
                <span className="rave-chip rounded-full px-3 py-2">
                  Listening room
                </span>
                <span className="rave-chip rounded-full px-3 py-2">
                  Family photos
                </span>
                <span className="rave-chip rounded-full px-3 py-2">Writing</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {footerColumns.map((column) => (
              <div
                key={column.title}
                className="rounded-[28px] border border-white/10 bg-black/20 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]"
              >
                <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
                  {column.eyebrow}
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {column.title}
                </div>
                <p className="mt-2 text-sm leading-6 text-cloud/76">
                  {column.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {column.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target={link.href.startsWith("https://") ? "_blank" : undefined}
                      rel={link.href.startsWith("https://") ? "noreferrer" : undefined}
                      className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-cloud/78 transition hover:text-white"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-cloud/65 md:flex-row md:items-center md:justify-between">
            <div>Ian Rasmussen // Rassy</div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/admin"
                className="transition hover:text-white"
              >
                Admin console
              </a>
              <span className="text-cloud/35">/</span>
              <span>The room shifts a little every time you come back.</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
