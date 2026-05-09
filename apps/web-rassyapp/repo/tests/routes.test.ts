import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

process.env.CAT_HTTP_BASE = "http://localhost:1865";
process.env.CAT_WS_BASE = "ws://localhost:1865";
process.env.APP_SESSION_SECRET = "test-secret";

const { POST: login } = await import("@/app/api/auth/login/route");
const { GET: threads } = await import("@/app/api/threads/route");
const { POST: streamThread } = await import("@/app/api/threads/[id]/stream/route");
const { POST: promoteThread } = await import("@/app/api/threads/[id]/promote/route");
const { GET: agentRoutines } = await import("@/app/api/agent-routines/route");
const { POST: runRoutine } = await import("@/app/api/agent-routines/[id]/run/route");
const { GET: personas } = await import("@/app/api/personas/route");
const { GET: catProxy } = await import("@/app/api/cat/proxy/[...path]/route");
const { GET: pluginBuilder } = await import("@/app/api/cat/plugin-builder/route");
const { POST: repairPlugin } = await import("@/app/api/cat/plugin-builder/repair/route");
const { POST: runtimePlugin } = await import("@/app/api/cat/plugin-builder/runtime/route");
const { GET: studioSummary } = await import("@/app/api/studio/summary/route");
const { GET: studioAssets } = await import("@/app/api/studio/assets/route");
const { PATCH: studioProject } = await import("@/app/api/studio/project/route");

describe("API routes", () => {
  it("rejects invalid login payload", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({})
    });
    const res = await login(req);
    expect(res.status).toBe(400);
  });

  it("requires auth for threads", async () => {
    const req = new NextRequest("http://localhost/api/threads");
    const res = await threads(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for personas", async () => {
    const req = new NextRequest("http://localhost/api/personas");
    const res = await personas(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for thread streaming", async () => {
    const req = new NextRequest("http://localhost/api/threads/thread-1/stream", {
      method: "POST",
      body: JSON.stringify({ text: "hello" })
    });
    const res = await streamThread(req, { params: { id: "thread-1" } });
    expect(res.status).toBe(401);
  });

  it("requires auth for thread promotion", async () => {
    const req = new NextRequest("http://localhost/api/threads/thread-1/promote", {
      method: "POST",
      body: JSON.stringify({ mode: "skill" })
    });
    const res = await promoteThread(req, { params: { id: "thread-1" } });
    expect(res.status).toBe(401);
  });

  it("requires auth for agent routines", async () => {
    const req = new NextRequest("http://localhost/api/agent-routines");
    const res = await agentRoutines(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for routine execution", async () => {
    const req = new NextRequest("http://localhost/api/agent-routines/routine-1/run", {
      method: "POST",
      body: JSON.stringify({})
    });
    const res = await runRoutine(req, { params: { id: "routine-1" } });
    expect(res.status).toBe(401);
  });

  it("requires auth for cat proxy", async () => {
    const req = new NextRequest("http://localhost/api/cat/proxy/plugins");
    const res = await catProxy(req, { params: { path: ["plugins"] } });
    expect(res.status).toBe(401);
  });

  it("requires auth for plugin builder", async () => {
    const req = new NextRequest("http://localhost/api/cat/plugin-builder");
    const res = await pluginBuilder(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for plugin repair", async () => {
    const req = new NextRequest("http://localhost/api/cat/plugin-builder/repair", {
      method: "POST",
      body: JSON.stringify({ slug: "shared-skill", goal: "Harden it" })
    });
    const res = await repairPlugin(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for plugin runtime harness", async () => {
    const req = new NextRequest("http://localhost/api/cat/plugin-builder/runtime", {
      method: "POST",
      body: JSON.stringify({ slug: "shared-skill" })
    });
    const res = await runtimePlugin(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for studio summary", async () => {
    const req = new NextRequest("http://localhost/api/studio/summary");
    const res = await studioSummary(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for studio assets", async () => {
    const req = new NextRequest("http://localhost/api/studio/assets");
    const res = await studioAssets(req);
    expect(res.status).toBe(401);
  });

  it("requires auth for studio project updates", async () => {
    const req = new NextRequest("http://localhost/api/studio/project", {
      method: "PATCH",
      body: JSON.stringify({ theme: "Candy sky" })
    });
    const res = await studioProject(req);
    expect(res.status).toBe(401);
  });
});
