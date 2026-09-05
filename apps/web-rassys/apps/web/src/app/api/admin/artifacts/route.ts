import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/admin-auth";
import { listRassyArtifacts, saveRassyArtifact } from "../../../../lib/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  channelId: z.string().min(1).max(80),
  kind: z.string().min(1).max(80),
  status: z.enum(["draft", "review", "published", "private", "archived"]),
  ownerResourceId: z.string().max(180).optional(),
  title: z.string().min(1).max(240),
  summary: z.string().max(2000).optional(),
  bodyMarkdown: z.string().max(200000).optional(),
  bodyJson: z.unknown().optional(),
  sourceRefs: z.array(z.object({ type: z.string().min(1), id: z.string().min(1) })).max(100).default([]),
  runId: z.string().max(180).optional(),
});

export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId")?.trim();
  if (!channelId) return NextResponse.json({ error: "channelId_required" }, { status: 400 });
  try {
    return NextResponse.json({ artifacts: await listRassyArtifacts(channelId) });
  } catch {
    return NextResponse.json({ error: "artifact_store_unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_artifact", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json({ artifact: await saveRassyArtifact(parsed.data) });
  } catch {
    return NextResponse.json({ error: "artifact_store_unavailable" }, { status: 503 });
  }
}
