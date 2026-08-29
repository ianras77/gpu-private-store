import type { PrismaClient } from "@prisma/client";
import { claimWorkflowRun } from "@/lib/workflow/repository";
import { appendRunEvent } from "@/lib/workflow/events";

export type RunExecutor = (run: { id: string; inputJson: string; stateJson: string }) => Promise<{ stateJson: string }>;

export class AgentWorker {
  private stopping = false;
  constructor(private readonly db: PrismaClient, private readonly workerId: string, private readonly execute: RunExecutor) {}
  stop() { this.stopping = true; }

  async tick(): Promise<boolean> {
    if (this.stopping) return false;
    const run = await claimWorkflowRun(this.db, this.workerId);
    if (!run) return false;
    try {
      const result = await this.execute(run);
      await this.db.workflowRun.update({ where: { id: run.id, leaseOwner: this.workerId }, data: { stateJson: result.stateJson, status: "passed", completedAt: new Date(), leaseExpiresAt: null } });
      await appendRunEvent(this.db, run.id, "run.completed", { status: "passed", workerId: this.workerId });
    } catch (error) {
      await this.db.workflowRun.update({ where: { id: run.id, leaseOwner: this.workerId }, data: { status: "failed", stateJson: JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : "Worker execution failed" }), completedAt: new Date(), leaseExpiresAt: null } });
      await appendRunEvent(this.db, run.id, "run.failed", { status: "failed", workerId: this.workerId, error: error instanceof Error ? error.message : "Worker execution failed" });
    }
    return true;
  }
}
