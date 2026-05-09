import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../../lib/dm/http";
import { parsePatchCharacterInput, patchCharacterInCampaign } from "../../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string; characterId: string }> };

export const runtime = "nodejs";

export async function PATCH(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const parsed = parsePatchCharacterInput(body);
    const { campaignId, characterId } = await context.params;
    const character = await patchCharacterInCampaign(
      auth.session.userId,
      campaignId,
      characterId,
      parsed
    );

    return NextResponse.json({ character });
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
    if (error instanceof Error && error.message === "character_not_found") {
      return NextResponse.json({ error: "character_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "character_patch_failed" }, { status: 500 });
  }
}
