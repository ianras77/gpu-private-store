import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../lib/dm/http";
import {
  bootstrapCampaign,
  createCampaignForUser,
  getCampaignSnapshotForUser,
  listCampaignsForUser,
  parseCreateCampaignInput
} from "../../../../lib/dm/service";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  const campaigns = await listCampaignsForUser(auth.session.userId);
  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const parsed = parseCreateCampaignInput(body);
    const shouldBootstrap = body?.bootstrap !== false;
    const bootstrapPrompt =
      typeof body?.bootstrapPrompt === "string" && body.bootstrapPrompt.trim()
        ? body.bootstrapPrompt.trim()
        : undefined;

    let snapshot = await createCampaignForUser(auth.session.userId, parsed);
    let bootstrapResult: { narration: string } | null = null;

    if (shouldBootstrap) {
      try {
        bootstrapResult = await bootstrapCampaign(auth.session.userId, snapshot.campaign.id, bootstrapPrompt);
        snapshot = await getCampaignSnapshotForUser(auth.session.userId, snapshot.campaign.id);
      } catch {
        bootstrapResult = null;
      }
    }

    return NextResponse.json(
      {
        campaign: snapshot,
        bootstrap: bootstrapResult
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "system_not_supported") {
      return NextResponse.json({ error: "system_not_supported" }, { status: 422 });
    }
    return NextResponse.json({ error: "campaign_create_failed" }, { status: 500 });
  }
}
