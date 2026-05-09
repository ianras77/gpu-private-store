"use client";

import useSWR from "swr";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { ThoughtImageSurface } from "./ThoughtImageSurface";
import { formatTimeAgo } from "../lib/utils";

type ThoughtImage = {
  src: string;
  alt: string;
  caption?: string;
};

type Thought = {
  id: string;
  title: string;
  excerpt: string;
  createdAt: string;
  images?: ThoughtImage[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const shorten = (value?: string, maxLength = 180) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
};

export function ThoughtsPanel() {
  const { data } = useSWR<Thought[]>("/api/thoughts?limit=3", fetcher, {
    refreshInterval: 30000,
  });

  return (
    <section
      id="thoughts"
      className="mx-auto max-w-6xl scroll-mt-28 px-6 pb-12 pt-2"
    >
      <div className="mb-7 flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
          Thoughts
        </div>
        <h2 className="section-title text-3xl">A few things I wanted to keep.</h2>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {(data ?? []).map((thought, index) => {
          const leadImage = thought.images?.[0];

          return index === 0 ? (
            <Card key={thought.id} className="overflow-hidden md:col-span-3">
              <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-center">
                <div className="min-w-0 flex flex-col gap-3">
                  <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">
                    Latest
                  </div>
                  <h3 className="break-words text-2xl font-semibold text-white">
                    {thought.title}
                  </h3>
                  <p className="text-sm leading-7 text-cloud/80 md:text-base">
                    {shorten(thought.excerpt, 240)}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-cloud/60">
                    <span>{formatTimeAgo(thought.createdAt) || "recent"}</span>
                    {leadImage && (
                      <span>
                        {thought.images?.length} image
                        {thought.images?.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
                {leadImage && (
                  <div className="relative min-h-[240px] overflow-hidden rounded-[28px] border border-white/10 bg-black/30">
                    <ThoughtImageSurface
                      src={leadImage.src}
                      alt={leadImage.alt}
                      sizes="(max-width: 768px) 100vw, 40vw"
                      className="object-cover"
                      priority
                    />
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card
              key={thought.id}
              className="flex h-full flex-col gap-4 overflow-hidden"
            >
              {leadImage && (
                <div className="relative h-40 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <ThoughtImageSurface
                    src={leadImage.src}
                    alt={leadImage.alt}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">
                  {formatTimeAgo(thought.createdAt) || "recent"}
                </div>
                <h3 className="mt-3 break-words text-lg font-semibold text-white">
                  {thought.title}
                </h3>
              </div>
              <p className="text-sm leading-7 text-cloud/80">
                {shorten(thought.excerpt, 150)}
              </p>
              <div className="mt-auto text-xs text-cloud/60">
                {leadImage
                  ? `${thought.images?.length ?? 0} images`
                  : "Words only"}
              </div>
            </Card>
          );
        })}
        {!data?.length && (
          <Card className="md:col-span-3">
            <div className="text-sm text-cloud/70">
              Nothing is posted here just yet. The next note I keep will show up
              here.
            </div>
          </Card>
        )}
      </div>
      <div className="mt-6">
        <Button variant="secondary" asChild>
          <a href="/thoughts">Open the full notebook</a>
        </Button>
      </div>
    </section>
  );
}
