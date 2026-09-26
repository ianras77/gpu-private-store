#!/usr/bin/env node
// Opt-in synthetic smoke check. It prints states only, never answer text or secrets.
const base = (process.argv[2] || "http://127.0.0.1:3199").replace(/\/$/, "");
const timeout = 90_000;

async function checkJson(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function chat(prompt, options = {}) {
  const response = await fetch(`${base}/api/mastra/chat`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }], maxTokens: 256, ...options })
  });
  const events = [];
  let answer = "";
  if (response.body) {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const records = buffer.split(/\r?\n\r?\n/);
      buffer = records.pop() || "";
      for (const record of records) {
        const event = record.match(/^event:\s*(.+)$/m)?.[1];
        const data = record.match(/^data:\s*(.+)$/m)?.[1];
        if (event) events.push(event);
        if (event === "text" && data) answer += JSON.parse(data).delta || "";
      }
    }
  }
  return { status: response.status, thread: Boolean(response.headers.get("x-rassy-thread-id")), complete: events.includes("complete"), searched: events.includes("search"), text: answer };
}

try {
  const health = await checkJson("/api/health");
  const capability = await checkJson("/api/capabilities");
  const arithmetic = await chat("Calculate 18% of 245 and answer with the number.", { webSearch: "off" });
  const research = await chat("Explain the latest Mastra release and search the web. Cite one source.", { webSearch: "auto" });
  const result = {
    health: health.status === 200 ? "PASS" : "FAIL",
    capability: capability.status === 200 && capability.body?.models?.some((model) => model.model === "rassy-agent" && model.streaming === "qualified") ? "PASS" : "FAIL",
    arithmetic: arithmetic.status === 200 && arithmetic.complete && /44[.,]1/.test(arithmetic.text) ? "PASS" : "FAIL",
    research: research.status === 200 && research.complete && research.searched ? "PASS" : "FAIL"
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).includes("FAIL")) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ qualification: "FAIL", reason: error instanceof Error ? error.name : "unknown" }));
  process.exitCode = 1;
}
