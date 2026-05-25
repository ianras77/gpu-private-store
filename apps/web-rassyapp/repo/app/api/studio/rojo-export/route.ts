import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { createZip } from "@/lib/cat/zip";
import { buildRojoExportPackage } from "@/lib/studio/rojo-export";
import { getStudioSummary } from "@/lib/studio/data";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspace } = await getOrCreateWorkspace(session.userId);
  const project = await getStudioSummary(workspace.id, session.userId);
  const pkg = buildRojoExportPackage(project);
  const format = request.nextUrl.searchParams.get("format");

  if (format === "json") {
    return NextResponse.json({
      filename: pkg.filename,
      manifest: pkg.manifest,
      checks: pkg.checks,
      entries: pkg.entries.map((entry) => ({
        name: entry.name,
        bytes: entry.data.length
      }))
    });
  }

  const zip = createZip(pkg.entries);

  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pkg.filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
