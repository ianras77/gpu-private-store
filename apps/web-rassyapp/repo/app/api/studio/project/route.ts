import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { updateStudioProject } from "@/lib/studio/data";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

const UpdateStudioProjectSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    theme: z.string().min(1).max(120).optional(),
    heroGoal: z.string().max(240).nullable().optional(),
    templatePackSlug: z.string().max(120).nullable().optional(),
    worldProfileSlug: z.string().max(120).nullable().optional(),
    mapPatternSlug: z.string().max(120).nullable().optional(),
    selectedAssetPackSlugs: z.array(z.string().max(120)).max(12).optional(),
    targetAudience: z.string().min(1).max(120).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes"
  });

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateStudioProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { workspace } = await getOrCreateWorkspace(session.userId);
  const project = await updateStudioProject({
    workspaceId: workspace.id,
    actorUserId: session.userId,
    patch: parsed.data
  });

  return NextResponse.json({ project });
}
