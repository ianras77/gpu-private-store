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
  const files = formData.getAll("files");
  if (!files.length) {
    return NextResponse.json({ error: "Missing files" }, { status: 400 });
  }

  const forward = new FormData();
  for (const file of files) {
    if (!(file instanceof File)) continue;
    forward.append("files", file);
  }

  if (!forward.getAll("files").length) {
    return NextResponse.json({ error: "No valid file payload" }, { status: 400 });
  }

  const chunkSize = formData.get("chunk_size");
  const chunkOverlap = formData.get("chunk_overlap");
  const metadata = formData.get("metadata");

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
    const data = await fetchForm<Record<string, unknown>>("/rabbithole/batch", forward, {
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}
