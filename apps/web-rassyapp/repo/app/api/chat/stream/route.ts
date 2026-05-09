import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { streamChat } from "@/lib/cat/chat";
import { env } from "@/lib/env";
import { getCatProfileConfig } from "@/lib/cat/topology";
import { buildRobloxCoachPrompt } from "@/lib/studio/prompt";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

const StreamSchema = z.object({
  mode: z.enum(["session", "public"]).optional(),
  text: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  userId: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = StreamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { text, metadata, userId } = parsed.data;
  const mode = parsed.data.mode ?? "session";
  const session = await getSessionFromRequest(request);
  const effectiveUserId = session ? resolveEngineUserId(session) : (userId ?? null);
  const workspaceContext = session ? await getOrCreateWorkspace(session.userId) : null;

  const scopedMetadata = {
    ...(metadata ?? {}),
    ...(workspaceContext
      ? {
          console_context: {
            workspaceId: workspaceContext.workspace.id,
            workspaceSlug: workspaceContext.workspace.slug,
            workspaceRole: workspaceContext.member.role
          }
        }
      : null)
  };

  if (!session && mode !== "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session && mode === "public" && !env.catWsApiKey) {
    return NextResponse.json({ error: "Public chat not available" }, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let assistantBuffer = "";
      const coachProfile = getCatProfileConfig("coach");

      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const closeSocket = streamChat({
        token: session?.engineJwt ?? env.catWsApiKey,
        userId: effectiveUserId,
        wsBase: coachProfile.wsBase,
        payload: {
          text: buildRobloxCoachPrompt({
            text,
            metadata: scopedMetadata
          }),
          metadata: scopedMetadata
        },
        onEvent: async (event) => {
          if (event.type === "token") {
            assistantBuffer += event.value;
            send(event);
          }

          if (event.type === "final") {
            const finalValue = event.value || assistantBuffer;
            send({ type: "final", value: finalValue, why: event.why ?? undefined });
            controller.close();
          }

          if (event.type === "notification") {
            send(event);
          }

          if (event.type === "error") {
            send(event);
            controller.close();
          }
        }
      });

      request.signal.addEventListener("abort", () => {
        closeSocket();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
