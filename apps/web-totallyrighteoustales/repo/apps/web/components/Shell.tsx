import Link from "next/link";
import Logo from "./Logo";
import SiteNav from "./SiteNav";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,_rgba(240,179,77,0.16),_transparent_62%)]" />
      <div className="fairy-dust absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[92rem] flex-col px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <header className="mb-10">
          <div className="rounded-[1.6rem] border border-white/10 bg-black/20 px-5 py-3 text-center text-[0.68rem] font-semibold uppercase tracking-[0.38em] text-parchment/78 shadow-soft backdrop-blur-sm">
            Named storytellers, anonymous legends, and hearts that actually mean
            something.
          </div>
          <div className="ink-panel story-arch mt-4 rounded-[2.8rem] px-6 py-6 md:px-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <Link
                  href="/"
                  className="inline-flex items-center gap-4 text-parchment"
                >
                  <Logo />
                  <div>
                    <p className="font-display text-3xl sm:text-[2.7rem]">
                      Totally Righteous Tales
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.42em] text-parchment/58">
                      a lantern-lit house for impossible stories
                    </p>
                  </div>
                </Link>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-parchment/72 sm:text-base">
                  Big openings. Moonlit images. Public hearts. Write by hand or
                  in studio mode, then let the tale wander into the room under
                  your name or behind a velvet mask.
                </p>
              </div>
              <SiteNav />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mt-16 rounded-[2rem] border border-white/10 bg-black/20 px-6 py-6 text-sm text-parchment/68 backdrop-blur-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl leading-7">
              Stories should feel seen before they are even read. This version
              is built like a storybook door flung open, not a whisper.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/compose"
                className="story-pill border-white/10 bg-white/5 text-parchment/82"
              >
                Start a tale
              </Link>
              <Link
                href="/leaderboard"
                className="story-pill border-white/10 bg-white/5 text-parchment/82"
              >
                See the hall
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
