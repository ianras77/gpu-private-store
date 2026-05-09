import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-auth";
import { callAdmin } from "../../../../lib/admin-proxy";

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await callAdmin("/admin/skip");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "radio_controller_unavailable" }, { status: 502 });
  }
}
