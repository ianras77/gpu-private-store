import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import { getPlayerDashboardForUser } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const { searchParams } = new URL(request.url);
    const selectedCharacterId =
      typeof searchParams.get("characterId") === "string" && searchParams.get("characterId")?.trim()
        ? (searchParams.get("characterId") as string)
        : undefined;

    const state = await getPlayerDashboardForUser(
      auth.session.userId,
      campaignId,
      selectedCharacterId
    );
    return NextResponse.json({ state });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "campaign_not_found") {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "character_not_found") {
      return NextResponse.json({ error: "character_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "player_state_failed" }, { status: 500 });
  }
}
