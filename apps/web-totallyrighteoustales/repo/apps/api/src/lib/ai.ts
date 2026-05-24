import { autoModerateText, type AutoModerationOutcome } from "./moderation";

const rawBaseUrl =
  process.env.LOCALAI_BASE_URL || "http://rassygpt-gateway:8080/v1";
const baseUrl = rawBaseUrl.endsWith("/v1")
  ? rawBaseUrl
  : `${rawBaseUrl.replace(/\/$/, "")}/v1`;
const apiKey = process.env.LOCALAI_API_KEY;

const chatModel = process.env.LOCALAI_CHAT_MODEL || "rassy-smart";
const moderationModel = process.env.LOCALAI_MODERATION_MODEL || "rassy-fast";
const embeddingModel = process.env.LOCALAI_EMBED_MODEL || "rassy-embed";
const transcribeModel = process.env.LOCALAI_TRANSCRIBE_MODEL || "rassy-fast";

function authHeaders(): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export function aiEnabled() {
  return process.env.OPENAI_ENABLED === "true";
}

export async function chatCompletion(
  messages: { role: string; content: string }[],
  temperature = 0.2,
) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: chatModel,
      temperature,
      messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`LocalAI chat error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content as string | undefined;
}

export async function polishStory(text: string) {
  const content = await chatCompletion([
    {
      role: "system",
      content:
        "You are a precise story proofreader for a modern Gutenberg writing studio. Improve clarity, rhythm, and imagery without changing plot, authorship, or scene intent. Return ONLY the polished story text.",
    },
    { role: "user", content: text },
  ]);

  return content?.trim() ?? text;
}

export async function moderateText(
  text: string,
): Promise<AutoModerationOutcome> {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        model: moderationModel,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              'Classify content for a PG-13 storytelling community. Respond ONLY with valid JSON: {"result":"PASS|FLAG|BLOCK","categories":{"spam":bool,"pii":bool,"violence":bool},"scores":{"risk":number},"notes":string}.',
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    if (!res.ok) {
      return autoModerateText(text);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content as string | undefined;
    if (!content) return autoModerateText(text);

    const parsed = JSON.parse(content.trim());
    if (!parsed.result || !parsed.categories) return autoModerateText(text);

    return {
      result: parsed.result,
      categories: parsed.categories,
      scores: parsed.scores ?? { risk: 0 },
      notes: parsed.notes,
    } as AutoModerationOutcome;
  } catch (_err) {
    return autoModerateText(text);
  }
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  contentType: string,
) {
  const form = new FormData();
  form.append("model", transcribeModel);
  const fileBlob = new Blob([new Uint8Array(buffer)], { type: contentType });
  form.append("file", fileBlob, filename);

  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      ...authHeaders(),
    },
    body: form,
  });

  if (!res.ok) return undefined;

  const data = await res.json();
  return data.text as string | undefined;
}

export async function embedText(input: string) {
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: embeddingModel,
      input,
    }),
  });

  if (!res.ok) {
    throw new Error(`LocalAI embedding error: ${res.status}`);
  }

  const data = await res.json();
  return data.data?.[0]?.embedding as number[] | undefined;
}
