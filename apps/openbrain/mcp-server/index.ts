import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { Pool } from "postgres";

type Metadata = Record<string, unknown>;

const PORT = parseInt(Deno.env.get("PORT") || "8000", 10);
const DB_HOST = Deno.env.get("DB_HOST") || "db";
const DB_PORT = parseInt(Deno.env.get("DB_PORT") || "5432", 10);
const DB_NAME = Deno.env.get("DB_NAME") || "openbrain";
const DB_USER = Deno.env.get("DB_USER") || "openbrain";
const DB_PASSWORD = Deno.env.get("DB_PASSWORD") || "";

const EMBEDDING_API_BASE =
  (Deno.env.get("EMBEDDING_API_BASE") || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const EMBEDDING_API_KEY = Deno.env.get("EMBEDDING_API_KEY") || Deno.env.get("OPENROUTER_API_KEY") || "";
const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") || "openai/text-embedding-3-small";

const CHAT_API_BASE = (Deno.env.get("CHAT_API_BASE") || EMBEDDING_API_BASE).replace(/\/+$/, "");
const CHAT_API_KEY = Deno.env.get("CHAT_API_KEY") || EMBEDDING_API_KEY;
const CHAT_MODEL = Deno.env.get("CHAT_MODEL") || "openai/gpt-4o-mini";

const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY") || "";
const MEDIA_DATA_PATH = Deno.env.get("MEDIA_DATA_PATH") || "/media/data";
const OBSIDIAN_VAULT_PATH = Deno.env.get("OBSIDIAN_VAULT_PATH") || "/vault/obsidian";
const IMPORT_STATE_DIR = Deno.env.get("IMPORT_STATE_DIR") || "/state";
const IMPORTER_API_BASE = (Deno.env.get("IMPORTER_API_BASE") || "http://obsidian-importer:8090").replace(/\/+$/, "");

const pool = new Pool(
  {
    hostname: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
  },
  20,
);

const encoder = new TextEncoder();

const defaultMetadata = (): Metadata => ({
  topics: ["uncategorized"],
  type: "observation",
});

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function contentFingerprint(text: string): Promise<string> {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return sha256Hex(normalized);
}

function bearerHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey.trim().length) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${EMBEDDING_API_BASE}/embeddings`, {
    method: "POST",
    headers: bearerHeaders(EMBEDDING_API_KEY),
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Embedding API failed: ${response.status} ${message}`.trim());
  }

  const payload = await response.json();
  return payload.data[0].embedding as number[];
}

