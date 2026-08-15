import crypto from "crypto";
import { z } from "zod";
import { requestCheshireChat, requestCheshireEmbedding } from "../cheshire-client";
import type { DmTurnPatch } from "./types";

export type DmContextPacket = {
  systemId: string;
  rulesPrimer: string;
  campaign: Record<string, unknown>;
  worldState: Record<string, unknown>;
  stateVector?: Record<string, unknown>;
  session: Record<string, unknown>;
  characters: Array<Record<string, unknown>>;
  quests: Array<Record<string, unknown>>;
  recentTurns: Array<Record<string, unknown>>;
  rollingSummaries: Array<Record<string, unknown>>;
  pinnedFacts: Array<Record<string, unknown>>;
  semanticMemory: Array<Record<string, unknown>>;
  compendiumContext?: Array<Record<string, unknown>>;
  contextMeta?: Record<string, unknown>;
  action: {
    text: string;
    actorCharacterId?: string;
    actorName?: string;
    allowedCharacterIds?: string[];
  };
};

export type DmLlmCallResult = {
  patch: DmTurnPatch;
  model: string;
  provider: "cheshire";
  latencyMs: number;
  promptPayload: Record<string, unknown>;
  responseText: string;
  responseJson?: Record<string, unknown>;
  promptHash: string;
};

const dmTurnSchema: z.ZodType<DmTurnPatch> = z.object({
  narration: z.string().min(1),
  shortSummary: z.string().min(1).optional(),
  worldPatch: z
    .object({
      location: z.string().min(1).optional(),
      worldTime: z.string().min(1).optional(),
      weather: z.string().min(1).optional(),
      activeThreats: z.array(z.string().min(1)).optional(),
      sceneSummary: z.string().min(1).optional(),
      storyBeat: z.string().min(1).optional(),
      visualPrompt: z.string().min(1).optional()
    })
    .optional(),
  questPatches: z
    .array(
      z.object({
        questId: z.string().optional(),
        title: z.string().min(1),
        summary: z.string().optional(),
        status: z.enum(["active", "completed", "failed", "paused"]).optional(),
        progress: z.number().min(0).max(100).optional(),
        objectives: z
          .array(
            z.object({
              text: z.string().min(1),
              completed: z.boolean().optional()
            })
          )
          .optional()
      })
    )
    .optional(),
  characterPatches: z
    .array(
      z.object({
        characterId: z.string(),
        hpDelta: z.number().int().optional(),
        hpTemp: z.number().int().optional(),
        status: z.string().optional(),
        notesAppend: z.string().optional(),
        inventoryDelta: z
          .array(
            z.object({
              itemName: z.string().min(1),
              quantityDelta: z.number().int(),
              detail: z.string().optional()
            })
          )
          .optional()
      })
    )
    .optional()
});

const parseJsonObjectFromText = (text: string): Record<string, unknown> => {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("no_json_payload");
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { narration: normalized.slice(0, 4000) };
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { narration: normalized.slice(0, 4000) };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pickString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const pickNumber = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
};

const coerceWorldPatch = (value: unknown) => {
  const candidate = Array.isArray(value) ? value.find((entry) => isRecord(entry)) : value;
  if (!isRecord(candidate)) return undefined;

  const worldPatch: Record<string, unknown> = {};
  const location = pickString(candidate, ["location", "currentLocation", "zone", "area"]);
  if (location) worldPatch.location = location;
  const worldTime = pickString(candidate, ["worldTime", "world_time", "time", "currentTime"]);
  if (worldTime) worldPatch.worldTime = worldTime;
  const weather = pickString(candidate, ["weather", "conditions"]);
  if (weather) worldPatch.weather = weather;
  const activeThreats = toStringArray(
    candidate.activeThreats ?? candidate.active_threats ?? candidate.threats
  );
  if (activeThreats.length) worldPatch.activeThreats = activeThreats;
  const sceneSummary = pickString(candidate, ["sceneSummary", "scene_summary", "scene", "description"]);
  if (sceneSummary) worldPatch.sceneSummary = sceneSummary;
  const storyBeat = pickString(candidate, ["storyBeat", "story_beat", "beat", "plotBeat"]);
  if (storyBeat) worldPatch.storyBeat = storyBeat;
  const visualPrompt = pickString(candidate, ["visualPrompt", "visual_prompt", "imagePrompt", "visual"]);
  if (visualPrompt) worldPatch.visualPrompt = visualPrompt;
  return Object.keys(worldPatch).length ? worldPatch : undefined;
};

