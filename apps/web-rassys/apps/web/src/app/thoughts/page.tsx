import type { Metadata } from "next";
import { RassyMarkdown } from "../../components/RassyMarkdown";
import { ThoughtImageSurface } from "../../components/ThoughtImageSurface";
import { listThoughts } from "../../lib/thoughts";
import { Footer } from "../../components/Footer";
import { RoomShell } from "../../components/RoomShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The Year Before Fifty // Ian Rasmussen",
  description:
    "A twelve-month field notebook for the year Ian arrived and the life that followed.",
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default async function ThoughtsPage() {
  const thoughts = await listThoughts();

  return (
    <RoomShell theme="notebook" channel="notebook" agent="notebook-editor">
      <main className="min-h-screen overflow-hidden">
        <section className="relative mx-auto max-w-6xl px-6 pb-12 pt-12 sm:pt-20">
          <div className="pointer-events-none absolute -right-24 -top-20 h-80 w-80 rounded-full bg-glow/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
            <div>
              <div className="eyebrow text-glow">
                Field notebook · 12 months
              </div>
              <h1 className="section-title mt-4 max-w-3xl text-5xl leading-[.95] sm:text-7xl">
                <span className="magical-text">The year before fifty</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-cloud/78">
                A living project about the year I arrived: the records,
                photographs, voices, places, and small evidence that make a life
                feel continuous.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[.035] p-5 text-sm leading-7 text-cloud/70 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[.28em] text-cloud/45">
                How to read this room
              </div>
              <p className="mt-3">
                Every entry can carry words, images, audio, video, or a
                document. The newest field note rises to the front page; the
                full trail stays here.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.18em] text-glow">
                <span>words</span>
                <span>images</span>
                <span>voice</span>
                <span>memory</span>
              </div>
            </div>
          </div>
        </section>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-16">
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-[.28em] text-cloud/45">
            <span className="h-px flex-1 bg-white/10" />
            Current field notes
            <span className="h-px flex-1 bg-white/10" />
          </div>
          {thoughts.map((thought) => (
            <article
              key={thought.id}
              className="rave-panel rounded-[2rem] p-6 sm:p-10"
            >
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">
                {formatDate(thought.createdAt)}
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                {thought.title}
              </h2>

              {thought.images && thought.images.length > 0 && (
                <div
                  className={`mt-6 grid gap-4 ${
                    thought.images.length === 1
                      ? "grid-cols-1"
                      : "md:grid-cols-2"
                  }`}
                >
                  {thought.images.map((image, index) => (
                    <figure
                      key={`${thought.id}-image-${index}`}
                      className="overflow-hidden rounded-3xl"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                        <ThoughtImageSurface
                          src={image.src}
                          alt={image.alt}
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover"
                        />
                      </div>
                      {image.caption && (
                        <figcaption className="mt-2 text-xs text-cloud/60">
                          {image.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}

              {thought.assets?.length ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {thought.assets.map((asset) => (
                    <a
                      key={asset.src}
                      href={asset.src}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-cloud/80 transition hover:border-glow/50 hover:text-white"
                      target={asset.kind === "document" ? "_blank" : undefined}
                      rel={asset.kind === "document" ? "noreferrer" : undefined}
                    >
                      <span className="text-glow">
                        {asset.kind === "audio"
                          ? "♪"
                          : asset.kind === "video"
                            ? "▶"
                            : asset.kind === "image"
                              ? "▧"
                              : "↗"}
                      </span>
                      <span className="min-w-0 truncate">{asset.name}</span>
                    </a>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-4 text-sm leading-7 text-cloud/80">
                <RassyMarkdown
                  markdown={thought.body}
                  variant="notebook"
                  assetBasePath={thought.assetBasePath}
                />
              </div>
            </article>
          ))}
          {!thoughts.length && (
            <div className="rave-panel rounded-3xl p-6 text-sm text-cloud/70">
              Nothing is posted here just yet.
            </div>
          )}
        </div>
        <Footer />
      </main>
    </RoomShell>
  );
}
