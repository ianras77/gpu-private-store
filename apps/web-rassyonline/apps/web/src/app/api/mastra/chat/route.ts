import { NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { agentRegistry } from "@/mastra";
import { streamMastraChat } from "@/mastra/chat";

export const dynamic = "force-dynamic";
const schema = z.object({
  agent: z.enum(["rassy", "researcher", "knowledge", "coder", "utility"]).default("rassy"),
  threadId: z.string().min(1).max(200),
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string().min(1).max(50000) })).min(1).max(60)
});

export async function POST(request: NextRequest) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  try {
    const result = await streamMastraChat({ agent: agentRegistry[parsed.data.agent], messages: parsed.data.messages, threadId: parsed.data.threadId, resourceId: user.id, signal: request.signal });
    return new Response(result.textStream as unknown as ReadableStream<Uint8Array>, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-rassy-agent": parsed.data.agent, "x-rassy-thread-id": parsed.data.threadId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mastra agent failed";
    return new Response(message, { status: /429|503|busy/i.test(message) ? 429 : 502 });
  }
}
