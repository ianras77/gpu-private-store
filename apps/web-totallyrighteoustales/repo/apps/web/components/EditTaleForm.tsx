"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchEditableTale,
  fetchProfile,
  updateTale,
  uploadImageFile,
  type EditableTale,
} from "../lib/api";
import { supabase } from "../lib/supabaseClient";
import ChoiceCard from "./ChoiceCard";
import StoryImage from "./StoryImage";

type PublishMode = "named" | "anonymous";

export default function EditTaleForm({ id }: { id: string }) {
  const [tale, setTale] = useState<EditableTale | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [storyPrompt, setStoryPrompt] = useState("");
  const [publishMode, setPublishMode] = useState<PublishMode>("anonymous");
  const [assistMode, setAssistMode] = useState<"HANDMADE" | "STUDIO">(
    "HANDMADE",
  );
  const [imageId, setImageId] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [storytellerName, setStorytellerName] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setMessage("Sign in to edit this story.");
        return;
      }

      try {
        const [data, profile] = await Promise.all([
          fetchEditableTale(id, token),
          fetchProfile(token).catch(() => null),
        ]);
        setTale(data);
        setTitle(data.title);
        setBody(data.body);
        setStoryPrompt(data.storyPrompt || "");
        setPublishMode(data.isAnonymous ? "anonymous" : "named");
        setAssistMode(data.assistMode);
        setImagePreviewUrl(data.imageUrl || null);
        if (profile) {
          setProfileComplete(profile.profileComplete);
          setStorytellerName(profile.displayName || profile.pseudonym);
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to load tale.",
        );
      }
    }

    void load();
  }, [id]);

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setMessage("Sign in before uploading images.");
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const response = await uploadImageFile({
        file,
        purpose: "STORY",
        token,
      });
      setImageId(response.imageId);
      setImagePreviewUrl(response.publicUrl);
      setMessage("New image attached and queued for review.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Image upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setLoading(false);
      setMessage("Sign in to edit.");
      return;
    }

    if (publishMode === "named" && !profileComplete) {
      setLoading(false);
      setMessage(
        "Add your storyteller name and photo in your profile before publishing under your name.",
      );
      return;
    }

    try {
      await updateTale({
        id,
        title,
        body,
        imageId,
        assistMode,
        isAnonymous: publishMode === "anonymous",
        storyPrompt: storyPrompt || null,
        token,
      });
      setSubmitted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!tale) {
    return (
      <div className="rounded-[2.4rem] border border-ink/15 bg-white p-8 text-sm text-ink/72 shadow-soft dark:border-white/10 dark:bg-white/5 dark:text-parchment/72">
        {message ?? "Loading your draft..."}
      </div>
    );
  }

  if (submitted) {
    return (
      <section className="mx-auto max-w-4xl overflow-hidden rounded-[2.8rem] border border-ink/80 bg-ink p-8 text-parchment shadow-[0_30px_90px_rgba(17,12,10,0.42)] md:p-10">
        <p className="text-xs uppercase tracking-[0.38em] text-parchment/52">
          Back in the queue
        </p>
        <h1 className="mt-3 font-display text-4xl text-parchment md:text-5xl">
          Your story has been resubmitted for moderation.
        </h1>
        <p className="mt-4 text-sm leading-7 text-parchment/74">
          The revised draft and any replacement image are now waiting in the
          garden again. You can head back to your profile to keep writing while
          this one is reviewed.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/profile" className="button-primary">
            Back to your storyteller nook
          </Link>
          <Link href="/compose" className="button-secondary">
            Start another story
          </Link>
        </div>
      </section>
    );
  }

  if (tale.status !== "NEEDS_EDITS") {
    return (
      <div className="rounded-[2.4rem] border border-ink/15 bg-white p-8 text-sm text-ink/72 shadow-soft dark:border-white/10 dark:bg-white/5 dark:text-parchment/72">
        This story is not marked for edits.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"
    >
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2.6rem] border border-ink/80 bg-ink p-6 text-parchment shadow-[0_25px_80px_rgba(17,12,10,0.35)] md:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.3),_transparent_72%)]" />
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.38em] text-parchment/50">
              Revision notes
            </p>
            <h2 className="mt-3 font-display text-3xl text-parchment md:text-4xl">
              Bring this story back stronger.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-parchment/74">
              The moderation reason sits front and center so the next draft is
              intentional instead of guesswork.
            </p>
            <div className="mt-6 rounded-[2rem] border border-amber-300/25 bg-white/[0.08] p-5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">
                Needs edits
              </p>
              <p className="mt-4 leading-7 text-parchment/82">
                {tale.rejectionReason || "Please revise and resubmit."}
              </p>
            </div>
          </div>
        </section>

        <section className="card story-panel p-6 md:p-8">
          <p className="eyebrow">Story metadata</p>
          <h2 className="mt-3 font-display text-3xl text-ink dark:text-parchment">
            Hold onto the story’s identity.
          </h2>
          <p className="mt-3 text-sm leading-7 text-ink/72 dark:text-parchment/72">
            Keep the story lineage clear while you edit: what sparked it, who it
            shows up as, and whether the final draft is clearly handmade or
            prompt-touched.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.8rem] border border-ink/10 bg-parchment/70 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45 dark:text-parchment/50">
                Current mode
              </p>
              <p className="mt-2 font-display text-2xl text-ink dark:text-parchment">
                {assistMode === "HANDMADE" ? "Handmade" : "Prompt-touched"}
              </p>
            </div>
            <div className="rounded-[1.8rem] border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45 dark:text-parchment/50">
                Showing as
              </p>
              <p className="mt-2 font-display text-2xl text-ink dark:text-parchment">
                {publishMode === "anonymous"
                  ? "Anonymous"
                  : storytellerName || "Named"}
              </p>
            </div>
          </div>
        </section>

        <section className="card story-panel p-6 md:p-8">
          <p className="eyebrow">Publishing controls</p>
          <h2 className="mt-3 font-display text-3xl text-ink dark:text-parchment">
            Keep the story’s shape intentional.
          </h2>
          <div className="mt-5 space-y-5">
            <div>
              <label className="field-label">Prompt note</label>
              <textarea
                value={storyPrompt}
                onChange={(event) => setStoryPrompt(event.target.value)}
                rows={5}
                placeholder="If this story started from a prompt, keep the spark note here."
                className="field-textarea"
              />
            </div>

            <div>
              <p className="field-label">Publishing mode</p>
              <div className="mt-3 grid gap-3">
                <ChoiceCard
                  eyebrow="Named storyteller"
                  title={
                    profileComplete
                      ? `Your storyteller profile shows on the story as ${storytellerName || "your storyteller identity"}.`
                      : "Finish your storyteller profile to keep publishing under your name."
                  }
                  description={
                    profileComplete
                      ? "Use this when you want the story tied to your public storyteller identity."
                      : "Head back to your profile to add the missing name or photo before resubmitting."
                  }
                  active={publishMode === "named"}
                  tone="sky"
                  disabled={!profileComplete}
                  onClick={() => setPublishMode("named")}
                />
                <ChoiceCard
                  eyebrow="Anonymous"
                  title="The story stands alone in public, but it still belongs to your account behind the scenes."
                  description="Hearts still count for you even when the public version stays hidden."
                  active={publishMode === "anonymous"}
                  tone="gold"
                  onClick={() => setPublishMode("anonymous")}
                />
              </div>
              {!profileComplete && (
                <p className="mt-3 text-sm text-ink/65 dark:text-parchment/70">
                  Named publishing unlocks again after you finish the missing
                  storyteller details in your{" "}
                  <Link href="/profile" className="font-semibold text-ember">
                    profile
                  </Link>
                  .
                </p>
              )}
            </div>

            <div>
              <p className="field-label">Creation mode</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  eyebrow="Written by hand"
                  title="Every sentence stays clearly hand-led."
                  description="Best for stories that were fully shaped by you."
                  active={assistMode === "HANDMADE"}
                  tone="moss"
                  onClick={() => setAssistMode("HANDMADE")}
                />
                <ChoiceCard
                  eyebrow="Prompt-touched"
                  title="Keep the prompt lineage visible when the draft had help."
                  description="Best for stories that started from a spark or studio pass."
                  active={assistMode === "STUDIO"}
                  tone="ember"
                  onClick={() => setAssistMode("STUDIO")}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="card story-panel p-6 md:p-8">
          <div className="flex flex-wrap gap-3 text-[0.68rem] uppercase tracking-[0.22em]">
            <span
              className={`rounded-full px-4 py-2 ${
                assistMode === "HANDMADE"
                  ? "bg-moss/15 text-moss"
                  : "bg-ember/15 text-ember"
              }`}
            >
              {assistMode === "HANDMADE"
                ? "Handmade draft"
                : "Prompt lineage visible"}
            </span>
            <span className="rounded-full border border-ink/15 px-4 py-2 text-ink/55 dark:border-parchment/20 dark:text-parchment/60">
              {publishMode === "anonymous"
                ? "Publishing anonymously"
                : `Publishing as ${storytellerName || "your storyteller"}`}
            </span>
          </div>

          <p className="eyebrow mt-6">Rework the draft</p>
          <div className="mt-5 space-y-5">
            <div>
              <label className="field-label">Title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="field-input"
                required
              />
            </div>

            <div>
              <label className="field-label">Story</label>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={16}
                className="field-textarea"
                required
              />
              <p className="mt-2 text-xs uppercase tracking-[0.24em] text-ink/45 dark:text-parchment/50">
                {body.length} characters
              </p>
            </div>

            {imagePreviewUrl && (
              <div className="space-y-3">
                <p className="field-label">Story image</p>
                <StoryImage
                  src={imagePreviewUrl}
                  alt={title || tale.title}
                  width={1200}
                  height={720}
                  sizes="(min-width: 1024px) 700px, 100vw"
                  className="rounded-[2rem] border border-ink/10"
                />
                {imageId && (
                  <p className="text-sm text-ink/65 dark:text-parchment/70">
                    A replacement image has been attached for review.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <label className="button-secondary cursor-pointer">
                {uploading ? "Uploading image..." : "Replace story image"}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleImageUpload}
                  accept="image/*"
                  disabled={uploading}
                />
              </label>
              <button
                type="submit"
                disabled={loading || uploading}
                className="button-primary"
              >
                {loading ? "Resubmitting..." : "Resubmit for moderation"}
              </button>
            </div>

            {message && (
              <p className="text-sm text-ink/70 dark:text-parchment/70">
                {message}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[2.2rem] border border-ink/15 bg-parchment/90 p-6 shadow-soft dark:border-white/10 dark:bg-white/5">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/45 dark:text-parchment/45">
            Revision cue
          </p>
          <p className="mt-3 font-display text-3xl text-ink dark:text-parchment">
            Keep what hits. Cut what drifts.
          </p>
          <p className="mt-3 text-sm leading-7 text-ink/72 dark:text-parchment/72">
            The mechanics are unchanged. The page just gives the rewrite the
            same confidence as the story you are trying to save.
          </p>
        </section>
      </div>
    </form>
  );
}
