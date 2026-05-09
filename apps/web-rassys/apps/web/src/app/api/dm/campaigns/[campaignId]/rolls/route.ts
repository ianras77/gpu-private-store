import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import { listCampaignDiceRolls } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const parseLimit = (value: string | null) => {
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.round(parsed), 1), 500);
};

export async function GET(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const turnId = searchParams.get("turnId") ?? undefined;

    const rolls = await listCampaignDiceRolls(auth.session.userId, campaignId, {
      limit,
      turnId
    });

    return NextResponse.json({ rolls, total: rolls.length });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "rolls_list_failed" }, { status: 500 });
  }
}
