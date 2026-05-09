import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { createZip } from "@/lib/cat/zip";

const ROOT = path.join(process.cwd(), ".cat-plugin-builder");
const DEFAULT_SLUG = "my-plugin";
const MAX_SOURCE_CHARS = 250_000;

export type PluginBuildCheck = {
  ok: boolean;
  label: string;
  detail: string;
};

export type PluginBuildStep = {
  label: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
};

export type PluginBuildReport = {
  mode: "checks" | "live-test" | "deploy" | "repair" | "runtime";
  summary: string;
  ranAt: string;
  checks: PluginBuildCheck[];
  steps: PluginBuildStep[];
  manifest: {
    name: string;
    version: string;
    description: string;
    author_name: string;
    author_url: string;
    plugin_url: string;
    tags: string[];
    thumb: string;
  };
  archive: {
    slug: string;
    filename: string;
    moduleName: string;
  };
  notes?: string | null;
};

export type PluginDraft = {
  slug: string;
  name: string;
  description: string;
  version: string;
  authorName: string;
  authorUrl: string;
  moduleName: string;
  source: string;
  updatedAt: string;
  lastBuildReport?: PluginBuildReport | null;
};

type SaveDraftInput = Partial<PluginDraft> & {
  slug?: string;
  source?: string;
};

function cleanSegment(value: string | null | undefined, fallback: string) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function normalizePluginSlug(value: string | null | undefined) {
  return cleanSegment(value, DEFAULT_SLUG);
}

function normalizeModuleName(value: string | null | undefined, fallbackSlug: string) {
  const normalized = cleanSegment(value?.replace(/-/g, "_"), fallbackSlug.replace(/-/g, "_"));
  return normalized.replace(/-/g, "_");
}

function defaultSource(name: string) {
  return [
    "from cat.mad_hatter.decorators import tool",
    "",
    "",
    "@tool",
    "def plugin_healthcheck(cat) -> str:",
    '    """Quick check for this plugin."""',
    `    return "Plugin ${name} is alive."`,
    ""
  ].join("\n");
}

function getUserRoot(userId: string) {
  return path.join(ROOT, cleanSegment(userId, "user"));
}

function getDraftFilePath(userId: string, slug: string) {
  return path.join(getUserRoot(userId), slug, "draft.json");
}

async function ensureUserDir(userId: string) {
  await fs.mkdir(getUserRoot(userId), { recursive: true });
}

async function writeDraftFile(userId: string, draft: PluginDraft) {
  const filePath = getDraftFilePath(userId, draft.slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
}

function hydrateDraft(raw: Partial<PluginDraft> | null | undefined, fallbackSlug: string): PluginDraft {
  const slug = normalizePluginSlug(raw?.slug ?? fallbackSlug);
  const moduleName = normalizeModuleName(raw?.moduleName, slug);
  const name = (raw?.name ?? slug)
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

  return {
    slug,
    name: name || slug,
    description: (raw?.description ?? "Generated Cheshire Cat plugin").trim(),
    version: (raw?.version ?? "0.1.0").trim() || "0.1.0",
    authorName: (raw?.authorName ?? "Console User").trim() || "Console User",
    authorUrl: (raw?.authorUrl ?? "").trim(),
    moduleName,
    source: (raw?.source ?? defaultSource(name || slug)).slice(0, MAX_SOURCE_CHARS),
    updatedAt: raw?.updatedAt ?? new Date().toISOString(),
    lastBuildReport: raw?.lastBuildReport ?? null
  };
}

export async function listPluginDrafts(userId: string) {
  await ensureUserDir(userId);
  const root = getUserRoot(userId);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const drafts: PluginDraft[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = normalizePluginSlug(entry.name);
    const filePath = getDraftFilePath(userId, slug);
    const raw = await fs.readFile(filePath, "utf8").catch(() => null);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<PluginDraft>;
      drafts.push(hydrateDraft(parsed, slug));
    } catch {
      continue;
    }
  }

  drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return drafts;
}

