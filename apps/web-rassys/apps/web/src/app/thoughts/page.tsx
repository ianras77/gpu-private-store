import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThoughtImageSurface } from "../../components/ThoughtImageSurface";
import { listThoughts } from "../../lib/thoughts";
import { Footer } from "../../components/Footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Thoughts // Ian Rasmussen",
  description:
    "Longer notes, drafts, and pieces of writing I wanted to keep close.",
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
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-12">
        <h1 className="section-title text-4xl">
          <span className="magical-text">Thoughts</span> I wanted to keep
        </h1>
        <p className="text-cloud/80">
          Longer notes, drafts, and the pieces of writing I was not ready to
          let go of.
        </p>
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 pb-16">
        {thoughts.map((thought) => (
          <article key={thought.id} className="rave-panel rounded-3xl p-6">
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
                img: ({ node: _node, src, alt = "", ...props }) => {
                  const resolvedSrc = resolveThoughtAssetUrl(
                    thought.assetBasePath,
                    typeof src === "string" ? src : undefined,
                  );

                  if (!resolvedSrc) return null;

                  return (
                    <figure className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                      <img
                        {...props}
                        src={resolvedSrc}
                        alt={alt}
                        loading="lazy"
                        className="h-auto w-full object-cover"
                      />
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
