import React from "react";
import Link from "next/link";
import type { TaleSummary } from "@trt/shared";
import StoryAvatar from "./StoryAvatar";
import HeartButton from "./HeartButton";
import StoryImage from "./StoryImage";

export default function TaleCard({ tale }: { tale: TaleSummary }) {
  return (
    <article className="group card story-arch overflow-hidden rounded-[2.2rem] border-2 transition duration-300 hover:-translate-y-1">
      <div className="relative h-56 w-full overflow-hidden bg-[linear-gradient(135deg,_rgba(28,16,20,0.98),_rgba(84,38,34,0.95))]">
        {tale.imageUrl ? (
          <>
            <StoryImage
              src={tale.imageUrl}
              alt={tale.title}
              fill
              sizes="(min-width: 1024px) 30vw, (min-width: 768px) 50vw, 100vw"
              className="transition duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-story text-ink">
            <span className="font-display text-6xl">
              {tale.title.slice(0, 1)}
            </span>
          </div>
        )}
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span
            className={`story-pill ${
              tale.assistMode === "STUDIO"
                ? "border-ember/30 bg-ember/90 text-white"
                : "border-moss/20 bg-moss/90 text-white"
            }`}
          >
            {tale.assistMode === "STUDIO"
              ? "Prompt-touched"
              : "Written by hand"}
          </span>
          <span className="story-pill border-white/10 bg-black/35 text-parchment/88">
            {tale.isAnonymous ? "Anonymous" : "Named"}
          </span>
        </div>
        {tale.status !== "APPROVED" && (
          <span className="absolute right-4 top-4 inline-flex rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-700">
            {tale.status.replace("_", " ")}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-parchment/58">
            {new Date(tale.createdAt).toLocaleDateString()}
          </p>
          <Link
            href={`/tales/${tale.id}`}
            className="story-link mt-2 block font-display text-3xl leading-tight text-parchment"
          >
            {tale.title}
          </Link>
        </div>
      </div>
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-3">
          <StoryAvatar
            name={tale.authorPseudonym}
            src={tale.authorAvatarUrl}
            anonymous={tale.isAnonymous}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold uppercase tracking-[0.2em] text-ink/55 dark:text-parchment/55">
              Storyteller
            </p>
            <p className="truncate text-lg text-ink dark:text-parchment">
              {tale.authorPseudonym}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[0.62rem]">
          {tale.storyPrompt && (
            <span className="story-pill border-ink/12 text-ink/70 dark:text-parchment/70">
              Prompt spark attached
            </span>
          )}
          <span className="story-pill border-ink/12 text-ink/70 dark:text-parchment/70">
            {tale.upvotes} hearts so far
          </span>
        </div>
        <p className="text-sm leading-7 text-ink/78 dark:text-parchment/78">
          {tale.excerpt}...
        </p>
        <div className="flex items-center justify-between">
          <HeartButton id={tale.id} initialCount={tale.upvotes} compact />
          <Link
            href={`/tales/${tale.id}`}
            className="story-link text-sm font-semibold uppercase tracking-[0.18em] text-ember hover:text-ink dark:hover:text-parchment"
          >
            Read the whole tale
          </Link>
        </div>
      </div>
    </article>
  );
}
