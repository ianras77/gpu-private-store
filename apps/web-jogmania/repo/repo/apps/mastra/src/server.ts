import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mastra } from "./mastra/index.js";

const port = Number(process.env.PORT || 4112);
const token = process.env.MASTRA_INTERNAL_TOKEN || "";
const maxBodyBytes = 48 * 1024;

function authorized(value: string | undefined) {
  if (!token || !value) return false;
  const candidate = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${token}`);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

async function readJson(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > maxBodyBytes) throw new Error("Request too large");
    chunks.push(data);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "GET" && pathname === "/healthz") {
    send(res, 200, { status: "ok", configured: Boolean(token && (process.env.MASTRA_MODEL_BASE_URL || process.env.OPENAI_API_KEY)) });
    return;
  }
  if (req.method !== "POST" || !["/v1/cartridge", "/v1/recap", "/v1/trend"].includes(pathname)) {
    send(res, 404, { error: "not_found" });
    return;
  }
  if (!authorized(req.headers.authorization)) {
    send(res, 401, { error: "unauthorized" });
    return;
  }
  if (!process.env.MASTRA_MODEL_BASE_URL && !process.env.OPENAI_API_KEY) {
    send(res, 503, { error: "model_not_configured" });
    return;
  }
  let input: unknown;
  try {
    input = await readJson(req);
  } catch {
    send(res, 400, { error: "invalid_request" });
    return;
  }
  try {
    const workflowName = pathname.endsWith("/cartridge")
      ? "cartridgeWorkflow"
      : pathname.endsWith("/trend")
        ? "trendWorkflow"
        : "recapWorkflow";
    const workflow = mastra.getWorkflow(workflowName);
    const run = await workflow.createRun();
    const result = await run.start({ inputData: input as never });
    if (result.status !== "success") {
      send(res, 502, { error: "story_workflow_failed" });
      return;
    }
    send(res, 200, { status: "mastra", output: result.result });
  } catch {
    send(res, 502, { error: "story_workflow_failed" });
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Jogmania Mastra listening on ${port}\n`);
});
