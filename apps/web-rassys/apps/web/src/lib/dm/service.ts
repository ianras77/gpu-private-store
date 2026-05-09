import crypto from "crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { hashPassword, verifyPassword } from "./auth";
import {
  buildCampaignSnapshot,
  buildContextPacket,
  ensureActiveSession,
  loadCampaignBundle,
  loadMembershipRole
} from "./context";
import {
  createFallbackTurn,
  embedTextWithCheshire,
  runContextAwareDmTurn,
  type DmContextPacket
} from "./cheshire";
import { dmQuery, ensureDmSchema, toJson, withCampaignLock, withDmTransaction } from "./db";
import { getSystemPlugin, type SeedResult } from "./systems";
import type {
  CampaignSnapshot,
  CampaignSummary,
  CharacterPatch,
  CharacterRecord,
  DmRole,
  DmTurnPatch,
  EventRecord,
  PublicUser,
  QuestPatch,
  QuestRecord,
  UserRecord
} from "./types";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(2).max(80)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

const worldSeedSchema = z.object({
  genre: z.string().trim().min(2).max(120).optional(),
  tone: z.string().trim().min(2).max(120).optional(),
  pacing: z.string().trim().min(2).max(120).optional(),
  factions: z.array(z.string().trim().min(1).max(140)).max(8).default([]),
  threat: z.array(z.string().trim().min(1).max(140)).max(8).default([]),
  techLevel: z.string().trim().min(2).max(240).optional(),
  landmark: z.string().trim().min(2).max(500).optional(),
  partyFocus: z.array(z.string().trim().min(1).max(140)).max(8).default([]),
  stakes: z.array(z.string().trim().min(1).max(140)).max(8).default([]),
  startingPoint: z.string().trim().min(2).max(160).optional(),
  tableLines: z.string().trim().max(500).optional(),
  openingSituation: z.string().trim().min(2).max(600).optional(),
  playerHook: z.string().trim().min(2).max(600).optional(),
  campaignTwist: z.string().trim().min(2).max(600).optional()
});

const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(4000),
  systemId: z.string().trim().min(1).max(80).default("gamma-world"),
  worldSeed: worldSeedSchema.optional()
});

const createCharacterActionSchema = z.object({
  key: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  actionType: z.string().trim().min(1).max(80).default("special"),
  usesCurrent: z.number().int().min(0).max(999).optional(),
  usesMax: z.number().int().min(0).max(999).optional(),
  cooldownTurns: z.number().int().min(0).max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const createCharacterAttributeSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    valueNumber: z.number().finite().optional(),
    valueText: z.string().trim().max(500).optional(),
    valueJson: z.unknown().optional(),
    source: z.string().trim().max(80).default("sheet")
  })
  .refine(
    (value) =>
      typeof value.valueNumber === "number" ||
      typeof value.valueText === "string" ||
      typeof value.valueJson !== "undefined",
    "attribute requires valueNumber, valueText, or valueJson"
  );

const createCharacterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  archetype: z.string().trim().min(2).max(120),
  playerType: z.string().trim().min(1).max(120).optional(),
  level: z.number().int().min(1).max(40).default(1),
  hpCurrent: z.number().int().min(0).max(1000),
  hpMax: z.number().int().min(1).max(1000),
  hpTemp: z.number().int().min(0).max(1000).default(0),
  status: z.string().trim().min(1).max(120).default("Ready"),
  notes: z.string().trim().max(4000).optional(),
  specialTraits: z.array(z.string().trim().min(1).max(140)).max(50).optional(),
  systemData: z.record(z.string(), z.unknown()).optional(),
  attributes: z.array(createCharacterAttributeSchema).max(120).optional(),
  actions: z.array(createCharacterActionSchema).max(120).optional(),
  inventory: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        detail: z.string().trim().max(240).optional(),
        quantity: z.number().int().min(0).max(999)
      })
    )
    .max(300)
    .optional()
});

const patchCharacterSchema = z.object({
  hpCurrent: z.number().int().min(0).max(1000).optional(),
  hpMax: z.number().int().min(1).max(1000).optional(),
  hpTemp: z.number().int().min(0).max(1000).optional(),
  playerType: z.string().trim().min(1).max(120).optional(),
  specialTraits: z.array(z.string().trim().min(1).max(140)).max(50).optional(),
  systemData: z.record(z.string(), z.unknown()).optional(),
  attributes: z
    .array(
      z
        .object({
          key: z.string().trim().min(1).max(80),
          valueNumber: z.number().finite().optional(),
          valueText: z.string().trim().max(500).optional(),
          valueJson: z.unknown().optional(),
          source: z.string().trim().max(80).default("sheet")
        })
        .refine(
          (value) =>
            typeof value.valueNumber === "number" ||
            typeof value.valueText === "string" ||
            typeof value.valueJson !== "undefined",
          "attribute requires valueNumber, valueText, or valueJson"
        )
    )
    .max(120)
    .optional(),
  actions: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(80).optional(),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).optional(),
        actionType: z.string().trim().min(1).max(80).default("special"),
        usesCurrent: z.number().int().min(0).max(999).optional(),
        usesMax: z.number().int().min(0).max(999).optional(),
        cooldownTurns: z.number().int().min(0).max(1000).optional(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
    )
    .max(120)
    .optional(),
  status: z.string().trim().min(1).max(120).optional(),
  notesAppend: z.string().trim().min(1).max(1800).optional(),
  inventoryDelta: z
    .array(
      z.object({
        itemName: z.string().trim().min(1).max(120),
        quantityDelta: z.number().int().min(-999).max(999),
        detail: z.string().trim().max(240).optional()
      })
    )
    .max(200)
    .optional()
});

const actionSchema = z.object({
  actionText: z.string().trim().min(1).max(5000),
  actorCharacterId: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(180).optional()
});

const rollSchema = z.object({
  expression: z.string().trim().min(2).max(24).default("d20"),
  reason: z.string().trim().max(600).optional(),
  actorCharacterId: z.string().trim().min(1).max(120).optional(),
  autoResolve: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(8).max(180).optional()
});

const createInviteSchema = z.object({
  role: z.enum(["dm", "player"]).default("player"),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(72)
});

const addFactSchema = z.object({
  kind: z.string().trim().min(1).max(80).default("canon"),
  factText: z.string().trim().min(2).max(2000),
  confidence: z.number().int().min(1).max(100).default(90),
  pinned: z.boolean().default(true)
});

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampText = (value: string, maxLen: number) => value.trim().slice(0, maxLen);
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 120);

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const normalizeCharacterAttributes = (
  raw: Array<z.infer<typeof createCharacterAttributeSchema>> | undefined
): Array<z.infer<typeof createCharacterAttributeSchema>> =>
  (raw ?? []).map((entry) => ({
    ...entry,
    key: entry.key.trim().toLowerCase()
  }));

const normalizeCharacterActions = (
  raw: Array<z.infer<typeof createCharacterActionSchema>> | undefined
): Array<z.infer<typeof createCharacterActionSchema>> =>
  (raw ?? []).map((entry) => ({
    ...entry,
    key: (entry.key?.trim() || slugify(entry.name) || `action-${crypto.randomUUID().slice(0, 8)}`).toLowerCase()
  }));

const normalizeInventorySeed = (
  raw: Array<{ name: string; detail?: string; quantity: number }> | undefined
): Array<{ name: string; detail?: string; quantity: number }> => {
  const merged = new Map<string, { name: string; detail?: string; quantity: number }>();
  for (const item of raw ?? []) {
    const key = item.name.trim().toLowerCase();
    if (!key || item.quantity <= 0) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        name: item.name.trim(),
        detail: item.detail,
        quantity: item.quantity
      });
      continue;
    }

    merged.set(key, {
      name: existing.name,
      detail: item.detail ?? existing.detail,
      quantity: existing.quantity + item.quantity
    });
  }
  return [...merged.values()];
};

type CampaignWorldSeed = z.infer<typeof worldSeedSchema>;

type SeedFactRecord = {
  key: string;
  text: string;
  confidence: number;
  pinned: boolean;
};

const uniqueStrings = (values: string[] | undefined, max = 6) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const trimmed = clampText(value, 240);
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= max) break;
  }
  return result;
};

const humanList = (values: string[], fallback: string) => {
  if (!values.length) return fallback;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
};

