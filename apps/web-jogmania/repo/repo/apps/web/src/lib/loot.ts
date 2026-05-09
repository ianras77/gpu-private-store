import type { RunSummary } from "@/game/RunnerGame";

export type LootItem = {
  name: string;
  rarity: "common" | "rare" | "epic";
  description: string;
};

const COMMON_LOOT: LootItem[] = [
  { name: "Static Charm", rarity: "common", description: "Keeps the CRT humming." },
  { name: "Glow Band", rarity: "common", description: "A steady pulse of jungle light." },
  { name: "Arcade Token", rarity: "common", description: "Trade for a pace boost later." }
];

const RARE_LOOT: LootItem[] = [
  { name: "Jungle Prism", rarity: "rare", description: "Splits neon light into pace boosts." },
  { name: "Pulse Capsule", rarity: "rare", description: "Stabilizes streaks under pressure." },
  { name: "Relic Compass", rarity: "rare", description: "Points toward hidden shortcuts." }
];

const EPIC_LOOT: LootItem[] = [
  { name: "Turbo Idol", rarity: "epic", description: "Turns every split into a highlight reel." },
  { name: "Laser Crown", rarity: "epic", description: "Earned by the fastest jungle runners." },
  { name: "Void Lantern", rarity: "epic", description: "Lights the course when the pace surges." }
];

function pickFrom(list: LootItem[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export function rollLoot(summary: RunSummary, sessionPoints: number): LootItem[] {
  const paceScore = summary.avg_pace_s_per_km ? Math.max(0, 420 - summary.avg_pace_s_per_km) : 0;
  const distanceScore = summary.distance_m / 100;
  const totalScore = paceScore + distanceScore + sessionPoints * 0.8;

  if (totalScore > 380) {
    return [pickFrom(EPIC_LOOT), pickFrom(RARE_LOOT)];
  }
  if (totalScore > 220) {
    return [pickFrom(RARE_LOOT), pickFrom(COMMON_LOOT)];
  }
  return [pickFrom(COMMON_LOOT), pickFrom(COMMON_LOOT)];
}
