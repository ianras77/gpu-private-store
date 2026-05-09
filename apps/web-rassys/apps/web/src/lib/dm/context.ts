import crypto from "crypto";
import type { PoolClient } from "pg";
import { dmQuery } from "./db";
import { cosineSimilarity, embedTextWithCheshire, type DmContextPacket } from "./cheshire";
import { getSystemPlugin } from "./systems";
import type {
  CampaignRecord,
  CampaignSnapshot,
  CharacterRecord,
  DmRole,
  EventRecord,
  QuestObjective,
  QuestRecord,
  WorldState
} from "./types";

type SessionRow = {
  id: string;
  campaign_id: string;
  status: string;
  current_turn: number;
  metadata: Record<string, unknown>;
  started_at: Date;
  ended_at: Date | null;
};

type RecentTurnRecord = {
  id: string;
  turnIndex: number;
  actionText: string;
  narration: string | null;
  status: string;
  createdAt: string;
  appliedAt: string | null;
};

type RollingSummaryRecord = {
  id: string;
  startTurnIndex: number | null;
  endTurnIndex: number | null;
  summary: string;
  createdAt: string;
};

type MemoryFactRecord = {
  id: string;
  kind: string;
  factText: string;
  confidence: number;
  pinned: boolean;
  updatedAt: string;
};

type SemanticMemoryRecord = {
  sourceType: string;
  sourceId: string;
  text: string;
  createdAt: string;
  score: number;
};

type BaseCampaignBundle = {
  campaign: CampaignRecord;
  worldState: WorldState;
  worldVersion: number;
  session: SessionRow | null;
  characters: CharacterRecord[];
  quests: QuestRecord[];
  recentEvents: EventRecord[];
  recentTurns: RecentTurnRecord[];
  lastAppliedTurnIndex: number;
  rollingSummaries: RollingSummaryRecord[];
  pinnedFacts: MemoryFactRecord[];
  semanticMemory: SemanticMemoryRecord[];
};

const parsePositiveInt = (value: string | undefined, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.round(parsed), max);
};

const contextConfig = {
  maxCharacters: parsePositiveInt(process.env.DM_CONTEXT_MAX_CHARACTERS, 12, 40),
  maxInventoryPerCharacter: parsePositiveInt(process.env.DM_CONTEXT_MAX_INVENTORY_PER_CHARACTER, 12, 60),
  maxQuests: parsePositiveInt(process.env.DM_CONTEXT_MAX_QUESTS, 12, 40),
  maxObjectivesPerQuest: parsePositiveInt(process.env.DM_CONTEXT_MAX_OBJECTIVES_PER_QUEST, 8, 24),
  maxRecentTurns: parsePositiveInt(process.env.DM_CONTEXT_MAX_RECENT_TURNS, 14, 48),
  maxRollingSummaries: parsePositiveInt(process.env.DM_CONTEXT_MAX_ROLLING_SUMMARIES, 4, 12),
  maxPinnedFacts: parsePositiveInt(process.env.DM_CONTEXT_MAX_PINNED_FACTS, 18, 64),
  maxSemanticMemory: parsePositiveInt(process.env.DM_CONTEXT_MAX_SEMANTIC_MEMORY, 8, 24),
  maxCompendiumHits: parsePositiveInt(process.env.DM_CONTEXT_MAX_COMPENDIUM_HITS, 10, 40),
  semanticMemoryThreshold: Number(process.env.DM_CONTEXT_SEMANTIC_THRESHOLD ?? 0.2)
};

const clampText = (value: string | null | undefined, limit: number) => {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const compendiumStopWords = new Set([
  "and",
  "the",
  "with",
  "from",
  "this",
  "that",
  "then",
  "into",
  "about",
  "after",
  "before",
  "while",
  "would",
  "could",
  "should",
  "their",
  "there",
  "your",
  "take",
  "using",
  "against",
  "have",
  "need"
]);

const tokenizeCompendiumTerms = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3 && !compendiumStopWords.has(entry));

