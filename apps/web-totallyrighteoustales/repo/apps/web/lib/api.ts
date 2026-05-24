import type {
  TaleSummary,
  TaleDetail,
  LeaderboardData,
  StorytellerProfile,
  ImagePurpose,
  CraftNotesResponse,
} from "@trt/shared";

const apiUrl =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

export const TALES_PAGE_SIZE = 30;
export const SEARCH_RESULTS_PAGE_SIZE = 20;
export const SEARCH_PAGE_SIZE = SEARCH_RESULTS_PAGE_SIZE;

type QueryValue = string | number | boolean | null | undefined;

function buildApiUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${apiUrl}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function readJson<T>(res: Response, fallbackMessage: string) {
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error || fallbackMessage);
  }

  return (await res.json()) as T;
}

async function apiJson<T>(
  path: string,
  fallbackMessage: string,
  init?: RequestInit,
  query?: Record<string, QueryValue>,
) {
  const res = await fetch(buildApiUrl(path, query), init);
  return readJson<T>(res, fallbackMessage);
}

async function authedFetch(
  path: string,
  token: string,
  init?: RequestInit,
  query?: Record<string, QueryValue>,
) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(buildApiUrl(path, query), {
    ...init,
    headers,
  });
}

async function authedJson<T>(
  path: string,
  token: string,
  init?: RequestInit,
  fallbackMessage = "Request failed",
  query?: Record<string, QueryValue>,
) {
  const res = await authedFetch(path, token, init, query);
  return readJson<T>(res, fallbackMessage);
}

export async function fetchTales(sort: string, page = 0) {
  return apiJson<TaleSummary[]>(
    "/tales",
    "Failed to load tales",
    { cache: "no-store" },
    { sort, page, limit: TALES_PAGE_SIZE },
  );
}

export async function fetchFeatured() {
  return apiJson<TaleSummary[]>(
    "/tales/featured",
    "Failed to load featured tales",
    { cache: "no-store" },
  );
}

export async function searchTales(query: string, page = 0) {
  return apiJson<(TaleSummary & { similarity?: number })[]>(
    "/tales/search",
    "Failed to search tales",
    { cache: "no-store" },
    { query: query.trim(), page, limit: SEARCH_RESULTS_PAGE_SIZE },
  );
}

export async function fetchPagedTales({
  sort = "hot",
  query,
  page = 0,
}: {
  sort?: string;
  query?: string;
  page?: number;
}) {
  if (query?.trim()) {
    return searchTales(query, page);
  }

  return fetchTales(sort, page);
}

export async function fetchTale(id: string) {
  return apiJson<TaleDetail>(`/tales/${id}`, "Failed to load tale", {
    cache: "no-store",
  });
}

export async function fetchLeaderboard() {
  return apiJson<LeaderboardData>(
    "/leaderboard",
    "Failed to load leaderboard",
    { cache: "no-store" },
  );
}

export async function createTale(payload: {
  title: string;
  body: string;
  imageId?: string | null;
  assistMode?: "HANDMADE" | "STUDIO";
  isAnonymous?: boolean;
  storyPrompt?: string | null;
  personaName?: string | null;
  personaVoice?: string | null;
  personaSignature?: string | null;
  token: string;
}) {
  return authedJson(
    "/tales",
    payload.token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        imageId: payload.imageId,
        assistMode: payload.assistMode,
        isAnonymous: payload.isAnonymous ?? false,
        storyPrompt: payload.storyPrompt ?? null,
        personaName: payload.personaName ?? null,
        personaVoice: payload.personaVoice ?? null,
        personaSignature: payload.personaSignature ?? null,
      }),
    },
    "Failed to create tale",
  );
}

export async function updateTale(payload: {
  id: string;
  title: string;
  body: string;
  imageId?: string | null;
  assistMode?: "HANDMADE" | "STUDIO";
  isAnonymous?: boolean;
  storyPrompt?: string | null;
  personaName?: string | null;
  personaVoice?: string | null;
  personaSignature?: string | null;
  token: string;
}) {
  return authedJson(
    `/tales/${payload.id}`,
    payload.token,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        imageId: payload.imageId,
        assistMode: payload.assistMode,
        isAnonymous: payload.isAnonymous ?? false,
        storyPrompt: payload.storyPrompt ?? null,
        personaName: payload.personaName ?? null,
        personaVoice: payload.personaVoice ?? null,
        personaSignature: payload.personaSignature ?? null,
      }),
    },
    "Failed to update tale",
  );
}

export async function toggleHeart(payload: { id: string; token: string }) {
  return authedJson<{ ok: true; hearted: boolean; upvotes: number }>(
    `/tales/${payload.id}/heart`,
    payload.token,
    { method: "POST" },
    "Failed to update heart",
  );
}

export type UploadedImage = {
  imageId: string;
  uploadUrl: string;
  publicUrl: string;
};

