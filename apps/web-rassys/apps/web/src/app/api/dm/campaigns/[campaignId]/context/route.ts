import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import { getCampaignContextForUser } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const { searchParams } = new URL(request.url);
    const actionText =
      typeof searchParams.get("actionText") === "string" && searchParams.get("actionText")?.trim()
        ? (searchParams.get("actionText") as string)
        : "Context preview request";
    const actorCharacterId =
      typeof searchParams.get("actorCharacterId") === "string" && searchParams.get("actorCharacterId")?.trim()
        ? (searchParams.get("actorCharacterId") as string)
        : undefined;

    const contextPacket = await getCampaignContextForUser(
      auth.session.userId,
      campaignId,
      actionText,
      actorCharacterId
    );

    return NextResponse.json({ context: contextPacket });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "campaign_not_found") {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "context_preview_failed" }, { status: 500 });
  }
}
