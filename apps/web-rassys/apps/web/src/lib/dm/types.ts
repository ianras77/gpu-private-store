export type DmSystemId = "gamma-world" | string;

export type DmRole = "dm" | "player";

export type QuestStatus = "active" | "completed" | "failed" | "paused";

export type EventType =
  | "world_created"
  | "world_bootstrap"
  | "player_joined"
  | "character_created"
  | "player_action"
  | "dice_roll"
  | "dm_response"
  | "state_patch"
  | "quest_update"
  | "character_update";

export type UserRecord = {
  id: string;
  email: string;
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
};

export type MembershipRecord = {
  userId: string;
  campaignId: string;
  role: DmRole;
  joinedAt: string;
};

export type WorldState = {
  location: string;
  worldTime: string;
  weather: string;
  activeThreats: string[];
  sceneSummary: string;
  storyBeat: string;
  visualPrompt: string;
};

export type CampaignRecord = {
  id: string;
  name: string;
  systemId: DmSystemId;
  description: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  worldState: WorldState;
};

export type InventoryItem = {
  id: string;
  compendiumEntryId?: string;
  name: string;
  detail?: string;
  quantity: number;
};

export type CharacterAttributeRecord = {
  id: string;
  key: string;
  valueNumber?: number;
  valueText?: string;
  valueJson?: unknown;
  source?: string;
  updatedAt: string;
};

export type CharacterActionRecord = {
  id: string;
  key: string;
  compendiumEntryId?: string;
  name: string;
  description?: string;
  actionType: string;
  usesCurrent?: number;
  usesMax?: number;
  cooldownTurns?: number;
  metadata?: Record<string, unknown>;
  updatedAt: string;
};

export type CharacterRecord = {
  id: string;
  campaignId: string;
  userId: string;
  name: string;
  archetype: string;
  archetypeEntryId?: string;
  playerType?: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  status: string;
  notes?: string;
  specialTraits?: string[];
  systemData?: Record<string, unknown>;
  inventory: InventoryItem[];
  attributes?: CharacterAttributeRecord[];
  actions?: CharacterActionRecord[];
  createdAt: string;
  updatedAt: string;
};

export type QuestObjective = {
  id: string;
  text: string;
  completed: boolean;
};

export type QuestRecord = {
  id: string;
  campaignId: string;
  title: string;
  summary: string;
  status: QuestStatus;
  progress: number;
  objectives: QuestObjective[];
  createdAt: string;
  updatedAt: string;
};

export type EventRecord = {
  id: string;
  campaignId: string;
  type: EventType;
  actorUserId?: string;
  actorCharacterId?: string;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type DmStore = {
  version: 1;
  users: UserRecord[];
  memberships: MembershipRecord[];
  campaigns: CampaignRecord[];
  characters: CharacterRecord[];
  quests: QuestRecord[];
  events: EventRecord[];
};

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt?: string;
};

export type CampaignSnapshot = {
  campaign: CampaignRecord;
  role: DmRole;
  characters: CharacterRecord[];
  quests: QuestRecord[];
  events: EventRecord[];
};

export type CampaignSummary = {
  id: string;
  name: string;
  systemId: string;
  description: string;
  role: DmRole;
  playerCount: number;
  characterCount: number;
  activeQuestCount: number;
  updatedAt: string;
};

export type WorldPatch = Partial<WorldState>;

export type QuestPatch = {
  questId?: string;
  title: string;
  summary?: string;
  status?: QuestStatus;
  progress?: number;
  objectives?: Array<{
    text: string;
    completed?: boolean;
  }>;
};

export type InventoryDelta = {
  itemName: string;
  quantityDelta: number;
  detail?: string;
};

export type CharacterPatch = {
  characterId: string;
  hpDelta?: number;
  hpTemp?: number;
  status?: string;
  notesAppend?: string;
  inventoryDelta?: InventoryDelta[];
};

export type DmTurnPatch = {
  narration: string;
  worldPatch?: WorldPatch;
  questPatches?: QuestPatch[];
  characterPatches?: CharacterPatch[];
  shortSummary?: string;
};
