import { spawn } from "node:child_process";
import { createServer } from "node:http";

const token = "jogmania-golden-smoke-token";
const eventIds = ["marquee", "prize-counter", "lantern-crew", "arcade-lights"];
const modelOutputs = {
  trend: {
    evidenceId: "first-adventure",
    moment: "A first little chapter, with the lantern mouse as your guide.",
  },
  cartridge: {
    title: "The Lantern Mouse and the Missing Token",
    openingLine: "A tiny door has appeared beside your familiar path.",
    finishLine: "The arcade glows again, and the mouse is keeping the brass token safe.",
    eventLines: eventIds.map((id, index) => ({
      id,
      title: ["The old sign", "A rolling token", "A tiny guide", "Arcade lights"][index],
      message: [
        "A neon sign wakes up with a little wink.",
        "A brass token rolls into a rattly tin.",
        "The lantern mouse joins the parade.",
        "The whole arcade bursts into color.",
      ][index],
    })),
    recapHeadline: "A little arcade came back to life",
    recapStory: "A tiny mouse found its way home along the path.",
    evidenceId: "chosen-intention",
    nextHook: "Something is jingling behind the prize counter.",
  },
  recap: {
    recapHeadline: "The familiar trail waved hello",
    recapStory: "Your returning footsteps helped the lantern mouse find its way back.",
    evidenceId: "course-return",
    nextHook: "A paper kite is waiting by the bridge.",
  },
};

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForMastra(url, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Mastra exited before its health check passed.");
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Mastra did not become ready within 20 seconds.");
}

const modelServer = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  modelRequestCount += 1;
  const requestBody = JSON.parse(Buffer.concat(await collectBody(request)).toString("utf8"));
  const content = JSON.stringify(requestBody.messages ?? []);
  const output = content.includes("Find one charming")
    ? modelOutputs.trend
    : content.includes("eventLog")
      ? modelOutputs.recap
      : modelOutputs.cartridge;

  sendJson(response, 200, {
    id: "chatcmpl-jogmania-golden",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "jogmania-golden",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 32, completion_tokens: 96, total_tokens: 128 },
  });
});

async function collectBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks;
}

let mastraProcess;
let modelPort;
let modelRequestCount = 0;
try {
  await new Promise((resolve, reject) => {
    modelServer.once("error", reject);
    modelServer.listen(0, "127.0.0.1", resolve);
  });
  modelPort = modelServer.address().port;
  const mastraPort = await reservePort();
  const baseDirectory = new URL("..", import.meta.url).pathname;
  mastraProcess = spawn(process.execPath, ["--import", "tsx/esm", "src/server.ts"], {
    cwd: baseDirectory,
    env: {
      ...process.env,
      PORT: String(mastraPort),
      MASTRA_INTERNAL_TOKEN: token,
      MASTRA_MODEL_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
      MASTRA_MODEL_API_KEY: "jogmania-golden-model-key",
      MASTRA_MODEL: "jogmania-golden",
    },
    stdio: "ignore",
  });

  const baseUrl = `http://127.0.0.1:${mastraPort}`;
  await waitForMastra(baseUrl, mastraProcess);

  const requests = [
    ["trend", "/v1/trend", {
      courseName: "Lantern loop",
      runnerSnapshot: {
        runsLogged: 1,
        favoriteCourse: null,
        favoriteCourseVisits: 0,
        recentRuns30Days: 1,
        typicalDistanceKm: null,
        typicalDurationMinutes: null,
        daysSinceLastRun: 0,
      },
      evidence: [{ id: "first-adventure", label: "First adventure", detail: "A first recorded run." }],
    }],
    ["cartridge", "/v1/cartridge", {
      courseName: "Lantern loop",
      worldName: "The Lost Arcade",
      intent: "easy",
      tone: "silly",
      feedbackHint: "shorter",
      runnerSnapshot: {
        runsLogged: 1,
        favoriteCourse: null,
        discoveries: 1,
        recentChapter: "Marquee Mystery",
        daysSinceLastRun: 0,
        lifetimeDistanceKm: 0,
        favoriteCourseVisits: 0,
        recentRuns30Days: 1,
        typicalDistanceKm: null,
        typicalDurationMinutes: null,
      },
      events: eventIds.map((id) => ({ id, kind: "discovery", title: id, message: "An arcade surprise." })),
      evidence: [{ id: "chosen-intention", label: "Chosen intention", detail: "The runner chose a gentle wander." }],
    }],
    ["recap", "/v1/recap", {
      courseName: "Lantern loop",
      worldName: "The Lost Arcade",
      intent: "repeat",
      feedbackHint: "default",
      distanceKm: 2.4,
      durationMinutes: 20,
      runnerSnapshot: {
        runsLogged: 3,
        courseVisits: 3,
        coursesPlayed: 1,
        favoriteCourse: "Lantern loop",
        recentChapter: "Marquee Mystery",
        daysSinceLastRun: 2,
        lifetimeDistanceKm: 7.2,
        favoriteCourseVisits: 3,
        recentRuns30Days: 3,
        typicalDistanceKm: 2.4,
        typicalDurationMinutes: 20,
      },
      eventLog: [{ id: "lantern-crew", title: "A tiny helper arrives" }],
      evidence: [{ id: "course-return", label: "A familiar course", detail: "This is the third visit." }],
    }],
  ];

  for (const [kind, path, input] of requests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok || result.status !== "mastra") {
      throw new Error(`${kind} workflow failed with HTTP ${response.status}; mock model requests: ${modelRequestCount}.`);
    }
    if (kind === "trend" && result.output.evidenceId !== "first-adventure") {
      throw new Error("Trend workflow did not preserve its selected evidence.");
    }
    if (kind === "cartridge" && result.output.eventLines.map((event) => event.id).join(",") !== eventIds.join(",")) {
      throw new Error("Cartridge workflow changed the event IDs or their order.");
    }
    if (kind === "recap" && result.output.evidenceId !== "course-return") {
      throw new Error("Recap workflow did not preserve its selected evidence.");
    }
  }

  process.stdout.write("Mastra golden smoke passed: trend, cartridge, recap schemas, and evidence/event IDs.\n");
} finally {
  if (mastraProcess && mastraProcess.exitCode === null) mastraProcess.kill("SIGTERM");
  if (modelPort !== undefined) await new Promise((resolve) => modelServer.close(resolve));
}
