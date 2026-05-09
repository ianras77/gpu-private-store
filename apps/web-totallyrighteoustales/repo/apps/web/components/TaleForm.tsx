"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createTale,
  fetchProfile,
  generateStorySpark,
  polishDraft,
  uploadImageFile,
} from "../lib/api";
import { supabase } from "../lib/supabaseClient";
import ChoiceCard from "./ChoiceCard";
import DiffView from "./DiffView";
import StoryImage from "./StoryImage";
import VoiceRecorder from "./VoiceRecorder";

const manualSparks = [
  "Begin with one tiny impossible thing that nobody in town thinks is strange anymore.",
  "Give your narrator a ritual they only perform when hope is on the line.",
  "Let the world smell like something oddly comforting before the trouble arrives.",
  "End the scene with a promise, not a resolution.",
  "Slip in one image that feels too beautiful to explain.",
];

type AssistMode = "handmade" | "studio";
type PublishMode = "named" | "anonymous";

export default function TaleForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [storyPrompt, setStoryPrompt] = useState("");
  const [imageId, setImageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [assistMode, setAssistMode] = useState<AssistMode>("handmade");
  const [publishMode, setPublishMode] = useState<PublishMode>("anonymous");
  const [profileComplete, setProfileComplete] = useState(false);
  const [storytellerName, setStorytellerName] = useState<string | null>(null);
  const [sparkIndex, setSparkIndex] = useState(0);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [premise, setPremise] = useState("");
  const [mood, setMood] = useState("");
  const [setting, setSetting] = useState("");
  const [wonder, setWonder] = useState("");
  const [sparkResult, setSparkResult] = useState<{
    titleSuggestion: string;
    prompt: string;
    opening: string;
  } | null>(null);

  const aiEnabled = assistMode === "studio";

  useEffect(() => {
    async function loadProfile() {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      try {
        const profile = await fetchProfile(token);
        setProfileComplete(profile.profileComplete);
        setStorytellerName(profile.displayName || profile.pseudonym);
        if (profile.profileComplete) {
          setPublishMode("named");
        }
      } catch (_err) {
        // Keep the composer usable even if profile loading fails.
      }
    }

    void loadProfile();
  }, []);

  function appendText(text: string) {
    setBody((prev) => (prev ? `${prev}\n\n${text}` : text));
  }

  function dropManualSpark() {
    const spark = manualSparks[sparkIndex % manualSparks.length];
    if (!spark) return;
    appendText(spark);
    setSparkIndex((prev) => (prev + 1) % manualSparks.length);
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setMessage("Sign in before adding a story image.");
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
      setMessage("Story image attached and queued for review.");
    } catch (_err) {
      setMessage("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handlePolish() {
    if (!body.trim()) return;
    if (!aiEnabled) {
      setMessage("Switch to Prompt-spun mode to use the polish tools.");
      return;
    }

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setMessage("Sign in to use the studio tools.");
      return;
    }

    setPolishing(true);
    setMessage(null);

    try {
      const data = await polishDraft(body, token);
      setSuggestion(data.text ?? body);
    } catch (_err) {
      setMessage("The polish spell fizzled. Try again in a moment.");
    } finally {
      setPolishing(false);
    }
  }

  async function handleSpinPrompt() {
    if (!premise.trim()) {
      setMessage("Give the prompt engine at least a premise to work with.");
      return;
    }

    setSpinning(true);
    setMessage(null);

    try {
      const result = await generateStorySpark({
        premise,
        mood: mood || null,
        setting: setting || null,
        wonder: wonder || null,
      });

      setSparkResult(result);
      setStoryPrompt(result.prompt);
      setAssistMode("studio");
      if (!title.trim()) {
        setTitle(result.titleSuggestion);
      }
    } catch (_err) {
      setMessage("The prompt engine is napping. Try again.");
    } finally {
      setSpinning(false);
    }
  }

  function pourSparkIntoDraft() {
    if (!sparkResult) return;
    setAssistMode("studio");
    setStoryPrompt(sparkResult.prompt);
    appendText(sparkResult.opening);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setLoading(false);
      setMessage("Sign in first so your story can be saved and moderated.");
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
      await createTale({
        title,
        body,
        imageId,
        assistMode: aiEnabled ? "STUDIO" : "HANDMADE",
        isAnonymous: publishMode === "anonymous",
        storyPrompt: storyPrompt || null,
        token,
      });

      setMessage("Story submitted. It’s on its way to the story garden now.");
      setTitle("");
      setBody("");
      setStoryPrompt("");
      setImageId(null);
      setImagePreviewUrl(null);
      setSparkResult(null);
      setSuggestion(null);
      setPremise("");
      setMood("");
      setSetting("");
      setWonder("");
    } catch (_err) {
      setMessage("Something went sideways while submitting. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-8 xl:grid-cols-[0.88fr_1.12fr]"
    >
      <div className="space-y-6">
        <section className="card rounded-[2.2rem] p-6 md:p-8">
          <p className="eyebrow">Choose your lane</p>
          <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
            Write by hand or invite the prompt engine in.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink/72 dark:text-parchment/72">
            Pick the rhythm first. You can keep every line handmade or build
            from a stronger studio spark and still steer the finished story
            yourself.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              eyebrow="Written by hand"
              title="You steer every sentence yourself."
              description="Keep the whole draft clearly hand-led from start to finish."
              active={assistMode === "handmade"}
              tone="moss"
              onClick={() => setAssistMode("handmade")}
            />
            <ChoiceCard
              eyebrow="Prompt-spun"
              title="Use a crafted prompt, opening, and polish pass."
              description="Start with a strong spark, then shape it into something that still feels like yours."
              active={assistMode === "studio"}
              tone="ember"
              onClick={() => setAssistMode("studio")}
            />
          </div>
        </section>

        <section className="card rounded-[2.2rem] p-6 md:p-8">
          <p className="eyebrow">Prompt engine</p>
          <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
            Give the LLM something delicious.
          </h2>
          <p className="mt-3 text-sm leading-7 text-ink/72 dark:text-parchment/72">
            Feed it a premise, a mood, a setting, and one impossible detail.
            We’ll turn that into a strong prompt and a starting paragraph.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="field-label">Premise</label>
              <input
                value={premise}
                onChange={(event) => setPremise(event.target.value)}
                placeholder="A shy lighthouse keeper hears the sea answer back."
                className="field-input"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Mood</label>
                <input
                  value={mood}
                  onChange={(event) => setMood(event.target.value)}
                  placeholder="cozy, yearning, moonlit"
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Setting</label>
                <input
                  value={setting}
                  onChange={(event) => setSetting(event.target.value)}
                  placeholder="an island that only appears at dawn"
                  className="field-input"
                />
              </div>
            </div>
            <div>
              <label className="field-label">Impossible detail</label>
              <input
                value={wonder}
                onChange={(event) => setWonder(event.target.value)}
                placeholder="tea that remembers every secret it overhears"
                className="field-input"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSpinPrompt}
                disabled={spinning}
                className="button-primary"
              >
                {spinning ? "Spinning..." : "Spin a prompt"}
              </button>
              <button
                type="button"
                onClick={dropManualSpark}
                className="button-secondary"
              >
                Drop a manual spark
              </button>
            </div>
          </div>

          {sparkResult && (
            <div className="story-note mt-6 space-y-4 rounded-[1.9rem] p-5">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-ink/50 dark:text-parchment/52">
                  Title suggestion
                </p>
                <p className="mt-2 font-display text-3xl text-ink dark:text-parchment">
                  {sparkResult.titleSuggestion}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-ink/50 dark:text-parchment/52">
                  Crafted prompt
                </p>
                <p className="mt-2 text-sm leading-7 text-ink/75 dark:text-parchment/75">
                  {sparkResult.prompt}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-ink/50 dark:text-parchment/52">
                  Opening spark
                </p>
                <p className="mt-2 text-sm leading-7 text-ink/75 dark:text-parchment/75">
                  {sparkResult.opening}
                </p>
              </div>
              <button
                type="button"
                onClick={pourSparkIntoDraft}
                className="button-moss"
              >
                Pour this into my draft
              </button>
            </div>
          )}
        </section>

        <section className="card rounded-[2.2rem] p-6 md:p-8">
          <p className="eyebrow">How it appears</p>
          <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
            Choose the storyteller veil.
          </h2>
          <div className="mt-5 grid gap-3">
            <ChoiceCard
              eyebrow="Publish under your storyteller"
              title={
                profileComplete
                  ? `Your name and photo will show as ${storytellerName || "your storyteller profile"}.`
                  : "Finish your profile first to unlock named publishing."
              }
              description="Named stories count toward the public storyteller board."
              active={publishMode === "named"}
              tone="sky"
              disabled={!profileComplete}
              onClick={() => setPublishMode("named")}
            />
            <ChoiceCard
              eyebrow="Publish anonymously"
              title="The story is public, but your identity stays tucked behind the curtain."
              description="The story can still collect hearts while your account stays hidden."
              active={publishMode === "anonymous"}
              tone="gold"
              onClick={() => setPublishMode("anonymous")}
            />
          </div>
          {!profileComplete && (
            <p className="mt-4 text-sm text-ink/65 dark:text-parchment/70">
              Named stories unlock after you add a storyteller name and photo in
              your{" "}
              <Link href="/profile" className="font-semibold text-ember">
                profile
              </Link>
              .
            </p>
          )}
        </section>

        <section className="card rounded-[2.2rem] p-6 md:p-8">
          <p className="eyebrow">Studio tools</p>
          <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
            Polish, record, keep moving.
          </h2>
          <p className="mt-3 text-sm leading-7 text-ink/72 dark:text-parchment/72">
            Use voice-to-text or a polish pass when the story wants a little
            lift.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <VoiceRecorder onText={appendText} />
            <button
              type="button"
              onClick={handlePolish}
              disabled={polishing}
              className="button-secondary disabled:opacity-60"
            >
              {polishing ? "Polishing..." : "Polish this draft"}
            </button>
          </div>
        </section>
      </div>

      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <section className="ink-panel relative overflow-hidden rounded-[2.8rem] p-6 md:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,_rgba(240,179,77,0.28),_transparent_70%)]" />
          <div className="relative">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-parchment/58">
              The draft table
            </p>
            <h2 className="mt-3 font-display text-4xl text-parchment">
              Build the version people will remember.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-parchment/72">
              The right side is your live story board. Keep the title sharp,
              keep the body musical, and attach an image if the tale wants one.
            </p>

            <div className="mt-6 flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.22em]">
              <span
                className={`story-pill ${aiEnabled ? "border-ember/20 bg-ember/15 text-gold" : "border-moss/20 bg-moss/15 text-mist"}`}
              >
                {aiEnabled ? "Prompt-spun" : "Written by hand"}
              </span>
              <span className="story-pill border-white/10 bg-white/5 text-parchment/62">
                {publishMode === "anonymous"
                  ? "Publishing anonymously"
                  : `Publishing as ${storytellerName || "your profile"}`}
              </span>
              {storyPrompt && (
                <span className="story-pill border-white/10 bg-white/5 text-parchment/62">
                  Prompt attached
                </span>
              )}
            </div>

            {storyPrompt && (
              <div className="mt-5 rounded-[1.9rem] border border-gold/20 bg-gold/10 p-5 text-sm text-parchment/80">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-gold/80">
                  Attached prompt
                </p>
                <p className="mt-3 whitespace-pre-wrap leading-7">
                  {storyPrompt}
                </p>
              </div>
            )}

            <div className="mt-6 space-y-5">
              <div>
                <label className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-parchment/55">
                  Story title
                </label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="The Day the Porch Learned to Float"
                  className="field-input"
                  required
                />
              </div>

              <div>
                <label className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-parchment/55">
                  Story draft
                </label>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={20}
                  placeholder="Write your story here. We accept 200 to 6,000 characters, so it can be a quick spell or a fully unfurled tale."
                  className="field-textarea"
                  required
                />
                <p className="mt-2 text-xs text-parchment/52">
                  {body.length} characters
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <label className="button-secondary cursor-pointer">
                {uploading ? "Uploading image..." : "Attach story image"}
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
                {loading ? "Submitting..." : "Send story to the garden"}
              </button>
            </div>

            {imagePreviewUrl && (
              <div className="mt-6 space-y-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-parchment/55">
                  Story image preview
                </p>
                <StoryImage
                  src={imagePreviewUrl}
                  alt={title || "Story image preview"}
                  width={1200}
                  height={720}
                  sizes="(min-width: 1024px) 700px, 100vw"
                  className="rounded-[1.9rem] border border-white/10"
                />
                <p className="text-sm text-parchment/68">
                  Your image is uploaded and waiting for moderation alongside
                  the story.
                </p>
              </div>
            )}

            {suggestion && (
              <div className="mt-6 space-y-4">
                <DiffView original={body} suggested={suggestion} />
                <button
                  type="button"
                  onClick={() => {
                    setBody(suggestion);
                    setSuggestion(null);
                  }}
                  className="button-moss"
                >
                  Use polished draft
                </button>
              </div>
            )}

            {message && (
              <p className="mt-5 rounded-[1.6rem] border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-parchment/72">
                {message}
              </p>
            )}
          </div>
        </section>
      </div>
    </form>
  );
}
