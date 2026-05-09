import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { loadPluginDraft, savePluginDraft } from "@/lib/cat/plugin-builder";
import { generatePluginSource } from "@/lib/cat/plugin-generation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const instructions =
    typeof (body as { instructions?: unknown }).instructions === "string"
      ? (body as { instructions: string }).instructions.trim()
      : "";
  if (!instructions) {
    return NextResponse.json({ error: "Missing instructions" }, { status: 400 });
  }

  const slug =
    typeof (body as { slug?: unknown }).slug === "string"
      ? (body as { slug: string }).slug
      : "my-plugin";
  const draft = await loadPluginDraft(session.userId, slug);

  const output = await generatePluginSource({
    draft,
    instructions,
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  }).catch((error) =>
    error instanceof Error ? error : new Error("LLM generation returned empty output")
  );
  if (output instanceof Error) {
    return NextResponse.json({ error: output.message }, { status: 502 });
  }

  const nextDraft = await savePluginDraft(session.userId, {
    ...draft,
    source: output
  });

  return NextResponse.json({ draft: nextDraft });
}
