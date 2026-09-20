import { createOpenAI } from "@ai-sdk/openai";

export function rassymindProvider() {
  return createOpenAI({
    baseURL: `${(process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844").replace(/\/+$/, "")}/v1`,
    apiKey: process.env.RASSYMIND_API_KEY ?? "runtipi-server-key",
    headers: {
      "X-Rassy-Profile": "agent",
      "X-Rassy-Domain": "general",
      "X-Rassy-Workload": "interactive",
      "X-Rassy-Deadline-Ms": "120000"
    }
  });
}

export const RASSY_AGENT_MODEL = "rassy-agent";
