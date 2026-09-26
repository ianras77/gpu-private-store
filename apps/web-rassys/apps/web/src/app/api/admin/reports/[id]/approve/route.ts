import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "../../../../../../lib/admin-auth";
import { approveAnalystReport } from "../../../../../../lib/report-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  try {
    const ok = await approveAnalystReport((await params).id, parsed.data.sha256, session.username);
    return NextResponse.json(ok ? { ok: true } : { error: "version_not_found" }, {
      status: ok ? 200 : 409, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "reports_unavailable" }, { status: 503 });
  }
}
