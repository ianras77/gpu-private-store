import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import {
  createCharacterInCampaign,
  getCampaignSnapshotForUser,
  parseCreateCharacterInput
} from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function GET(_: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const snapshot = await getCampaignSnapshotForUser(auth.session.userId, campaignId);
    return NextResponse.json({ characters: snapshot.characters });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "campaign_not_found") {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "character_list_failed" }, { status: 500 });
  }
}

export async function POST(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const parsed = parseCreateCharacterInput(body);
    const { campaignId } = await context.params;

    const character = await createCharacterInCampaign(auth.session.userId, campaignId, parsed);
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "campaign_not_found") {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "character_create_failed" }, { status: 500 });
  }
}
