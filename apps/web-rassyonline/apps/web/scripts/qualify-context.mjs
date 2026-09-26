#!/usr/bin/env node
// Synthetic two-turn check. Outputs only status, source titles/URLs, and topic coverage.
const base = (process.argv[2] || "http://127.0.0.1:3199").replace(/\/$/, "");

async function chat(prompt, { thread, cookie, web = "off" } = {}) {
  const response = await fetch(`${base}/api/mastra/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ threadId: thread, messages: [{ role: "user", content: prompt }], webSearch: web, maxTokens: 512 }),
    signal: AbortSignal.timeout(90_000)
  });
  let raw = "";
  for await (const chunk of response.body ?? []) raw += Buffer.from(chunk).toString();
  const records = raw.split(/\r?\n\r?\n/).map((record) => ({
    event: record.match(/^event: (.+)$/m)?.[1],
    data: record.match(/^data: (.+)$/m)?.[1]
  })).filter((record) => record.event);
  const readData = (record) => { try { return JSON.parse(record.data); } catch { return {}; } };
  return {
    status: response.status,
    thread: response.headers.get("x-rassy-thread-id"),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    complete: records.some((record) => record.event === "complete"),
    text: records.filter((record) => record.event === "text").map((record) => readData(record).delta ?? "").join(""),
    sources: records.filter((record) => record.event === "search").flatMap((record) => readData(record).results ?? [])
  };
}

try {
  const first = await chat("Mastra and LangGraph are the two subjects. Remember them for the next question.");
  const second = await chat("Compare those two using their official documentation.", { thread: first.thread, cookie: first.cookie, web: "on" });
  const result = {
    first: { status: first.status, complete: first.complete },
    second: {
      status: second.status, complete: second.complete,
      sources: second.sources.slice(0, 5).map((source) => ({ title: source.title, url: source.url })),
      mentionsMastra: /mastra/i.test(second.text), mentionsLangGraph: /langgraph/i.test(second.text)
    }
  };
  console.log(JSON.stringify(result));
  if (!first.complete || !second.complete || !result.second.mentionsMastra || !result.second.mentionsLangGraph) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ qualification: "FAIL", reason: error instanceof Error ? error.name : "unknown" }));
  process.exitCode = 1;
}
