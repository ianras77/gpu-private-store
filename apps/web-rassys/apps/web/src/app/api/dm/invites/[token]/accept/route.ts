import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import { acceptCampaignInvite } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ token: string }> };

export const runtime = "nodejs";

export async function POST(_: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { token } = await context.params;
    const accepted = await acceptCampaignInvite(auth.session.userId, token);
    return NextResponse.json({ accepted });
  } catch (error) {
    if (
      error instanceof Error &&
      ["invite_not_found", "invite_used", "invite_expired"].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "invite_accept_failed" }, { status: 500 });
  }
}
