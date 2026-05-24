const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

async function readJson<T>(res: Response, fallback: string) {
  if (!res.ok) throw new Error(fallback);
  return (await res.json()) as T;
}

export type TaleSummary = {
  id: string;
  title: string;
  excerpt: string;
  authorPseudonym: string;
  createdAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_EDITS";
  assistMode: "HANDMADE" | "STUDIO";
  isAnonymous: boolean;
  storyPrompt?: string | null;
  upvotes: number;
  downvotes: number;
  imageUrl?: string | null;
};

export type LeaderboardData = {
  storytellers: Array<{
    userId: string;
    displayName: string;
    creditsTotal: number;
    storyCount: number;
    totalHearts: number;
  }>;
  stories: TaleSummary[];
};

export async function fetchTales(sort = "hot") {
  const res = await fetch(`${apiUrl}/tales?sort=${sort}`);
  return readJson<TaleSummary[]>(res, "Failed to load tales");
}

export async function searchTales(query: string) {
  const res = await fetch(
    `${apiUrl}/tales/search?query=${encodeURIComponent(query)}`,
  );
  return readJson<TaleSummary[]>(res, "Failed to search tales");
}

export async function fetchTale(id: string, token?: string) {
  const res = await fetch(`${apiUrl}/tales/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return readJson<
    TaleSummary & { body: string; rejectionReason?: string | null }
  >(res, "Failed to load tale");
}

export async function createTale(payload: {
  title: string;
  body: string;
  imageId?: string | null;
  assistMode?: "HANDMADE" | "STUDIO";
  isAnonymous?: boolean;
  storyPrompt?: string | null;
  personaVoice?: string | null;
  personaSignature?: string | null;
  token: string;
}) {
  const res = await fetch(`${apiUrl}/tales`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`,
    },
    body: JSON.stringify({
      title: payload.title,
      body: payload.body,
      imageId: payload.imageId ?? null,
      assistMode: payload.assistMode ?? "HANDMADE",
      isAnonymous: payload.isAnonymous ?? true,
      storyPrompt: payload.storyPrompt ?? null,
      personaVoice: payload.personaVoice ?? null,
      personaSignature: payload.personaSignature ?? null,
    }),
  });
  return readJson(res, "Failed to create tale");
}

export async function heartTale(payload: { id: string; token: string }) {
  const res = await fetch(`${apiUrl}/tales/${payload.id}/heart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${payload.token}` },
  });
  return readJson<{
    ok: true;
    hearted: boolean;
    upvotes: number;
    downvotes: number;
  }>(res, "Failed to heart tale");
}

export async function requestImageUpload(payload: {
  filename: string;
  contentType: string;
  token: string;
}) {
  const res = await fetch(`${apiUrl}/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`,
    },
    body: JSON.stringify({
      filename: payload.filename,
      contentType: payload.contentType,
      purpose: "STORY",
    }),
  });
  return readJson<{ imageId: string; uploadUrl: string; publicUrl: string }>(
    res,
    "Failed to request upload",
  );
}

export async function fetchProfile(token: string) {
  const res = await fetch(`${apiUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<any>(res, "Failed to load profile");
}

export async function updateProfile(payload: {
  displayName?: string | null;
  bio?: string | null;
  token: string;
}) {
  const res = await fetch(`${apiUrl}/me/profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`,
    },
    body: JSON.stringify({
      displayName: payload.displayName ?? null,
      bio: payload.bio ?? null,
    }),
  });
  return readJson<any>(res, "Failed to update profile");
}

export async function fetchMyTales(token: string) {
  const res = await fetch(`${apiUrl}/tales/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<TaleSummary[]>(res, "Failed to load your tales");
}

export async function fetchLeaderboard() {
  const res = await fetch(`${apiUrl}/leaderboard`);
  return readJson<LeaderboardData>(res, "Failed to load leaderboard");
}

export async function polishStory(payload: { text: string; token: string }) {
  const res = await fetch(`${apiUrl}/polish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`,
    },
    body: JSON.stringify({ text: payload.text }),
  });
  return readJson<{ text: string }>(res, "Failed to polish story");
}

export async function craftNotes(payload: {
  title?: string;
  body?: string;
  premise?: string | null;
  character?: string | null;
  stakes?: string | null;
  turn?: string | null;
  voice?: string | null;
}) {
  const res = await fetch(`${apiUrl}/craft-notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<{ notes: string[]; focus: string }>(
    res,
    "Failed to load craft notes",
  );
}

export async function transcribeAudio(payload: { uri: string; token: string }) {
  const form = new FormData();
  form.append("file", {
    uri: payload.uri,
    name: "recording.m4a",
    type: "audio/m4a",
  } as any);

  const res = await fetch(`${apiUrl}/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${payload.token}` },
    body: form,
  });
  return readJson<{ text: string }>(res, "Failed to transcribe audio");
}