const deriveCompendiumTerms = (actionText: string, actor?: CharacterRecord): string[] => {
  const seedStrings = [
    actionText,
    actor?.name ?? "",
    actor?.archetype ?? "",
    actor?.playerType ?? "",
    ...(actor?.specialTraits ?? []),
    ...(actor?.actions ?? []).slice(0, 8).map((action) => action.name),
    ...(actor?.inventory ?? []).slice(0, 10).map((item) => item.name)
  ];

  const unique = new Set<string>();
  for (const seed of seedStrings) {
    for (const token of tokenizeCompendiumTerms(seed)) {
      unique.add(token);
      if (unique.size >= 24) break;
    }
    if (unique.size >= 24) break;
  }

  return [...unique];
};

const getCompendiumContext = async (
  systemId: string,
  actionText: string,
  actor?: CharacterRecord
): Promise<Array<Record<string, unknown>>> => {
  const terms = deriveCompendiumTerms(actionText, actor);
  if (!terms.length) return [];

  const result = await dmQuery<{
    id: string;
    entry_type: string;
    name: string;
    summary: string;
    rules_text: string;
    tags: unknown;
    updated_at: Date;
  }>(
    `SELECT id, entry_type, name, summary, rules_text, tags, updated_at
     FROM dm_compendium_entries
     WHERE system_id = $1
       AND EXISTS (
         SELECT 1
         FROM unnest($2::text[]) as term
         WHERE lower(name) LIKE '%' || term || '%'
            OR lower(summary) LIKE '%' || term || '%'
            OR lower(coalesce(rules_text, '')) LIKE '%' || term || '%'
            OR lower(tags::text) LIKE '%' || term || '%'
       )
     ORDER BY updated_at DESC, name ASC
     LIMIT $3`,
    [systemId, terms, contextConfig.maxCompendiumHits]
  );

  return result.rows.map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    name: clampText(row.name, 120),
    summary: clampText(row.summary, 260),
    rulesSnippet: clampText(row.rules_text, 340),
    tags: asStringArray(row.tags)
  }));
};

const parseObjectiveRows = (rows: Array<{ quest_id: string; id: string; ord: number; text: string; completed: boolean }>) => {
  const map = new Map<string, QuestObjective[]>();
  for (const row of rows) {
    const existing = map.get(row.quest_id) ?? [];
    existing.push({
      id: row.id,
      text: row.text,
      completed: row.completed
    });
    map.set(row.quest_id, existing);
  }
  return map;
};