const ensureSentence = (value: string, maxLen: number) => {
  const trimmed = clampText(value, maxLen);
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const lowerFirst = (value: string) => (value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value);

const applyWorldSeedOverrides = (
  baseSeed: SeedResult,
  campaignName: string,
  worldSeed?: CampaignWorldSeed
): SeedResult => {
  if (!worldSeed) return baseSeed;

  const factions = uniqueStrings(worldSeed.factions, 4);
  const threats = uniqueStrings(worldSeed.threat, 4);
  const partyFocus = uniqueStrings(worldSeed.partyFocus, 4);
  const stakes = uniqueStrings(worldSeed.stakes, 4);

  const location = worldSeed.startingPoint?.trim() || baseSeed.worldState.location;
  const openingSituation = worldSeed.openingSituation?.trim();
  const playerHook = worldSeed.playerHook?.trim();
  const twist = worldSeed.campaignTwist?.trim();
  const landmark = worldSeed.landmark?.trim();
  const techLevel = worldSeed.techLevel?.trim();
  const activeThreats = threats.length ? threats : baseSeed.worldState.activeThreats;

  const sceneSummary = [
    `${campaignName} opens in ${location}.`,
    openingSituation ? ensureSentence(openingSituation, 280) : baseSeed.worldState.sceneSummary,
    landmark ? `Signature landmark: ${ensureSentence(landmark, 180)}` : "",
    factions.length ? `Factions already moving: ${humanList(factions, "local powers")}.` : "",
    techLevel ? `World texture: ${ensureSentence(techLevel, 180)}` : ""
  ]
    .filter((value) => value.length > 0)
    .join(" ");

  const storyBeat = playerHook
    ? `The opening demand is personal: ${ensureSentence(playerHook, 220)}`
    : twist
      ? `Something underneath the surface is wrong: ${ensureSentence(twist, 220)}`
      : baseSeed.worldState.storyBeat;

  const questSummary = [
    openingSituation ? ensureSentence(openingSituation, 180) : baseSeed.initialQuest.summary,
    stakes.length ? `The party must ${lowerFirst(humanList(stakes, "survive the opening crisis"))}.` : "",
    twist ? `A hidden complication shadows the first move: ${ensureSentence(twist, 180)}` : ""
  ]
    .filter((value) => value.length > 0)
    .join(" ");

  const questObjectives = uniqueStrings(
    [
      playerHook ? `Act on the first hook: ${clampText(playerHook, 96)}` : "",
      factions[0] ? `Learn what ${clampText(factions[0], 80)} wants from ${location}` : "",
      activeThreats[0] ? `Contain or outmaneuver ${clampText(activeThreats[0], 80)}` : "",
      stakes[0] ? `Push toward ${lowerFirst(clampText(stakes[0], 100))}` : "",
      partyFocus[0] ? `Get the ${lowerFirst(clampText(partyFocus[0], 90))} moving as a unit` : "",
      ...baseSeed.initialQuest.objectives
    ],
    3
  );

  return {
    worldState: {
      ...baseSeed.worldState,
      location,
      activeThreats,
      sceneSummary,
      storyBeat,
      visualPrompt: [
        baseSeed.worldState.visualPrompt,
        worldSeed.genre?.trim(),
        worldSeed.tone?.trim(),
        landmark,
        techLevel
      ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => clampText(value, 180))
        .join(", ")
    },
    initialQuest: {
      ...baseSeed.initialQuest,
      summary: questSummary,
      objectives: questObjectives.length ? questObjectives : baseSeed.initialQuest.objectives
    }
  };
};

const buildWorldSeedFacts = (campaignName: string, worldSeed?: CampaignWorldSeed): SeedFactRecord[] => {
  if (!worldSeed) return [];

  const factions = uniqueStrings(worldSeed.factions, 4);
  const threats = uniqueStrings(worldSeed.threat, 4);
  const partyFocus = uniqueStrings(worldSeed.partyFocus, 4);
  const stakes = uniqueStrings(worldSeed.stakes, 4);

  const factRows: Array<SeedFactRecord | null> = [
    worldSeed.genre || worldSeed.tone || worldSeed.pacing
      ? {
          key: "seed:premise",
          text: `Campaign '${campaignName}' premise: ${[
            worldSeed.genre,
            worldSeed.tone ? `${worldSeed.tone} tone` : "",
            worldSeed.pacing ? `${worldSeed.pacing} pacing` : ""
          ]
            .filter((value) => typeof value === "string" && value.trim().length > 0)
            .join(", ")}`,
          confidence: 96,
          pinned: true
        }
      : null,
    worldSeed.startingPoint
      ? {
          key: "seed:starting_point",
          text: `Opening location: ${clampText(worldSeed.startingPoint, 160)}`,
          confidence: 98,
          pinned: true
        }
      : null,
    worldSeed.openingSituation
      ? {
          key: "seed:opening_situation",
          text: `Opening situation: ${clampText(worldSeed.openingSituation, 320)}`,
          confidence: 98,
          pinned: true
        }
      : null,
    worldSeed.playerHook
      ? {
          key: "seed:player_hook",
          text: `Player hook: ${clampText(worldSeed.playerHook, 320)}`,
          confidence: 97,
          pinned: true
        }
      : null,
    worldSeed.campaignTwist
      ? {
          key: "seed:twist",
          text: `Hidden complication: ${clampText(worldSeed.campaignTwist, 320)}`,
          confidence: 92,
          pinned: true
        }
      : null,
    worldSeed.landmark
      ? {
          key: "seed:landmark",
          text: `Signature landmark: ${clampText(worldSeed.landmark, 280)}`,
          confidence: 90,
          pinned: true
        }
      : null,
    worldSeed.techLevel
      ? {
          key: "seed:tech_level",
          text: `Tech or magic texture: ${clampText(worldSeed.techLevel, 240)}`,
          confidence: 88,
          pinned: true
        }
      : null,
    factions.length
      ? {
          key: "seed:factions",
          text: `Key factions in motion: ${humanList(factions, "local powers")}`,
          confidence: 92,
          pinned: true
        }
      : null,
    threats.length
      ? {
          key: "seed:threats",
          text: `Immediate threats: ${humanList(threats, "danger gathering nearby")}`,
          confidence: 92,
          pinned: true
        }
      : null,
    partyFocus.length
      ? {
          key: "seed:party_focus",
          text: `Party identity: ${humanList(partyFocus, "adventurers")}`,
          confidence: 85,
          pinned: true
        }
      : null,
    stakes.length
      ? {
          key: "seed:stakes",
          text: `Campaign stakes: ${humanList(stakes, "survive the opening crisis")}`,
          confidence: 94,
          pinned: true
        }
      : null,
    worldSeed.tableLines
      ? {
          key: "seed:table_lines",
          text: `Table safety boundaries: ${clampText(worldSeed.tableLines, 320)}`,
          confidence: 99,
          pinned: true
        }
      : null
  ];

  return factRows.filter((entry): entry is SeedFactRecord => Boolean(entry));
};

const insertWorldSeedFacts = async (
  client: PoolClient,
  campaignId: string,
  facts: SeedFactRecord[]
) => {
  for (const fact of facts) {
    await client.query(
      `INSERT INTO dm_memory_facts (id, campaign_id, kind, fact_key, fact_text, confidence, pinned, created_at, updated_at)
       VALUES ($1, $2, 'world_seed', $3, $4, $5, $6, now(), now())`,
      [createId("fact"), campaignId, fact.key, fact.text, fact.confidence, fact.pinned]
    );
  }
};

const compactContextForRetry = (context: DmContextPacket): DmContextPacket => ({
  ...context,
  characters: context.characters.slice(0, 8).map((character) => ({
    id: character.id,
    name: character.name,
    archetype: character.archetype,
    level: character.level,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    hpTemp: character.hpTemp,
    status: character.status,
    inventory: Array.isArray(character.inventory) ? character.inventory.slice(0, 8) : []
  })),
  quests: context.quests.slice(0, 8),
  recentTurns: context.recentTurns.slice(0, 8),
  rollingSummaries: context.rollingSummaries.slice(0, 3),
  pinnedFacts: context.pinnedFacts.slice(0, 10),
  semanticMemory: context.semanticMemory.slice(0, 4),
  compendiumContext: context.compendiumContext?.slice(0, 6),
  contextMeta: {
    ...(context.contextMeta ?? {}),
    compactRetry: true
  }
});

type CharacterTemplate = {
  entryId: string;
  playerType?: string;
  specialTraits?: string[];
  attributes?: Array<z.infer<typeof createCharacterAttributeSchema>>;
  actions?: Array<z.infer<typeof createCharacterActionSchema>>;
};

const getArchetypeTemplate = async (systemId: string, archetype: string): Promise<CharacterTemplate | null> => {
  const result = await dmQuery<{ id: string; data: Record<string, unknown> | null }>(
    `SELECT id, data
     FROM dm_compendium_entries
     WHERE system_id = $1
       AND entry_type = 'archetype_template'
       AND lower(name) = lower($2)
     LIMIT 1`,
    [systemId, archetype]
  );

  const row = result.rows[0];
  if (!row?.data) return null;
  const data = toRecord(row.data);
  const attributesRaw = Array.isArray(data.attributes) ? data.attributes : [];
  const actionsRaw = Array.isArray(data.actions) ? data.actions : [];

  const attributes = attributesRaw
    .map((entry) => createCharacterAttributeSchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => entry.data);
  const actions = actionsRaw
    .map((entry) => createCharacterActionSchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => entry.data);

  return {
    entryId: row.id,
    playerType: typeof data.playerType === "string" ? data.playerType : undefined,
    specialTraits: toStringArray(data.specialTraits),
    attributes: normalizeCharacterAttributes(attributes),
    actions: normalizeCharacterActions(actions)
  };
};

type ActionResultPayload = {
  turn: DmTurnPatch;
  snapshot: CampaignSnapshot;
  meta?: {
    turnId: string;
    sessionId: string;
    turnIndex: number;
  };
};
type DiceRollResult = {
  expression: string;
  count: number;
  sides: number;
  modifier: number;
  rolls: number[];
  total: number;
  criticalSuccess: boolean;
  criticalFailure: boolean;
};
export type DiceRollOutcome = {
  roll: DiceRollResult;
  summary: string;
  diceRollId?: string;
  outcomeStatus?: string;
  resolutionTurnId?: string;
  snapshot?: CampaignSnapshot;
  resolution?: ActionResultPayload;
};
export type PlayerDashboardState = {
  campaign: CampaignSnapshot["campaign"];
  role: DmRole;
  activeCharacter: CharacterRecord | null;
  ownedCharacters: CharacterRecord[];
  party: CharacterRecord[];
  quests: QuestRecord[];
  worldState: CampaignSnapshot["campaign"]["worldState"];
  recentEvents: EventRecord[];
  stats: {
    totalRolls: number;
    criticalSuccesses: number;
    criticalFailures: number;
    averageRollTotal: number | null;
    actionsTaken: number;
    dmResponsesSeen: number;
    lastActionAt: string | null;
    lastRollAt: string | null;
  };
  keyMoments: string[];
  suggestedPrompts: string[];
};

const supportedDiceSides = new Set([4, 6, 8, 10, 12, 20, 100]);

const parseDiceExpression = (value: string) => {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{0,2})d(\d{1,3})([+-]\d{1,3})?$/);
  if (!match) throw new Error("invalid_dice_expression");

  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;

  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error("invalid_dice_expression");
  }
  if (!Number.isInteger(sides) || !supportedDiceSides.has(sides)) {
    throw new Error("invalid_dice_expression");
  }
  if (!Number.isInteger(modifier) || modifier < -100 || modifier > 100) {
    throw new Error("invalid_dice_expression");
  }

  return { count, sides, modifier };
};

const rollDice = (expression: string): DiceRollResult => {
  const normalized = expression.trim().toLowerCase();
  const { count, sides, modifier } = parseDiceExpression(normalized);
  const rolls = Array.from({ length: count }, () => crypto.randomInt(1, sides + 1));
  const rollTotal = rolls.reduce((sum, value) => sum + value, 0);
  const total = rollTotal + modifier;
  const criticalSuccess = count === 1 && sides === 20 && rolls[0] === 20;
  const criticalFailure = count === 1 && sides === 20 && rolls[0] === 1;
  return {
    expression: normalized,
    count,
    sides,
    modifier,
    rolls,
    total,
    criticalSuccess,
    criticalFailure
  };
};

const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt
});

const hashInviteToken = (token: string) =>
  crypto.createHash("sha256").update(`${token}:${process.env.DM_JWT_SECRET ?? "dm-secret"}`).digest("hex");

const assertMembership = async (campaignId: string, userId: string): Promise<DmRole> => {
  const role = await loadMembershipRole(campaignId, userId);
  if (!role) throw new Error("forbidden");
  return role;
};

