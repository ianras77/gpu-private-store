import { NextRequest } from "next/server";
import { synthesizeSpeech } from "@/lib/rassymind";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { input?: unknown; voice?: unknown };
    if (typeof body.input !== "string" || !body.input.trim() || body.input.length > 12000) return Response.json({ error: "invalid_speech" }, { status: 400 });
    const upstream = await synthesizeSpeech(body.input, typeof body.voice === "string" ? body.voice : "aiden");
    return new Response(upstream.body, { headers: { "content-type": upstream.headers.get("content-type") ?? "audio/wav", "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "speech synthesis failed";
    return new Response(message, { status: /status 429|status 503|busy|queue/i.test(message) ? 429 : 502 });
  }
}
