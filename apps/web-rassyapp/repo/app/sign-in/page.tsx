import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand/mark";
import { Card } from "@/components/ui/card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Button } from "@/components/ui/button";
import { getUserSession } from "@/lib/auth/require-user";

const checkpoints = [
  {
    title: "Dream a game",
    body: "Start with an obby, racer, pet adventure, or story quest and let the coach turn it into a plan."
  },
  {
    title: "Gather inspiration",
    body: "Upload sketches, screenshots, notes, and reference links so the coach can borrow the right vibe."
  },
  {
    title: "Build with review",
    body: "Turn great conversations into reusable build kits and keep account linking behind a parent or coach step."
  }
];

const destinations = [
  {
    title: "Game coach",
    body: "One guided thread for game ideas, scenes, quests, and next steps.",
    href: "/playground?tab=chat"
  },
  {
    title: "Asset shelf",
    body: "Open the safe shelf for concept art, notes, uploads, and inspiration links the coach can remix.",
    href: "/playground?tab=assets"
  },
  {
    title: "Build kits",
    body: "Install or draft reusable studio powers for quests, NPCs, and mechanics.",
    href: "/playground?tab=plugins"
  },
  {
    title: "Studio pulse",
    body: "Check the engine today and grow into account linking and publish review next.",
    href: "/playground?tab=status"
  }
];

export default async function SignInPage({
  searchParams
}: {
  searchParams?: { reason?: string };
}) {
  const session = await getUserSession();
  if (session) {
    redirect("/playground");
  }

  const expiredSession = searchParams?.reason === "session-expired";

  return (
    <div className="min-h-screen bg-ink-950 text-ink-50">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(18,22,30,0.85),_rgba(8,10,14,0.98))]" />
        <div className="floating-orb absolute -left-24 top-20 h-[320px] w-[320px] rounded-full bg-glow-500/15 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl px-6 py-10">
          <nav className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/">
              <BrandMark />
            </Link>
            <Link href="/">
              <Button variant="outline">Back to home</Button>
            </Link>
          </nav>

          <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="intro-rise">
              <div className="text-xs uppercase tracking-[0.4em] text-ink-400">Parent / Creator Sign-In</div>
              <h1 className="mt-4 text-4xl font-semibold">Enter Rassy Launchpad</h1>
              <p className="mt-4 text-sm text-ink-300">
                Today Launchpad signs into the underlying Cheshire Cat engine. This is the doorway
                into the kid-first studio shell for ideas, inspiration, build kits, and the
                supervised path toward Studio publishing.
              </p>
              {expiredSession ? (
                <div className="mt-6 rounded-2xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 text-sm text-ember-300">
                  Your previous studio session expired. Sign in again to reconnect the project space.
                </div>
              ) : null}
              <div className="mt-8 space-y-3">
                {checkpoints.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-ink-800 bg-ink-900/70 px-4 py-3 text-sm text-ink-300"
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-ink-500">After login</div>
                    <div className="mt-1 font-semibold text-ink-100">{item.title}</div>
                    <div className="mt-1">{item.body}</div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                  Start anywhere, but the best first stops are
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {destinations.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="rounded-xl border border-ink-800 bg-ink-950/70 px-3 py-2 transition hover:border-ink-700"
                    >
                      <div className="text-sm font-semibold text-ink-100">{item.title}</div>
                      <div className="mt-1 text-xs text-ink-300">{item.body}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <Card className="intro-rise delay-1">
              <div className="mb-4">
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Studio Engine</div>
                <div className="mt-2 text-xl font-semibold">Connect the Launchpad engine</div>
                <p className="mt-2 text-xs text-ink-400">
                  Parent or coach sign-in is the safest starting point before any account-linking or publish features are added.
                </p>
              </div>
              <SignInForm />
              <div className="mt-6 rounded-xl border border-ink-800 bg-ink-950/60 px-4 py-3 text-xs text-ink-300">
                Operator note: Cheshire Cat admin still exists for maintainers, but the child-facing
                flow should stay inside Launchpad.
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
