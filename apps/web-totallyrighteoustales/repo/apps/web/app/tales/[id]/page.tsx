import { CalendarDays, Feather, Sparkles } from "lucide-react";
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
  const StudioIcon = tale.assistMode === "STUDIO" ? Sparkles : Feather;

  return (
    <div className="space-y-6">
      <section className="press-hero overflow-hidden p-5 sm:p-7 lg:p-9">
        <div className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div className="flex flex-col justify-between border border-white/12 p-5 sm:p-7">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="type-tile border-white/15 bg-white/10 text-press-paper/76">
                  <CalendarDays size={13} />
                  {new Date(tale.createdAt).toLocaleDateString()}
                </span>
                <span className="type-tile border-white/15 bg-white/10 text-press-paper/76">
                  <StudioIcon size={13} />
                  {tale.assistMode === "STUDIO" ? "Studio notes" : "Hand-led"}
                </span>
                <span className="type-tile border-white/15 bg-white/10 text-press-paper/76">
                  {tale.isAnonymous ? "Masked" : "Named"}
                </span>
              </div>
              <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[0.94] text-press-paper sm:text-7xl">
                {tale.title}
              </h1>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <StoryAvatar
                name={tale.authorPseudonym}
                src={tale.authorAvatarUrl}
                anonymous={tale.isAnonymous}
                size="md"
              />
              <div>
                <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-press-paper/48">
                  Typeset by
                </p>
                <p className="mt-1 text-lg font-semibold text-press-paper">
                  {tale.authorPseudonym}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {tale.imageUrl ? (
              <div className="relative min-h-[360px] overflow-hidden border border-white/12">
                <StoryImage
                  src={tale.imageUrl}
                  alt={tale.title}
                  fill
                  sizes="(min-width: 1280px) 520px, 100vw"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="grid min-h-[360px] place-items-center border border-white/12 bg-[linear-gradient(135deg,rgba(216,162,63,0.20),rgba(49,95,141,0.18))] p-8">
                <div className="grid h-40 w-40 place-items-center border border-press-paper/30 font-display text-7xl text-press-paper">
                  {tale.title.slice(0, 1)}
                </div>
              </div>
            )}
            <div className="border border-white/12 bg-white/[0.06] p-5">
              <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-press-paper/52">
                Hearts in circulation
              </p>
              <p className="mt-2 font-display text-5xl text-press-paper">
                {tale.upvotes}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="press-panel overflow-hidden">
          {tale.storyPrompt && (
            <section className="border-b border-press-ink/10 bg-press-gold/10 px-6 py-5 dark:border-white/10">
              <p className="press-label">Studio spine</p>
              <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-press-ink/74 dark:text-press-paper/74">
                {tale.storyPrompt}
              </p>
            </section>
          )}

          <div
            className="prose prose-neutral prose-lg max-w-none px-6 py-8 prose-headings:font-display prose-p:leading-8 md:px-10 md:py-10"
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
          <div className="press-panel p-5">
            <p className="press-label">Reader note</p>
            <p className="mt-3 text-sm leading-7 text-press-ink/70 dark:text-press-paper/70">
              Long-form stories get room here. Hearts are for tales worth
              remembering, not for skimmed fragments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
