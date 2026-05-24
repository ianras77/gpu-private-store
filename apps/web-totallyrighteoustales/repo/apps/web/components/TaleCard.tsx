import React from "react";
import Link from "next/link";
import { BookOpenText, Feather, Sparkles } from "lucide-react";
import type { TaleSummary } from "@trt/shared";
import StoryAvatar from "./StoryAvatar";
import HeartButton from "./HeartButton";
import StoryImage from "./StoryImage";

export default function TaleCard({ tale }: { tale: TaleSummary }) {
  const StudioIcon = tale.assistMode === "STUDIO" ? Sparkles : Feather;

  return (
    <article className="group press-panel overflow-hidden transition duration-300 hover:-translate-y-1">
      <div className="relative h-52 w-full overflow-hidden border-b border-press-ink/12 bg-press-ink dark:border-white/10">
        {tale.imageUrl ? (
          <StoryImage
            src={tale.imageUrl}
            alt={tale.title}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#15120f,#3f241d,#173c3a)] text-press-paper">
            <div className="grid h-28 w-28 place-items-center border border-current/30 font-display text-6xl">
              {tale.title.slice(0, 1)}
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-2 p-3">
          <span className="type-tile border-white/15 bg-black/40 text-press-paper/86">
            <StudioIcon size={13} />
            {tale.assistMode === "STUDIO" ? "Studio notes" : "Hand-led"}
          </span>
          <span className="type-tile border-white/15 bg-black/40 text-press-paper/86">
            {tale.isAnonymous ? "Masked" : "Named"}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <StoryAvatar
              name={tale.authorPseudonym}
              src={tale.authorAvatarUrl}
              anonymous={tale.isAnonymous}
              size="sm"
            />
            <div className="min-w-0">
              <p className="press-label text-[0.62rem]">Typeset by</p>
              <p className="truncate text-sm font-semibold text-press-ink dark:text-press-paper">
                {tale.authorPseudonym}
              </p>
            </div>
          </div>
          <BookOpenText className="shrink-0 text-press-copper" size={19} />
        </div>

        <div>
          <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-press-ink/48 dark:text-press-paper/48">
            {new Date(tale.createdAt).toLocaleDateString()}
          </p>
          <Link
            href={`/tales/${tale.id}`}
            className="story-link mt-2 block font-display text-3xl leading-tight text-press-ink dark:text-press-paper"
          >
            {tale.title}
          </Link>
        </div>

        <p className="text-sm leading-7 text-press-ink/72 dark:text-press-paper/72">
          {tale.excerpt}...
        </p>

        <div className="flex items-center justify-between gap-3 border-t border-press-ink/10 pt-4 dark:border-white/10">
          <HeartButton id={tale.id} initialCount={tale.upvotes} compact />
          <Link
            href={`/tales/${tale.id}`}
            className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-press-copper"
          >
            Read sheet
          </Link>
        </div>
      </div>
    </article>
  );
}
