import { fetchTale } from "../../../lib/api";
import { renderMarkdown } from "../../../lib/markdown";
import HeartPanel from "../../../components/HeartPanel";
import StoryAvatar from "../../../components/StoryAvatar";
import StoryImage from "../../../components/StoryImage";

export default async function TaleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const tale = await fetchTale(params.id);

  const html = renderMarkdown(tale.body);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[3rem] border border-ink/80 bg-ink px-8 py-10 text-parchment shadow-[0_30px_90px_rgba(17,12,10,0.42)] md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.3),_transparent_70%)]" />
        <div className="pointer-events-none absolute -right-10 top-12 h-52 w-52 rounded-full bg-sky/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-ember/20 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-[0.68rem] uppercase tracking-[0.24em] text-parchment/72">
              <span className="rounded-full border border-parchment/[0.18] bg-white/5 px-4 py-2">
                {new Date(tale.createdAt).toLocaleDateString()}
              </span>
              <span
                className={`rounded-full px-4 py-2 ${
                  tale.assistMode === "STUDIO"
                    ? "bg-ember/20 text-amber-100"
                    : "bg-moss/25 text-mist"
                }`}
              >
                {tale.assistMode === "STUDIO"
                  ? "Prompt-touched"
                  : "Written by hand"}
              </span>
              <span className="rounded-full border border-parchment/[0.18] bg-white/5 px-4 py-2">
                {tale.isAnonymous
                  ? "Published anonymously"
                  : "Published under a storyteller"}
              </span>
            </div>

            <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[0.92] text-parchment md:text-7xl">
              {tale.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-parchment/78">
              A full-blooded tale page: big title, real atmosphere, and enough
              room for the story itself to land.
            </p>

            <div className="mt-8 flex items-center gap-4">
              <StoryAvatar
                name={tale.authorPseudonym}
                src={tale.authorAvatarUrl}
                anonymous={tale.isAnonymous}
                size="md"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-parchment/48">
                  Storyteller
                </p>
                <p className="mt-2 text-xl text-parchment">
                  {tale.authorPseudonym}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {tale.imageUrl ? (
              <StoryImage
                src={tale.imageUrl}
                alt={tale.title}
                width={1200}
                height={720}
                sizes="(min-width: 1280px) 520px, 100vw"
                className="rounded-[2.2rem] border border-parchment/15 shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
              />
            ) : (
              <div className="flex min-h-[280px] items-end rounded-[2.2rem] border border-parchment/15 bg-[linear-gradient(160deg,rgba(244,201,93,0.18),rgba(255,255,255,0.04)),linear-gradient(135deg,rgba(16,11,10,0.8),rgba(52,38,33,0.9))] p-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-parchment/48">
                    No cover image
                  </p>
                  <p className="mt-3 font-display text-4xl leading-tight text-parchment">
                    Let the words carry the spectacle.
                  </p>
                </div>
              </div>
            )}
            <div className="rounded-[2rem] border border-parchment/15 bg-white/[0.08] p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/50">
                Heart count
              </p>
              <p className="mt-3 font-display text-4xl text-parchment">
                {tale.upvotes}
              </p>
              <p className="mt-2 text-sm leading-7 text-parchment/72">
                Hearts raise the story in public and still reward the person
                behind it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="card overflow-hidden rounded-[2.6rem]">
          {tale.storyPrompt && (
            <section className="border-b border-ink/10 bg-gold/10 px-8 py-6 md:px-10">
              <p className="text-xs uppercase tracking-[0.3em] text-ember">
                Spark note
              </p>
              <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-ink/76 dark:text-parchment/74">
                {tale.storyPrompt}
              </p>
            </section>
          )}

          <div
            className="prose prose-neutral prose-lg max-w-none px-8 py-8 text-ink/84 prose-headings:font-display prose-headings:text-ink prose-p:leading-8 prose-a:text-ember prose-strong:text-ink dark:prose-invert md:px-10 md:py-10"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>

        <div className="space-y-4">
          <HeartPanel
            id={tale.id}
            initialHearts={tale.upvotes}
            storytellerName={tale.authorPseudonym}
            anonymous={tale.isAnonymous}
          />
          <div className="rounded-[2rem] border border-ink/15 bg-white p-6 shadow-soft dark:border-white/10 dark:bg-white/5">
            <p className="text-xs uppercase tracking-[0.3em] text-ink/45 dark:text-parchment/45">
              Reading mood
            </p>
            <p className="mt-3 font-display text-3xl text-ink dark:text-parchment">
              Stay with the scene.
            </p>
            <p className="mt-3 text-sm leading-7 text-ink/72 dark:text-parchment/72">
              This layout gives the story room to breathe first and buttons
              second, so the page reads like a tale rather than a content card.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