const coerceQuestPatches = (value: unknown) => {
  const source = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  const result: Array<Record<string, unknown>> = [];

  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const title = pickString(entry, ["title", "name", "quest", "questTitle"]);
    if (!title) continue;
    const patch: Record<string, unknown> = { title };

    const questId = pickString(entry, ["questId", "quest_id", "id"]);
    if (questId) patch.questId = questId;
    const summary = pickString(entry, ["summary", "description", "details"]);
    if (summary) patch.summary = summary;
    const status = pickString(entry, ["status"]);
    if (status && ["active", "completed", "failed", "paused"].includes(status)) {
      patch.status = status;
    }
    const progress = pickNumber(entry, ["progress", "percent", "completion"]);
    if (typeof progress === "number") {
      patch.progress = progress;
    }

    const objectivesRaw = entry.objectives;
    if (Array.isArray(objectivesRaw)) {
      const objectives: Array<{ text: string; completed?: boolean }> = [];
      for (const objective of objectivesRaw) {
        if (!isRecord(objective)) continue;
        const text = pickString(objective, ["text", "objective", "description"]);
        if (!text) continue;
        const completed = typeof objective.completed === "boolean" ? objective.completed : undefined;
        if (typeof completed === "boolean") {
          objectives.push({ text, completed });
        } else {
          objectives.push({ text });
        }
      }
      if (objectives.length) {
        patch.objectives = objectives;
      }
    }

    result.push(patch);
  }

  return result.length ? result : undefined;
};

const coerceCharacterPatches = (value: unknown, allowedCharacterIds: string[]) => {
  const source = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  const result: Array<Record<string, unknown>> = [];

  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const characterId =
      pickString(entry, ["characterId", "character_id", "id"]) ??
      (allowedCharacterIds.length === 1 ? allowedCharacterIds[0] : undefined);
    if (!characterId) continue;

    const patch: Record<string, unknown> = { characterId };
    const hpDelta = pickNumber(entry, ["hpDelta", "hp_delta", "hpChange", "hp_change"]);
    if (typeof hpDelta === "number") patch.hpDelta = hpDelta;
    const hpTemp = pickNumber(entry, ["hpTemp", "hp_temp", "tempHp", "temp_hp"]);
    if (typeof hpTemp === "number") patch.hpTemp = hpTemp;
    const status = pickString(entry, ["status", "condition"]);
    if (status) patch.status = status;
    const notesAppend = pickString(entry, ["notesAppend", "notes_append", "notes"]);
    if (notesAppend) patch.notesAppend = notesAppend;

    const inventoryRaw = entry.inventoryDelta ?? entry.inventory_delta ?? entry.inventory;
    if (Array.isArray(inventoryRaw)) {
      const inventoryDelta: Array<{ itemName: string; quantityDelta: number; detail?: string }> = [];
      for (const item of inventoryRaw) {
        if (!isRecord(item)) continue;
        const itemName = pickString(item, ["itemName", "item_name", "name"]);
        const quantityDelta = pickNumber(item, [
          "quantityDelta",
          "quantity_delta",
          "delta",
          "change"
        ]);
        if (!itemName || typeof quantityDelta !== "number") continue;
        const detail = pickString(item, ["detail", "description"]);
        if (detail) {
          inventoryDelta.push({ itemName, quantityDelta, detail });
        } else {
          inventoryDelta.push({ itemName, quantityDelta });
        }
      }
      if (inventoryDelta.length) {
        patch.inventoryDelta = inventoryDelta;
      }
    }

    result.push(patch);
  }

  return result.length ? result : undefined;
};

