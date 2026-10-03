import { NextResponse } from "next/server";
import { getModelCapability } from "@/lib/model-capabilities";
import { toolRegistry } from "@/mastra/tools";

export const dynamic = "force-dynamic";

export async function GET() {
  const models = await Promise.all(["rassy-agent", "rassy-code", "rassy-mind", "rassy-utility"].map(getModelCapability));
  const tools = Object.entries(toolRegistry).map(([id, definition]) => ({ id, category: definition.category, risk: definition.risk, enabled: definition.enabled }));
  return NextResponse.json({ models, tools }, { headers: { "cache-control": "private, max-age=30" } });
}
