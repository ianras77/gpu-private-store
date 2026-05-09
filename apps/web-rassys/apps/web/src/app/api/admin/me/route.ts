import { NextResponse } from "next/server";
import { getAdminSession } from "../../../../lib/admin-auth";

export async function GET() {
  const session = await getAdminSession();
  return NextResponse.json({ ok: Boolean(session), username: session?.username ?? null });
}