const normalizeDmTurnPayload = (
  raw: Record<string, unknown>,
  context: DmContextPacket
): Record<string, unknown> => {
  const nested = ["patch", "turn", "result", "response", "data"]
    .map((key) => raw[key])
    .find((value) => isRecord(value));
  const source = isRecord(nested) ? nested : raw;

  const worldPatch =
    coerceWorldPatch(source.worldPatch ?? source.world_patch ?? source.worldState ?? source.world_state) ??
    undefined;
  const questPatches =
    coerceQuestPatches(source.questPatches ?? source.quest_patches ?? source.quests) ?? undefined;
  const characterPatches =
    coerceCharacterPatches(
      source.characterPatches ?? source.character_patches ?? source.characters,
      context.action.allowedCharacterIds ?? []
    ) ?? undefined;
  const contextWorld = isRecord(context.worldState) ? context.worldState : {};
  const contextSceneSummary = pickString(contextWorld, [
    "sceneSummary",
    "scene_summary",
    "storyBeat",
    "story_beat"
  ]);
  const contextLocation = pickString(contextWorld, ["location"]);
  const contextWeather = pickString(contextWorld, ["weather"]);
  const synthesizedNarration = [
    contextSceneSummary,
    `Action taken: ${context.action.text.slice(0, 240)}`,
    [contextLocation, contextWeather].filter(Boolean).join(" | ")
  ]
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .join(" ");

  const narration =
    pickString(source, [
      "narration",
      "narrative",
      "sceneNarration",
      "scene_narration",
      "openingNarration",
      "opening_narration",
      "story",
      "text"
    ]) ??
    pickString(source, ["shortSummary", "short_summary", "summary"]) ??
    (isRecord(worldPatch) && typeof worldPatch.sceneSummary === "string" ? worldPatch.sceneSummary : undefined) ??
    synthesizedNarration;

  const shortSummary = pickString(source, ["shortSummary", "short_summary", "summary"]);

  const normalized: Record<string, unknown> = {
    narration
  };
  if (shortSummary) normalized.shortSummary = shortSummary;
  if (worldPatch) normalized.worldPatch = worldPatch;
  if (questPatches) normalized.questPatches = questPatches;
  if (characterPatches) normalized.characterPatches = characterPatches;
  return normalized;
};

const buildSystemPrompt = () =>
  [
    "You are Cheshire Cat running the server-authoritative DM turn pipeline.",
    "You must maintain continuity and obey bounded state changes.",
    "Output JSON only and strictly match schema for worldPatch/questPatches/characterPatches.",
    "Always include a top-level narration string. Never omit narration.",
    "Do not invent nonexistent characters. Use only provided character ids.",
    "Never set HP below 0 or above max. Do not make extreme inventory swings unless directly implied.",
    "Prioritize coherent consequences and actionable next scene narration.",
    "Use the provided memory (recent turns, summaries, pinned facts, semantic recall) for continuity.",
    "Use compendiumContext to ground mechanics, items, mutations, and entities when relevant.",
    "Use stateVector as source-of-truth for version and turn progression continuity.",
    "If context conflicts, prioritize pinned facts > summaries > recent turns.",
    'JSON shape example: {"narration":"...", "shortSummary":"...", "worldPatch":{}, "questPatches":[], "characterPatches":[]}',
    "No markdown fencing."
  ].join("\n");

export const runContextAwareDmTurn = async (context: DmContextPacket): Promise<DmLlmCallResult> => {
  const model = process.env.CHESHIRE_MODEL ?? "rassy-mind";
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: JSON.stringify(context)
    }
  ];
  const payload = {
    model,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages
  };

  const promptHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const response = await requestCheshireChat({
    model,
    temperature: 0.35,
    responseFormat: { type: "json_object" },
    messages,
    lane: "dm",
    priority: "high",
    purpose: "dm-turn",
    queueWaitMs: 15000,
    timeoutMs: 45000
  });

  const text = response.content;
  const parsedJson = parseJsonObjectFromText(text);
  const normalizedJson = normalizeDmTurnPayload(parsedJson, context);
  const parsed = dmTurnSchema.safeParse(normalizedJson);
  if (!parsed.success) {
    throw new Error(`cheshire_payload_invalid:${parsed.error.message}`);
  }

  return {
    patch: parsed.data,
    model: response.model,
    provider: "cheshire",
    latencyMs: response.latencyMs,
    promptPayload: payload,
    responseText: text,
    responseJson: parsedJson,
    promptHash
  };
};

export const createFallbackTurn = (actionText: string): DmTurnPatch => {
  const now = new Date().toISOString();
  return {
    narration: [
      `Action recorded: ${actionText}`,
      "World continuity preserved under fallback mode.",
      "The session state was updated and persisted."
    ].join(" "),
    shortSummary: "Fallback response generated because LLM was unavailable.",
    worldPatch: {
      storyBeat: `Fallback progression at ${now}`,
      sceneSummary: actionText.slice(0, 240)
    }
  };
};

export const embedTextWithCheshire = async (text: string): Promise<number[] | null> => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const response = await requestCheshireEmbedding(trimmed, undefined, {
      lane: "embeddings",
      priority: "low",
      purpose: "dm-embedding",
      queueWaitMs: 4000,
      timeoutMs: 15000
    });
    return response.embedding;
  } catch {
    return null;
  }
};

export const cosineSimilarity = (a: number[], b: number[]) => {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};
