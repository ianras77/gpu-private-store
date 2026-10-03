import { NextResponse } from "next/server";
import {
  getPublishedLearningModule,
  learningStoragePath,
  LearningStorageError,
} from "../../../../../../lib/learning/catalog";
import {
  LearningAssetError,
  readLearningRasterAsset,
} from "../../../../../../lib/learning/assets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string; path: string[] }> };

export async function GET(_request: Request, context: RouteContext) {
  const { slug, path: segments } = await context.params;
  try {
    if (!(await getPublishedLearningModule(slug)))
      return new Response(null, { status: 404 });
    const root = await learningStoragePath();
    const asset = await readLearningRasterAsset(root, slug, segments.join("/"));
    return new NextResponse(new Uint8Array(asset.body), {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.body.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof LearningStorageError)
      return new Response(null, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    const status =
      error instanceof LearningAssetError && error.code === "too_large"
        ? 413
        : 404;
    return new Response(null, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