const mapCharacterRows = async (campaignId: string): Promise<CharacterRecord[]> => {
  const charactersResult = await dmQuery<{
    id: string;
    campaign_id: string;
    user_id: string;
    name: string;
    archetype: string;
    archetype_entry_id: string | null;
    player_type: string | null;
    level: number;
    hp_current: number;
    hp_max: number;
    hp_temp: number;
    status: string;
    notes: string | null;
    special_traits: unknown;
    system_data: Record<string, unknown> | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, campaign_id, user_id, name, archetype, archetype_entry_id, player_type, level, hp_current, hp_max, hp_temp, status, notes, special_traits, system_data, created_at, updated_at
     FROM dm_characters
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );

  const characterIds = charactersResult.rows.map((row) => row.id);
  const inventoryResult = characterIds.length
    ? await dmQuery<{
        id: string;
        character_id: string;
        compendium_entry_id: string | null;
        name: string;
        detail: string | null;
        quantity: number;
      }>(
        `SELECT id, character_id, compendium_entry_id, name, detail, quantity
         FROM dm_inventory_items
         WHERE character_id = ANY($1::text[])
         ORDER BY name ASC`,
        [characterIds]
      )
    : {
        rows: [] as Array<{
          id: string;
          character_id: string;
          compendium_entry_id: string | null;
          name: string;
          detail: string | null;
          quantity: number;
        }>
      };

  const inventoryByCharacter = new Map<string, CharacterRecord["inventory"]>();
  for (const row of inventoryResult.rows) {
    const list = inventoryByCharacter.get(row.character_id) ?? [];
    list.push({
      id: row.id,
      compendiumEntryId: row.compendium_entry_id ?? undefined,
      name: row.name,
      detail: row.detail ?? undefined,
      quantity: row.quantity
    });
    inventoryByCharacter.set(row.character_id, list);
  }

  const attributesResult = characterIds.length
    ? await dmQuery<{
        id: string;
        character_id: string;
        attr_key: string;
        value_num: number | null;
        value_text: string | null;
        value_json: unknown;
        source: string | null;
        updated_at: Date;
      }>(
        `SELECT id, character_id, attr_key, value_num, value_text, value_json, source, updated_at
         FROM dm_character_attributes
         WHERE character_id = ANY($1::text[])
         ORDER BY attr_key ASC`,
        [characterIds]
      )
    : {
        rows: [] as Array<{
          id: string;
          character_id: string;
          attr_key: string;
          value_num: number | null;
          value_text: string | null;
          value_json: unknown;
          source: string | null;
          updated_at: Date;
        }>
      };

  const actionsResult = characterIds.length
    ? await dmQuery<{
        id: string;
        character_id: string;
        compendium_entry_id: string | null;
        action_key: string;
        name: string;
        description: string | null;
        action_type: string;
        uses_current: number | null;
        uses_max: number | null;
        cooldown_turns: number | null;
        metadata: Record<string, unknown> | null;
        updated_at: Date;
      }>(
        `SELECT id, character_id, compendium_entry_id, action_key, name, description, action_type, uses_current, uses_max, cooldown_turns, metadata, updated_at
         FROM dm_character_actions
         WHERE character_id = ANY($1::text[])
         ORDER BY name ASC`,
        [characterIds]
      )
    : {
        rows: [] as Array<{
          id: string;
          character_id: string;
          compendium_entry_id: string | null;
          action_key: string;
          name: string;
          description: string | null;
          action_type: string;
          uses_current: number | null;
          uses_max: number | null;
          cooldown_turns: number | null;
          metadata: Record<string, unknown> | null;
          updated_at: Date;
        }>
      };

  const attributesByCharacter = new Map<string, NonNullable<CharacterRecord["attributes"]>>();
  for (const row of attributesResult.rows) {
    const list = attributesByCharacter.get(row.character_id) ?? [];
    list.push({
      id: row.id,
      key: row.attr_key,
      valueNumber: row.value_num ?? undefined,
      valueText: row.value_text ?? undefined,
      valueJson: row.value_json ?? undefined,
      source: row.source ?? undefined,
      updatedAt: row.updated_at.toISOString()
    });
    attributesByCharacter.set(row.character_id, list);
  }

  const actionsByCharacter = new Map<string, NonNullable<CharacterRecord["actions"]>>();
  for (const row of actionsResult.rows) {
    const list = actionsByCharacter.get(row.character_id) ?? [];
    list.push({
      id: row.id,
      key: row.action_key,
      compendiumEntryId: row.compendium_entry_id ?? undefined,
      name: row.name,
      description: row.description ?? undefined,
      actionType: row.action_type,
      usesCurrent: row.uses_current ?? undefined,
      usesMax: row.uses_max ?? undefined,
      cooldownTurns: row.cooldown_turns ?? undefined,
      metadata: row.metadata ?? undefined,
      updatedAt: row.updated_at.toISOString()
    });
    actionsByCharacter.set(row.character_id, list);
  }

  return charactersResult.rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    name: row.name,
    archetype: row.archetype,
    archetypeEntryId: row.archetype_entry_id ?? undefined,
    playerType: row.player_type ?? undefined,
    level: row.level,
    hpCurrent: row.hp_current,
    hpMax: row.hp_max,
    hpTemp: row.hp_temp,
    status: row.status,
    notes: row.notes ?? undefined,
    specialTraits: asStringArray(row.special_traits),
    systemData: row.system_data ?? {},
    inventory: inventoryByCharacter.get(row.id) ?? [],
    attributes: attributesByCharacter.get(row.id) ?? [],
    actions: actionsByCharacter.get(row.id) ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));
};

