import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../lib/dm/http";
import { getCampaignSnapshotForUser } from "../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function GET(_: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const snapshot = await getCampaignSnapshotForUser(auth.session.userId, campaignId);
    return NextResponse.json({ campaign: snapshot });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "campaign_not_found") {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "campaign_read_failed" }, { status: 500 });
  }
}
