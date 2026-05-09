"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TaleCard from "../../components/TaleCard";
import StoryAvatar from "../../components/StoryAvatar";
import {
  fetchMyTales,
  fetchProfile,
  updateProfile,
  uploadImageFile,
} from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import type { StorytellerProfile, TaleSummary } from "@trt/shared";

export default function ProfilePage() {
  const [user, setUser] = useState<StorytellerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [myTales, setMyTales] = useState<TaleSummary[]>([]);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setError(
          "Sign in to create your storyteller profile and see your stories.",
        );
        return;
      }

      try {
        const [profile, tales] = await Promise.all([
          fetchProfile(token),
          fetchMyTales(token),
        ]);

        setUser(profile);
        setDisplayName(profile.displayName || "");
        setBio(profile.bio || "");
        setMyTales(tales);
        setAvatarPreviewUrl(profile.avatarUrl || null);
      } catch (_err) {
        setError("Unable to load your storyteller nook right now.");
      }
    }

    void load();
  }, []);

  async function saveProfile(
    nextAvatarImageId?: string | null,
    nextAvatarUrl?: string | null,
  ) {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setStatus("Sign in first.");
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const profile = await updateProfile({
        displayName: displayName || null,
        bio: bio || null,
        ...(nextAvatarImageId !== undefined
          ? { avatarImageId: nextAvatarImageId }
          : {}),
        token,
      });
      setUser(profile);
      setDisplayName(profile.displayName || "");
      setBio(profile.bio || "");
      setAvatarPreviewUrl(
        (prev) => profile.avatarUrl || nextAvatarUrl || prev || null,
      );
      setStatus(
        profile.profileComplete
          ? "Your storyteller profile is ready. Named publishing is unlocked."
          : "Saved. Add both a storyteller name and a photo to publish under your name.",
      );
    } catch (_err) {
      setStatus("That update did not stick. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setStatus("Sign in before uploading a photo.");
      return;
    }

    setUploading(true);
    setStatus(null);

    try {
      const response = await uploadImageFile({
        file,
        purpose: "AVATAR",
        token,
      });
      setAvatarPreviewUrl(response.publicUrl);
      await saveProfile(response.imageId, response.publicUrl);
    } catch (_err) {
      setStatus("Photo upload failed. Please try a different image.");
    } finally {
      setUploading(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="ink-panel rounded-[3rem] px-8 py-10 md:px-10 md:py-12">
          <p className="text-xs uppercase tracking-[0.42em] text-parchment/55">
            Storyteller accounts
          </p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.95] text-parchment md:text-7xl">
            Claim your storyteller identity before your tales drift into the
            room alone.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-parchment/78">
            Magic-link sign in keeps it fast. Once you are in, add a photo and
            storyteller name so the site can treat your profile like a real
            marquee, not an afterthought.
          </p>
        </section>

        <section className="card rounded-[2.6rem] p-8">
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="button-primary">
              Create account
            </Link>
            <Link href="/" className="button-secondary">
              Explore stories first
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <p className="text-parchment/72">Loading your storyteller nook...</p>
    );
  }

  const namedStories = myTales.filter((tale) => !tale.isAnonymous).length;
  const anonymousStories = myTales.filter((tale) => tale.isAnonymous).length;
  const totalHearts = myTales.reduce((sum, tale) => sum + tale.upvotes, 0);

  return (
    <div className="space-y-8">
      <section className="ink-panel relative overflow-hidden rounded-[3rem] px-8 py-10 md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.34),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-ember/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 top-14 h-56 w-56 rounded-full bg-sky/15 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className="flex items-center gap-5">
              <StoryAvatar
                name={user.displayName || user.pseudonym}
                src={avatarPreviewUrl || user.avatarUrl}
                size="lg"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.38em] text-parchment/55">
                  Your storyteller profile
                </p>
                <h1 className="mt-3 font-display text-5xl leading-none text-parchment">
                  {user.displayName || user.pseudonym}
                </h1>
              </div>
            </div>
            <p className="max-w-2xl text-base leading-8 text-parchment/76">
              {user.bio ||
                "Add a short note about the kinds of stories you bring into the room."}
            </p>
            <div className="flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.22em]">
              <span
                className={`story-pill ${
                  user.profileComplete
                    ? "border-moss/20 bg-moss/12 text-parchment"
                    : "border-gold/20 bg-gold/12 text-parchment"
                }`}
              >
                {user.profileComplete
                  ? "Named publishing ready"
                  : "Finish name + photo"}
              </span>
              <span className="story-pill border-white/10 bg-white/5 text-parchment/82">
                {user.creditsTotal} storyteller cred
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[2rem] border border-parchment/14 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/50">
                Stories told
              </p>
              <p className="mt-3 font-display text-5xl text-parchment">
                {myTales.length}
              </p>
            </div>
            <div className="rounded-[2rem] border border-parchment/14 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/50">
                Named tales
              </p>
              <p className="mt-3 font-display text-5xl text-parchment">
                {namedStories}
              </p>
            </div>
            <div className="rounded-[2rem] border border-parchment/14 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/50">
                Hearts gathered
              </p>
              <p className="mt-3 font-display text-5xl text-parchment">
                {totalHearts}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="card rounded-[2.5rem] p-8">
          <p className="eyebrow">Profile details</p>
          <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
            How you appear when a story goes out under your name
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink/72 dark:text-parchment/72">
            Add the public name, the photo, and the short bio that tell the room
            who just walked in. Anonymous publishing stays available whenever
            you want it.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <label className="field-label">Storyteller name</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Juniper Vale"
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Short bio</label>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
                placeholder="Softly strange stories, pocket-sized wonder, and a belief that every moonlit porch deserves a legend."
                className="field-textarea"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="button-secondary cursor-pointer">
                {uploading ? "Uploading photo..." : "Upload storyteller photo"}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={saving || uploading}
                className="button-primary"
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
            {status && (
              <p className="rounded-[1.6rem] border border-ink/10 bg-black/5 px-4 py-3 text-sm leading-7 text-ink/72 dark:border-white/10 dark:bg-white/5 dark:text-parchment/72">
                {status}
              </p>
            )}
          </div>
        </div>

        <div className="card rounded-[2.5rem] p-8">
          <p className="eyebrow">Publishing modes</p>
          <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
            Named or anonymous, every single time
          </h2>
          <div className="mt-6 space-y-4 text-sm text-ink/72 dark:text-parchment/72">
            <div className="story-note rounded-[1.8rem] p-5">
              <p className="font-display text-3xl text-ink dark:text-parchment">
                Publish under your name
              </p>
              <p className="mt-3 leading-7">
                Shows your photo and storyteller name on the story, and helps
                you climb the storyteller board.
              </p>
            </div>
            <div className="story-note rounded-[1.8rem] p-5">
              <p className="font-display text-3xl text-ink dark:text-parchment">
                Publish anonymously
              </p>
              <p className="mt-3 leading-7">
                Keeps the story public and heartable while your identity stays
                tucked away. The storyteller cred still finds its way back to
                you.
              </p>
            </div>
            <div className="story-note rounded-[1.8rem] p-5">
              <p className="font-display text-3xl text-ink dark:text-parchment">
                Your account at a glance
              </p>
              <p className="mt-3 leading-7">
                Anonymous stories: {anonymousStories}. Named stories:{" "}
                {namedStories}. All of them belong to this account behind the
                scenes.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-parchment/58">
              Your shelf
            </p>
            <h2 className="mt-2 font-display text-5xl text-parchment">
              Stories tied to you
            </h2>
          </div>
          <Link href="/compose" className="button-moss">
            Start a fresh story
          </Link>
        </div>

        {myTales.length === 0 ? (
          <div className="card rounded-[2.2rem] p-8 text-sm leading-7 text-ink/72 dark:text-parchment/72">
            Your shelf is quiet so far. Spin up a prompt, write something
            luminous, and place your first story here.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {myTales.map((tale) => (
              <div key={tale.id} className="space-y-3">
                <TaleCard tale={tale} />
                {tale.status === "NEEDS_EDITS" && (
                  <Link
                    href={`/tales/${tale.id}/edit`}
                    className="story-pill border-amber-300 bg-amber-50 text-amber-700"
                  >
                    Revise and resubmit
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
