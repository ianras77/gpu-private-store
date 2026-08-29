import { prisma } from "@/lib/db";
import { AgentWorker } from "./runner";

const worker = new AgentWorker(prisma, process.env.WORKER_ID ?? `worker-${process.pid}`, async () => {
  throw new Error("No workflow executor is configured");
});
const intervalMs = Number(process.env.WORKER_POLL_MS ?? 1000);
let stopping = false;
process.once("SIGTERM", () => { stopping = true; worker.stop(); });
process.once("SIGINT", () => { stopping = true; worker.stop(); });

async function loop() {
  while (!stopping) {
    await worker.tick();
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

void loop().catch((error) => { console.error("agent worker stopped", error); process.exitCode = 1; });
