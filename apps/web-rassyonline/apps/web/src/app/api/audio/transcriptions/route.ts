import { NextRequest } from "next/server";
import { transcribeAudio } from "@/lib/rassymind";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 25 * 1024 * 1024) return Response.json({ error: "invalid_audio" }, { status: 400 });
    return Response.json(await transcribeAudio(file, typeof form.get("language") === "string" ? String(form.get("language")) : undefined));
  } catch (error) {
    const message = error instanceof Error ? error.message : "transcription failed";
    return new Response(message, { status: /status 429|status 503|busy|queue/i.test(message) ? 429 : 502 });
  }
}
