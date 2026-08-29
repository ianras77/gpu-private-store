import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ releaseVersion: process.env.RASSYS_RELEASE_VERSION ?? "2.0.0-dev", gitSha: process.env.RASSYS_GIT_SHA ?? "unknown", buildTimestamp: process.env.RASSYS_BUILD_TIMESTAMP ?? null, imageVersion: process.env.RASSYS_IMAGE_VERSION ?? null, environment: process.env.NODE_ENV ?? "unknown" });
}
