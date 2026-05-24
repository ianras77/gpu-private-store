"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Check, ImagePlus, Lightbulb, Wand2 } from "lucide-react";
import {
  createTale,
  fetchCraftNotes,
  fetchProfile,
  generateStorySpark,
  polishDraft,
  uploadImageFile,
} from "../lib/api";
import { supabase } from "../lib/supabaseClient";
import ChoiceCard from "./ChoiceCard";
import CraftMeter, { type StorySpine } from "./CraftMeter";
import DiffView from "./DiffView";
import StoryImage from "./StoryImage";
import VoiceRecorder from "./VoiceRecorder";

type AssistMode = "handmade" | "studio";
type PublishMode = "named" | "anonymous";

const craftPrompts = [
  "What is the one impossible claim this story makes?",
  "What choice will the main character avoid until they cannot?",
  "Which object should appear three times and mean something new each time?",
  "What sentence would sound good read aloud at the end?",
];

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function TaleForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageId, setImageId] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [assistMode, setAssistMode] = useState<AssistMode>("handmade");
  const [publishMode, setPublishMode] = useState<PublishMode>("anonymous");
  const [profileComplete, setProfileComplete] = useState(false);
  const [storytellerName, setStorytellerName] = useState<string | null>(null);
  const [premise, setPremise] = useState("");
  const [character, setCharacter] = useState("");
  const [stakes, setStakes] = useState("");
  const [turn, setTurn] = useState("");
  const [voice, setVoice] = useState("");
  const [setting, setSetting] = useState("");
  const [wonder, setWonder] = useState("");
  const [storyPrompt, setStoryPrompt] = useState("");
  const [craftNotes, setCraftNotes] = useState<string[]>([]);
  const [craftFocus, setCraftFocus] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [noting, setNoting] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pledgeAccepted, setPledgeAccepted] = useState(true);
  const [promptIndex, setPromptIndex] = useState(0);

  const spine: StorySpine = useMemo(
    () => ({ premise, character, stakes, turn }),
    [premise, character, stakes, turn],
  );
  const words = countWords(body);
  const studioUsed = assistMode === "studio" || Boolean(storyPrompt);

  useEffect(() => {
    async function loadProfile() {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      try {
        const profile = await fetchProfile(token);
        setProfileComplete(profile.profileComplete);
        setStorytellerName(profile.displayName || profile.pseudonym);
        if (profile.profileComplete) setPublishMode("named");
      } catch (_err) {
        // Composer remains usable when profile lookup is unavailable.
      }
    }

    void loadProfile();
  }, []);

  function appendText(text: string) {
    setBody((prev) => (prev ? `${prev}\n\n${text}` : text));
  }

  function dropCraftPrompt() {
    appendText(
      craftPrompts[promptIndex % craftPrompts.length] ??
        "What choice changes the story?",
    );
    setPromptIndex((prev) => (prev + 1) % craftPrompts.length);
  }

  async function handleSpinPrompt() {
    if (!premise.trim()) {
      setMessage("Set the premise before asking the studio for a spark.");
      return;
    }

    setSpinning(true);
    setMessage(null);

    try {
      const result = await generateStorySpark({
        premise,
        character: character || null,
        stakes: stakes || null,
        turn: turn || null,
        voice: voice || null,
        setting: setting || null,
        wonder: wonder || null,
      });
      setAssistMode("studio");
      setStoryPrompt(result.prompt);
      if (!title.trim()) setTitle(result.titleSuggestion);
      appendText(result.opening);
      setMessage(
        "The studio added an opening spark. Keep control of the draft from here.",
      );
    } catch (_err) {
      setMessage("The studio press jammed. Keep drafting by hand for now.");
    } finally {
      setSpinning(false);
    }
  }

  async function handleCraftNotes() {
    setNoting(true);
    setMessage(null);

    try {
      const result = await fetchCraftNotes({
        title,
        body,
        premise,
        character,
        stakes,
        turn,
        voice,
      });
      setCraftNotes(result.notes);
      setCraftFocus(result.focus);
    } catch (_err) {
      setMessage(
        "Craft notes are unavailable right now. Use the spine checklist and keep drafting.",
      );
    } finally {
      setNoting(false);
    }
  }

  async function handlePolish() {
    if (!body.trim()) return;
    if (assistMode !== "studio") {
      setMessage("Switch on Studio notes before requesting a proof pass.");
      return;
    }

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setMessage("Sign in to request a proof pass.");
      return;
    }

    setPolishing(true);
    setMessage(null);

    try {
      const data = await polishDraft(body, token);
      setSuggestion(data.text ?? body);
    } catch (_err) {
      setMessage("The proof pass failed. Your draft is still safe here.");
    } finally {
      setPolishing(false);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setMessage("Sign in before adding a cover image.");
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const response = await uploadImageFile({ file, purpose: "STORY", token });
      setImageId(response.imageId);
      setImagePreviewUrl(response.publicUrl);
      setMessage("Cover image attached and queued for review.");
    } catch (_err) {
      setMessage("Image upload failed. Try a different image.");
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
      setMessage("Sign in first so your tale can be saved and moderated.");
      return;
    }

    if (publishMode === "named" && !profileComplete) {
      setLoading(false);
      setMessage(
        "Finish your storyteller profile before publishing under your name.",
      );
      return;
    }

    if (!pledgeAccepted) {
      setLoading(false);
      setMessage("Accept the craft pledge before publishing.");
      return;
    }

    try {
      await createTale({
        title,
        body,
        imageId,
        assistMode: studioUsed ? "STUDIO" : "HANDMADE",
        isAnonymous: publishMode === "anonymous",
        storyPrompt: storyPrompt || null,
        personaName: storytellerName || null,
        personaVoice: voice || null,
        personaSignature: premise || null,
        token,
      });

      setMessage("Tale submitted to the moderation desk.");
      setTitle("");
      setBody("");
      setImageId(null);
      setImagePreviewUrl(null);
      setStoryPrompt("");
      setCraftNotes([]);
      setCraftFocus(null);
      setSuggestion(null);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Submission failed.";
      setMessage(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]"
    >
      <div className="space-y-5">
        <CraftMeter
          title={title}
          body={body}
          spine={spine}
          studioUsed={studioUsed}
          pledgeAccepted={pledgeAccepted}
        />

        <section className="press-panel p-5">
          <p className="press-label">Writing mode</p>
          <h2 className="mt-2 font-display text-3xl text-press-ink dark:text-press-paper">
            Keep authorship visible.
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              eyebrow="Hand-led"
              title="Draft every line yourself."
              description="The app supplies structure and reminders, not replacement prose."
              active={assistMode === "handmade"}
              tone="moss"
              onClick={() => setAssistMode("handmade")}
            />
            <ChoiceCard
              eyebrow="Studio notes"
              title="Ask for sparks and proofing."
              description="The studio can suggest an opening or notes, while you approve every word."
              active={assistMode === "studio"}
              tone="ember"
              onClick={() => setAssistMode("studio")}
            />
          </div>
        </section>

        <section className="press-panel p-5">
          <p className="press-label">Story spine</p>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="field-label">Premise</span>
              <input
                className="field-input"
                value={premise}
                onChange={(event) => setPremise(event.target.value)}
                placeholder="A printing press begins publishing tomorrow's secrets."
              />
            </label>
            <label className="block">
              <span className="field-label">Character</span>
              <input
                className="field-input"
                value={character}
                onChange={(event) => setCharacter(event.target.value)}
                placeholder="A careful apprentice who fixes mistakes after midnight."
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Stakes</span>
                <input
                  className="field-input"
                  value={stakes}
                  onChange={(event) => setStakes(event.target.value)}
                  placeholder="The town will believe the wrong future."
                />
              </label>
              <label className="block">
                <span className="field-label">Turn</span>
                <input
                  className="field-input"
                  value={turn}
                  onChange={(event) => setTurn(event.target.value)}
                  placeholder="The press asks for one memory as payment."
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Voice</span>
                <input
                  className="field-input"
                  value={voice}
                  onChange={(event) => setVoice(event.target.value)}
                  placeholder="Luminous, funny, precise, a little dangerous."
                />
              </label>
              <label className="block">
                <span className="field-label">Setting or wonder</span>
                <input
                  className="field-input"
                  value={setting}
                  onChange={(event) => setSetting(event.target.value)}
                  placeholder="A rain-bright city of ink canals."
                />
              </label>
            </div>
            <label className="block">
              <span className="field-label">Impossible detail</span>
              <input
                className="field-input"
                value={wonder}
                onChange={(event) => setWonder(event.target.value)}
                placeholder="The movable type rearranges itself when someone lies."
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSpinPrompt}
                disabled={spinning}
                className="button-primary"
              >
                <Lightbulb size={16} />
                {spinning ? "Setting type..." : "Set an opening spark"}
              </button>
              <button
                type="button"
                onClick={dropCraftPrompt}
                className="button-secondary"
              >
                Drop craft prompt
              </button>
            </div>
          </div>
        </section>

        <section className="press-panel p-5">
          <p className="press-label">Publish mark</p>
          <div className="mt-4 grid gap-3">
            <ChoiceCard
              eyebrow="Named impression"
              title={
                profileComplete
                  ? `Publish as ${storytellerName || "your studio"}.`
                  : "Finish profile to unlock named publishing."
              }
              description="Named tales build the public storyteller board."
              active={publishMode === "named"}
              tone="sky"
              disabled={!profileComplete}
              onClick={() => setPublishMode("named")}
            />
            <ChoiceCard
              eyebrow="Masked broadside"
              title="Publish the tale without revealing the account."
              description="The story can still gather hearts while your identity stays private."
              active={publishMode === "anonymous"}
              tone="gold"
              onClick={() => setPublishMode("anonymous")}
            />
          </div>
          {!profileComplete && (
            <p className="mt-4 text-sm leading-6 text-press-ink/66 dark:text-press-paper/66">
              Add your storyteller name and photo in your{" "}
              <Link href="/profile" className="font-semibold text-press-copper">
                studio profile
              </Link>
              .
            </p>
          )}
        </section>
      </div>

      <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
        <section className="press-hero p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
                Draft table
              </p>
              <h2 className="mt-2 font-display text-4xl text-press-paper">
                Set the page people will remember.
              </h2>
            </div>
            <span className="type-tile border-white/15 bg-white/10 text-press-paper/76">
              {words} words
            </span>
          </div>

          {storyPrompt && (
            <div className="mt-5 border border-press-gold/25 bg-press-gold/10 p-4 text-sm leading-7 text-press-paper/78">
              <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-press-gold">
                Studio spine
              </p>
              <p className="mt-2 whitespace-pre-wrap">{storyPrompt}</p>
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-press-paper/58">
                Title
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="The Press That Printed Tomorrow"
                className="field-input"
                required
              />
            </label>
            <label className="block">
              <span className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-press-paper/58">
                Tale
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={20}
                placeholder="Draft in scenes. Aim for 400-2,500 words. Make the impossible detail matter. Let the ending echo instead of explain."
                className="field-textarea"
                required
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <VoiceRecorder onText={appendText} />
            <button
              type="button"
              onClick={handleCraftNotes}
              disabled={noting}
              className="button-secondary border-white/20 bg-white/10 text-press-paper hover:text-press-paper"
            >
              <BookOpenText size={16} />
              {noting ? "Reading..." : "Ask for craft notes"}
            </button>
            <button
              type="button"
              onClick={handlePolish}
              disabled={polishing}
              className="button-secondary border-white/20 bg-white/10 text-press-paper hover:text-press-paper"
            >
              <Wand2 size={16} />
              {polishing ? "Proofing..." : "Proof pass"}
            </button>
            <label className="button-secondary cursor-pointer border-white/20 bg-white/10 text-press-paper hover:text-press-paper">
              <ImagePlus size={16} />
              {uploading ? "Uploading..." : "Cover image"}
              <input
                type="file"
                className="hidden"
                onChange={handleImageUpload}
                accept="image/*"
                disabled={uploading}
              />
            </label>
          </div>

          <label className="mt-5 flex items-start gap-3 border border-white/12 bg-white/[0.06] p-4 text-sm leading-6 text-press-paper/72">
            <input
              type="checkbox"
              checked={pledgeAccepted}
              onChange={(event) => setPledgeAccepted(event.target.checked)}
              className="mt-1"
            />
            <span>
              I shaped this tale myself. Studio help is notes, sparks, or
              proofing - not a substitute for my choices.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || uploading}
            className="button-primary mt-5 w-full"
          >
            {loading
              ? "Sending to moderation..."
              : "Send to the moderation desk"}
          </button>

          {message && (
            <p className="mt-5 border border-white/12 bg-white/[0.06] px-4 py-3 text-sm leading-7 text-press-paper/74">
              {message}
            </p>
          )}
        </section>

        {craftNotes.length > 0 && (
          <section className="press-panel p-5">
            <p className="press-label">
              Craft notes {craftFocus ? `- ${craftFocus}` : ""}
            </p>
            <div className="mt-4 grid gap-3">
              {craftNotes.map((note) => (
                <div
                  key={note}
                  className="flex gap-3 border border-press-ink/10 bg-white/45 p-3 text-sm leading-6 text-press-ink/74 dark:border-white/10 dark:bg-white/5 dark:text-press-paper/74"
                >
                  <Check size={16} className="mt-1 shrink-0 text-press-green" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {imagePreviewUrl && (
          <section className="press-panel p-5">
            <p className="press-label">Cover proof</p>
            <StoryImage
              src={imagePreviewUrl}
              alt={title || "Story image preview"}
              width={1200}
              height={720}
              sizes="(min-width: 1024px) 650px, 100vw"
              className="mt-4 rounded-lg border border-press-ink/10"
            />
          </section>
        )}

        {suggestion && (
          <section className="press-panel p-5">
            <DiffView original={body} suggested={suggestion} />
            <button
              type="button"
              onClick={() => {
                setBody(suggestion);
                setSuggestion(null);
              }}
              className="button-moss mt-4"
            >
              Accept proof changes
            </button>
          </section>
        )}
      </div>
    </form>
  );
}
