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
        setError("Sign in to open your story studio.");
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
        setError("Unable to load your studio right now.");
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
          ? "Named publishing is unlocked."
          : "Saved. Add a name and photo to publish named tales.",
      );
    } catch (_err) {
      setStatus("That update did not stick. Try again.");
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
      setStatus("Photo upload failed. Try another image.");
    } finally {
      setUploading(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="press-hero p-6 sm:p-8">
          <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
            Story studio
          </p>
          <h1 className="mt-4 font-display text-5xl leading-[0.94] text-press-paper sm:text-7xl">
            Your private press room starts with a login.
          </h1>
        </section>
        <Link href="/login" className="button-primary">
          Open studio
        </Link>
      </div>
    );
  }

  if (!user)
    return (
      <p className="text-press-ink/70 dark:text-press-paper/70">
        Loading studio...
      </p>
    );

  const totalHearts = myTales.reduce((sum, tale) => sum + tale.upvotes, 0);
  const namedStories = myTales.filter((tale) => !tale.isAnonymous).length;

  return (
    <div className="space-y-7">
      <section className="press-hero p-6 sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <div className="flex items-center gap-5">
            <StoryAvatar
              name={user.displayName || user.pseudonym}
              src={avatarPreviewUrl || user.avatarUrl}
              size="lg"
            />
            <div>
              <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
                Your story studio
              </p>
              <h1 className="mt-3 font-display text-5xl leading-none text-press-paper">
                {user.displayName || user.pseudonym}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-press-paper/70">
                {user.bio ||
                  "Add the kind of public mark that makes your named tales feel intentional."}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border border-white/12 bg-white/[0.06] p-4">
              <p className="type-tile border-white/15 bg-white/10 text-press-paper/76">
                Cred
              </p>
              <p className="mt-3 font-display text-4xl text-press-paper">
                {user.creditsTotal}
              </p>
            </div>
            <div className="border border-white/12 bg-white/[0.06] p-4">
              <p className="type-tile border-white/15 bg-white/10 text-press-paper/76">
                Hearts
              </p>
              <p className="mt-3 font-display text-4xl text-press-paper">
                {totalHearts}
              </p>
            </div>
            <div className="border border-white/12 bg-white/[0.06] p-4">
              <p className="type-tile border-white/15 bg-white/10 text-press-paper/76">
                Named
              </p>
              <p className="mt-3 font-display text-4xl text-press-paper">
                {namedStories}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="press-panel p-5 sm:p-6">
          <p className="press-label">Public mark</p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="field-label">Storyteller name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Juniper Vale"
                className="field-input"
              />
            </label>
            <label className="block">
              <span className="field-label">Short bio</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
                placeholder="Strange stories, clean sentences, and a belief that every impossible object has a cost."
                className="field-textarea"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="button-secondary cursor-pointer">
                {uploading ? "Uploading..." : "Upload photo"}
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
                {saving ? "Saving..." : "Save studio"}
              </button>
            </div>
            {status && (
              <p className="border border-press-ink/10 bg-white/45 px-4 py-3 text-sm leading-7 text-press-ink/70 dark:border-white/10 dark:bg-white/5 dark:text-press-paper/70">
                {status}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="press-label">Your sheets</p>
              <h2 className="mt-2 font-display text-4xl text-press-ink dark:text-press-paper">
                Stories tied to you
              </h2>
            </div>
            <Link href="/compose" className="button-primary">
              Set new type
            </Link>
          </div>
          {myTales.length === 0 ? (
            <div className="press-panel p-7 text-sm leading-7 text-press-ink/68 dark:text-press-paper/68">
              No tales yet. Start with a spine and set the first page.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {myTales.map((tale) => (
                <div key={tale.id} className="space-y-3">
                  <TaleCard tale={tale} />
                  {tale.status === "NEEDS_EDITS" && (
                    <Link
                      href={`/tales/${tale.id}/edit`}
                      className="type-tile border-press-gold/50 bg-press-gold/15 text-press-ink dark:text-press-paper"
                    >
                      Revise and resubmit
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
