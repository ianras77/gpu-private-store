import { NextResponse } from "next/server";
import {
  LearningStorageError,
  listPublishedLearningModules,
} from "../../../../lib/learning/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const modules = await listPublishedLearningModules();
    return NextResponse.json(
      { modules },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof LearningStorageError) {
      return NextResponse.json(
        { error: "learning_unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "learning_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