const resolveIdempotentAction = async (
  client: PoolClient,
  campaignId: string,
  idempotencyKey: string
): Promise<ActionResultPayload | null> => {
  const existing = await client.query<{
    result_payload: ActionResultPayload | null;
    status: string;
  }>(
    `SELECT result_payload, status
     FROM dm_turns
     WHERE campaign_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [campaignId, idempotencyKey]
  );

  const turn = existing.rows[0];
  if (!turn) return null;
  if (turn.status === "applied" && turn.result_payload) return turn.result_payload;
  if (turn.status === "processing") throw new Error("turn_in_progress");
  if (turn.status === "failed") throw new Error("turn_previously_failed");
  return null;
};

const extractAutoFacts = (patch: DmTurnPatch): Array<{ key: string; text: string; confidence: number }> => {
  const facts: Array<{ key: string; text: string; confidence: number }> = [];

  if (patch.worldPatch?.location) {
    facts.push({
      key: "world:location",
      text: `Current location: ${clampText(patch.worldPatch.location, 240)}`,
      confidence: 88
    });
  }
  if (patch.worldPatch?.weather) {
    facts.push({
      key: "world:weather",
      text: `Current weather: ${clampText(patch.worldPatch.weather, 240)}`,
      confidence: 84
    });
  }
  if (patch.worldPatch?.storyBeat) {
    facts.push({
      key: "world:story_beat",
      text: `Story beat: ${clampText(patch.worldPatch.storyBeat, 320)}`,
      confidence: 86
    });
  }

  for (const quest of patch.questPatches ?? []) {
    const questKey = quest.questId ? `quest:${quest.questId}` : `quest-title:${slugify(quest.title) || "unknown"}`;
    const status = quest.status ?? "active";
    const progress = typeof quest.progress === "number" ? clamp(Math.round(quest.progress), 0, 100) : null;
    facts.push({
      key: `${questKey}:status`,
      text: `Quest '${clampText(quest.title, 160)}' status: ${status}${progress === null ? "" : ` (${progress}% progress)`}`,
      confidence: 82
    });
    if (quest.summary) {
      facts.push({
        key: `${questKey}:summary`,
        text: `Quest summary: ${clampText(quest.summary, 320)}`,
        confidence: 74
      });
    }
  }

  for (const character of patch.characterPatches ?? []) {
    if (character.status) {
      facts.push({
        key: `character:${character.characterId}:status`,
        text: `Character ${character.characterId} status: ${clampText(character.status, 140)}`,
        confidence: 76
      });
    }
  }

  return facts.slice(0, 40);
};

const upsertAutoFacts = async (client: PoolClient, campaignId: string, patch: DmTurnPatch) => {
  const facts = extractAutoFacts(patch);
  if (!facts.length) return;

  for (const fact of facts) {
    const updated = await client.query<{ id: string }>(
      `UPDATE dm_memory_facts
       SET fact_text = $3,
           confidence = $4,
           updated_at = now()
       WHERE campaign_id = $1
         AND fact_key = $2
       RETURNING id`,
      [campaignId, fact.key, fact.text, fact.confidence]
    );
    if (updated.rowCount && updated.rowCount > 0) {
      continue;
    }

    await client.query(
      `INSERT INTO dm_memory_facts (id, campaign_id, kind, fact_key, fact_text, confidence, pinned, created_at, updated_at)
       VALUES ($1, $2, 'auto_state', $3, $4, $5, false, now(), now())`,
      [createId("fact"), campaignId, fact.key, fact.text, fact.confidence]
    );
  }
};

type TransitionSourceContext = {
  campaignId: string;
  sessionId?: string | null;
  turnId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  actorUserId?: string | null;
  actorCharacterId?: string | null;
};

type TransitionWriteInput = {
  entityType: string;
  entityId?: string | null;
  fieldPath: string;
  transitionType?: "set" | "delta" | "append" | "replace" | "create" | "delete";
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
};

const transitionJson = (value: unknown) => (typeof value === "undefined" ? null : toJson(value));

const writeStateTransition = async (
  client: PoolClient,
  source: TransitionSourceContext,
  input: TransitionWriteInput
) => {
  await client.query(
    `INSERT INTO dm_state_transitions (
       id,
       campaign_id,
       session_id,
       turn_id,
       source_type,
       source_id,
       actor_user_id,
       actor_character_id,
       entity_type,
       entity_id,
       field_path,
       transition_type,
       old_value,
       new_value,
       metadata,
       created_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, now()
     )`,
    [
      createId("transition"),
      source.campaignId,
      source.sessionId ?? null,
      source.turnId ?? null,
      source.sourceType,
      source.sourceId ?? null,
      source.actorUserId ?? null,
      source.actorCharacterId ?? null,
      input.entityType,
      input.entityId ?? null,
      input.fieldPath,
      input.transitionType ?? "set",
      transitionJson(input.oldValue),
      transitionJson(input.newValue),
      toJson(input.metadata ?? {})
    ]
  );
};

const writePatchStateTransitions = async (
  client: PoolClient,
  source: TransitionSourceContext,
  patch: DmTurnPatch
) => {
  const world = patch.worldPatch;
  if (world) {
    const worldFields: Array<[string, unknown]> = [
      ["location", world.location],
      ["worldTime", world.worldTime],
      ["weather", world.weather],
      ["activeThreats", world.activeThreats],
      ["sceneSummary", world.sceneSummary],
      ["storyBeat", world.storyBeat],
      ["visualPrompt", world.visualPrompt]
    ];

    for (const [field, value] of worldFields) {
      if (typeof value === "undefined") continue;
      await writeStateTransition(client, source, {
        entityType: "world_state",
        entityId: source.campaignId,
        fieldPath: field,
        transitionType: "set",
        newValue: value
      });
    }
  }

  for (const questPatch of patch.questPatches ?? []) {
    const questEntityId = questPatch.questId ?? `title:${slugify(questPatch.title) || "unknown"}`;
    await writeStateTransition(client, source, {
      entityType: "quest",
      entityId: questEntityId,
      fieldPath: "title",
      transitionType: questPatch.questId ? "set" : "create",
      newValue: questPatch.title
    });

    if (typeof questPatch.summary === "string") {
      await writeStateTransition(client, source, {
        entityType: "quest",
        entityId: questEntityId,
        fieldPath: "summary",
        transitionType: "set",
        newValue: questPatch.summary
      });
    }
    if (typeof questPatch.status === "string") {
      await writeStateTransition(client, source, {
        entityType: "quest",
        entityId: questEntityId,
        fieldPath: "status",
        transitionType: "set",
        newValue: questPatch.status
      });
    }
    if (typeof questPatch.progress === "number") {
      await writeStateTransition(client, source, {
        entityType: "quest",
        entityId: questEntityId,
        fieldPath: "progress",
        transitionType: "set",
        newValue: clamp(Math.round(questPatch.progress), 0, 100)
      });
    }
    if (questPatch.objectives?.length) {
      await writeStateTransition(client, source, {
        entityType: "quest",
        entityId: questEntityId,
        fieldPath: "objectives",
        transitionType: "replace",
        newValue: questPatch.objectives.map((objective) => ({
          text: objective.text,
          completed: Boolean(objective.completed)
        }))
      });
    }
  }

  for (const characterPatch of patch.characterPatches ?? []) {
    if (typeof characterPatch.hpDelta === "number") {
      await writeStateTransition(client, source, {
        entityType: "character",
        entityId: characterPatch.characterId,
        fieldPath: "hpCurrent",
        transitionType: "delta",
        newValue: { delta: characterPatch.hpDelta }
      });
    }
    if (typeof characterPatch.hpTemp === "number") {
      await writeStateTransition(client, source, {
        entityType: "character",
        entityId: characterPatch.characterId,
        fieldPath: "hpTemp",
        transitionType: "set",
        newValue: characterPatch.hpTemp
      });
    }
    if (typeof characterPatch.status === "string") {
      await writeStateTransition(client, source, {
        entityType: "character",
        entityId: characterPatch.characterId,
        fieldPath: "status",
        transitionType: "set",
        newValue: characterPatch.status
      });
    }
    if (typeof characterPatch.notesAppend === "string" && characterPatch.notesAppend.trim()) {
      await writeStateTransition(client, source, {
        entityType: "character",
        entityId: characterPatch.characterId,
        fieldPath: "notes",
        transitionType: "append",
        newValue: clampText(characterPatch.notesAppend, 1200)
      });
    }
    for (const delta of characterPatch.inventoryDelta ?? []) {
      await writeStateTransition(client, source, {
        entityType: "inventory_item",
        entityId: `${characterPatch.characterId}:${slugify(delta.itemName) || "item"}`,
        fieldPath: "quantity",
        transitionType: "delta",
        newValue: { itemName: delta.itemName, quantityDelta: delta.quantityDelta, detail: delta.detail ?? null }
      });
    }
  }
};

const recordPatchEvents = async (
  client: PoolClient,
  campaignId: string,
  sessionId: string,
  turnId: string,
  actorUserId: string,
  patch: DmTurnPatch
) => {
  if (patch.worldPatch) {
    await client.query(
      `INSERT INTO dm_events (id, campaign_id, session_id, turn_id, type, actor_user_id, summary, payload, created_at)
       VALUES ($1, $2, $3, $4, 'state_patch', $5, $6, $7::jsonb, now())`,
      [
        createId("event"),
        campaignId,
        sessionId,
        turnId,
        actorUserId,
        "World state patched",
        toJson(patch.worldPatch)
      ]
    );
  }

  for (const questPatch of patch.questPatches ?? []) {
    await client.query(
      `INSERT INTO dm_events (id, campaign_id, session_id, turn_id, type, actor_user_id, summary, payload, created_at)
       VALUES ($1, $2, $3, $4, 'quest_update', $5, $6, $7::jsonb, now())`,
      [
        createId("event"),
        campaignId,
        sessionId,
        turnId,
        actorUserId,
        `Quest update: ${clampText(questPatch.title, 140)}`,
        toJson(questPatch)
      ]
    );
  }

  for (const characterPatch of patch.characterPatches ?? []) {
    await client.query(
      `INSERT INTO dm_events (id, campaign_id, session_id, turn_id, type, actor_user_id, actor_character_id, summary, payload, created_at)
       VALUES ($1, $2, $3, $4, 'character_update', $5, $6, $7, $8::jsonb, now())`,
      [
        createId("event"),
        campaignId,
        sessionId,
        turnId,
        actorUserId,
        characterPatch.characterId,
        `Character update: ${characterPatch.characterId}`,
        toJson(characterPatch)
      ]
    );
  }
};

const applyQuestPatches = async (
  client: PoolClient,
  campaignId: string,
  patches: QuestPatch[] | undefined
) => {
  if (!patches?.length) return;

  for (const patch of patches) {
    const existingById = patch.questId
      ? await client.query<{ id: string }>(
          `SELECT id FROM dm_quests WHERE campaign_id = $1 AND id = $2 LIMIT 1`,
          [campaignId, patch.questId]
        )
      : { rows: [] as Array<{ id: string }> };

    const existingByTitle =
      existingById.rows[0] ??
      (
        await client.query<{ id: string }>(
          `SELECT id FROM dm_quests WHERE campaign_id = $1 AND lower(title) = lower($2) LIMIT 1`,
          [campaignId, patch.title]
        )
      ).rows[0];

    const questId = existingByTitle?.id ?? patch.questId ?? createId("quest");

    if (!existingByTitle) {
      await client.query(
        `INSERT INTO dm_quests (id, campaign_id, title, summary, status, progress, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
        [
          questId,
          campaignId,
          patch.title,
          patch.summary ?? "",
          patch.status ?? "active",
          clamp(Math.round(patch.progress ?? 0), 0, 100)
        ]
      );
    } else {
      await client.query(
        `UPDATE dm_quests
         SET title = COALESCE($3, title),
             summary = COALESCE($4, summary),
             status = COALESCE($5, status),
             progress = COALESCE($6, progress),
             updated_at = now()
         WHERE id = $1 AND campaign_id = $2`,
        [
          questId,
          campaignId,
          patch.title,
          patch.summary ?? null,
          patch.status ?? null,
          typeof patch.progress === "number" ? clamp(Math.round(patch.progress), 0, 100) : null
        ]
      );
    }

    if (patch.objectives?.length) {
      await client.query(`DELETE FROM dm_quest_objectives WHERE quest_id = $1`, [questId]);
      let ord = 0;
      for (const objective of patch.objectives) {
        await client.query(
          `INSERT INTO dm_quest_objectives (id, quest_id, ord, text, completed)
           VALUES ($1, $2, $3, $4, $5)`,
          [createId("objective"), questId, ord, objective.text, Boolean(objective.completed)]
        );
        ord += 1;
      }
    }
  }
};

