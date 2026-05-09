import { requireDmSession } from "../../../../../../lib/dm/http";
import { listCampaignEventsSince, resolveCampaignEventCursor } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toSse = (event: string, data: unknown, id?: string) =>
  `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export async function GET(request: Request, context: Params) {
  const auth = await requireDmSession();
  if (!auth.ok) return auth.response;

  try {
    const { campaignId } = await context.params;
    const { searchParams } = new URL(request.url);
    let since = searchParams.get("since") ?? undefined;
    let afterId = searchParams.get("afterId") ?? undefined;

    const lastEventId = request.headers.get("last-event-id") ?? undefined;
    if (lastEventId) {
      const resolved = await resolveCampaignEventCursor(auth.session.userId, campaignId, lastEventId);
      if (resolved) {
        since = resolved;
        afterId = lastEventId;
      }
    }

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
        };

        request.signal.addEventListener("abort", close);

        const run = async () => {
          controller.enqueue(
            encoder.encode(toSse("ready", { campaignId, since: since ?? null, afterId: afterId ?? null }))
          );

          let loops = 0;
          while (!closed && loops < 45) {
            try {
              const events = await listCampaignEventsSince(auth.session.userId, campaignId, since, afterId);
              if (events.length) {
                for (const event of events) {
                  controller.enqueue(encoder.encode(toSse("event", event, event.id)));
                }
                const last = events[events.length - 1];
                since = last?.createdAt;
                afterId = last?.id;
              }
              controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
            } catch (error) {
              controller.enqueue(
                encoder.encode(
                  toSse("error", {
                    message: error instanceof Error ? error.message : "stream_failed"
                  })
                )
              );
              break;
            }

            loops += 1;
            await sleep(2000);
          }

          close();
        };

        void run();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    return Response.json({ error: "stream_init_failed" }, { status: 500 });
  }
}
