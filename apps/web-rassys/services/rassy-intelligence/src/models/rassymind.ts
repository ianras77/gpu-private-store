import { createOpenAI } from "@ai-sdk/openai";

const baseURL = (process.env.RASSYMIND_BASE_URL ?? "http://127.0.0.1:8844").replace(/\/$/, "");

export const rassymind = createOpenAI({
  baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`,
  apiKey: process.env.RASSYMIND_API_KEY ?? "",
  name: "rassymind",
});

// RassyMind exposes the OpenAI-compatible Chat Completions contract.  Using
// the provider's default model selector can choose the Responses API, whose
// content parts are not accepted by the gateway's local lanes.
export const rassyModel = (alias: string) => rassymind.chat(alias);
