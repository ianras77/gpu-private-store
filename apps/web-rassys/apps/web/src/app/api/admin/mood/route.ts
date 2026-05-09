import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/admin-auth";
import { callAdmin } from "../../../../lib/admin-proxy";

const bodySchema = z.object({ mood: z.string().min(2) });

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    await callAdmin("/admin/mood", parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "radio_controller_unavailable" }, { status: 502 });
  }
}
