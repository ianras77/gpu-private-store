import { NextResponse } from "next/server";
import { listThoughts } from "../../../lib/thoughts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit ?? 0, 1), 50) : undefined;
  const thoughts = await listThoughts(safeLimit);
  return NextResponse.json(thoughts);
}
