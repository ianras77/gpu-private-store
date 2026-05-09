import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import { endCampaignSession, startCampaignSession } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function POST(_: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const session = await startCampaignSession(auth.session.userId, campaignId);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "session_start_failed" }, { status: 500 });
  }
}

export async function PATCH(_: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const result = await endCampaignSession(auth.session.userId, campaignId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "session_end_failed" }, { status: 500 });
  }
}
