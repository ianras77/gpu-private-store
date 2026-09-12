import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { createRun, listRunsForUser } from "@/lib/runs";
import { z } from "zod";

const createSchema = z.object({ workflow: z.string().trim().min(1).max(80), threadId: z.string().trim().min(1).max(200).optional(), projectId: z.string().trim().min(1).max(200).optional(), workflowVersion: z.string().trim().min(1).max(40).optional(), budget: z.record(z.string(), z.unknown()).optional() });
async function currentUser(request: NextRequest) { return getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value); }

export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  return NextResponse.json({ ok: true, runs: await listRunsForUser(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  const run = await createRun({ ...parsed.data, userId: user.id });
  return NextResponse.json({ ok: true, run }, { status: 202, headers: { "cache-control": "no-store" } });
}
