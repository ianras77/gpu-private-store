import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { readArtifact } from "@/lib/artifacts";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return new Response("unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const item = await readArtifact((await context.params).id, user.id);
    if (!item) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
    return new NextResponse(new Uint8Array(item.content), { headers: { "content-type": item.artifact.mimeType, "content-length": String(item.content.byteLength), "content-disposition": `attachment; filename="artifact-${item.artifact.id}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-artifact-sha256": item.artifact.contentHash } });
  } catch { return new Response("artifact unavailable", { status: 410, headers: { "cache-control": "no-store" } }); }
}