const applyInventoryDelta = async (
  client: PoolClient,
  characterId: string,
  inventoryDelta: CharacterPatch["inventoryDelta"]
) => {
  for (const delta of inventoryDelta ?? []) {
    const existing = await client.query<{ id: string; quantity: number }>(
      `SELECT id, quantity
       FROM dm_inventory_items
       WHERE character_id = $1 AND lower(name) = lower($2)
       ORDER BY updated_at DESC, id ASC`,
      [characterId, delta.itemName]
    );

    if (!existing.rows.length) {
      if (delta.quantityDelta <= 0) continue;
      await client.query(
        `INSERT INTO dm_inventory_items (id, character_id, name, detail, quantity, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [createId("item"), characterId, delta.itemName, delta.detail ?? null, delta.quantityDelta]
      );
      continue;
    }

    const item = existing.rows[0];
    const mergedQuantity = existing.rows.reduce((total, row) => total + row.quantity, 0);
    const nextQuantity = mergedQuantity + delta.quantityDelta;
    if (nextQuantity <= 0) {
      await client.query(`DELETE FROM dm_inventory_items WHERE id = ANY($1::text[])`, [existing.rows.map((row) => row.id)]);
      continue;
    }

    await client.query(
      `UPDATE dm_inventory_items
       SET quantity = $2,
           detail = COALESCE($3, detail),
           updated_at = now()
      WHERE id = $1`,
      [item.id, nextQuantity, delta.detail ?? null]
    );

    if (existing.rows.length > 1) {
      await client.query(`DELETE FROM dm_inventory_items WHERE id = ANY($1::text[])`, [
        existing.rows.slice(1).map((row) => row.id)
      ]);
    }
  }
};

const upsertCharacterAttributes = async (
  client: PoolClient,
  characterId: string,
  systemId: string,
  attributes: Array<z.infer<typeof createCharacterAttributeSchema>> | undefined
) => {
  if (!attributes) return;

  for (const attribute of normalizeCharacterAttributes(attributes)) {
    await client.query(
      `INSERT INTO dm_character_attributes (
         id,
         character_id,
         system_id,
         attr_key,
         value_num,
         value_text,
         value_json,
         source,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7::jsonb, $8, now()
       )
       ON CONFLICT (character_id, attr_key)
       DO UPDATE SET
         value_num = EXCLUDED.value_num,
         value_text = EXCLUDED.value_text,
         value_json = EXCLUDED.value_json,
         source = EXCLUDED.source,
         updated_at = now()`,
      [
        createId("attr"),
        characterId,
        systemId,
        attribute.key,
        typeof attribute.valueNumber === "number" ? attribute.valueNumber : null,
        typeof attribute.valueText === "string" ? attribute.valueText : null,
        typeof attribute.valueJson !== "undefined" ? toJson(attribute.valueJson) : null,
        attribute.source ?? "sheet"
      ]
    );
  }
};

const replaceCharacterActions = async (
  client: PoolClient,
  characterId: string,
  systemId: string,
  actions: Array<z.infer<typeof createCharacterActionSchema>> | undefined
) => {
  if (!actions) return;
  await client.query(`DELETE FROM dm_character_actions WHERE character_id = $1`, [characterId]);

  for (const action of normalizeCharacterActions(actions)) {
    await client.query(
      `INSERT INTO dm_character_actions (
         id,
         character_id,
         system_id,
         action_key,
         name,
         description,
         action_type,
         uses_current,
         uses_max,
         cooldown_turns,
         metadata,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now()
       )`,
      [
        createId("action"),
        characterId,
        systemId,
        action.key ?? slugify(action.name),
        action.name,
        action.description ?? null,
        action.actionType,
        typeof action.usesCurrent === "number" ? action.usesCurrent : null,
        typeof action.usesMax === "number" ? action.usesMax : null,
        typeof action.cooldownTurns === "number" ? action.cooldownTurns : null,
        toJson(action.metadata ?? {})
      ]
    );
  }
};

const applyCharacterPatches = async (
  client: PoolClient,
  campaignId: string,
  systemId: string,
  patches: CharacterPatch[] | undefined
) => {
  if (!patches?.length) return;

  const plugin = getSystemPlugin(systemId);

  for (const patch of patches) {
    const characterResult = await client.query<{
      id: string;
      level: number;
      hp_current: number;
      hp_max: number;
      hp_temp: number;
      status: string;
      notes: string | null;
      archetype: string;
      name: string;
      user_id: string;
      campaign_id: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, level, hp_current, hp_max, hp_temp, status, notes, archetype, name, user_id, campaign_id, created_at, updated_at
       FROM dm_characters
       WHERE campaign_id = $1 AND id = $2
       LIMIT 1`,
      [campaignId, patch.characterId]
    );

    const row = characterResult.rows[0];
    if (!row) continue;

    const character: CharacterRecord = {
      id: row.id,
      campaignId: row.campaign_id,
      userId: row.user_id,
      name: row.name,
      archetype: row.archetype,
      level: row.level,
      hpCurrent: row.hp_current,
      hpMax: row.hp_max,
      hpTemp: row.hp_temp,
      status: row.status,
      notes: row.notes ?? undefined,
      inventory: [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };

    const normalizedPatch = plugin.normalizeCharacterPatch(character, patch);
    const hpCurrent =
      typeof normalizedPatch.hpDelta === "number"
        ? clamp(row.hp_current + normalizedPatch.hpDelta, 0, row.hp_max)
        : row.hp_current;

    const hpTemp =
      typeof normalizedPatch.hpTemp === "number"
        ? clamp(normalizedPatch.hpTemp, 0, 1000)
        : row.hp_temp;

    const status = normalizedPatch.status ?? row.status;
    const notes = normalizedPatch.notesAppend
      ? `${row.notes ? `${row.notes}\n` : ""}${nowIso()}: ${normalizedPatch.notesAppend}`
      : row.notes;

    await client.query(
      `UPDATE dm_characters
       SET hp_current = $3,
           hp_temp = $4,
           status = $5,
           notes = $6,
           updated_at = now()
       WHERE campaign_id = $1 AND id = $2`,
      [campaignId, patch.characterId, hpCurrent, hpTemp, status, notes ?? null]
    );

    await applyInventoryDelta(client, patch.characterId, normalizedPatch.inventoryDelta);
  }
};

const maybeCreateRollingSummary = async (client: PoolClient, campaignId: string, endTurnIndex: number) => {
  if (endTurnIndex % 6 !== 0) return;

  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM dm_memory_summaries
     WHERE campaign_id = $1 AND end_turn_index = $2
     LIMIT 1`,
    [campaignId, endTurnIndex]
  );
  if (existing.rows[0]) return;

  const turns = await client.query<{
    turn_index: number;
    action_text: string;
    llm_narration: string | null;
  }>(
    `SELECT turn_index, action_text, llm_narration
     FROM dm_turns
     WHERE campaign_id = $1
       AND status = 'applied'
       AND turn_index > $2
       AND turn_index <= $3
     ORDER BY turn_index ASC`,
    [campaignId, endTurnIndex - 6, endTurnIndex]
  );

  if (!turns.rows.length) return;

  const summary = turns.rows
    .map((turn) => `T${turn.turn_index}: ${turn.action_text} -> ${turn.llm_narration ?? "(no narration)"}`)
    .join("\n")
    .slice(0, 8000);

  await client.query(
    `INSERT INTO dm_memory_summaries (id, campaign_id, start_turn_index, end_turn_index, summary, source)
     VALUES ($1, $2, $3, $4, $5, 'system')`,
    [createId("summary"), campaignId, endTurnIndex - turns.rows.length + 1, endTurnIndex, summary]
  );
};

const upsertEmbedding = async (
  campaignId: string,
  sourceType: string,
  sourceId: string,
  textChunk: string,
  model: string
) => {
  const embedding = await embedTextWithCheshire(textChunk);
  if (!embedding) return;

  await dmQuery(
    `DELETE FROM dm_memory_embeddings
     WHERE campaign_id = $1 AND source_type = $2 AND source_id = $3`,
    [campaignId, sourceType, sourceId]
  );

  await dmQuery(
    `INSERT INTO dm_memory_embeddings (id, campaign_id, source_type, source_id, text_chunk, embedding, model, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())`,
    [createId("embed"), campaignId, sourceType, sourceId, textChunk.slice(0, 4000), toJson(embedding), model]
  );
};

const recordCheckpoint = async (client: PoolClient, campaignId: string, turnId: string, role: DmRole) => {
  const snapshot = await buildCampaignSnapshot(campaignId, role);
  await client.query(
    `INSERT INTO dm_checkpoints (id, campaign_id, turn_id, snapshot, created_at)
     VALUES ($1, $2, $3, $4::jsonb, now())`,
    [createId("checkpoint"), campaignId, turnId, toJson(snapshot)]
  );
  return snapshot;
};

export const parseRegisterInput = (body: unknown) => registerSchema.parse(body);
export const parseLoginInput = (body: unknown) => loginSchema.parse(body);
export const parseCreateCampaignInput = (body: unknown) => createCampaignSchema.parse(body);
export const parseCreateCharacterInput = (body: unknown) => createCharacterSchema.parse(body);
export const parsePatchCharacterInput = (body: unknown) => patchCharacterSchema.parse(body);
export const parseActionInput = (body: unknown) => actionSchema.parse(body);
export const parseRollInput = (body: unknown) => rollSchema.parse(body);
export const parseCreateInviteInput = (body: unknown) => createInviteSchema.parse(body);
export const parseAddFactInput = (body: unknown) => addFactSchema.parse(body);

export const recordDmAuthEvent = async (input: {
  userId: string;
  eventType: "login" | "register" | "logout";
  request?: Request;
  metadata?: Record<string, unknown>;
}) => {
  await ensureDmSchema();
  const forwardedFor = input.request?.headers.get("x-forwarded-for") ?? "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || null;
  const userAgent = input.request?.headers.get("user-agent") ?? null;
  const sessionKey = createId("sesslog");

  await dmQuery(
    `INSERT INTO dm_auth_events (id, user_id, event_type, session_key, ip_address, user_agent, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())`,
    [
      createId("auth"),
      input.userId,
      input.eventType,
      sessionKey,
      ipAddress,
      userAgent,
      toJson(input.metadata ?? {})
    ]
  );
};

export const registerDmUser = async (input: z.infer<typeof registerSchema>) => {
  await ensureDmSchema();

  const normalizedEmail = normalizeEmail(input.email);
  const existing = await dmQuery<{ id: string }>(
    `SELECT id FROM dm_users WHERE email_normalized = $1 LIMIT 1`,
    [normalizedEmail]
  );

  if (existing.rows[0]) {
    throw new Error("email_in_use");
  }

  const now = nowIso();
  const user: UserRecord = {
    id: createId("user"),
    email: input.email,
    emailNormalized: normalizedEmail,
    displayName: input.displayName,
    passwordHash: hashPassword(input.password),
    createdAt: now,
    lastLoginAt: now
  };

  await dmQuery(
    `INSERT INTO dm_users (id, email, email_normalized, display_name, password_hash, created_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)`,
    [
      user.id,
      user.email,
      user.emailNormalized,
      user.displayName,
      user.passwordHash,
      user.createdAt,
      user.lastLoginAt ?? null
    ]
  );

  return toPublicUser(user);
};

export const authenticateDmUser = async (input: z.infer<typeof loginSchema>) => {
  await ensureDmSchema();

  const normalizedEmail = normalizeEmail(input.email);
  const result = await dmQuery<{
    id: string;
    email: string;
    email_normalized: string;
    display_name: string;
    password_hash: string;
    created_at: Date;
    last_login_at: Date | null;
  }>(
    `SELECT id, email, email_normalized, display_name, password_hash, created_at, last_login_at
     FROM dm_users
     WHERE email_normalized = $1
     LIMIT 1`,
    [normalizedEmail]
  );

  const row = result.rows[0];
  if (!row) return null;

  if (!verifyPassword(input.password, row.password_hash)) {
    return null;
  }

  await dmQuery(`UPDATE dm_users SET last_login_at = now() WHERE id = $1`, [row.id]);

  return toPublicUser({
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: new Date().toISOString()
  });
};

export const getDmUserById = async (userId: string) => {
  await ensureDmSchema();

  const result = await dmQuery<{
    id: string;
    email: string;
    email_normalized: string;
    display_name: string;
    password_hash: string;
    created_at: Date;
    last_login_at: Date | null;
  }>(
    `SELECT id, email, email_normalized, display_name, password_hash, created_at, last_login_at
     FROM dm_users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return toPublicUser({
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : undefined
  });
};

export const listCampaignsForUser = async (userId: string): Promise<CampaignSummary[]> => {
  await ensureDmSchema();

  const result = await dmQuery<{
    id: string;
    name: string;
    system_id: string;
    description: string;
    role: DmRole;
    updated_at: Date;
    player_count: number;
    character_count: number;
    active_quest_count: number;
  }>(
    `SELECT c.id,
            c.name,
            c.system_id,
            c.description,
            m.role,
            c.updated_at,
            (SELECT COUNT(*)::int FROM dm_memberships m2 WHERE m2.campaign_id = c.id) as player_count,
            (SELECT COUNT(*)::int FROM dm_characters ch WHERE ch.campaign_id = c.id) as character_count,
            (SELECT COUNT(*)::int FROM dm_quests q WHERE q.campaign_id = c.id AND q.status = 'active') as active_quest_count
     FROM dm_memberships m
     JOIN dm_campaigns c ON c.id = m.campaign_id
     WHERE m.user_id = $1
     ORDER BY c.updated_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    systemId: row.system_id,
    description: row.description,
    role: row.role,
    playerCount: row.player_count,
    characterCount: row.character_count,
    activeQuestCount: row.active_quest_count,
    updatedAt: row.updated_at.toISOString()
  }));
};

export const createCampaignForUser = async (
  userId: string,
  input: z.infer<typeof createCampaignSchema>
): Promise<CampaignSnapshot> => {
  await ensureDmSchema();
  const systemExists = await dmQuery<{ id: string }>(
    `SELECT id
     FROM dm_systems
     WHERE id = $1
     LIMIT 1`,
    [input.systemId]
  );
  if (!systemExists.rows[0]) throw new Error("system_not_supported");

  const plugin = getSystemPlugin(input.systemId);
  const seed = applyWorldSeedOverrides(
    plugin.seedWorld({ campaignName: input.name, description: input.description }),
    input.name,
    input.worldSeed
  );
  const campaignId = createId("camp");
  const initialQuestId = createId("quest");
  const worldSeedFacts = buildWorldSeedFacts(input.name, input.worldSeed);

  await withDmTransaction(async (client) => {
    await client.query(
      `INSERT INTO dm_campaigns (id, name, system_id, description, created_by_user_id, status, story_summary, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, now(), now())`,
      [campaignId, input.name, input.systemId, input.description, userId, "Campaign created"]
    );

    await client.query(
      `INSERT INTO dm_memberships (user_id, campaign_id, role, joined_at)
       VALUES ($1, $2, 'dm', now())`,
      [userId, campaignId]
    );

    await client.query(
      `INSERT INTO dm_world_state (campaign_id, version, location, world_time, weather, active_threats, scene_summary, story_beat, visual_prompt, updated_at)
       VALUES ($1, 1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())`,
      [
        campaignId,
        seed.worldState.location,
        seed.worldState.worldTime,
        seed.worldState.weather,
        toJson(seed.worldState.activeThreats),
        seed.worldState.sceneSummary,
        seed.worldState.storyBeat,
        seed.worldState.visualPrompt
      ]
    );

    await client.query(
      `INSERT INTO dm_quests (id, campaign_id, title, summary, status, progress, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 0, now(), now())`,
      [initialQuestId, campaignId, seed.initialQuest.title, seed.initialQuest.summary]
    );

    let ord = 0;
    for (const objective of seed.initialQuest.objectives) {
      await client.query(
        `INSERT INTO dm_quest_objectives (id, quest_id, ord, text, completed)
         VALUES ($1, $2, $3, $4, false)`,
        [createId("objective"), initialQuestId, ord, objective]
      );
      ord += 1;
    }

    if (worldSeedFacts.length) {
      await insertWorldSeedFacts(client, campaignId, worldSeedFacts);
    }

    await client.query(
      `INSERT INTO dm_events (id, campaign_id, type, actor_user_id, summary, payload, created_at)
       VALUES ($1, $2, 'world_created', $3, $4, $5::jsonb, now())`,
      [
        createId("event"),
        campaignId,
        userId,
        `Campaign '${input.name}' created`,
        toJson({
          systemId: input.systemId,
          description: input.description,
          worldSeed: input.worldSeed ?? null
        })
      ]
    );
  });

  return getCampaignSnapshotForUser(userId, campaignId);
};

export const bootstrapCampaign = async (
  userId: string,
  campaignId: string,
  seedPrompt?: string
): Promise<DmTurnPatch> => {
  const campaignMeta = await dmQuery<{ name: string; system_id: string }>(
    `SELECT name, system_id
     FROM dm_campaigns
     WHERE id = $1
     LIMIT 1`,
    [campaignId]
  );
  const campaignName = campaignMeta.rows[0]?.name ?? "the campaign";
  const systemId = campaignMeta.rows[0]?.system_id ?? "generic";
  const plugin = getSystemPlugin(systemId);

  const result = await processCampaignAction(userId, campaignId, {
    actionText:
      seedPrompt?.trim() ||
      `Generate opening narration for '${campaignName}', establish the first scene, and set immediate stakes for this ${plugin.displayName} campaign.`,
    idempotencyKey: `bootstrap-${campaignId}`
  });

  return result.turn;
};

export const getCampaignSnapshotForUser = async (
  userId: string,
  campaignId: string
): Promise<CampaignSnapshot> => {
  await assertMembership(campaignId, userId);
  const role = (await loadMembershipRole(campaignId, userId)) as DmRole;
  return buildCampaignSnapshot(campaignId, role);
};

export const getCampaignContextForUser = async (
  userId: string,
  campaignId: string,
  actionText: string,
  actorCharacterId?: string
) => {
  await assertMembership(campaignId, userId);
  return buildContextPacket(campaignId, actionText, actorCharacterId);
};

export const createCharacterInCampaign = async (
  userId: string,
  campaignId: string,
  input: z.infer<typeof createCharacterSchema>
): Promise<CharacterRecord> => {
  await ensureDmSchema();
  await assertMembership(campaignId, userId);

  const bundle = await loadCampaignBundle(campaignId);
  const plugin = getSystemPlugin(bundle.campaign.systemId);
  const template = await getArchetypeTemplate(bundle.campaign.systemId, input.archetype);

  const resolvedAttributes = normalizeCharacterAttributes(input.attributes ?? template?.attributes);
  const resolvedActions = normalizeCharacterActions(input.actions ?? template?.actions);
  const resolvedSpecialTraits = (input.specialTraits ?? template?.specialTraits ?? []).slice(0, 50);
  const resolvedPlayerType = input.playerType ?? template?.playerType ?? input.archetype;
  const resolvedSystemData = {
    ...(template
      ? {
          templateApplied: template.playerType ?? input.archetype,
          templateCompendiumEntryId: template.entryId
        }
      : {}),
    ...(input.systemData ?? {})
  };

  const character = plugin.normalizeCharacter({
    id: createId("char"),
    campaignId,
    userId,
    name: input.name,
    archetype: input.archetype,
    archetypeEntryId: template?.entryId,
    playerType: resolvedPlayerType,
    level: input.level,
    hpCurrent: input.hpCurrent,
    hpMax: input.hpMax,
    hpTemp: input.hpTemp,
    status: input.status,
    notes: input.notes,
    specialTraits: resolvedSpecialTraits,
    systemData: resolvedSystemData,
    inventory: normalizeInventorySeed(input.inventory).map((item) => ({
      id: createId("item"),
      name: item.name,
      detail: item.detail,
      quantity: item.quantity
    })),
    attributes: resolvedAttributes.map((attribute) => ({
      id: createId("attr"),
      key: attribute.key,
      valueNumber: attribute.valueNumber,
      valueText: attribute.valueText,
      valueJson: attribute.valueJson,
      source: attribute.source,
      updatedAt: nowIso()
    })),
    actions: resolvedActions.map((action) => ({
      id: createId("action"),
      key: action.key ?? slugify(action.name),
      name: action.name,
      description: action.description,
      actionType: action.actionType,
      usesCurrent: action.usesCurrent,
      usesMax: action.usesMax,
      cooldownTurns: action.cooldownTurns,
      metadata: action.metadata,
      updatedAt: nowIso()
    })),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  await withDmTransaction(async (client) => {
    await client.query(
      `INSERT INTO dm_characters (
         id, campaign_id, user_id, name, archetype, archetype_entry_id, player_type, level, hp_current, hp_max, hp_temp, status, notes, special_traits, system_data, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, now(), now())`,
      [
        character.id,
        campaignId,
        userId,
        character.name,
        character.archetype,
        character.archetypeEntryId ?? null,
        character.playerType ?? null,
        character.level,
        character.hpCurrent,
        character.hpMax,
        character.hpTemp,
        character.status,
        character.notes ?? null,
        toJson(character.specialTraits ?? []),
        toJson(character.systemData ?? {})
      ]
    );

    for (const item of character.inventory) {
      await client.query(
        `INSERT INTO dm_inventory_items (id, character_id, name, detail, quantity, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [item.id, character.id, item.name, item.detail ?? null, item.quantity]
      );
    }

    await upsertCharacterAttributes(client, character.id, bundle.campaign.systemId, resolvedAttributes);
    await replaceCharacterActions(client, character.id, bundle.campaign.systemId, resolvedActions);

    await client.query(`UPDATE dm_campaigns SET updated_at = now() WHERE id = $1`, [campaignId]);

    await client.query(
      `INSERT INTO dm_events (id, campaign_id, type, actor_user_id, actor_character_id, summary, payload, created_at)
       VALUES ($1, $2, 'character_created', $3, $4, $5, $6::jsonb, now())`,
      [
        createId("event"),
        campaignId,
        userId,
        character.id,
        `Character created: ${character.name}`,
        toJson({
          archetype: character.archetype,
          playerType: character.playerType,
          level: character.level,
          hp: [character.hpCurrent, character.hpMax],
          specialTraits: character.specialTraits ?? [],
          attributeCount: character.attributes?.length ?? 0,
          actionCount: character.actions?.length ?? 0
        })
      ]
    );
  });

  const snapshot = await getCampaignSnapshotForUser(userId, campaignId);
  const created = snapshot.characters.find((entry) => entry.id === character.id);
  if (!created) throw new Error("character_not_found");
  return created;
};

