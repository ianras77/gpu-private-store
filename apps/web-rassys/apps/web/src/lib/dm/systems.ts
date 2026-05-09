import type { CharacterPatch, CharacterRecord, QuestRecord, WorldState } from "./types";

export type WorldSeedInput = {
  campaignName: string;
  description: string;
};

export type SeedResult = {
  worldState: WorldState;
  initialQuest: {
    title: string;
    summary: string;
    objectives: string[];
  };
};

export type GameSystemPlugin = {
  id: string;
  displayName: string;
  rulesPrimer: string;
  seedWorld: (input: WorldSeedInput) => SeedResult;
  normalizeCharacter: (character: CharacterRecord) => CharacterRecord;
  normalizeCharacterPatch: (character: CharacterRecord, patch: CharacterPatch) => CharacterPatch;
  normalizeQuest: (quest: QuestRecord) => QuestRecord;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hashText = (value: string) => {
  let hash = 17;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
};

const pickVariant = <T>(seed: string, variants: readonly T[]) => variants[hashText(seed) % variants.length];

const excerpt = (value: string, limit: number) => {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const titleCaseFromSystemId = (systemId: string) =>
  systemId
    .split(/[-_]+/g)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeCharacterBase = (character: CharacterRecord) => ({
  ...character,
  level: clamp(character.level, 1, 40),
  hpMax: clamp(character.hpMax, 1, 1000),
  hpCurrent: clamp(character.hpCurrent, 0, character.hpMax),
  hpTemp: clamp(character.hpTemp, 0, 1000)
});

const normalizeCharacterPatchBase = (character: CharacterRecord, patch: CharacterPatch) => ({
  ...patch,
  hpTemp:
    typeof patch.hpTemp === "number"
      ? clamp(patch.hpTemp, 0, 1000)
      : patch.hpTemp,
  hpDelta:
    typeof patch.hpDelta === "number"
      ? clamp(patch.hpDelta, -character.hpMax, character.hpMax)
      : patch.hpDelta
});

const normalizeQuestBase = (quest: QuestRecord) => ({
  ...quest,
  progress: clamp(quest.progress, 0, 100)
});

const genericLocations = [
  "Lantern Crossroads",
  "Ashfall Harbor",
  "Morrow Vale",
  "Thornwatch Keep",
  "Starfall Gate",
  "The Iron Market"
] as const;

const genericTimes = [
  "Opening Scene / First Watch",
  "Day 1 / Dawn",
  "Day 1 / Dusk",
  "Nightfall / Second Bell",
  "Early Morning / Travel Hour"
] as const;

const genericWeather = [
  "Cold rain and torch-smoke",
  "Low fog threaded with distant bells",
  "Dry wind carrying ash and rumor",
  "Still air before an approaching storm",
  "A clear sky with an uneasy hush"
] as const;

const genericThreats = [
  "Rival faction pressure",
  "A hidden enemy watching from the edge",
  "A dangerous shortage of key supplies",
  "An ancient secret close to surfacing",
  "Unstable local alliances",
  "A panic that could turn the region violent"
] as const;

const genericStoryBeats = [
  "The party arrives just before the balance of power tips.",
  "A local problem is about to become everyone else's emergency.",
  "The first decision will reveal who gains momentum in the region.",
  "An uneasy status quo is already cracking around the party."
] as const;

const genericQuestTitles = [
  "Secure Safe Passage",
  "Win a First Ally",
  "Recover the Missing Key",
  "Hold the Line",
  "Map the Unknown"
] as const;

const buildGenericWorldSeed = ({ campaignName, description }: WorldSeedInput): SeedResult => {
  const location = pickVariant(`${campaignName}:location`, genericLocations);
  const worldTime = pickVariant(`${campaignName}:time`, genericTimes);
  const weather = pickVariant(`${campaignName}:weather`, genericWeather);
  const primaryThreat = pickVariant(`${campaignName}:threat:1`, genericThreats);
  const secondaryThreat = pickVariant(
    `${description}:threat:2`,
    genericThreats.filter((threat) => threat !== primaryThreat)
  );
  const openingQuestTitle = pickVariant(`${campaignName}:quest`, genericQuestTitles);
  const storyBeat = pickVariant(`${campaignName}:story`, genericStoryBeats);
  const summary = excerpt(description, 240);

  return {
    worldState: {
      location,
      worldTime,
      weather,
      activeThreats: [primaryThreat, secondaryThreat],
      sceneSummary: `${campaignName} opens in ${location}. ${summary}`,
      storyBeat,
      visualPrompt: `${campaignName}, ${location}, ${weather.toLowerCase()}, tabletop adventure scene, cinematic illustration`
    },
    initialQuest: {
      title: openingQuestTitle,
      summary: `Establish a foothold in ${location} before ${primaryThreat.toLowerCase()} turns the opening situation against the party.`,
      objectives: [
        `Learn who actually controls ${location}`,
        `Secure one ally, route, or resource before the next setback`,
        `Expose the first clue behind ${secondaryThreat.toLowerCase()}`
      ]
    }
  };
};

const gammaWorldPlugin: GameSystemPlugin = {
  id: "gamma-world",
  displayName: "Gamma World",
  rulesPrimer:
    "Gamma World: post-apocalyptic science-fantasy, mutations, unstable technology, faction tension, dangerous exploration, fast dramatic consequences.",
  seedWorld: ({ campaignName, description }) => ({
    worldState: {
      location: "Rupture Expanse",
      worldTime: "Cycle 1 / Dawn",
      weather: "Irradiated wind with static arcs",
      activeThreats: ["Mutant scavengers", "Stormfront anomalies"],
      sceneSummary: `The campaign '${campaignName}' begins at the edge of a shattered arcology. ${description}`,
      storyBeat: "The party assembles and takes first contact with the zone.",
      visualPrompt:
        "Collapsed megastructures, bioluminescent fog, mutant ruins, storm-lit horizon, salvage caravans"
    },
    initialQuest: {
      title: "Secure a Foothold",
      summary: "Establish a safe base, gather intel on local factions, and survive the first incursion.",
      objectives: [
        "Scout a defensible shelter",
        "Recover one critical supply cache",
        "Identify one faction and their intent"
      ]
    }
  }),
  normalizeCharacter: normalizeCharacterBase,
  normalizeCharacterPatch: normalizeCharacterPatchBase,
  normalizeQuest: normalizeQuestBase
};

const createGenericPlugin = (systemId: string): GameSystemPlugin => {
  const displayName = systemId === "generic" ? "Generic RPG" : titleCaseFromSystemId(systemId);
  return {
    id: systemId,
    displayName,
    rulesPrimer: `${displayName}: maintain coherent world state, bounded stats, and meaningful consequences that respect the selected ruleset.`,
    seedWorld: buildGenericWorldSeed,
    normalizeCharacter: normalizeCharacterBase,
    normalizeCharacterPatch: normalizeCharacterPatchBase,
    normalizeQuest: normalizeQuestBase
  };
};

const pluginMap = new Map<string, GameSystemPlugin>([
  [gammaWorldPlugin.id, gammaWorldPlugin]
]);

export const getSystemPlugin = (systemId: string) => pluginMap.get(systemId) ?? createGenericPlugin(systemId);
