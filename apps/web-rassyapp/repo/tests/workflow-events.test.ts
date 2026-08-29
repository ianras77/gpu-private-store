import { describe, expect, it, vi } from "vitest";
import { appendRunEvent } from "@/lib/workflow/events";

describe("workflow events", () => {
  it("appends the next sequence number", async () => {
    const create = vi.fn(async ({ data }) => data);
    const db = { workflowRunEvent: { findFirst: vi.fn(async () => ({ sequence: 4 })), create } } as never;
    await appendRunEvent(db, "run-1", "step.completed", { step: "plan" });
    expect(create).toHaveBeenCalledWith({ data: { runId: "run-1", sequence: 5, type: "step.completed", payloadJson: '{"step":"plan"}' } });
  });
});
