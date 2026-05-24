import Link from "next/link";
import Logo from "./Logo";
import SiteNav from "./SiteNav";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="press-shell relative min-h-screen overflow-hidden">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[92rem] flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <header className="mb-6 border-b border-press-ink/15 pb-4 dark:border-white/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Link href="/" className="inline-flex max-w-2xl items-center gap-4">
              <Logo />
              <div>
                <p className="font-display text-3xl leading-none text-press-ink dark:text-press-paper sm:text-4xl">
                  Totally Righteous Tales
                </p>
                <p className="mt-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.18em] text-press-ink/58 dark:text-press-paper/58">
                  Modern Gutenberg studio for living tall tales
                </p>
              </div>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mt-14 border-t border-press-ink/15 py-6 text-sm text-press-ink/66 dark:border-white/10 dark:text-press-paper/64">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl leading-7">
              Built for stories that are drafted, revised, typeset, and sent
              into the room with care.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/compose" className="type-tile">
                Start a tale
              </Link>
              <Link href="/leaderboard" className="type-tile">
                Hall of type
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