export const patchCharacterInCampaign = async (
  userId: string,
  campaignId: string,
  characterId: string,
  input: z.infer<typeof patchCharacterSchema>
): Promise<CharacterRecord> => {
  await ensureDmSchema();
  const role = await assertMembership(campaignId, userId);
  if (role !== "dm") throw new Error("forbidden");

  const campaignMeta = await dmQuery<{ system_id: string }>(
    `SELECT system_id
     FROM dm_campaigns
     WHERE id = $1
     LIMIT 1`,
    [campaignId]
  );
  if (!campaignMeta.rows[0]) throw new Error("campaign_not_found");
  const systemId = campaignMeta.rows[0].system_id;

  await withDmTransaction(async (client) => {
    const characterResult = await client.query<{
      id: string;
      hp_current: number;
      hp_max: number;
      hp_temp: number;
      status: string;
      notes: string | null;
      player_type: string | null;
      special_traits: unknown;
      system_data: Record<string, unknown> | null;
    }>(
      `SELECT id, hp_current, hp_max, hp_temp, status, notes, player_type, special_traits, system_data
       FROM dm_characters
       WHERE campaign_id = $1 AND id = $2
       LIMIT 1`,
      [campaignId, characterId]
    );

    const row = characterResult.rows[0];
    if (!row) throw new Error("character_not_found");

    const hpMax = typeof input.hpMax === "number" ? input.hpMax : row.hp_max;
    const hpCurrent =
      typeof input.hpCurrent === "number" ? clamp(input.hpCurrent, 0, hpMax) : clamp(row.hp_current, 0, hpMax);
    const hpTemp = typeof input.hpTemp === "number" ? input.hpTemp : row.hp_temp;

    const notes = input.notesAppend
      ? `${row.notes ? `${row.notes}\n` : ""}${nowIso()}: ${input.notesAppend}`
      : row.notes;
    const specialTraits = input.specialTraits ? input.specialTraits.slice(0, 50) : toStringArray(row.special_traits);
    const systemData = input.systemData ? { ...(row.system_data ?? {}), ...input.systemData } : row.system_data ?? {};

    await client.query(
      `UPDATE dm_characters
       SET hp_current = $3,
           hp_max = $4,
           hp_temp = $5,
           player_type = COALESCE($6, player_type),
           special_traits = $7::jsonb,
           system_data = $8::jsonb,
           status = COALESCE($10, status),
           notes = $9,
           updated_at = now()
       WHERE campaign_id = $1 AND id = $2`,
      [
        campaignId,
        characterId,
        hpCurrent,
        hpMax,
        hpTemp,
        input.playerType ?? null,
        toJson(specialTraits),
        toJson(systemData),
        notes ?? null,
        input.status ?? null
      ]
    );

    await applyInventoryDelta(client, characterId, input.inventoryDelta);
    await upsertCharacterAttributes(client, characterId, systemId, input.attributes);
    await replaceCharacterActions(client, characterId, systemId, input.actions);

    await client.query(`UPDATE dm_campaigns SET updated_at = now() WHERE id = $1`, [campaignId]);
    await client.query(
      `INSERT INTO dm_events (id, campaign_id, type, actor_user_id, actor_character_id, summary, payload, created_at)
       VALUES ($1, $2, 'character_update', $3, $4, $5, $6::jsonb, now())`,
      [
        createId("event"),
        campaignId,
        userId,
        characterId,
        "Character patched",
        toJson(input)
      ]
    );
  });

  const snapshot = await getCampaignSnapshotForUser(userId, campaignId);
  const character = snapshot.characters.find((entry) => entry.id === characterId);
  if (!character) throw new Error("character_not_found");
  return character;
};

