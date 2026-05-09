import { NextResponse, type NextRequest } from "next/server";
import { fetchForm } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const chunkSize = formData.get("chunk_size");
  const chunkOverlap = formData.get("chunk_overlap");
  const metadata = formData.get("metadata");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const forward = new FormData();
  forward.append("file", file);
  if (chunkSize && typeof chunkSize === "string") {
    forward.append("chunk_size", chunkSize);
  }
  if (chunkOverlap && typeof chunkOverlap === "string") {
    forward.append("chunk_overlap", chunkOverlap);
  }
  if (metadata && typeof metadata === "string") {
    forward.append("metadata", metadata);
  }

  try {
    const data = await fetchForm<Record<string, unknown>>("/rabbithole/", forward, {
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}