const mapQuestRows = async (campaignId: string): Promise<QuestRecord[]> => {
  const questsResult = await dmQuery<{
    id: string;
    campaign_id: string;
    title: string;
    summary: string;
    status: QuestRecord["status"];
    progress: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, campaign_id, title, summary, status, progress, created_at, updated_at
     FROM dm_quests
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );

  const questIds = questsResult.rows.map((row) => row.id);
  const objectivesResult = questIds.length
    ? await dmQuery<{
        quest_id: string;
        id: string;
        ord: number;
        text: string;
        completed: boolean;
      }>(
        `SELECT quest_id, id, ord, text, completed
         FROM dm_quest_objectives
         WHERE quest_id = ANY($1::text[])
         ORDER BY quest_id, ord ASC`,
        [questIds]
      )
    : { rows: [] as Array<{ quest_id: string; id: string; ord: number; text: string; completed: boolean }> };

  const objectiveMap = parseObjectiveRows(objectivesResult.rows);

  return questsResult.rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    progress: row.progress,
    objectives: objectiveMap.get(row.id) ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));
};

const mapRecentEvents = async (campaignId: string, limit = 100): Promise<EventRecord[]> => {
  const result = await dmQuery<{
    id: string;
    campaign_id: string;
    type: EventRecord["type"];
    actor_user_id: string | null;
    actor_character_id: string | null;
    summary: string;
    payload: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, campaign_id, type, actor_user_id, actor_character_id, summary, payload, created_at
     FROM dm_events
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [campaignId, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    type: row.type,
    actorUserId: row.actor_user_id ?? undefined,
    actorCharacterId: row.actor_character_id ?? undefined,
    summary: row.summary,
    payload: row.payload ?? undefined,
    createdAt: row.created_at.toISOString()
  }));
};

const getSemanticMemory = async (campaignId: string, queryText: string): Promise<SemanticMemoryRecord[]> => {
  const embedding = await embedTextWithCheshire(queryText);
  if (!embedding) return [];

  const result = await dmQuery<{
    source_type: string;
    source_id: string;
    text_chunk: string;
    embedding: number[];
    created_at: Date;
  }>(
    `SELECT source_type, source_id, text_chunk, embedding, created_at
     FROM dm_memory_embeddings
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT 400`,
    [campaignId]
  );

  return result.rows
    .map((row) => ({
      sourceType: row.source_type,
      sourceId: row.source_id,
      text: clampText(row.text_chunk, 420),
      createdAt: row.created_at.toISOString(),
      score: cosineSimilarity(embedding, Array.isArray(row.embedding) ? row.embedding : [])
    }))
    .filter((row) => row.score >= contextConfig.semanticMemoryThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, contextConfig.maxSemanticMemory);
};

