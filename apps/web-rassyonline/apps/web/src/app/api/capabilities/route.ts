import { NextResponse } from "next/server";
import { getModelCapability } from "@/lib/model-capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  const models = await Promise.all(["rassy-agent", "rassy-code", "rassy-mind", "rassy-utility"].map(getModelCapability));
  return NextResponse.json({ models }, { headers: { "cache-control": "private, max-age=30" } });
}