export async function requestImageUpload(payload: {
  filename: string;
  contentType: string;
  purpose?: ImagePurpose;
  token: string;
}) {
  return authedJson<UploadedImage>(
    "/images",
    payload.token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: payload.filename,
        contentType: payload.contentType,
        purpose: payload.purpose ?? "STORY",
      }),
    },
    "Failed to request upload",
  );
}

async function uploadToSignedUrl(
  uploadUrl: string,
  file: Blob,
  contentType?: string,
) {
  const headers = new Headers();
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: file,
  });

  if (!res.ok) {
    throw new Error("Upload failed");
  }
}

export async function uploadImageFile(payload: {
  file: File;
  purpose?: ImagePurpose;
  token: string;
}) {
  const response = await requestImageUpload({
    filename: payload.file.name,
    contentType: payload.file.type || "application/octet-stream",
    purpose: payload.purpose,
    token: payload.token,
  });

  await uploadToSignedUrl(
    response.uploadUrl,
    payload.file,
    payload.file.type || undefined,
  );
  return response;
}

export async function updateProfile(payload: {
  displayName?: string | null;
  bio?: string | null;
  avatarImageId?: string | null;
  token: string;
}) {
  return authedJson<StorytellerProfile>(
    "/me/profile",
    payload.token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: payload.displayName ?? null,
        bio: payload.bio ?? null,
        avatarImageId: Object.prototype.hasOwnProperty.call(
          payload,
          "avatarImageId",
        )
          ? (payload.avatarImageId ?? null)
          : undefined,
      }),
    },
    "Failed to update profile",
  );
}

export async function fetchProfile(token: string) {
  return authedJson<StorytellerProfile>(
    "/me",
    token,
    { cache: "no-store" },
    "Failed to load profile",
  );
}

export async function fetchMyTales(token: string) {
  return authedJson<TaleSummary[]>(
    "/tales/mine",
    token,
    { cache: "no-store" },
    "Failed to load your tales",
  );
}

export async function generateStorySpark(payload: {
  premise: string;
  mood?: string | null;
  setting?: string | null;
  wonder?: string | null;
  character?: string | null;
  stakes?: string | null;
  turn?: string | null;
  voice?: string | null;
}) {
  return apiJson<{
    titleSuggestion: string;
    prompt: string;
    opening: string;
  }>("/story-spark", "Failed to spin a story spark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchCraftNotes(payload: {
  title?: string;
  body?: string;
  premise?: string | null;
  character?: string | null;
  stakes?: string | null;
  turn?: string | null;
  voice?: string | null;
}) {
  return apiJson<CraftNotesResponse>(
    "/craft-notes",
    "Failed to gather craft notes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

export async function polishDraft(text: string, token: string) {
  return authedJson<{ text: string }>(
    "/polish",
    token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
    "Failed to polish draft",
  );
}

export async function transcribeStoryAudio(payload: {
  audio: Blob;
  filename?: string;
  token: string;
}) {
  const form = new FormData();
  form.append("file", payload.audio, payload.filename ?? "recording.webm");

  const res = await authedFetch("/transcribe", payload.token, {
    method: "POST",
    body: form,
  });

  return readJson<{ text: string }>(res, "Failed to transcribe audio");
}

export type EditableTale = TaleDetail & {
  assistMode: "HANDMADE" | "STUDIO";
  isAnonymous: boolean;
  storyPrompt?: string | null;
};

export async function fetchEditableTale(id: string, token: string) {
  return authedJson<EditableTale>(
    `/tales/${id}`,
    token,
    { cache: "no-store" },
    "Failed to load tale",
  );
}

export type PendingTale = {
  id: string;
  title: string;
  excerpt: string;
  authorPseudonym: string;
  createdAt: string;
  imageUrl?: string | null;
};

export type PendingImage = {
  id: string;
  url: string;
  createdAt: string;
  uploader: string;
};

export async function fetchModerationQueue(token: string) {
  return authedJson<PendingTale[]>(
    "/moderation/queue",
    token,
    { cache: "no-store" },
    "Failed to load moderation queue",
  );
}

export async function moderateTale(
  token: string,
  id: string,
  action: "approve" | "reject" | "needs-edits",
  reason?: string,
) {
  return authedJson(
    `/moderation/tales/${id}/${action}`,
    token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body:
        action === "approve"
          ? undefined
          : JSON.stringify({ reason: reason || "Not a fit" }),
    },
    "Failed to update moderation decision",
  );
}

export async function fetchModerationImages(token: string) {
  return authedJson<PendingImage[]>(
    "/moderation/images/queue",
    token,
    { cache: "no-store" },
    "Failed to load moderation image queue",
  );
}

export async function moderateImage(
  token: string,
  id: string,
  action: "approve" | "reject",
  reason?: string,
) {
  return authedJson(
    `/moderation/images/${id}/${action}`,
    token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body:
        action === "reject"
          ? JSON.stringify({ reason: reason || "Not a fit" })
          : undefined,
    },
    "Failed to update image moderation",
  );
}