export const loadCampaignBundle = async (campaignId: string): Promise<BaseCampaignBundle> => {
  const campaignResult = await dmQuery<{
    id: string;
    name: string;
    system_id: string;
    description: string;
    created_by_user_id: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, system_id, description, created_by_user_id, created_at, updated_at
     FROM dm_campaigns
     WHERE id = $1
     LIMIT 1`,
    [campaignId]
  );

  if (!campaignResult.rows[0]) {
    throw new Error("campaign_not_found");
  }

  const campaignRow = campaignResult.rows[0];
  const worldResult = await dmQuery<{
    campaign_id: string;
    version: number;
    location: string;
    world_time: string;
    weather: string;
    active_threats: unknown;
    scene_summary: string;
    story_beat: string;
    visual_prompt: string;
  }>(
    `SELECT campaign_id, version, location, world_time, weather, active_threats, scene_summary, story_beat, visual_prompt
     FROM dm_world_state
     WHERE campaign_id = $1
     LIMIT 1`,
    [campaignId]
  );

  if (!worldResult.rows[0]) {
    throw new Error("world_state_missing");
  }

  const worldRow = worldResult.rows[0];

  const sessionResult = await dmQuery<SessionRow>(
    `SELECT id, campaign_id, status, current_turn, metadata, started_at, ended_at
     FROM dm_sessions
     WHERE campaign_id = $1 AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [campaignId]
  );

  const [characters, quests, recentEvents] = await Promise.all([
    mapCharacterRows(campaignId),
    mapQuestRows(campaignId),
    mapRecentEvents(campaignId, 100)
  ]);

  const turnResult = await dmQuery<{
    id: string;
    turn_index: number;
    action_text: string;
    llm_narration: string | null;
    status: string;
    created_at: Date;
    applied_at: Date | null;
  }>(
    `SELECT id, turn_index, action_text, llm_narration, status, created_at, applied_at
     FROM dm_turns
     WHERE campaign_id = $1
     ORDER BY turn_index DESC
     LIMIT $2`,
    [campaignId, Math.max(contextConfig.maxRecentTurns, 20)]
  );

  const latestAppliedTurnResult = await dmQuery<{ turn_index: number }>(
    `SELECT turn_index
     FROM dm_turns
     WHERE campaign_id = $1 AND status = 'applied'
     ORDER BY turn_index DESC
     LIMIT 1`,
    [campaignId]
  );

  const summaryResult = await dmQuery<{
    id: string;
    start_turn_index: number | null;
    end_turn_index: number | null;
    summary: string;
    created_at: Date;
  }>(
    `SELECT id, start_turn_index, end_turn_index, summary, created_at
     FROM dm_memory_summaries
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [campaignId, Math.max(contextConfig.maxRollingSummaries, 6)]
  );

  const factsResult = await dmQuery<{
    id: string;
    kind: string;
    fact_text: string;
    confidence: number;
    pinned: boolean;
    updated_at: Date;
  }>(
    `SELECT id, kind, fact_text, confidence, pinned, updated_at
     FROM dm_memory_facts
     WHERE campaign_id = $1
     ORDER BY pinned DESC, confidence DESC, updated_at DESC
     LIMIT $2`,
    [campaignId, Math.max(contextConfig.maxPinnedFacts, 30)]
  );

  const plugin = getSystemPlugin(campaignRow.system_id);
  const campaign: CampaignRecord = {
    id: campaignRow.id,
    name: campaignRow.name,
    systemId: campaignRow.system_id,
    description: campaignRow.description,
    createdByUserId: campaignRow.created_by_user_id,
    createdAt: campaignRow.created_at.toISOString(),
    updatedAt: campaignRow.updated_at.toISOString(),
    worldState: {
      location: worldRow.location,
      worldTime: worldRow.world_time,
      weather: worldRow.weather,
      activeThreats: asStringArray(worldRow.active_threats),
      sceneSummary: worldRow.scene_summary,
      storyBeat: worldRow.story_beat,
      visualPrompt: worldRow.visual_prompt
    }
  };

  const normalizedCharacters = characters.map((character) => plugin.normalizeCharacter(character));
  const normalizedQuests = quests.map((quest) => plugin.normalizeQuest(quest));

  return {
    campaign,
    worldState: campaign.worldState,
    worldVersion: worldRow.version,
    session: sessionResult.rows[0] ?? null,
    characters: normalizedCharacters,
    quests: normalizedQuests,
    recentEvents,
    recentTurns: turnResult.rows.map((row) => ({
      id: row.id,
      turnIndex: row.turn_index,
      actionText: row.action_text,
      narration: row.llm_narration,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      appliedAt: row.applied_at ? row.applied_at.toISOString() : null
    })),
    lastAppliedTurnIndex: latestAppliedTurnResult.rows[0]?.turn_index ?? 0,
    rollingSummaries: summaryResult.rows.map((row) => ({
      id: row.id,
      startTurnIndex: row.start_turn_index,
      endTurnIndex: row.end_turn_index,
      summary: row.summary,
      createdAt: row.created_at.toISOString()
    })),
    pinnedFacts: factsResult.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      factText: row.fact_text,
      confidence: row.confidence,
      pinned: row.pinned,
      updatedAt: row.updated_at.toISOString()
    })),
    semanticMemory: []
  };
};

export const buildContextPacket = async (
  campaignId: string,
  actionText: string,
  actorCharacterId?: string
): Promise<DmContextPacket> => {
  const bundle = await loadCampaignBundle(campaignId);
  const plugin = getSystemPlugin(bundle.campaign.systemId);

  const actor = actorCharacterId
    ? bundle.characters.find((character) => character.id === actorCharacterId)
    : undefined;

  const semanticMemory = await getSemanticMemory(campaignId, actionText);
  const compendiumContext = await getCompendiumContext(bundle.campaign.systemId, actionText, actor);

  const characters = bundle.characters.slice(0, contextConfig.maxCharacters).map((character) => ({
    id: character.id,
    name: clampText(character.name, 80),
    archetype: clampText(character.archetype, 80),
    playerType: clampText(character.playerType, 80),
    level: character.level,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    hpTemp: character.hpTemp,
    status: clampText(character.status, 120),
    notes: clampText(character.notes, 320),
    specialTraits: (character.specialTraits ?? []).slice(0, 8).map((trait) => clampText(trait, 80)),
    attributes: (character.attributes ?? []).slice(0, 24).map((attribute) => ({
      key: clampText(attribute.key, 80),
      valueNumber: attribute.valueNumber,
      valueText: clampText(attribute.valueText, 140),
      source: clampText(attribute.source, 60)
    })),
    actions: (character.actions ?? []).slice(0, 16).map((action) => ({
      key: clampText(action.key, 80),
      name: clampText(action.name, 120),
      actionType: clampText(action.actionType, 80),
      usesCurrent: action.usesCurrent,
      usesMax: action.usesMax,
      cooldownTurns: action.cooldownTurns
    })),
    inventory: character.inventory.slice(0, contextConfig.maxInventoryPerCharacter).map((item) => ({
      id: item.id,
      name: clampText(item.name, 80),
      detail: clampText(item.detail, 120),
      quantity: item.quantity
    }))
  }));

  const quests = bundle.quests.slice(0, contextConfig.maxQuests).map((quest) => ({
    id: quest.id,
    title: clampText(quest.title, 120),
    summary: clampText(quest.summary, 600),
    status: quest.status,
    progress: quest.progress,
    objectives: quest.objectives.slice(0, contextConfig.maxObjectivesPerQuest).map((objective) => ({
      id: objective.id,
      text: clampText(objective.text, 220),
      completed: objective.completed
    }))
  }));

  const recentTurns = [...bundle.recentTurns]
    .sort((left, right) => left.turnIndex - right.turnIndex)
    .slice(-contextConfig.maxRecentTurns)
    .map((turn) => ({
      id: turn.id,
      turnIndex: turn.turnIndex,
      actionText: clampText(turn.actionText, 700),
      narration: clampText(turn.narration, 900),
      status: turn.status,
      createdAt: turn.createdAt,
      appliedAt: turn.appliedAt
    }));

  const rollingSummaries = bundle.rollingSummaries.slice(0, contextConfig.maxRollingSummaries).map((summary) => ({
    id: summary.id,
    startTurnIndex: summary.startTurnIndex,
    endTurnIndex: summary.endTurnIndex,
    summary: clampText(summary.summary, 1400),
    createdAt: summary.createdAt
  }));

  const pinnedFacts = bundle.pinnedFacts.slice(0, contextConfig.maxPinnedFacts).map((fact) => ({
    id: fact.id,
    kind: fact.kind,
    factText: clampText(fact.factText, 360),
    confidence: fact.confidence,
    pinned: fact.pinned,
    updatedAt: fact.updatedAt
  }));

  return {
    systemId: bundle.campaign.systemId,
    rulesPrimer: plugin.rulesPrimer,
    campaign: {
      id: bundle.campaign.id,
      name: clampText(bundle.campaign.name, 120),
      description: clampText(bundle.campaign.description, 1200),
      worldVersion: bundle.worldVersion
    },
    worldState: {
      location: clampText(bundle.worldState.location, 180),
      worldTime: clampText(bundle.worldState.worldTime, 120),
      weather: clampText(bundle.worldState.weather, 160),
      activeThreats: bundle.worldState.activeThreats.slice(0, 16).map((threat) => clampText(threat, 100)),
      sceneSummary: clampText(bundle.worldState.sceneSummary, 1200),
      storyBeat: clampText(bundle.worldState.storyBeat, 600),
      visualPrompt: clampText(bundle.worldState.visualPrompt, 420)
    },
    stateVector: {
      worldVersion: bundle.worldVersion,
      activeSessionId: bundle.session?.id ?? null,
      sessionTurn: bundle.session?.current_turn ?? 0,
      lastAppliedTurnIndex: bundle.lastAppliedTurnIndex
    },
    session: bundle.session
      ? {
          id: bundle.session.id,
          status: bundle.session.status,
          currentTurn: bundle.session.current_turn,
          metadata: bundle.session.metadata,
          startedAt: bundle.session.started_at.toISOString(),
          endedAt: bundle.session.ended_at ? bundle.session.ended_at.toISOString() : null
        }
      : { id: null, status: "none", currentTurn: 0, metadata: {} },
    characters,
    quests,
    recentTurns,
    rollingSummaries,
    pinnedFacts,
    semanticMemory,
    compendiumContext,
    contextMeta: {
      generatedAt: new Date().toISOString(),
      limits: contextConfig,
      totalCharacters: bundle.characters.length,
      totalQuests: bundle.quests.length,
      totalRecentTurns: bundle.recentTurns.length,
      totalFacts: bundle.pinnedFacts.length,
      totalSemanticHits: semanticMemory.length,
      totalCompendiumHits: compendiumContext.length
    },
    action: {
      text: clampText(actionText, 1200),
      actorCharacterId,
      actorName: actor?.name,
      allowedCharacterIds: bundle.characters.map((character) => character.id)
    }
  };
};

export const buildCampaignSnapshot = async (campaignId: string, role: DmRole): Promise<CampaignSnapshot> => {
  const bundle = await loadCampaignBundle(campaignId);
  return {
    campaign: bundle.campaign,
    role,
    characters: bundle.characters,
    quests: bundle.quests,
    events: bundle.recentEvents
  };
};

export const loadMembershipRole = async (campaignId: string, userId: string): Promise<DmRole | null> => {
  const result = await dmQuery<{ role: DmRole }>(
    `SELECT role
     FROM dm_memberships
     WHERE campaign_id = $1 AND user_id = $2
     LIMIT 1`,
    [campaignId, userId]
  );

  return result.rows[0]?.role ?? null;
};

export const ensureActiveSession = async (client: PoolClient, campaignId: string, userId: string) => {
  const existing = await client.query<SessionRow>(
    `SELECT id, campaign_id, status, current_turn, metadata, started_at, ended_at
     FROM dm_sessions
     WHERE campaign_id = $1 AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [campaignId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await client.query<SessionRow>(
    `INSERT INTO dm_sessions (id, campaign_id, started_by_user_id, status, current_turn, metadata)
     VALUES ($1, $2, $3, 'active', 0, '{}'::jsonb)
     RETURNING id, campaign_id, status, current_turn, metadata, started_at, ended_at`,
    [`sess_${crypto.randomUUID()}`, campaignId, userId]
  );

  return created.rows[0];
};
