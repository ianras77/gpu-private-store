import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = process.env.CRACKSTACK_SQLSERVER_ENABLED === "1";
  return NextResponse.json({ enabled });
}
