import { NextResponse } from "next/server";
import { getDmSession } from "../../../../../lib/dm/auth";
import { getDmUserById } from "../../../../../lib/dm/service";

export const runtime = "nodejs";

export async function GET() {
  const session = await getDmSession();
  if (!session) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }

  const user = await getDmUserById(session.userId);
  if (!user) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user });
}
