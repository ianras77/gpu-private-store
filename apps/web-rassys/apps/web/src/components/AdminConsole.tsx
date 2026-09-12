"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const HEIF_PATTERN = /\.(heic|heif)$/i;

const isHeifFile = (file: File) =>
  /image\/hei[cf]/i.test(file.type) || HEIF_PATTERN.test(file.name || "");

const convertHeifFile = async (file: File) => {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const imageBlob = Array.isArray(converted) ? converted[0] : converted;
  const nextName = HEIF_PATTERN.test(file.name)
    ? file.name.replace(HEIF_PATTERN, ".jpg")
    : `${file.name}.jpg`;
  return new File([imageBlob as Blob], nextName, { type: "image/jpeg" });
};

type AdminMe = {
  ok?: boolean;
  username?: string | null;
};

export function AdminConsole() {
  const { data: me, mutate } = useSWR<AdminMe>("/api/admin/me", fetcher);
  const [username, setUsername] = useState("ian");
  const [password, setPassword] = useState("");
  const [mood, setMood] = useState("daydream");
  const [radioMessage, setRadioMessage] = useState<string | null>(null);
  const [seed, setSeed] = useState("");
  const [title, setTitle] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<File[]>([]);
  const [thoughtMessage, setThoughtMessage] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const login = async () => {
    setRadioMessage(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      await mutate();
      setPassword("");
    } else {
      setRadioMessage("That login did not go through.");
    }
  };

  const sendAction = async (path: string, body?: unknown) => {
    setRadioMessage(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) {
      setRadioMessage("Command sent.");
    } else {
      setRadioMessage("Command failed.");
    }
  };

  const handleImageSelection = async (files: File[]) => {
    setThoughtMessage(null);

    try {
      const normalizedFiles = await Promise.all(
        files.map(async (file) =>
          isHeifFile(file) ? convertHeifFile(file) : file,
        ),
      );
      setSelectedImages(normalizedFiles);
    } catch {
      setThoughtMessage(
        "One of the HEIC images could not be prepared. Try it again or use JPG/WebP.",
      );
    }
  };

  const publishThought = async (mode: "assist" | "raw") => {
    if (!seed.trim()) return;
    setThoughtMessage(null);
    setPublishing(true);

    const formData = new FormData();
    formData.set("seed", seed);
    formData.set("mode", mode);
    if (title.trim()) formData.set("title", title.trim());
    if (imageAlt.trim()) formData.set("imageAlt", imageAlt.trim());
    if (imageCaption.trim()) formData.set("imageCaption", imageCaption.trim());
    for (const image of selectedImages) {
      formData.append("images", image);
    }
    for (const asset of selectedAssets) formData.append("assets", asset);

    const res = await fetch("/api/admin/thoughts", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      setThoughtMessage("Thought published.");
      setSeed("");
      setTitle("");
      setImageAlt("");
      setImageCaption("");
      setSelectedImages([]);
      setSelectedAssets([]);
    } else {
      const payload = await res.json().catch(() => null);
      setThoughtMessage(
        payload?.detail
          ? `Publish failed: ${payload.detail}`
          : payload?.error
            ? `Publish failed: ${payload.error}`
            : "Publish failed.",
      );
    }

    setPublishing(false);
  };

  if (!me?.ok) {
    return (
      <Card className="w-full">
        <h2 className="section-title text-2xl">Admin Access</h2>
        <p className="mt-2 text-sm text-cloud/80">
          Sign in with the admin username and password.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-[0.8fr_1fr_auto]">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rave-input w-full rounded-full px-4 py-2 text-sm"
            placeholder="username"
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rave-input w-full rounded-full px-4 py-2 text-sm"
            placeholder="password"
            autoComplete="current-password"
          />
          <Button onClick={login}>Enter</Button>
        </div>
        {radioMessage && (
          <div className="mt-3 text-xs text-comet">{radioMessage}</div>
        )}
      </Card>
    );
  }

  return (
    <div className="grid w-full gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="xl:col-span-2 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_85%_15%,rgba(66,245,255,.18),transparent_30%),linear-gradient(135deg,rgba(255,79,216,.16),rgba(10,4,22,.88))] p-6 shadow-[0_24px_80px_rgba(0,0,0,.25)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="text-[10px] font-semibold uppercase tracking-[.3em] text-cyan-200/70">Rassy control room · live surface</div>
            <h1 className="mt-3 font-display text-3xl leading-tight text-white sm:text-5xl">Make the house feel alive.</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-cloud/75">A calmer command deck for the radio, the writing shelf, and the little moments that make Rasies worth opening. Every action below is explicit, reversible where possible, and visible when it lands.</p>
          </div>
          <div className="grid min-w-[12rem] gap-2 text-xs text-cloud/70">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><span className="block uppercase tracking-[.2em] text-cyan-200/60">mode</span><strong className="mt-1 block text-white">Operator / creator</strong></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><span className="block uppercase tracking-[.2em] text-cyan-200/60">guardrail</span><strong className="mt-1 block text-white">Server-side admin gate</strong></div>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-2xl">◉</div><strong className="mt-2 block text-sm text-white">Direct the mood</strong><span className="mt-1 block text-xs leading-5 text-cloud/60">Shape the room without hunting through settings.</span></div>
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-2xl">✦</div><strong className="mt-2 block text-sm text-white">Make something lasting</strong><span className="mt-1 block text-xs leading-5 text-cloud/60">Turn a seed into a considered thought, with its media attached.</span></div>
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-2xl">↗</div><strong className="mt-2 block text-sm text-white">See what happened</strong><span className="mt-1 block text-xs leading-5 text-cloud/60">Feedback stays close to the action so the console never feels mysterious.</span></div>
        </div>
      </div>
      <Card className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title text-2xl">DJ Console</h2>
            <p className="mt-2 text-sm text-cloud/80">
              Live control for the booth.
            </p>
          </div>
          <div className="rave-chip rounded-full px-4 py-2 text-xs uppercase tracking-[0.25em] text-cloud/75">
            Signed in as {me.username ?? "ian"}
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <input
              value={mood}
              onChange={(event) => setMood(event.target.value)}
              className="rave-input rounded-full px-4 py-2 text-sm"
              placeholder="mood"
            />
            <Button onClick={() => sendAction("/api/admin/mood", { mood })}>
              Set mood
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendAction("/api/admin/skip")}
            >
              Skip track
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => sendAction("/api/admin/stinger")}
            >
              Fire stinger
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendAction("/api/admin/talk")}
            >
              Talk break now
            </Button>
          </div>
          {radioMessage && (
            <div className="text-xs text-comet">{radioMessage}</div>
          )}
        </div>
      </Card>

      <Card className="w-full">
        <h2 className="section-title text-2xl">Thoughts Studio</h2>
        <p className="mt-2 text-sm text-cloud/80">
          Write the thought, attach images, audio, video, PDFs, or other files, then either polish
          it or ship it exactly as written.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rave-input rounded-full px-4 py-2 text-sm"
            placeholder="title"
          />
          <textarea
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            className="rave-input min-h-[180px] w-full rounded-3xl p-4 text-sm"
            placeholder="Write the thought here..."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={imageAlt}
              onChange={(event) => setImageAlt(event.target.value)}
              className="rave-input rounded-full px-4 py-2 text-sm"
              placeholder="image alt text"
            />
            <input
              value={imageCaption}
              onChange={(event) => setImageCaption(event.target.value)}
              className="rave-input rounded-full px-4 py-2 text-sm"
              placeholder="lead image caption"
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">
                  Attached Images
                </div>
                <div className="mt-1 text-sm text-cloud/75">
                  Add JPG, PNG, WebP, GIF, AVIF, or HEIC files. HEIC and HEIF
                  uploads are converted in the browser before they land.
                </div>
              </div>
              <label className="rave-chip cursor-pointer rounded-full px-4 py-2 text-xs uppercase tracking-[0.25em] text-cloud/80">
                Choose files
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,image/heic-sequence,image/heif-sequence,.heic,.heif"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    void handleImageSelection(files);
                  }}
                />
              </label>
            </div>

            {selectedImages.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {selectedImages.map((file) => (
                  <div
                    key={`${file.name}-${file.size}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-cloud/80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-white">{file.name}</div>
                      <div className="text-xs text-cloud/55">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-xs uppercase tracking-[0.2em] text-comet"
                      onClick={() =>
                        setSelectedImages((current) =>
                          current.filter((candidate) => candidate !== file),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-cloud/60">
                No images attached yet.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Linked project files</div><div className="mt-1 text-sm text-cloud/75">Voice notes, recordings, PDFs, Markdown, and reference files stay attached to this post.</div></div>
              <label className="rave-chip cursor-pointer rounded-full px-4 py-2 text-xs uppercase tracking-[0.25em] text-cloud/80">Attach files<input type="file" multiple className="hidden" onChange={(event) => setSelectedAssets((current) => [...current, ...Array.from(event.target.files ?? [])])} /></label>
            </div>
            {selectedAssets.length ? <div className="mt-4 flex flex-wrap gap-2">{selectedAssets.map((file) => <span key={`${file.name}-${file.size}`} className="rounded-full border border-white/10 px-3 py-2 text-xs text-cloud/75">{file.name}</span>)}</div> : <div className="mt-4 text-sm text-cloud/60">No extra files attached yet.</div>}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => publishThought("assist")}
              disabled={publishing}
            >
              {publishing ? "Publishing..." : "Polish and publish"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => publishThought("raw")}
              disabled={publishing}
            >
              {publishing ? "Publishing..." : "Publish as written"}
            </Button>
          </div>
          {thoughtMessage && (
            <div className="text-xs text-comet">{thoughtMessage}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
