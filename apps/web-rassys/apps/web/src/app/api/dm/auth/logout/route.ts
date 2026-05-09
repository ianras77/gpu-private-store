import { NextResponse } from "next/server";
import { clearDmToken, getDmSession } from "../../../../../lib/dm/auth";
import { recordDmAuthEvent } from "../../../../../lib/dm/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getDmSession();
  if (session) {
    await recordDmAuthEvent({
      userId: session.userId,
      eventType: "logout",
      request
    });
  }
  await clearDmToken(request);
  return NextResponse.json({ ok: true });
}
