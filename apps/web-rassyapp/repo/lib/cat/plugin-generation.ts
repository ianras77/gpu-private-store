import "server-only";

import type { PluginDraft } from "@/lib/cat/plugin-builder";
import { fetchJson } from "@/lib/cat/client";
import { getCatProfileConfig } from "@/lib/cat/topology";
import { buildRobloxPluginPrompt } from "@/lib/studio/prompt";

type CatMessageResponse = {
  content?: unknown;
  text?: unknown;
  message?: unknown;
};

function extractText(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const response = payload as CatMessageResponse;
  const candidates = [response.content, response.text, response.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return JSON.stringify(payload);
}

function extractPythonCode(text: string) {
  const fenced = text.match(/```(?:python)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  return text.trim();
}

export async function generatePluginSource(options: {
  draft: PluginDraft;
  instructions: string;
  token: string;
  userId: string;
  appUserId: string;
}) {
  const prompt = buildRobloxPluginPrompt({
    draftName: options.draft.name,
    draftDescription: options.draft.description,
    currentSource: options.draft.source,
    instructions: options.instructions
  });
  const builderProfile = getCatProfileConfig("builder");

  const generated = await fetchJson<unknown>("/message", {
    method: "POST",
    token: options.token,
    userId: options.userId,
    appUserId: options.appUserId,
    httpBase: builderProfile.httpBase,
    timeoutMs: 45_000,
    retries: 0,
    body: JSON.stringify({ text: prompt })
  });

  const output = extractPythonCode(extractText(generated));
  if (!output) {
    throw new Error("LLM generation returned empty output");
  }

  return output;
}
