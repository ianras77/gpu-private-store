import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { requireDmSession } from "../../../../../../lib/dm/http";
import { rateLimit } from "../../../../../../lib/rate-limit";
import { parseActionInput, processCampaignAction } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const limit = Number(process.env.DM_ACTION_RATE_LIMIT_COUNT ?? 24);
    const windowMs = Number(process.env.DM_ACTION_RATE_LIMIT_WINDOW_MS ?? 60000);
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const key = `dm-action:${auth.session.userId}:${campaignId}`;
    const rate = await rateLimit(key, limit, windowSeconds);
    const rateHeaders = {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(rate.remaining),
      "X-RateLimit-Reset": String(Math.floor((Date.now() + windowMs) / 1000))
    };

    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: "rate_limited",
          retryAfterSeconds: windowSeconds
        },
        {
          status: 429,
          headers: {
            ...rateHeaders,
            "Retry-After": String(windowSeconds)
          }
        }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const idempotencyHeader = request.headers.get("idempotency-key") ?? undefined;
    const parsed = parseActionInput({
      actionText: typeof body.actionText === "string" ? body.actionText : "",
      actorCharacterId:
        typeof body.actorCharacterId === "string" ? body.actorCharacterId : undefined,
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : idempotencyHeader
    });
    const result = await processCampaignAction(auth.session.userId, campaignId, parsed);
    return NextResponse.json(result, { headers: rateHeaders });
  } catch (error) {
    console.error("dm_action_failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
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
    if (error instanceof Error && error.message === "turn_in_progress") {
      return NextResponse.json({ error: "turn_in_progress" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "turn_previously_failed") {
      return NextResponse.json({ error: "turn_previously_failed" }, { status: 409 });
    }
    return NextResponse.json({ error: "action_failed" }, { status: 500 });
  }
}
