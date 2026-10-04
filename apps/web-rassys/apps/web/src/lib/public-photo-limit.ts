import { NextResponse } from "next/server";
import { getClientIp } from "./request";
import { rateLimit } from "./rate-limit";

const PUBLIC_PHOTO_MEDIA_LIMIT = 600;
const PUBLIC_PHOTO_WINDOW_SECONDS = 60;

export async function limitPublicPhotoMedia() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(
    `rl:public-photo-media:${ip}`,
    PUBLIC_PHOTO_MEDIA_LIMIT,
    PUBLIC_PHOTO_WINDOW_SECONDS,
  );
  return allowed
    ? null
    : NextResponse.json(
        { error: "rate_limit" },
        {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": "60" },
        },
      );
}
