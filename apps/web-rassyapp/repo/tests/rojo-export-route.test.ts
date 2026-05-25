import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

process.env.CAT_HTTP_BASE = "http://localhost:1865";
process.env.CAT_WS_BASE = "ws://localhost:1865";
process.env.APP_SESSION_SECRET = "test-secret";

const { GET: studioRojoExport } = await import("@/app/api/studio/rojo-export/route");

describe("Rojo export API route", () => {
  it("requires auth for studio Rojo export", async () => {
    const req = new NextRequest("http://localhost/api/studio/rojo-export");
    const res = await studioRojoExport(req);
    expect(res.status).toBe(401);
  });
});
