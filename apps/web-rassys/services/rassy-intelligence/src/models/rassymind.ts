import { createOpenAI } from "@ai-sdk/openai";

const baseURL = (process.env.RASSYMIND_BASE_URL ?? "http://127.0.0.1:8844").replace(/\/$/, "");

export const rassymind = createOpenAI({
  baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`,
  apiKey: process.env.RASSYMIND_API_KEY ?? "",
  name: "rassymind",
});

export const rassyModel = (alias: string) => rassymind(alias);
