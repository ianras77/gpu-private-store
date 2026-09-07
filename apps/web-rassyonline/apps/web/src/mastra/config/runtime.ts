import { createOpenAI } from "@ai-sdk/openai";

export function rassymindProvider() {
  return createOpenAI({
    baseURL: `${(process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844").replace(/\/+$/, "")}/v1`,
    apiKey: process.env.RASSYMIND_API_KEY ?? "runtipi-server-key"
  });
}