export const processCampaignAction = async (
  userId: string,
  campaignId: string,
  input: z.infer<typeof actionSchema>
) => {
  await ensureDmSchema();

  return withCampaignLock(campaignId, async (client) => {
    const role = await assertMembership(campaignId, userId);

    if (input.idempotencyKey) {
      const replay = await resolveIdempotentAction(client, campaignId, input.idempotencyKey);
      if (replay) return replay;
    }

    const campaignMeta = await client.query<{ system_id: string }>(
      `SELECT system_id FROM dm_campaigns WHERE id = $1 LIMIT 1`,
      [campaignId]
    );
    if (!campaignMeta.rows[0]) throw new Error("campaign_not_found");

    if (input.actorCharacterId) {
      const actor = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id
         FROM dm_characters
         WHERE campaign_id = $1 AND id = $2
         LIMIT 1`,
        [campaignId, input.actorCharacterId]
      );
      if (!actor.rows[0]) throw new Error("character_not_found");
      if (role !== "dm" && actor.rows[0].user_id !== userId) throw new Error("forbidden");
    }

    const session = await ensureActiveSession(client, campaignId, userId);

    const turnIndexResult = await client.query<{ next_turn: number }>(
      `SELECT COALESCE(MAX(turn_index), 0) + 1 as next_turn
       FROM dm_turns
       WHERE campaign_id = $1`,
      [campaignId]
    );
    const turnIndex = turnIndexResult.rows[0]?.next_turn ?? 1;
    const turnId = createId("turn");

    const context = await buildContextPacket(campaignId, input.actionText, input.actorCharacterId);

    try {
      await client.query(
        `INSERT INTO dm_turns (
           id, campaign_id, session_id, turn_index, idempotency_key,
           actor_user_id, actor_character_id, action_text, context_payload,
           status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'processing', now())`,
        [
          turnId,
          campaignId,
          session.id,
          turnIndex,
          input.idempotencyKey ?? null,
          userId,
          input.actorCharacterId ?? null,
          input.actionText,
          toJson(context)
        ]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (input.idempotencyKey && pgError.code === "23505") {
        const replay = await resolveIdempotentAction(client, campaignId, input.idempotencyKey);
        if (replay) return replay;
        throw new Error("turn_in_progress");
      }
      throw error;
    }

    const playerEventId = createId("event");
    await client.query(
      `INSERT INTO dm_events (id, campaign_id, session_id, turn_id, type, actor_user_id, actor_character_id, summary, payload, created_at)
       VALUES ($1, $2, $3, $4, 'player_action', $5, $6, $7, $8::jsonb, now())`,
      [
        playerEventId,
        campaignId,
        session.id,
        turnId,
        userId,
        input.actorCharacterId ?? null,
        input.actionText.slice(0, 280),
        toJson({ actionText: input.actionText })
      ]
    );

    let llmPatch: DmTurnPatch;
    let llmModel = process.env.CHESHIRE_MODEL ?? "unknown";
    let promptHash = "";
    let llmResponseText = "";
    let llmPromptPayload: Record<string, unknown> = {};
    let llmResponseJson: Record<string, unknown> | undefined;
    let llmLatencyMs = 0;
    let llmSuccess = true;
    let llmError: string | null = null;

    try {
      const llm = await runContextAwareDmTurn(context);
      llmPatch = llm.patch;
      llmModel = llm.model;
      promptHash = llm.promptHash;
      llmResponseText = llm.responseText;
      llmPromptPayload = llm.promptPayload;
      llmResponseJson = llm.responseJson;
      llmLatencyMs = llm.latencyMs;
    } catch (error) {
      const firstError = error instanceof Error ? error.message : "unknown_llm_error";
      try {
        const compactContext = compactContextForRetry(context);
        const llm = await runContextAwareDmTurn(compactContext);
        llmPatch = llm.patch;
        llmModel = llm.model;
        promptHash = llm.promptHash;
        llmResponseText = llm.responseText;
        llmPromptPayload = {
          ...llm.promptPayload,
          compactRetry: true,
          initialError: firstError
        };
        llmResponseJson = llm.responseJson;
        llmLatencyMs = llm.latencyMs;
      } catch (retryError) {
        llmSuccess = false;
        const retryMessage =
          retryError instanceof Error ? retryError.message : "unknown_llm_retry_error";
        llmError = `${firstError};retry:${retryMessage}`;
        llmPatch = createFallbackTurn(input.actionText);
        llmModel = "fallback";
        promptHash = crypto.createHash("sha256").update(input.actionText).digest("hex");
        llmResponseText = llmPatch.narration;
        llmPromptPayload = { fallback: true, actionText: input.actionText, initialError: firstError };
        llmResponseJson = undefined;
        llmLatencyMs = 0;
      }
    }

    const plugin = getSystemPlugin(campaignMeta.rows[0].system_id);
    const normalizedPatch: DmTurnPatch = {
      ...llmPatch,
      characterPatches: (llmPatch.characterPatches ?? []).map((patch) =>
        plugin.normalizeCharacterPatch(
          {
            id: patch.characterId,
            campaignId,
            userId,
            name: "",
            archetype: "",
            level: 1,
            hpCurrent: 1,
            hpMax: 1,
            hpTemp: 0,
            status: "",
            inventory: [],
            createdAt: nowIso(),
            updatedAt: nowIso()
          },
          patch
        )
      ),
      questPatches: (llmPatch.questPatches ?? []).map((quest) => ({
        ...quest,
        progress: typeof quest.progress === "number" ? clamp(Math.round(quest.progress), 0, 100) : quest.progress
      }))
    };

    await client.query("BEGIN");
    try {
      if (normalizedPatch.worldPatch) {
        await client.query(
          `UPDATE dm_world_state
           SET location = COALESCE($2, location),
               world_time = COALESCE($3, world_time),
               weather = COALESCE($4, weather),
               active_threats = COALESCE($5::jsonb, active_threats),
               scene_summary = COALESCE($6, scene_summary),
               story_beat = COALESCE($7, story_beat),
               visual_prompt = COALESCE($8, visual_prompt),
               version = version + 1,
               updated_at = now()
           WHERE campaign_id = $1`,
          [
            campaignId,
            normalizedPatch.worldPatch.location ?? null,
            normalizedPatch.worldPatch.worldTime ?? null,
            normalizedPatch.worldPatch.weather ?? null,
            normalizedPatch.worldPatch.activeThreats ? toJson(normalizedPatch.worldPatch.activeThreats) : null,
            normalizedPatch.worldPatch.sceneSummary ?? null,
            normalizedPatch.worldPatch.storyBeat ?? null,
            normalizedPatch.worldPatch.visualPrompt ?? null
          ]
        );
      }

      await applyQuestPatches(client, campaignId, normalizedPatch.questPatches);
      await applyCharacterPatches(
        client,
        campaignId,
        campaignMeta.rows[0].system_id,
        normalizedPatch.characterPatches
      );
      await writePatchStateTransitions(
        client,
        {
          campaignId,
          sessionId: session.id,
          turnId,
          sourceType: "dm_turn",
          sourceId: turnId,
          actorUserId: userId,
          actorCharacterId: input.actorCharacterId ?? null
        },
        normalizedPatch
      );
      await upsertAutoFacts(client, campaignId, normalizedPatch);
      await recordPatchEvents(client, campaignId, session.id, turnId, userId, normalizedPatch);

      const dmEventId = createId("event");
      await client.query(
        `INSERT INTO dm_events (id, campaign_id, session_id, turn_id, type, actor_user_id, summary, payload, created_at)
         VALUES ($1, $2, $3, $4, 'dm_response', $5, $6, $7::jsonb, now())`,
        [
          dmEventId,
          campaignId,
          session.id,
          turnId,
          userId,
          normalizedPatch.shortSummary ?? normalizedPatch.narration.slice(0, 280),
          toJson({ narration: normalizedPatch.narration, patch: normalizedPatch })
        ]
      );

      await client.query(
        `UPDATE dm_sessions
         SET current_turn = $2
         WHERE id = $1`,
        [session.id, turnIndex]
      );

      await client.query(
        `UPDATE dm_campaigns
         SET updated_at = now(),
             story_summary = COALESCE($2, story_summary)
         WHERE id = $1`,
        [campaignId, normalizedPatch.shortSummary ?? null]
      );

      await client.query(
        `UPDATE dm_turns
         SET llm_narration = $2,
             llm_patch = $3::jsonb,
             applied_patch = $4::jsonb,
             prompt_hash = $5,
             model = $6,
             status = 'applied',
             applied_at = now()
         WHERE id = $1`,
        [turnId, normalizedPatch.narration, toJson(llmPatch), toJson(normalizedPatch), promptHash, llmModel]
      );

      await client.query(
        `INSERT INTO dm_llm_calls (
          id, campaign_id, turn_id, provider, model, prompt, response_text, response_json, latency_ms, success, error_text, created_at
        ) VALUES ($1, $2, $3, 'cheshire', $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10, now())`,
        [
          createId("llm"),
          campaignId,
          turnId,
          llmModel,
          toJson(llmPromptPayload),
          llmResponseText,
          llmResponseJson ? toJson(llmResponseJson) : null,
          llmLatencyMs,
          llmSuccess,
          llmError
        ]
      );

      await maybeCreateRollingSummary(client, campaignId, turnIndex);

      const snapshot = await recordCheckpoint(client, campaignId, turnId, role);
      const resultPayload = {
        turn: normalizedPatch,
        snapshot,
        meta: {
          turnId,
          sessionId: session.id,
          turnIndex
        }
      };

      await client.query(
        `UPDATE dm_turns
         SET result_payload = $2::jsonb
         WHERE id = $1`,
        [turnId, toJson(resultPayload)]
      );

      await client.query("COMMIT");

      // Non-blocking memory embeddings for context retrieval.
      void upsertEmbedding(campaignId, "player_action", playerEventId, input.actionText, llmModel);
      void upsertEmbedding(campaignId, "dm_narration", turnId, normalizedPatch.narration, llmModel);
      if (normalizedPatch.shortSummary) {
        void upsertEmbedding(campaignId, "turn_summary", turnId, normalizedPatch.shortSummary, llmModel);
      }

      return resultPayload;
    } catch (error) {
      await client.query("ROLLBACK");

      await client.query(
        `UPDATE dm_turns
         SET status = 'failed',
             llm_narration = $2,
             llm_patch = $3::jsonb,
             prompt_hash = $4,
             model = $5,
             applied_at = now()
         WHERE id = $1`,
        [turnId, llmResponseText, toJson(llmPatch), promptHash, llmModel]
      );

      throw error;
    }
  });
};

const summarizeDiceRoll = (actorName: string, roll: DiceRollResult, reason?: string) => {
  const modifierToken = roll.modifier
    ? roll.modifier > 0
      ? ` + ${roll.modifier}`
      : ` - ${Math.abs(roll.modifier)}`
    : "";
  const critToken = roll.criticalSuccess
    ? " (critical success)"
    : roll.criticalFailure
      ? " (critical failure)"
      : "";
  const why = reason ? ` for ${clampText(reason, 180)}` : "";
  return `${actorName} rolled ${roll.expression}: ${roll.total} (${roll.rolls.join(" + ")}${modifierToken})${critToken}${why}`;
};

export const rollCampaignDice = async (
  userId: string,
  campaignId: string,
  input: z.infer<typeof rollSchema>
): Promise<DiceRollOutcome> => {
  await ensureDmSchema();
  const role = await assertMembership(campaignId, userId);

  let actorCharacterId: string | undefined = input.actorCharacterId;
  let actorName = "Player";

  if (actorCharacterId) {
    const actorResult = await dmQuery<{ id: string; user_id: string; name: string }>(
      `SELECT id, user_id, name
       FROM dm_characters
       WHERE campaign_id = $1 AND id = $2
       LIMIT 1`,
      [campaignId, actorCharacterId]
    );
    const actor = actorResult.rows[0];
    if (!actor) throw new Error("character_not_found");
    if (role !== "dm" && actor.user_id !== userId) throw new Error("forbidden");
    actorName = actor.name;
  } else if (role !== "dm") {
    const ownedResult = await dmQuery<{ id: string; name: string }>(
      `SELECT id, name
       FROM dm_characters
       WHERE campaign_id = $1 AND user_id = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [campaignId, userId]
    );
    const owned = ownedResult.rows[0];
    if (owned) {
      actorCharacterId = owned.id;
      actorName = owned.name;
    }
  }

  const existingRoll =
    input.idempotencyKey && input.idempotencyKey.trim().length > 0
      ? await dmQuery<{
          id: string;
          turn_id: string | null;
          expression: string;
          dice_count: number;
          dice_sides: number;
          modifier: number;
          rolls: unknown;
          total: number;
          critical_success: boolean;
          critical_failure: boolean;
          summary: string;
          reason: string | null;
          outcome_status: string;
        }>(
          `SELECT id, turn_id, expression, dice_count, dice_sides, modifier, rolls, total,
                  critical_success, critical_failure, summary, reason, outcome_status
           FROM dm_dice_rolls
           WHERE campaign_id = $1
             AND request_idempotency_key = $2
           LIMIT 1`,
          [campaignId, input.idempotencyKey]
        )
      : null;

  const existingRow = existingRoll?.rows[0];
  if (existingRow) {
    const replayRoll: DiceRollResult = {
      expression: existingRow.expression,
      count: existingRow.dice_count,
      sides: existingRow.dice_sides,
      modifier: existingRow.modifier,
      rolls: Array.isArray(existingRow.rolls)
        ? existingRow.rolls.filter((value): value is number => typeof value === "number")
        : [],
      total: existingRow.total,
      criticalSuccess: existingRow.critical_success,
      criticalFailure: existingRow.critical_failure
    };

    const replay: DiceRollOutcome = {
      roll: replayRoll,
      summary: existingRow.summary,
      diceRollId: existingRow.id,
      outcomeStatus: existingRow.outcome_status,
      resolutionTurnId: existingRow.turn_id ?? undefined
    };

    if (existingRow.turn_id) {
      const turnResult = await dmQuery<{ result_payload: ActionResultPayload | null }>(
        `SELECT result_payload
         FROM dm_turns
         WHERE campaign_id = $1 AND id = $2
         LIMIT 1`,
        [campaignId, existingRow.turn_id]
      );
      const payload = turnResult.rows[0]?.result_payload ?? null;
      if (payload) {
        replay.resolution = payload;
      }
    }

    if (!replay.resolution) {
      replay.snapshot = await getCampaignSnapshotForUser(userId, campaignId);
    }
    return replay;
  }

  const roll = rollDice(input.expression);
  const summary = summarizeDiceRoll(actorName, roll, input.reason);
  const diceRollId = createId("roll");
  let persistedOutcomeStatus = input.autoResolve ? "pending_resolution" : "recorded";

  await withDmTransaction(async (client) => {
    const sessionResult = await client.query<{ id: string }>(
      `SELECT id
       FROM dm_sessions
       WHERE campaign_id = $1
         AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`,
      [campaignId]
    );
    const activeSessionId = sessionResult.rows[0]?.id ?? null;

    await client.query(
      `INSERT INTO dm_events (id, campaign_id, type, actor_user_id, actor_character_id, summary, payload, created_at)
       VALUES ($1, $2, 'dice_roll', $3, $4, $5, $6::jsonb, now())`,
      [
        createId("event"),
        campaignId,
        userId,
        actorCharacterId ?? null,
        summary,
        toJson({
          diceRollId,
          expression: roll.expression,
          count: roll.count,
          sides: roll.sides,
          modifier: roll.modifier,
          rolls: roll.rolls,
          total: roll.total,
          criticalSuccess: roll.criticalSuccess,
          criticalFailure: roll.criticalFailure,
          reason: input.reason ?? null
        })
      ]
    );

    await client.query(
      `INSERT INTO dm_dice_rolls (
         id,
         campaign_id,
         session_id,
         actor_user_id,
         actor_character_id,
         expression,
         dice_count,
         dice_sides,
         modifier,
         rolls,
         total,
         critical_success,
         critical_failure,
         reason,
         summary,
         outcome_status,
         request_idempotency_key,
         created_at
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, now()
       )`,
      [
        diceRollId,
        campaignId,
        activeSessionId,
        userId,
        actorCharacterId ?? null,
        roll.expression,
        roll.count,
        roll.sides,
        roll.modifier,
        toJson(roll.rolls),
        roll.total,
        roll.criticalSuccess,
        roll.criticalFailure,
        input.reason ?? null,
        summary,
        persistedOutcomeStatus,
        input.idempotencyKey ?? null
      ]
    );

    await writeStateTransition(
      client,
      {
        campaignId,
        sessionId: activeSessionId,
        sourceType: "dice_roll",
        sourceId: diceRollId,
        actorUserId: userId,
        actorCharacterId: actorCharacterId ?? null
      },
      {
        entityType: "dice_roll",
        entityId: diceRollId,
        fieldPath: "outcomeStatus",
        transitionType: "set",
        newValue: persistedOutcomeStatus,
        metadata: {
          expression: roll.expression,
          total: roll.total,
          criticalSuccess: roll.criticalSuccess,
          criticalFailure: roll.criticalFailure
        }
      }
    );

    await client.query(`UPDATE dm_campaigns SET updated_at = now() WHERE id = $1`, [campaignId]);
  });

  if (!input.autoResolve) {
    return {
      roll,
      summary,
      diceRollId,
      outcomeStatus: persistedOutcomeStatus,
      snapshot: await getCampaignSnapshotForUser(userId, campaignId)
    };
  }

  const actionText = [
    summary,
    input.reason ? `Intent: ${clampText(input.reason, 300)}.` : "Resolve consequences and advance the scene.",
    "Use the roll result as authoritative for outcome framing."
  ].join(" ");

  try {
    const resolution = await processCampaignAction(userId, campaignId, {
      actionText,
      actorCharacterId,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:resolve` : undefined
    });

    persistedOutcomeStatus = "resolved";
    await withDmTransaction(async (client) => {
      await client.query(
        `UPDATE dm_dice_rolls
         SET session_id = COALESCE($3, session_id),
             turn_id = $4,
             outcome_status = 'resolved',
             outcome_summary = $5,
             outcome_payload = $6::jsonb,
             resolved_at = now()
         WHERE id = $1
           AND campaign_id = $2`,
        [
          diceRollId,
          campaignId,
          resolution.meta?.sessionId ?? null,
          resolution.meta?.turnId ?? null,
          resolution.turn.shortSummary ?? resolution.turn.narration.slice(0, 280),
          toJson({
            turn: resolution.turn,
            meta: resolution.meta ?? null
          })
        ]
      );

      await writeStateTransition(
        client,
        {
          campaignId,
          sessionId: resolution.meta?.sessionId ?? null,
          turnId: resolution.meta?.turnId ?? null,
          sourceType: "dice_roll",
          sourceId: diceRollId,
          actorUserId: userId,
          actorCharacterId: actorCharacterId ?? null
        },
        {
          entityType: "dice_roll",
          entityId: diceRollId,
          fieldPath: "outcomeStatus",
          transitionType: "set",
          oldValue: "pending_resolution",
          newValue: "resolved",
          metadata: {
            turnId: resolution.meta?.turnId ?? null,
            turnIndex: resolution.meta?.turnIndex ?? null
          }
        }
      );
    });

    return {
      roll,
      summary,
      diceRollId,
      outcomeStatus: persistedOutcomeStatus,
      resolutionTurnId: resolution.meta?.turnId,
      resolution
    };
  } catch (error) {
    persistedOutcomeStatus = "failed";
    await withDmTransaction(async (client) => {
      await client.query(
        `UPDATE dm_dice_rolls
         SET outcome_status = 'failed',
             outcome_summary = $3,
             outcome_payload = $4::jsonb,
             resolved_at = now()
         WHERE id = $1
           AND campaign_id = $2`,
        [
          diceRollId,
          campaignId,
          "Auto-resolution failed",
          toJson({
            error: error instanceof Error ? error.message : String(error)
          })
        ]
      );

      await writeStateTransition(
        client,
        {
          campaignId,
          sourceType: "dice_roll",
          sourceId: diceRollId,
          actorUserId: userId,
          actorCharacterId: actorCharacterId ?? null
        },
        {
          entityType: "dice_roll",
          entityId: diceRollId,
          fieldPath: "outcomeStatus",
          transitionType: "set",
          oldValue: "pending_resolution",
          newValue: "failed",
          metadata: {
            reason: error instanceof Error ? error.message : String(error)
          }
        }
      );
    });
    throw error;
  }
};

export const createCampaignInvite = async (
  userId: string,
  campaignId: string,
  input: z.infer<typeof createInviteSchema>
) => {
  const role = await assertMembership(campaignId, userId);
  if (role !== "dm") throw new Error("forbidden");

  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString();
  const inviteId = createId("invite");

  await dmQuery(
    `INSERT INTO dm_campaign_invites (id, campaign_id, created_by_user_id, role, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, now())`,
    [inviteId, campaignId, userId, input.role, tokenHash, expiresAt]
  );

  return {
    id: inviteId,
    token,
    role: input.role,
    expiresAt
  };
};

export const acceptCampaignInvite = async (userId: string, token: string) => {
  const tokenHash = hashInviteToken(token);

  return withDmTransaction(async (client) => {
    const inviteResult = await client.query<{
      id: string;
      campaign_id: string;
      role: DmRole;
      expires_at: Date | null;
      accepted_at: Date | null;
    }>(
      `SELECT id, campaign_id, role, expires_at, accepted_at
       FROM dm_campaign_invites
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    const invite = inviteResult.rows[0];
    if (!invite) throw new Error("invite_not_found");
    if (invite.accepted_at) throw new Error("invite_used");
    if (invite.expires_at && invite.expires_at.getTime() < Date.now()) throw new Error("invite_expired");

    await client.query(
      `INSERT INTO dm_memberships (user_id, campaign_id, role, joined_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, campaign_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [userId, invite.campaign_id, invite.role]
    );

    await client.query(
      `UPDATE dm_campaign_invites
       SET accepted_by_user_id = $2,
           accepted_at = now()
       WHERE id = $1`,
      [invite.id, userId]
    );

    await client.query(
      `INSERT INTO dm_events (id, campaign_id, type, actor_user_id, summary, payload, created_at)
       VALUES ($1, $2, 'player_joined', $3, $4, $5::jsonb, now())`,
      [createId("event"), invite.campaign_id, userId, "Player joined campaign", toJson({ viaInvite: invite.id })]
    );

    return {
      campaignId: invite.campaign_id,
      role: invite.role
    };
  });
};

export const listPinnedFactsForCampaign = async (userId: string, campaignId: string) => {
  await assertMembership(campaignId, userId);

  const result = await dmQuery<{
    id: string;
    kind: string;
    fact_text: string;
    confidence: number;
    pinned: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, kind, fact_text, confidence, pinned, created_at, updated_at
     FROM dm_memory_facts
     WHERE campaign_id = $1
     ORDER BY pinned DESC, updated_at DESC`,
    [campaignId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    factText: row.fact_text,
    confidence: row.confidence,
    pinned: row.pinned,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));
};

export const addPinnedFactToCampaign = async (
  userId: string,
  campaignId: string,
  input: z.infer<typeof addFactSchema>
) => {
  await assertMembership(campaignId, userId);

  const factId = createId("fact");
  await dmQuery(
    `INSERT INTO dm_memory_facts (id, campaign_id, kind, fact_text, confidence, pinned, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
    [factId, campaignId, input.kind, input.factText, input.confidence, input.pinned]
  );

  await dmQuery(
    `INSERT INTO dm_events (id, campaign_id, type, actor_user_id, summary, payload, created_at)
     VALUES ($1, $2, 'state_patch', $3, $4, $5::jsonb, now())`,
    [createId("event"), campaignId, userId, "Pinned fact added", toJson({ factId, kind: input.kind })]
  );

  void upsertEmbedding(campaignId, "pinned_fact", factId, input.factText, process.env.CHESHIRE_EMBED_MODEL ?? "embed");

  return {
    id: factId,
    ...input
  };
};

export const getTurnReplay = async (userId: string, campaignId: string, turnId: string) => {
  await assertMembership(campaignId, userId);

  const turnResult = await dmQuery<{
    id: string;
    turn_index: number;
    action_text: string;
    context_payload: Record<string, unknown> | null;
    llm_narration: string | null;
    llm_patch: Record<string, unknown> | null;
    applied_patch: Record<string, unknown> | null;
    prompt_hash: string | null;
    model: string | null;
    status: string;
    created_at: Date;
    applied_at: Date | null;
  }>(
    `SELECT id, turn_index, action_text, context_payload, llm_narration, llm_patch, applied_patch,
            prompt_hash, model, status, created_at, applied_at
     FROM dm_turns
     WHERE campaign_id = $1 AND id = $2
     LIMIT 1`,
    [campaignId, turnId]
  );

  const turn = turnResult.rows[0];
  if (!turn) throw new Error("turn_not_found");

  const llmCalls = await dmQuery<{
    id: string;
    provider: string;
    model: string;
    prompt: Record<string, unknown>;
    response_text: string | null;
    response_json: Record<string, unknown> | null;
    latency_ms: number | null;
    success: boolean;
    error_text: string | null;
    created_at: Date;
  }>(
    `SELECT id, provider, model, prompt, response_text, response_json, latency_ms, success, error_text, created_at
     FROM dm_llm_calls
     WHERE campaign_id = $1 AND turn_id = $2
     ORDER BY created_at DESC`,
    [campaignId, turnId]
  );

  const transitions = await dmQuery<{
    id: string;
    source_type: string;
    source_id: string | null;
    actor_user_id: string | null;
    actor_character_id: string | null;
    entity_type: string;
    entity_id: string | null;
    field_path: string;
    transition_type: string;
    old_value: unknown;
    new_value: unknown;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, source_type, source_id, actor_user_id, actor_character_id, entity_type, entity_id,
            field_path, transition_type, old_value, new_value, metadata, created_at
     FROM dm_state_transitions
     WHERE campaign_id = $1
       AND turn_id = $2
     ORDER BY created_at ASC, id ASC`,
    [campaignId, turnId]
  );

  const linkedRolls = await dmQuery<{
    id: string;
    actor_user_id: string | null;
    actor_character_id: string | null;
    expression: string;
    dice_count: number;
    dice_sides: number;
    modifier: number;
    rolls: unknown;
    total: number;
    critical_success: boolean;
    critical_failure: boolean;
    reason: string | null;
    summary: string;
    outcome_status: string;
    outcome_summary: string | null;
    created_at: Date;
    resolved_at: Date | null;
  }>(
    `SELECT id, actor_user_id, actor_character_id, expression, dice_count, dice_sides, modifier, rolls,
            total, critical_success, critical_failure, reason, summary, outcome_status, outcome_summary,
            created_at, resolved_at
     FROM dm_dice_rolls
     WHERE campaign_id = $1
       AND turn_id = $2
     ORDER BY created_at ASC, id ASC`,
    [campaignId, turnId]
  );

  return {
    turn: {
      id: turn.id,
      turnIndex: turn.turn_index,
      actionText: turn.action_text,
      contextPayload: turn.context_payload,
      narration: turn.llm_narration,
      llmPatch: turn.llm_patch,
      appliedPatch: turn.applied_patch,
      promptHash: turn.prompt_hash,
      model: turn.model,
      status: turn.status,
      createdAt: turn.created_at.toISOString(),
      appliedAt: turn.applied_at ? turn.applied_at.toISOString() : null
    },
    llmCalls: llmCalls.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model,
      prompt: row.prompt,
      responseText: row.response_text,
      responseJson: row.response_json,
      latencyMs: row.latency_ms,
      success: row.success,
      errorText: row.error_text,
      createdAt: row.created_at.toISOString()
    })),
    stateTransitions: transitions.rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      actorUserId: row.actor_user_id,
      actorCharacterId: row.actor_character_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      fieldPath: row.field_path,
      transitionType: row.transition_type,
      oldValue: row.old_value ?? null,
      newValue: row.new_value ?? null,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString()
    })),
    linkedDiceRolls: linkedRolls.rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorCharacterId: row.actor_character_id,
      expression: row.expression,
      count: row.dice_count,
      sides: row.dice_sides,
      modifier: row.modifier,
      rolls: Array.isArray(row.rolls) ? row.rolls.filter((value): value is number => typeof value === "number") : [],
      total: row.total,
      criticalSuccess: row.critical_success,
      criticalFailure: row.critical_failure,
      reason: row.reason,
      summary: row.summary,
      outcomeStatus: row.outcome_status,
      outcomeSummary: row.outcome_summary,
      createdAt: row.created_at.toISOString(),
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null
    }))
  };
};

