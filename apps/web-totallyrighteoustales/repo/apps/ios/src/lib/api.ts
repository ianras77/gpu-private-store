const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

export async function fetchTales(sort = "hot") {
  const res = await fetch(`${apiUrl}/tales?sort=${sort}`);
  if (!res.ok) throw new Error("Failed to load tales");
  return res.json();
}

export async function fetchTale(id: string, token?: string) {
  const res = await fetch(`${apiUrl}/tales/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!res.ok) throw new Error("Failed to load tale");
  return res.json();
}

export async function createTale(payload: { title: string; body: string; imageId?: string | null; token: string }) {
  const res = await fetch(`${apiUrl}/tales`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`
    },
    body: JSON.stringify({ title: payload.title, body: payload.body, imageId: payload.imageId })
  });
  if (!res.ok) throw new Error("Failed to create tale");
  return res.json();
}

export async function voteTale(payload: { id: string; value: 1 | -1; token: string }) {
  const res = await fetch(`${apiUrl}/tales/${payload.id}/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`
    },
    body: JSON.stringify({ value: payload.value })
  });
  if (!res.ok) throw new Error("Failed to vote");
  return res.json();
}

export async function fetchProfile(token: string) {
  const res = await fetch(`${apiUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to load profile");
  return res.json();
}

export async function fetchLeaderboard() {
  const res = await fetch(`${apiUrl}/leaderboard`);
  if (!res.ok) throw new Error("Failed to load leaderboard");
  return res.json();
}

export async function polishStory(payload: { text: string; token: string }) {
  const res = await fetch(`${apiUrl}/polish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`
    },
    body: JSON.stringify({ text: payload.text })
  });
  if (!res.ok) throw new Error("Failed to polish story");
  return res.json();
}

export async function requestImageUpload(payload: { filename: string; contentType: string; token: string }) {
  const res = await fetch(`${apiUrl}/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.token}`
    },
    body: JSON.stringify({ filename: payload.filename, contentType: payload.contentType })
  });
  if (!res.ok) throw new Error("Failed to request upload");
  return res.json();
}

export async function transcribeAudio(payload: { uri: string; token: string }) {
  const form = new FormData();
  form.append(
    "file",
    {
      uri: payload.uri,
      name: "recording.m4a",
      type: "audio/m4a"
    } as any
  );

  const res = await fetch(`${apiUrl}/transcribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${payload.token}`
    },
    body: form
  });
  if (!res.ok) throw new Error("Failed to transcribe audio");
  return res.json();
}
