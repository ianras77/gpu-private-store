import { describe, expect, it, vi } from "vitest";
import { AgentWorker } from "@/services/agent-worker/runner";

describe("AgentWorker", () => {
  it("stops before claiming work", async () => {
    const db = { workflowRun: { update: vi.fn() } } as never;
    const worker = new AgentWorker(db, "worker-1", async () => ({ stateJson: "{}" }));
    worker.stop();
    expect(await worker.tick()).toBe(false);
  });
});