export const resolveCampaignEventCursor = async (
  userId: string,
  campaignId: string,
  eventId: string
) => {
  await assertMembership(campaignId, userId);
  const result = await dmQuery<{ created_at: Date }>(
    `SELECT created_at
     FROM dm_events
     WHERE campaign_id = $1 AND id = $2
     LIMIT 1`,
    [campaignId, eventId]
  );
  return result.rows[0]?.created_at.toISOString() ?? null;
};

export const listCampaignEventsSince = async (
  userId: string,
  campaignId: string,
  sinceIso?: string,
  afterEventId?: string
) => {
  await assertMembership(campaignId, userId);

  const result = await dmQuery<{
    id: string;
    type: EventRecord["type"];
    actor_user_id: string | null;
    actor_character_id: string | null;
    summary: string;
    payload: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, type, actor_user_id, actor_character_id, summary, payload, created_at
     FROM dm_events
     WHERE campaign_id = $1
       AND (
         $2::timestamptz IS NULL
         OR created_at > $2::timestamptz
         OR (created_at = $2::timestamptz AND $3::text IS NOT NULL AND id > $3::text)
       )
     ORDER BY created_at ASC, id ASC
     LIMIT 200`,
    [campaignId, sinceIso ?? null, afterEventId ?? null]
  );

  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    actorUserId: row.actor_user_id,
    actorCharacterId: row.actor_character_id,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.created_at.toISOString()
  }));
};

export const listCampaignStateTransitions = async (
  userId: string,
  campaignId: string,
  input?: { limit?: number; turnId?: string }
) => {
  await assertMembership(campaignId, userId);
  const limit = clamp(input?.limit ?? 100, 1, 500);

  const result = await dmQuery<{
    id: string;
    session_id: string | null;
    turn_id: string | null;
    source_type: string;
    source_id: string | null;
    actor_user_id: string | null;
    actor_character_id: string | null;
    entity_type: string;
    entity_id: string | null;
    field_path: string;
    transition_type: string;
    old_value: unknown;
    new_value: unknown;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, session_id, turn_id, source_type, source_id, actor_user_id, actor_character_id,
            entity_type, entity_id, field_path, transition_type, old_value, new_value, metadata, created_at
     FROM dm_state_transitions
     WHERE campaign_id = $1
       AND ($2::text IS NULL OR turn_id = $2)
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [campaignId, input?.turnId ?? null, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    actorUserId: row.actor_user_id,
    actorCharacterId: row.actor_character_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fieldPath: row.field_path,
    transitionType: row.transition_type,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString()
  }));
};

export const listCampaignDiceRolls = async (
  userId: string,
  campaignId: string,
  input?: { limit?: number; turnId?: string }
) => {
  await assertMembership(campaignId, userId);
  const limit = clamp(input?.limit ?? 100, 1, 500);

  const result = await dmQuery<{
    id: string;
    session_id: string | null;
    turn_id: string | null;
    actor_user_id: string | null;
    actor_character_id: string | null;
    expression: string;
    dice_count: number;
    dice_sides: number;
    modifier: number;
    rolls: unknown;
    total: number;
    critical_success: boolean;
    critical_failure: boolean;
    reason: string | null;
    summary: string;
    outcome_status: string;
    outcome_summary: string | null;
    outcome_payload: Record<string, unknown> | null;
    created_at: Date;
    resolved_at: Date | null;
  }>(
    `SELECT id, session_id, turn_id, actor_user_id, actor_character_id, expression, dice_count, dice_sides,
            modifier, rolls, total, critical_success, critical_failure, reason, summary, outcome_status,
            outcome_summary, outcome_payload, created_at, resolved_at
     FROM dm_dice_rolls
     WHERE campaign_id = $1
       AND ($2::text IS NULL OR turn_id = $2)
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [campaignId, input?.turnId ?? null, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    actorUserId: row.actor_user_id,
    actorCharacterId: row.actor_character_id,
    expression: row.expression,
    count: row.dice_count,
    sides: row.dice_sides,
    modifier: row.modifier,
    rolls: Array.isArray(row.rolls) ? row.rolls.filter((value): value is number => typeof value === "number") : [],
    total: row.total,
    criticalSuccess: row.critical_success,
    criticalFailure: row.critical_failure,
    reason: row.reason,
    summary: row.summary,
    outcomeStatus: row.outcome_status,
    outcomeSummary: row.outcome_summary,
    outcomePayload: row.outcome_payload ?? {},
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null
  }));
};

