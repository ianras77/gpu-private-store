import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThoughtImageSurface } from "../../components/ThoughtImageSurface";
import { listThoughts } from "../../lib/thoughts";
import { Footer } from "../../components/Footer";

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

const thoughtAssetOrigin = "https://thoughts.local";

const isAbsoluteReference = (value: string) =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);

const isExternalHttpReference = (value: string) => /^(?:https?:)?\/\//i.test(value);

const resolveThoughtAssetUrl = (
  assetBasePath: string | undefined,
  value?: string | null,
) => {
  if (!value) return "";
  if (isAbsoluteReference(value)) return value;

  const base = new URL(assetBasePath ?? "/api/thoughts/assets/", thoughtAssetOrigin);
  const resolved = new URL(value, base);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
};

export default async function ThoughtsPage() {
  const thoughts = await listThoughts();

  return (
    <main className="min-h-screen overflow-hidden">
      <section className="relative mx-auto max-w-6xl px-6 pb-12 pt-12 sm:pt-20">
        <div className="pointer-events-none absolute -right-24 -top-20 h-80 w-80 rounded-full bg-glow/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <div>
            <div className="eyebrow text-glow">Field notebook · 12 months</div>
            <h1 className="section-title mt-4 max-w-3xl text-5xl leading-[.95] sm:text-7xl"><span className="magical-text">The year before fifty</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-cloud/78">A living project about the year I arrived: the records, photographs, voices, places, and small evidence that make a life feel continuous.</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/[.035] p-5 text-sm leading-7 text-cloud/70 backdrop-blur">
            <div className="text-[10px] uppercase tracking-[.28em] text-cloud/45">How to read this room</div>
            <p className="mt-3">Every entry can carry words, images, audio, video, or a document. The newest field note rises to the front page; the full trail stays here.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.18em] text-glow"><span>words</span><span>images</span><span>voice</span><span>memory</span></div>
          </div>
        </div>
      </section>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-16">
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-[.28em] text-cloud/45"><span className="h-px flex-1 bg-white/10" />Current field notes<span className="h-px flex-1 bg-white/10" /></div>
        {thoughts.map((thought) => (
          <article key={thought.id} className="rave-panel rounded-[2rem] p-6 sm:p-10">
            <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">
              {formatDate(thought.createdAt)}
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {thought.title}
            </h2>

            {thought.images && thought.images.length > 0 && (
              <div
                className={`mt-6 grid gap-4 ${
                  thought.images.length === 1 ? "grid-cols-1" : "md:grid-cols-2"
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
                  <a key={asset.src} href={asset.src} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-cloud/80 transition hover:border-glow/50 hover:text-white" target={asset.kind === "document" ? "_blank" : undefined} rel={asset.kind === "document" ? "noreferrer" : undefined}>
                    <span className="text-glow">{asset.kind === "audio" ? "♪" : asset.kind === "video" ? "▶" : asset.kind === "image" ? "▧" : "↗"}</span>
                    <span className="min-w-0 truncate">{asset.name}</span>
                  </a>
                ))}
              </div>
            ) : null}

            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="mt-6 flex flex-col gap-4 text-sm leading-7 text-cloud/80"
              components={{
                a: ({ node: _node, href, children, ...props }) => {
                  const resolvedHref = resolveThoughtAssetUrl(
                    thought.assetBasePath,
                    typeof href === "string" ? href : undefined,
                  );

                  return (
                    <a
                      {...props}
                      href={resolvedHref}
                      className="text-sunrise transition hover:text-white"
                      target={
                        resolvedHref && isExternalHttpReference(resolvedHref)
                          ? "_blank"
                          : undefined
                      }
                      rel={
                        resolvedHref && isExternalHttpReference(resolvedHref)
                          ? "noreferrer"
                          : undefined
                      }
                    >
                      {children}
                    </a>
                  );
                },
                p: ({ children }) => <p>{children}</p>,
                ul: ({ children }) => (
                  <ul className="list-disc space-y-2 pl-6">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal space-y-2 pl-6">{children}</ol>
                ),
                li: ({ children }) => <li>{children}</li>,
                h1: ({ children }) => (
                  <h3 className="text-2xl font-semibold text-white">{children}</h3>
                ),
                h2: ({ children }) => (
                  <h3 className="text-2xl font-semibold text-white">{children}</h3>
                ),
                h3: ({ children }) => (
                  <h4 className="text-xl font-semibold text-white">{children}</h4>
                ),
                h4: ({ children }) => (
                  <h5 className="text-lg font-semibold text-white">{children}</h5>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-sunrise/70 pl-4 italic text-cloud/70">
                    {children}
                  </blockquote>
                ),
                pre: ({ children }) => (
                  <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-cloud/90">
                    {children}
                  </pre>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[0.95em] text-white">
                    {children}
                  </code>
                ),
                hr: () => <hr className="border-white/10" />,
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-sm">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="border-b border-white/10 text-cloud/60">
                    {children}
                  </thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-white/5">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 font-semibold text-white">{children}</th>
                ),
                td: ({ children }) => <td className="px-3 py-2">{children}</td>,
                img: ({ node: _node, src, alt = "" }) => {
                  const resolvedSrc = resolveThoughtAssetUrl(
                    thought.assetBasePath,
                    typeof src === "string" ? src : undefined,
                  );

                  if (!resolvedSrc) return null;

                  return (
                    <figure className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <ThoughtImageSurface
                          src={resolvedSrc}
                          alt={alt}
                          sizes="(max-width: 768px) 100vw, 768px"
                          className="object-cover"
                        />
                      </div>
                      {alt ? (
                        <figcaption className="px-4 py-3 text-xs text-cloud/60">
                          {alt}
                        </figcaption>
                      ) : null}
                    </figure>
                  );
                },
              }}
            >
              {thought.body}
            </ReactMarkdown>
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
  );
}
