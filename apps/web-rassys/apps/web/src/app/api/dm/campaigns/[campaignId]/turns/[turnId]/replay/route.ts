import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../../../lib/dm/http";
import { getTurnReplay } from "../../../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string; turnId: string }> };

export const runtime = "nodejs";

export async function GET(_: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId, turnId } = await context.params;
    const replay = await getTurnReplay(auth.session.userId, campaignId, turnId);
    return NextResponse.json({ replay });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "turn_not_found") {
      return NextResponse.json({ error: "turn_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "turn_replay_failed" }, { status: 500 });
  }
}