export type CompendiumLookupRecord = {
  id: string;
  systemId: string;
  sourceRef: string;
  entryType: string;
  name: string;
  slug: string;
  summary: string;
  tags: string[];
  data: Record<string, unknown>;
};

export type DmSystemSummary = {
  id: string;
  displayName: string;
  description: string;
  rulesPrimer: string;
};

export const listDmSystems = async (): Promise<DmSystemSummary[]> => {
  await ensureDmSchema();
  const result = await dmQuery<{
    id: string;
    display_name: string;
    description: string;
    rules_primer: string;
  }>(
    `SELECT id, display_name, description, rules_primer
     FROM dm_systems
     ORDER BY display_name ASC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    rulesPrimer: row.rules_primer
  }));
};

export const searchCompendiumEntries = async (input: {
  systemId: string;
  query?: string;
  entryTypes?: string[];
  limit?: number;
}): Promise<CompendiumLookupRecord[]> => {
  await ensureDmSchema();

  const normalizedQuery = input.query?.trim().toLowerCase() ?? "";
  const normalizedTypes = (input.entryTypes ?? [])
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const limit = clamp(input.limit ?? 12, 1, 100);

  const result = await dmQuery<{
    id: string;
    system_id: string;
    source_ref: string;
    entry_type: string;
    name: string;
    slug: string;
    summary: string;
    tags: unknown;
    data: Record<string, unknown> | null;
  }>(
    `SELECT id, system_id, source_ref, entry_type, name, slug, summary, tags, data
     FROM dm_compendium_entries
     WHERE system_id = $1
       AND (
         $2::text = ''
         OR lower(name) LIKE '%' || $2 || '%'
         OR lower(summary) LIKE '%' || $2 || '%'
         OR lower(coalesce(rules_text, '')) LIKE '%' || $2 || '%'
         OR lower(tags::text) LIKE '%' || $2 || '%'
       )
       AND (
         COALESCE(array_length($3::text[], 1), 0) = 0
         OR lower(entry_type) = ANY($3::text[])
       )
     ORDER BY updated_at DESC, name ASC
     LIMIT $4`,
    [input.systemId, normalizedQuery, normalizedTypes.length ? normalizedTypes : null, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    systemId: row.system_id,
    sourceRef: row.source_ref,
    entryType: row.entry_type,
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    tags: toStringArray(row.tags),
    data: row.data ?? {}
  }));
};

export const getPlayerDashboardForUser = async (
  userId: string,
  campaignId: string,
  selectedCharacterId?: string
): Promise<PlayerDashboardState> => {
  const snapshot = await getCampaignSnapshotForUser(userId, campaignId);
  const ownedCharacters = snapshot.characters.filter((character) => character.userId === userId);
  const ownedCharacterIds = new Set(ownedCharacters.map((character) => character.id));

  let activeCharacter: CharacterRecord | null = ownedCharacters[0] ?? null;
  if (selectedCharacterId) {
    const selected = snapshot.characters.find((character) => character.id === selectedCharacterId);
    if (!selected) throw new Error("character_not_found");
    if (snapshot.role !== "dm" && selected.userId !== userId) throw new Error("forbidden");
    activeCharacter = selected;
  }

  const eventsResult = await dmQuery<{
    id: string;
    type: EventRecord["type"];
    actor_user_id: string | null;
    actor_character_id: string | null;
    summary: string;
    payload: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, type, actor_user_id, actor_character_id, summary, payload, created_at
     FROM dm_events
     WHERE campaign_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 400`,
    [campaignId]
  );

  const mappedEvents = eventsResult.rows.map((row) => ({
    id: row.id,
    campaignId,
    type: row.type,
    actorUserId: row.actor_user_id ?? undefined,
    actorCharacterId: row.actor_character_id ?? undefined,
    summary: row.summary,
    payload: row.payload ?? undefined,
    createdAt: row.created_at.toISOString()
  }));

  const globallyVisibleEventTypes = new Set<EventRecord["type"]>([
    "world_created",
    "dm_response",
    "state_patch",
    "quest_update",
    "character_update",
    "character_created"
  ]);

  const relevantEvents =
    snapshot.role === "dm"
      ? mappedEvents
      : mappedEvents.filter((event) => {
          if (globallyVisibleEventTypes.has(event.type)) return true;
          if (event.actorUserId && event.actorUserId === userId) return true;
          if (event.actorCharacterId && ownedCharacterIds.has(event.actorCharacterId)) return true;
          return false;
        });

  const recentEvents = relevantEvents.slice(0, 120);
  const personalRollEvents = relevantEvents.filter(
    (event) =>
      event.type === "dice_roll" &&
      (event.actorUserId === userId || (event.actorCharacterId ? ownedCharacterIds.has(event.actorCharacterId) : false))
  );

  const rollTotals = personalRollEvents
    .map((event) => {
      const payload = event.payload as Record<string, unknown> | null;
      const total = payload?.total;
      return typeof total === "number" && Number.isFinite(total) ? total : null;
    })
    .filter((value): value is number => value !== null);

  const criticalSuccesses = personalRollEvents.filter((event) => {
    const payload = event.payload as Record<string, unknown> | null;
    return payload?.criticalSuccess === true;
  }).length;
  const criticalFailures = personalRollEvents.filter((event) => {
    const payload = event.payload as Record<string, unknown> | null;
    return payload?.criticalFailure === true;
  }).length;

  const actionsTaken = relevantEvents.filter(
    (event) => event.type === "player_action" && event.actorUserId === userId
  ).length;
  const dmResponsesSeen = relevantEvents.filter((event) => event.type === "dm_response").length;

  const keyMoments = relevantEvents
    .filter((event) => ["dm_response", "quest_update", "character_update", "dice_roll"].includes(event.type))
    .slice(0, 8)
    .map((event) => event.summary);

  const promptsFromCharacter = activeCharacter
    ? [
        `As ${activeCharacter.name}, I secure our position at ${snapshot.campaign.worldState.location}.`,
        `As ${activeCharacter.name}, I investigate threat signals and report findings.`,
        `As ${activeCharacter.name}, I push quest progress while protecting the party.`
      ]
    : [
        "I assess the current scene and state one concrete next action.",
        "I ask the DM for tactical options tied to active objectives.",
        "I coordinate with the party before advancing the scene."
      ];

  return {
    campaign: snapshot.campaign,
    role: snapshot.role,
    activeCharacter,
    ownedCharacters,
    party: snapshot.characters,
    quests: snapshot.quests,
    worldState: snapshot.campaign.worldState,
    recentEvents,
    stats: {
      totalRolls: personalRollEvents.length,
      criticalSuccesses,
      criticalFailures,
      averageRollTotal: rollTotals.length
        ? Number((rollTotals.reduce((sum, value) => sum + value, 0) / rollTotals.length).toFixed(2))
        : null,
      actionsTaken,
      dmResponsesSeen,
      lastActionAt:
        relevantEvents.find((event) => event.type === "player_action" && event.actorUserId === userId)?.createdAt ??
        null,
      lastRollAt: personalRollEvents[0]?.createdAt ?? null
    },
    keyMoments,
    suggestedPrompts: promptsFromCharacter
  };
};

export const startCampaignSession = async (userId: string, campaignId: string) => {
  const role = await assertMembership(campaignId, userId);
  if (role !== "dm") throw new Error("forbidden");

  return withDmTransaction(async (client) => {
    await client.query(
      `UPDATE dm_sessions
       SET status = 'ended',
           ended_at = now()
       WHERE campaign_id = $1 AND status = 'active'`,
      [campaignId]
    );

    const sessionId = createId("sess");
    const created = await client.query<{ id: string; started_at: Date }>(
      `INSERT INTO dm_sessions (id, campaign_id, started_by_user_id, status, current_turn, metadata, started_at)
       VALUES ($1, $2, $3, 'active', 0, '{}'::jsonb, now())
       RETURNING id, started_at`,
      [sessionId, campaignId, userId]
    );

    await client.query(
      `INSERT INTO dm_events (id, campaign_id, session_id, type, actor_user_id, summary, payload, created_at)
       VALUES ($1, $2, $3, 'state_patch', $4, $5, $6::jsonb, now())`,
      [createId("event"), campaignId, sessionId, userId, "New session started", toJson({ sessionId })]
    );

    return {
      id: created.rows[0].id,
      startedAt: created.rows[0].started_at.toISOString()
    };
  });
};

export const endCampaignSession = async (userId: string, campaignId: string) => {
  const role = await assertMembership(campaignId, userId);
  if (role !== "dm") throw new Error("forbidden");

  await dmQuery(
    `UPDATE dm_sessions
     SET status = 'ended',
         ended_at = now()
     WHERE campaign_id = $1 AND status = 'active'`,
    [campaignId]
  );

  return { ok: true };
};