export async function loadPluginDraft(userId: string, requestedSlug?: string | null) {
  const slug = normalizePluginSlug(requestedSlug ?? DEFAULT_SLUG);
  const filePath = getDraftFilePath(userId, slug);
  const raw = await fs.readFile(filePath, "utf8").catch(() => null);

  if (!raw) {
    const draft = hydrateDraft(null, slug);
    await writeDraftFile(userId, draft);
    return draft;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PluginDraft>;
    const draft = hydrateDraft(parsed, slug);
    return draft;
  } catch {
    const draft = hydrateDraft(null, slug);
    await writeDraftFile(userId, draft);
    return draft;
  }
}

export async function savePluginDraft(userId: string, input: SaveDraftInput) {
  const existing = await loadPluginDraft(userId, input.slug);
  const merged = hydrateDraft(
    {
      ...existing,
      ...input,
      slug: input.slug ?? existing.slug,
      updatedAt: new Date().toISOString()
    },
    input.slug ?? existing.slug
  );
  await writeDraftFile(userId, merged);
  return merged;
}

function looksLikePythonTooling(source: string) {
  return /@tool|@hook|def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(source);
}

export function runDraftChecks(draft: PluginDraft) {
  const checks: PluginBuildCheck[] = [];
  checks.push({
    ok: Boolean(draft.name.trim()),
    label: "Plugin name",
    detail: draft.name.trim() ? "Present" : "Missing name"
  });
  checks.push({
    ok: draft.source.trim().length > 0,
    label: "Source code",
    detail: draft.source.trim().length > 0 ? "Present" : "Missing Python source"
  });
  checks.push({
    ok: looksLikePythonTooling(draft.source),
    label: "Plugin decorators",
    detail: "Expected at least one @tool/@hook or function definition"
  });
  checks.push({
    ok: draft.source.length <= MAX_SOURCE_CHARS,
    label: "Source size",
    detail: `${draft.source.length} characters`
  });

  const ok = checks.every((item) => item.ok);
  return { ok, checks };
}

export function buildPluginManifest(draft: PluginDraft) {
  return {
    name: draft.name,
    version: draft.version || "0.1.0",
    description: draft.description,
    author_name: draft.authorName || "Console User",
    author_url: draft.authorUrl || "",
    plugin_url: "",
    tags: ["console-builder"],
    thumb: ""
  };
}

export function buildPluginArchive(
  draft: PluginDraft,
  options?: { ownerUserId?: string | null; namespaceByUser?: boolean }
) {
  const ownerSegment = options?.ownerUserId
    ? cleanSegment(options.ownerUserId.slice(0, 12), "user")
    : "user";
  const baseSlug = normalizePluginSlug(draft.slug);
  const archiveSlug = options?.namespaceByUser === false ? baseSlug : `${ownerSegment}-${baseSlug}`;
  const moduleName = normalizeModuleName(draft.moduleName, archiveSlug);
  const pluginJson = buildPluginManifest(draft);

  const files = [
    {
      name: `${archiveSlug}/plugin.json`,
      data: Buffer.from(`${JSON.stringify(pluginJson, null, 2)}\n`, "utf8")
    },
    {
      name: `${archiveSlug}/${moduleName}.py`,
      data: Buffer.from(draft.source, "utf8")
    }
  ];

  return {
    archiveSlug,
    filename: `${archiveSlug}.zip`,
    moduleName,
    manifest: pluginJson,
    buffer: createZip(files)
  };
}

export function summarizeBuildPayload(payload: unknown) {
  if (typeof payload === "string") {
    return payload.slice(0, 600);
  }

  if (payload && typeof payload === "object") {
    try {
      return JSON.stringify(payload, null, 2).slice(0, 600);
    } catch {
      return "Payload available but could not be serialized";
    }
  }

  if (typeof payload === "number" || typeof payload === "boolean") {
    return String(payload);
  }

  return "No extra payload returned";
}

export function extractToolNamesFromSource(source: string) {
  const matches = Array.from(
    source.matchAll(/@tool(?:\([^)]*\))?\s*(?:\r?\n)+def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)
  );
  return Array.from(new Set(matches.map((match) => match[1]).filter(Boolean)));
}
