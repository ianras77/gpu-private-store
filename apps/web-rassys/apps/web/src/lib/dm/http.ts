import { NextResponse } from "next/server";
import { getDmSession } from "./auth";

export const requireDmSession = async () => {
  const session = await getDmSession();
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 })
    };
  }
  return {
    ok: true as const,
    session
  };
};
