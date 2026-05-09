import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../../lib/dm/http";
import {
  addPinnedFactToCampaign,
  listPinnedFactsForCampaign,
  parseAddFactInput
} from "../../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function GET(_: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const facts = await listPinnedFactsForCampaign(auth.session.userId, campaignId);
    return NextResponse.json({ facts });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "facts_list_failed" }, { status: 500 });
  }
}

export async function POST(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const parsed = parseAddFactInput(body);
    const { campaignId } = await context.params;
    const fact = await addPinnedFactToCampaign(auth.session.userId, campaignId, parsed);
    return NextResponse.json({ fact }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "fact_add_failed" }, { status: 500 });
  }
}