async function extractMetadata(text: string): Promise<Metadata> {
  const response = await fetch(`${CHAT_API_BASE}/chat/completions`, {
    method: "POST",
    headers: bearerHeaders(CHAT_API_KEY),
    body: JSON.stringify({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract metadata from the user's captured thought. Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    return defaultMetadata();
  }

  const payload = await response.json();

  try {
    return JSON.parse(payload.choices[0].message.content);
  } catch {
    return defaultMetadata();
  }
}

const server = new McpServer({
  name: "open-brain",
  version: "1.0.0",
});

server.registerTool(
  "search_thoughts",
  {
    title: "Search Thoughts",
    description:
      "Search captured thoughts by meaning. Use this when the user asks about a topic, person, or idea they've previously captured.",
    inputSchema: {
      query: z.string().describe("What to search for"),
      limit: z.number().optional().default(10),
      threshold: z.number().optional().default(0.5),
    },
  },
  async ({ query, limit, threshold }) => {
    try {
      const queryEmbedding = await getEmbedding(query);
      const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

      const client = await pool.connect();
      try {
        const result = await client.queryObject<{
          content: string;
          metadata: Metadata;
          similarity: number;
          created_at: string;
        }>(
          `SELECT content, metadata, created_at,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM thoughts
           WHERE embedding IS NOT NULL
             AND 1 - (embedding <=> $1::vector) >= $2
           ORDER BY embedding <=> $1::vector
           LIMIT $3`,
          [embeddingLiteral, threshold, limit],
        );

        if (!result.rows.length) {
          return {
            content: [{ type: "text" as const, text: `No thoughts found matching "${query}".` }],
          };
        }

        const rows = result.rows.map((thought, index) => {
          const metadata = thought.metadata || {};
          const parts = [
            `--- Result ${index + 1} (${(thought.similarity * 100).toFixed(1)}% match) ---`,
            `Captured: ${new Date(thought.created_at).toLocaleDateString()}`,
            `Type: ${metadata.type || "unknown"}`,
          ];

          if (Array.isArray(metadata.topics) && metadata.topics.length) {
            parts.push(`Topics: ${(metadata.topics as string[]).join(", ")}`);
          }
          if (Array.isArray(metadata.people) && metadata.people.length) {
            parts.push(`People: ${(metadata.people as string[]).join(", ")}`);
          }
          if (Array.isArray(metadata.action_items) && metadata.action_items.length) {
            parts.push(`Actions: ${(metadata.action_items as string[]).join("; ")}`);
          }

          parts.push(`\n${thought.content}`);
          return parts.join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${result.rows.length} thought(s):\n\n${rows.join("\n\n")}`,
            },
          ],
        };
      } finally {
        client.release();
      }
    } catch (error: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "list_thoughts",
  {
    title: "List Recent Thoughts",
    description:
      "List recently captured thoughts with optional filters by type, topic, person, or time range.",
    inputSchema: {
      limit: z.number().optional().default(10),
      type: z.string().optional().describe("Filter by type: observation, task, idea, reference, person_note"),
      topic: z.string().optional().describe("Filter by topic tag"),
      person: z.string().optional().describe("Filter by person mentioned"),
      days: z.number().optional().describe("Only thoughts from the last N days"),
    },
  },
  async ({ limit, type, topic, person, days }) => {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let nextParam = 1;

      if (type) {
        conditions.push(`metadata->>'type' = $${nextParam}`);
        params.push(type);
        nextParam += 1;
      }
      if (topic) {
        conditions.push(`metadata->'topics' ? $${nextParam}`);
        params.push(topic);
        nextParam += 1;
      }
      if (person) {
        conditions.push(`metadata->'people' ? $${nextParam}`);
        params.push(person);
        nextParam += 1;
      }
      if (typeof days === "number") {
        conditions.push(`created_at >= NOW() - ($${nextParam}::text || ' days')::interval`);
        params.push(String(days));
        nextParam += 1;
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const client = await pool.connect();
      try {
        const result = await client.queryObject<{
          content: string;
          metadata: Metadata;
          created_at: string;
        }>(
          `SELECT content, metadata, created_at
           FROM thoughts
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${nextParam}`,
          [...params, limit],
        );

        if (!result.rows.length) {
          return {
            content: [{ type: "text" as const, text: "No thoughts found." }],
          };
        }

        const rows = result.rows.map((thought, index) => {
          const metadata = thought.metadata || {};
          const tags = Array.isArray(metadata.topics) ? (metadata.topics as string[]).join(", ") : "";
          return `${index + 1}. [${new Date(thought.created_at).toLocaleDateString()}] (${metadata.type || "??"}${tags ? " - " + tags : ""})\n   ${thought.content}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${result.rows.length} recent thought(s):\n\n${rows.join("\n\n")}`,
            },
          ],
        };
      } finally {
        client.release();
      }
    } catch (error: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "thought_stats",
  {
    title: "Thought Statistics",
    description: "Get a summary of all captured thoughts: totals, types, top topics, and people.",
    inputSchema: {},
  },
  async () => {
    try {
      const client = await pool.connect();
      try {
        const countResult = await client.queryObject<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM thoughts",
        );

        const dataResult = await client.queryObject<{
          metadata: Metadata;
          created_at: string;
        }>(
          "SELECT metadata, created_at FROM thoughts ORDER BY created_at DESC",
        );

        const count = countResult.rows[0]?.count || 0;
        const data = dataResult.rows;

        const types: Record<string, number> = {};
        const topics: Record<string, number> = {};
        const people: Record<string, number> = {};

        for (const row of data) {
          const metadata = row.metadata || {};

          if (metadata.type) {
            types[metadata.type as string] = (types[metadata.type as string] || 0) + 1;
          }
          if (Array.isArray(metadata.topics)) {
            for (const topic of metadata.topics) {
              topics[topic as string] = (topics[topic as string] || 0) + 1;
            }
          }
          if (Array.isArray(metadata.people)) {
            for (const person of metadata.people) {
              people[person as string] = (people[person as string] || 0) + 1;
            }
          }
        }

        const topTen = (entries: Record<string, number>): [string, number][] =>
          Object.entries(entries)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10);

        const lines: string[] = [
          `Total thoughts: ${count}`,
          `Date range: ${
            data.length
              ? `${new Date(data[data.length - 1].created_at).toLocaleDateString()} -> ${new Date(data[0].created_at).toLocaleDateString()}`
              : "N/A"
          }`,
          "",
          "Types:",
          ...topTen(types).map(([key, value]) => `  ${key}: ${value}`),
        ];

        if (Object.keys(topics).length) {
          lines.push("", "Top topics:");
          for (const [key, value] of topTen(topics)) {
            lines.push(`  ${key}: ${value}`);
          }
        }

        if (Object.keys(people).length) {
          lines.push("", "People mentioned:");
          for (const [key, value] of topTen(people)) {
            lines.push(`  ${key}: ${value}`);
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } finally {
        client.release();
      }
    } catch (error: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "capture_thought",
  {
    title: "Capture Thought",
    description:
      "Save a new thought to the Open Brain. Generates an embedding and extracts metadata automatically.",
    inputSchema: {
      content: z.string().describe("The thought to capture"),
    },
  },
  async ({ content }) => {
    try {
      const [embedding, metadata, fingerprint] = await Promise.all([
        getEmbedding(content),
        extractMetadata(content),
        contentFingerprint(content),
      ]);

      const embeddingLiteral = `[${embedding.join(",")}]`;
      const mergedMetadata = { ...metadata, source: "mcp" };

      const client = await pool.connect();
      try {
        const result = await client.queryObject<{ id: number }>(
          `INSERT INTO thoughts (content, embedding, metadata, content_fingerprint)
           VALUES ($1, $2::vector, $3::jsonb, $4)
           ON CONFLICT (content_fingerprint) WHERE content_fingerprint IS NOT NULL DO NOTHING
           RETURNING id`,
          [content, embeddingLiteral, JSON.stringify(mergedMetadata), fingerprint],
        );

        if (!result.rows.length) {
          return {
            content: [{ type: "text" as const, text: "Duplicate thought skipped." }],
          };
        }
      } finally {
        client.release();
      }

      let confirmation = `Captured as ${mergedMetadata.type || "thought"}`;
      if (Array.isArray(mergedMetadata.topics) && mergedMetadata.topics.length) {
        confirmation += ` -- ${(mergedMetadata.topics as string[]).join(", ")}`;
      }
      if (Array.isArray(mergedMetadata.people) && mergedMetadata.people.length) {
        confirmation += ` | People: ${(mergedMetadata.people as string[]).join(", ")}`;
      }
      if (Array.isArray(mergedMetadata.action_items) && mergedMetadata.action_items.length) {
        confirmation += ` | Actions: ${(mergedMetadata.action_items as string[]).join("; ")}`;
      }

      return {
        content: [{ type: "text" as const, text: confirmation }],
      };
    } catch (error: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
);

type PathStatus = {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  details: string;
};

type ImporterStatusPayload = {
  reachable: boolean;
  apiBase: string;
  status: string;
  running: boolean;
  mode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  note: string | null;
  command: string | null;
  logPath: string | null;
  logTail: string;
  reportPath: string | null;
  reportExists: boolean;
  vaultPath: string;
  stateDir: string;
  artifacts: string[];
  error?: string;
};

type StatusPayload = {
  database: {
    connected: boolean;
    totalThoughts: number;
    latestCapture: string | null;
    error?: string;
  };
  api: {
    embeddingBase: string;
    embeddingModel: string;
    embeddingKeyConfigured: boolean;
    chatBase: string;
    chatModel: string;
    chatKeyConfigured: boolean;
  };
  mounts: {
    mediaData: PathStatus;
    obsidianVault: PathStatus;
    importState: PathStatus;
  };
  importer: ImporterStatusPayload;
  mcp: {
    endpoint: string;
    auth: string;
    accessKeyConfigured: boolean;
  };
};

async function databaseSummary(): Promise<StatusPayload["database"]> {
  let client: Awaited<ReturnType<typeof pool.connect>> | undefined;
  try {
    client = await pool.connect();
    const result = await client.queryObject<{ total: number; latest_capture: string | null }>(
      `SELECT COUNT(*)::int AS total,
              MAX(created_at)::text AS latest_capture
       FROM thoughts`,
    );

    return {
      connected: true,
      totalThoughts: result.rows[0]?.total || 0,
      latestCapture: result.rows[0]?.latest_capture || null,
    };
  } catch (error: unknown) {
    return {
      connected: false,
      totalThoughts: 0,
      latestCapture: null,
      error: (error as Error).message,
    };
  } finally {
    client?.release();
  }
}

async function pathStatus(path: string): Promise<PathStatus> {
  try {
    const stat = await Deno.stat(path);
    return {
      path,
      exists: true,
      isDirectory: stat.isDirectory,
      details: stat.isDirectory ? "mounted directory" : "mounted file",
    };
  } catch (error: unknown) {
    return {
      path,
      exists: false,
      isDirectory: false,
      details: (error as Error).message,
    };
  }
}

async function importerArtifacts(): Promise<string[]> {
  try {
    const files: string[] = [];

    for await (const entry of Deno.readDir(IMPORT_STATE_DIR)) {
      files.push(entry.name);
    }

    return files.sort();
  } catch {
    return [];
  }
}

function defaultImporterStatus(error?: string): ImporterStatusPayload {
  return {
    reachable: false,
    apiBase: IMPORTER_API_BASE,
    status: "unknown",
    running: false,
    mode: null,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    note: null,
    command: null,
    logPath: null,
    logTail: "",
    reportPath: null,
    reportExists: false,
    vaultPath: OBSIDIAN_VAULT_PATH,
    stateDir: IMPORT_STATE_DIR,
    artifacts: [],
    error,
  };
}

async function fetchImporterStatus(): Promise<ImporterStatusPayload> {
  try {
    const response = await fetch(`${IMPORTER_API_BASE}/status`);
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return defaultImporterStatus(`Importer API returned ${response.status}${message ? `: ${message}` : ""}`);
    }

    const payload = await response.json();
    return {
      reachable: true,
      apiBase: IMPORTER_API_BASE,
      status: payload.status || "unknown",
      running: Boolean(payload.running),
      mode: payload.mode ?? null,
      startedAt: payload.started_at ?? null,
      finishedAt: payload.finished_at ?? null,
      exitCode: typeof payload.exit_code === "number" ? payload.exit_code : null,
      note: payload.note ?? null,
      command: payload.command ?? null,
      logPath: payload.log_path ?? null,
      logTail: payload.log_tail ?? "",
      reportPath: payload.report_path ?? null,
      reportExists: Boolean(payload.report_exists),
      vaultPath: payload.vault_path ?? OBSIDIAN_VAULT_PATH,
      stateDir: payload.state_dir ?? IMPORT_STATE_DIR,
      artifacts: Array.isArray(payload.artifacts) ? payload.artifacts.map((value: unknown) => String(value)) : [],
    };
  } catch (error: unknown) {
    return defaultImporterStatus((error as Error).message);
  }
}

async function startImporter(mode: "dry-run" | "live"): Promise<{ statusCode: number; payload: ImporterStatusPayload | { error: string; detail?: unknown } }> {
  try {
    const response = await fetch(`${IMPORTER_API_BASE}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        statusCode: response.status,
        payload: {
          error: payload.error || `Importer API returned ${response.status}`,
          detail: payload.status || payload,
        },
      };
    }

    return {
      statusCode: response.status,
      payload: {
        reachable: true,
        apiBase: IMPORTER_API_BASE,
        status: payload.status || "unknown",
        running: Boolean(payload.running),
        mode: payload.mode ?? null,
        startedAt: payload.started_at ?? null,
        finishedAt: payload.finished_at ?? null,
        exitCode: typeof payload.exit_code === "number" ? payload.exit_code : null,
        note: payload.note ?? null,
        command: payload.command ?? null,
        logPath: payload.log_path ?? null,
        logTail: payload.log_tail ?? "",
        reportPath: payload.report_path ?? null,
        reportExists: Boolean(payload.report_exists),
        vaultPath: payload.vault_path ?? OBSIDIAN_VAULT_PATH,
        stateDir: payload.state_dir ?? IMPORT_STATE_DIR,
        artifacts: Array.isArray(payload.artifacts) ? payload.artifacts.map((value: unknown) => String(value)) : [],
      },
    };
  } catch (error: unknown) {
    return {
      statusCode: 502,
      payload: {
        error: (error as Error).message,
      },
    };
  }
}

async function buildStatusPayload(origin: string): Promise<StatusPayload> {
  const [database, mediaData, obsidianVault, importState, artifacts, importerStatus] = await Promise.all([
    databaseSummary(),
    pathStatus(MEDIA_DATA_PATH),
    pathStatus(OBSIDIAN_VAULT_PATH),
    pathStatus(IMPORT_STATE_DIR),
    importerArtifacts(),
    fetchImporterStatus(),
  ]);

  const mergedImporter = {
    ...importerStatus,
    artifacts: importerStatus.artifacts.length ? importerStatus.artifacts : artifacts,
    stateDir: importerStatus.stateDir || IMPORT_STATE_DIR,
  };

  return {
    database,
    api: {
      embeddingBase: EMBEDDING_API_BASE,
      embeddingModel: EMBEDDING_MODEL,
      embeddingKeyConfigured: EMBEDDING_API_KEY.trim().length > 0,
      chatBase: CHAT_API_BASE,
      chatModel: CHAT_MODEL,
      chatKeyConfigured: CHAT_API_KEY.trim().length > 0,
    },
    mounts: {
      mediaData,
      obsidianVault,
      importState,
    },
    importer: mergedImporter,
    mcp: {
      endpoint: `${origin}/mcp`,
      auth: "x-brain-key header or ?key=<MCP_ACCESS_KEY>",
      accessKeyConfigured: MCP_ACCESS_KEY.trim().length > 0,
    },
  };
}

function formatTimestamp(value: string | null, fallback = "No captures yet"): string {
  if (!value) {
    return fallback;
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function badge(label: string, ok: boolean): string {
  return `<span class="badge ${ok ? "ok" : "warn"}">${escapeHtml(label)}</span>`;
}

function renderPathCard(label: string, status: PathStatus): string {
  const state = status.exists ? "available" : "missing";
  return `
    <article class="card">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <h3>${badge(state, status.exists)}</h3>
      <p class="path">${escapeHtml(status.path)}</p>
      <p class="muted">${escapeHtml(status.details)}</p>
    </article>
  `;
}

function renderHomePage(status: StatusPayload): string {
  const importerArtifacts = status.importer.artifacts.length
    ? status.importer.artifacts.map((artifact) => `<li>${escapeHtml(artifact)}</li>`).join("")
    : "<li>No sync log or report written yet.</li>";
  const importerCommand = status.importer.command ||
    "python /app/import-obsidian.py /vault/obsidian --dry-run --verbose --report";
  const importerLog = status.importer.logTail
    ? escapeHtml(status.importer.logTail)
    : "No importer log available yet.";
  const importerNote = status.importer.note
    ? escapeHtml(status.importer.note)
    : "No importer run started yet.";
  const importerStateLabel = status.importer.reachable
    ? (status.importer.running ? "running" : status.importer.status)
    : "unreachable";
  const importerStateOk = status.importer.reachable &&
    (status.importer.running || status.importer.status === "idle" || status.importer.status === "succeeded");
  const importerSummary = status.importer.reachable
    ? `Mode: ${status.importer.mode || "none"} | Started: ${formatTimestamp(status.importer.startedAt, "not started")} | Finished: ${formatTimestamp(status.importer.finishedAt, "not finished")} | Exit: ${
      status.importer.exitCode === null ? "pending" : String(status.importer.exitCode)
    }`
    : `Importer API unavailable: ${status.importer.error || "unknown error"}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open Brain</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f172a;
        --panel: rgba(15, 23, 42, 0.86);
        --panel-strong: rgba(30, 41, 59, 0.94);
        --line: rgba(251, 146, 60, 0.22);
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #fb923c;
        --accent-strong: #f59e0b;
        --ok: #34d399;
        --warn: #fbbf24;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(251, 146, 60, 0.16), transparent 28%),
          radial-gradient(circle at top right, rgba(52, 211, 153, 0.12), transparent 20%),
          linear-gradient(160deg, #0b1120 0%, #0f172a 35%, #111827 100%);
      }

      main {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 40px 0 56px;
      }

      header {
        display: grid;
        gap: 18px;
        padding: 28px;
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.88));
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: 0 18px 60px rgba(2, 6, 23, 0.35);
      }

      h1, h2, h3, p {
        margin: 0;
      }

      h1 {
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        font-size: clamp(2.2rem, 4vw, 3.6rem);
        font-weight: 700;
        letter-spacing: -0.03em;
      }

      .lead {
        max-width: 60ch;
        color: var(--muted);
        line-height: 1.6;
        font-size: 1.02rem;
      }

      .topline,
      .grid,
      .paths,
      .details {
        display: grid;
        gap: 16px;
      }

      .topline {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 24px;
      }

      .paths,
      .details {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        margin-top: 24px;
      }

      .card {
        padding: 20px;
        border-radius: 24px;
        border: 1px solid rgba(148, 163, 184, 0.14);
        background: var(--panel);
        backdrop-filter: blur(10px);
      }

      .card strong {
        font-size: 2rem;
        line-height: 1;
        display: block;
        margin-top: 12px;
      }

      .eyebrow {
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 0.76rem;
        font-weight: 700;
      }

      .muted {
        color: var(--muted);
        line-height: 1.55;
      }

      .path,
      code,
      pre {
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
      }

      .path {
        margin-top: 14px;
        font-size: 0.92rem;
        color: #fde68a;
        word-break: break-word;
      }

      section {
        margin-top: 28px;
      }

      .section-title {
        margin-bottom: 14px;
        font-size: 1.05rem;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.85rem;
        font-weight: 700;
        background: rgba(148, 163, 184, 0.12);
      }

      .badge.ok {
        color: var(--ok);
        background: rgba(52, 211, 153, 0.14);
      }

      .badge.warn {
        color: var(--warn);
        background: rgba(251, 191, 36, 0.14);
      }

      pre {
        margin: 14px 0 0;
        padding: 16px;
        overflow-x: auto;
        border-radius: 18px;
        background: rgba(2, 6, 23, 0.58);
        border: 1px solid rgba(148, 163, 184, 0.12);
        color: #f8fafc;
        line-height: 1.55;
      }

      ul {
        margin: 14px 0 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.65;
      }

      .inline {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }

      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        color: #0f172a;
        background: linear-gradient(135deg, #fb923c, #f59e0b);
        transition: transform 160ms ease, opacity 160ms ease;
      }

      button.secondary {
        color: #f8fafc;
        background: rgba(148, 163, 184, 0.18);
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
      }

      .status-line {
        margin-top: 14px;
      }

      .two-col {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 16px;
        margin-top: 24px;
      }

      .log-panel {
        min-height: 260px;
        white-space: pre-wrap;
      }

      .tiny {
        font-size: 0.86rem;
      }

      .accent {
        color: var(--accent-strong);
      }

      @media (max-width: 860px) {
        .two-col {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="topline">
          <article class="card">
            <p class="eyebrow">Database</p>
            <strong>${status.database.totalThoughts}</strong>
            <p class="muted">Stored thoughts</p>
          </article>
          <article class="card">
            <p class="eyebrow">Latest Capture</p>
            <strong>${escapeHtml(formatTimestamp(status.database.latestCapture))}</strong>
            <p class="muted">Last recorded thought timestamp</p>
          </article>
          <article class="card">
            <p class="eyebrow">MCP Endpoint</p>
            <strong class="accent">/mcp</strong>
            <p class="muted">Protected by the generated access key</p>
          </article>
        </div>

        <div>
          <h1>Open Brain</h1>
          <p class="lead">
            A self-hosted OB1 starter for RunTipi with local pgvector storage, an MCP HTTP endpoint,
            and direct read-only access to your shared media tree plus the default Obsidian vault mount.
          </p>
          <div class="inline">
            ${badge("database ready", status.database.connected)}
            ${badge("embedding api", status.api.embeddingKeyConfigured)}
            ${badge("chat api", status.api.chatKeyConfigured || status.api.embeddingKeyConfigured)}
            ${badge("mcp key", status.mcp.accessKeyConfigured)}
          </div>
        </div>
      </header>

      <section>
        <h2 class="section-title">Mounted Paths</h2>
        <div class="paths">
          ${renderPathCard("Shared media/data", status.mounts.mediaData)}
          ${renderPathCard("Obsidian vault", status.mounts.obsidianVault)}
          ${renderPathCard("Import state", status.mounts.importState)}
        </div>
      </section>

      <section>
        <h2 class="section-title">Connection Details</h2>
        <div class="details">
          <article class="card">
            <p class="eyebrow">MCP</p>
            <p class="muted">Use either the <code>x-brain-key</code> header or a <code>?key=</code> query parameter.</p>
            <pre>${escapeHtml(status.mcp.endpoint)}?key=&lt;MCP_ACCESS_KEY&gt;</pre>
          </article>
          <article class="card">
            <p class="eyebrow">Embedding Provider</p>
            <p class="muted">Configured base and model for search + capture embeddings.</p>
            <pre>${escapeHtml(status.api.embeddingBase)}
model=${escapeHtml(status.api.embeddingModel)}</pre>
          </article>
          <article class="card">
            <p class="eyebrow">Chat Provider</p>
            <p class="muted">Used for lightweight metadata extraction and importer LLM chunking.</p>
            <pre>${escapeHtml(status.api.chatBase)}
model=${escapeHtml(status.api.chatModel)}</pre>
          </article>
        </div>
      </section>

      <section>
        <h2 class="section-title">Obsidian Import Helper</h2>
        <div class="details">
          <article class="card">
            <p class="eyebrow">One-Click Import</p>
            <div id="importer-badge">${badge(importerStateLabel, importerStateOk)}</div>
            <p class="muted status-line" id="importer-summary">${escapeHtml(importerSummary)}</p>
            <p class="muted tiny" id="importer-note">${importerNote}</p>
            <div class="button-row">
              <button type="button" id="dry-run-button">Dry Run</button>
              <button type="button" class="secondary" id="live-import-button">Live Import</button>
            </div>
            <p class="muted tiny" style="margin-top: 14px;">
              Dry run scans your mounted vault and writes a report without inserting rows.
              Live import writes directly into the local <code>thoughts</code> table.
            </p>
            <pre id="importer-command">${escapeHtml(importerCommand)}</pre>
          </article>
          <article class="card">
            <p class="eyebrow">State artifacts</p>
            <p class="muted">Sync logs and markdown reports are persisted under the import-state app-data volume.</p>
            <p class="muted tiny" id="importer-report">${escapeHtml(status.importer.reportPath || "No report written yet.")}</p>
            <ul id="importer-artifacts">${importerArtifacts}</ul>
          </article>
        </div>
        <div class="two-col">
          <article class="card">
            <p class="eyebrow">Importer Log Tail</p>
            <p class="muted tiny">The latest output from the importer runner.</p>
            <pre id="importer-log" class="log-panel">${importerLog}</pre>
          </article>
          <article class="card">
            <p class="eyebrow">Mounted Vault</p>
            <p class="muted">The importer service reads from this path inside the container.</p>
            <pre id="importer-vault">${escapeHtml(status.importer.vaultPath)}</pre>
            <p class="eyebrow" style="margin-top: 16px;">Importer API</p>
            <p class="muted tiny" id="importer-endpoint">${escapeHtml(status.importer.apiBase)}</p>
            <p class="eyebrow" style="margin-top: 16px;">State Directory</p>
            <pre id="importer-state-dir">${escapeHtml(status.importer.stateDir)}</pre>
          </article>
        </div>
      </section>
    </main>
    <script>
      (function () {
        var dryRunButton = document.getElementById("dry-run-button");
        var liveImportButton = document.getElementById("live-import-button");
        var badgeEl = document.getElementById("importer-badge");
        var summaryEl = document.getElementById("importer-summary");
        var noteEl = document.getElementById("importer-note");
        var commandEl = document.getElementById("importer-command");
        var logEl = document.getElementById("importer-log");
        var reportEl = document.getElementById("importer-report");
        var artifactsEl = document.getElementById("importer-artifacts");
        var vaultEl = document.getElementById("importer-vault");
        var endpointEl = document.getElementById("importer-endpoint");
        var stateDirEl = document.getElementById("importer-state-dir");

        function escapeHtmlJs(value) {
          return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function badgeHtml(label, ok) {
          return '<span class="badge ' + (ok ? 'ok' : 'warn') + '">' + escapeHtmlJs(label) + '</span>';
        }

        function formatTimestampJs(value, fallback) {
          if (!value) {
            return fallback;
          }
          try {
            return new Date(value).toLocaleString();
          } catch (_error) {
            return value;
          }
        }

        function setButtonsDisabled(disabled) {
          dryRunButton.disabled = disabled;
          liveImportButton.disabled = disabled;
        }

        function renderArtifacts(items) {
          if (!items || !items.length) {
            artifactsEl.innerHTML = '<li>No sync log or report written yet.</li>';
            return;
          }
          artifactsEl.innerHTML = items.map(function (item) {
            return '<li>' + escapeHtmlJs(item) + '</li>';
          }).join('');
        }

        function renderImporter(data) {
          var reachable = Boolean(data.reachable);
          var running = Boolean(data.running);
          var stateLabel = reachable ? (running ? 'running' : (data.status || 'unknown')) : 'unreachable';
          var stateOk = reachable && (running || data.status === 'idle' || data.status === 'succeeded');
          var summary = reachable
            ? 'Mode: ' + (data.mode || 'none') +
              ' | Started: ' + formatTimestampJs(data.startedAt, 'not started') +
              ' | Finished: ' + formatTimestampJs(data.finishedAt, 'not finished') +
              ' | Exit: ' + (data.exitCode === null || typeof data.exitCode === 'undefined' ? 'pending' : String(data.exitCode))
            : 'Importer API unavailable: ' + (data.error || 'unknown error');

          badgeEl.innerHTML = badgeHtml(stateLabel, stateOk);
          summaryEl.textContent = summary;
          noteEl.textContent = data.note || 'No importer run started yet.';
          commandEl.textContent = data.command || 'python /app/import-obsidian.py /vault/obsidian --dry-run --verbose --report';
          logEl.textContent = data.logTail || 'No importer log available yet.';
          reportEl.textContent = data.reportPath || 'No report written yet.';
          vaultEl.textContent = data.vaultPath || '/vault/obsidian';
          endpointEl.textContent = data.apiBase || '';
          stateDirEl.textContent = data.stateDir || '/state';
          renderArtifacts(data.artifacts || []);
          setButtonsDisabled(running);
        }

        async function refreshImporter() {
          try {
            var response = await fetch('/api/import/status');
            var payload = await response.json();
            renderImporter(payload);
          } catch (error) {
            renderImporter({
              reachable: false,
              status: 'unreachable',
              running: false,
              note: error && error.message ? error.message : 'Failed to load importer status.',
              apiBase: '',
              artifacts: [],
              logTail: '',
              reportPath: null,
              vaultPath: '/vault/obsidian',
              stateDir: '/state'
            });
          }
        }

        async function startImport(mode) {
          setButtonsDisabled(true);
          try {
            var response = await fetch('/api/import/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: mode })
            });
            var payload = await response.json();

            if (!response.ok) {
              var message = payload && payload.error ? payload.error : 'Unable to start importer run.';
              throw new Error(message);
            }

            renderImporter(payload);
          } catch (error) {
            noteEl.textContent = error && error.message ? error.message : 'Unable to start importer run.';
          } finally {
            refreshImporter();
          }
        }

        dryRunButton.addEventListener('click', function () {
          startImport('dry-run');
        });

        liveImportButton.addEventListener('click', function () {
          var confirmed = window.confirm('Start a live import into the local Open Brain database?');
          if (confirmed) {
            startImport('live');
          }
        });

        refreshImporter();
        window.setInterval(refreshImporter, 5000);
      })();
    </script>
  </body>
</html>`;
}

const app = new Hono();

app.get("/", async (context) => {
  const origin = new URL(context.req.url).origin;
  const status = await buildStatusPayload(origin);
  return context.html(renderHomePage(status));
});

app.get("/api/status", async (context) => {
  const origin = new URL(context.req.url).origin;
  return context.json(await buildStatusPayload(origin));
});

app.get("/api/import/status", async (context) => {
  return context.json(await fetchImporterStatus());
});

app.post("/api/import/start", async (context) => {
  const body = await context.req.json().catch(() => ({})) as { mode?: string };
  const mode = body.mode === "live" ? "live" : "dry-run";
  const result = await startImporter(mode);
  return context.json(result.payload, result.statusCode);
});

app.get("/health", async (context) => {
  const database = await databaseSummary();
  return context.json(
    {
      ok: database.connected,
      totalThoughts: database.totalThoughts,
      latestCapture: database.latestCapture,
      error: database.error,
    },
    database.connected ? 200 : 503,
  );
});

app.get("/favicon.ico", (context) => context.body(null, 204));

app.all("/mcp", async (context) => {
  const requestUrl = new URL(context.req.url);
  const providedKey = context.req.header("x-brain-key") || requestUrl.searchParams.get("key");

  if (!providedKey || providedKey !== MCP_ACCESS_KEY) {
    return context.json({ error: "Invalid or missing access key" }, 401);
  }

  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(context);
});

app.notFound((context) => context.redirect("/"));

Deno.serve({ port: PORT }, app.fetch);
