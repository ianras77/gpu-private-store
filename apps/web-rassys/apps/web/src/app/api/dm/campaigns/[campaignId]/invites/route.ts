import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import { createCampaignInvite, parseCreateInviteInput } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const parsed = parseCreateInviteInput(body);
    const { campaignId } = await context.params;
    const invite = await createCampaignInvite(auth.session.userId, campaignId, parsed);
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "invite_create_failed" }, { status: 500 });
  }
}
