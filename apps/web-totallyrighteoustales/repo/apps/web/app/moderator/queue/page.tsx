"use client";

import { useEffect, useState } from "react";
import {
  fetchModerationImages,
  fetchModerationQueue,
  moderateImage,
  moderateTale,
  type PendingImage,
  type PendingTale,
} from "../../../lib/api";
import { supabase } from "../../../lib/supabaseClient";
import StoryImage from "../../../components/StoryImage";

export default function ModeratorQueuePage() {
  const [items, setItems] = useState<PendingTale[]>([]);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadQueue() {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setError("Sign in as a moderator to view the queue.");
        setLoading(false);
        return;
      }

      try {
        const [pendingTales, pendingImages] = await Promise.all([
          fetchModerationQueue(token),
          fetchModerationImages(token).catch(() => []),
        ]);

        setItems(pendingTales);
        setImages(pendingImages);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load queue.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadQueue();
  }, []);

  async function handleDecision(
    id: string,
    action: "approve" | "reject" | "needs-edits",
  ) {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    try {
      await moderateTale(token, id, action, reasons[id]);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Unable to update tale.",
      );
    }
  }

  async function handleImageDecision(id: string, action: "approve" | "reject") {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    try {
      await moderateImage(token, id, action, reasons[id]);
      setImages((prev) => prev.filter((item) => item.id !== id));
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Unable to update image.",
      );
    }
  }

  if (error) {
    return (
      <div className="rounded-[2.4rem] border border-ink/15 bg-white p-8 text-sm text-ink/72 shadow-soft dark:border-white/10 dark:bg-white/5 dark:text-parchment/72">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-[2.4rem] border border-ink/15 bg-white p-8 text-sm text-ink/72 shadow-soft dark:border-white/10 dark:bg-white/5 dark:text-parchment/72">
        Loading the moderation queue...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[3rem] border border-ink/80 bg-ink px-8 py-10 text-parchment shadow-[0_30px_90px_rgba(17,12,10,0.42)] md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.32),_transparent_72%)]" />
        <div className="pointer-events-none absolute -right-12 top-10 h-56 w-56 rounded-full bg-sky/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-ember/20 blur-3xl" />
        <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.42em] text-parchment/55">
              Moderator tools
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.95] text-parchment md:text-6xl">
              Keep the story garden sharp, kind, and unmistakably curated.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-parchment/76">
              Review pending stories, send clear notes back when a draft needs
              more work, and keep uploaded imagery aligned with the site’s
              illustration standards.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[2rem] border border-parchment/15 bg-white/10 p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/50">
                Pending stories
              </p>
              <p className="mt-3 font-display text-5xl text-parchment">
                {items.length}
              </p>
            </div>
            <div className="rounded-[2rem] border border-gold/20 bg-gold/10 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-gold/80">
                Pending images
              </p>
              <p className="mt-3 font-display text-5xl text-parchment">
                {images.length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Pending stories</p>
            <h2 className="mt-2 font-display text-3xl text-ink dark:text-parchment">
              Story queue
            </h2>
          </div>
          <div className="rounded-full border border-ink/15 bg-white px-4 py-2 text-xs uppercase tracking-[0.24em] text-ink/55 shadow-soft dark:border-white/10 dark:bg-white/5 dark:text-parchment/60">
            {items.length} waiting
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[2.3rem] border border-ink/80 bg-ink p-6 text-sm text-parchment/72 shadow-[0_18px_60px_rgba(17,12,10,0.3)]">
            No pending stories right now.
          </div>
        ) : (
          <div className="grid gap-5">
            {items.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-[2.6rem] border border-ink/15 bg-white shadow-soft dark:border-white/10 dark:bg-white/5"
              >
                <div className="grid gap-0 lg:grid-cols-[1.02fr_0.98fr]">
                  <div className="p-6 md:p-8">
                    <div className="flex flex-wrap items-center gap-3 text-[0.68rem] uppercase tracking-[0.24em] text-ink/50 dark:text-parchment/55">
                      <span>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                      <span className="rounded-full border border-ink/10 bg-parchment/70 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                        Pending review
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-4xl text-ink dark:text-parchment">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm uppercase tracking-[0.24em] text-ink/48 dark:text-parchment/50">
                      {item.authorPseudonym}
                    </p>
                    <p className="mt-6 max-w-2xl text-base leading-8 text-ink/76 dark:text-parchment/74">
                      {item.excerpt}...
                    </p>
                    <div className="mt-6 rounded-[1.8rem] border border-ink/10 bg-blush/20 p-5 text-sm text-ink/72 dark:border-white/10 dark:bg-white/5 dark:text-parchment/72">
                      Use the note field to explain what should change if you
                      send the story back. The UI is louder now, but the review
                      standard stays precise.
                    </div>
                  </div>

                  <div className="space-y-4 bg-ink p-6 text-parchment md:p-8">
                    {item.imageUrl && (
                      <StoryImage
                        src={item.imageUrl}
                        alt={item.title}
                        width={1200}
                        height={720}
                        sizes="(min-width: 1024px) 420px, 100vw"
                        className="rounded-[2rem] border border-parchment/[0.12]"
                      />
                    )}

                    <div>
                      <label className="text-xs uppercase tracking-[0.28em] text-parchment/55">
                        Moderator note
                      </label>
                      <textarea
                        className="mt-3 w-full rounded-[1.8rem] border border-parchment/15 bg-white/[0.08] px-4 py-4 text-sm leading-7 text-parchment placeholder:text-parchment/35 focus:border-gold focus:outline-none"
                        placeholder="Explain why it needs edits or why it doesn’t fit."
                        value={reasons[item.id] || ""}
                        onChange={(event) =>
                          setReasons((prev) => ({
                            ...prev,
                            [item.id]: event.target.value,
                          }))
                        }
                        rows={5}
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="button-moss"
                        onClick={() => void handleDecision(item.id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-parchment/20 bg-white/[0.08] px-5 py-3 text-sm font-medium text-parchment transition hover:border-gold hover:text-gold"
                        onClick={() =>
                          void handleDecision(item.id, "needs-edits")
                        }
                      >
                        Needs edits
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-parchment/20 bg-white/[0.08] px-5 py-3 text-sm font-medium text-parchment transition hover:border-rose-300 hover:text-rose-200"
                        onClick={() => void handleDecision(item.id, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Pending images</p>
            <h2 className="mt-2 font-display text-3xl text-ink dark:text-parchment">
              Image queue
            </h2>
          </div>
          <div className="rounded-full border border-ink/15 bg-white px-4 py-2 text-xs uppercase tracking-[0.24em] text-ink/55 shadow-soft dark:border-white/10 dark:bg-white/5 dark:text-parchment/60">
            {images.length} waiting
          </div>
        </div>

        {images.length === 0 ? (
          <div className="rounded-[2.3rem] border border-ink/80 bg-ink p-6 text-sm text-parchment/72 shadow-[0_18px_60px_rgba(17,12,10,0.3)]">
            No pending images right now.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {images.map((img) => (
              <article
                key={img.id}
                className="overflow-hidden rounded-[2.4rem] border border-ink/15 bg-white shadow-soft dark:border-white/10 dark:bg-white/5"
              >
                <StoryImage
                  src={img.url}
                  alt={`Pending upload from ${img.uploader}`}
                  width={1200}
                  height={720}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="h-72 rounded-none"
                />
                <div className="space-y-4 p-5 md:p-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-ink/45 dark:text-parchment/45">
                      Uploaded by
                    </p>
                    <p className="mt-3 font-display text-3xl text-ink dark:text-parchment">
                      {img.uploader}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="button-moss"
                      onClick={() =>
                        void handleImageDecision(img.id, "approve")
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void handleImageDecision(img.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
