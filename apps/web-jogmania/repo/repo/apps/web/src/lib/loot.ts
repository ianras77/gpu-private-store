import type { RunSummary } from "@/game/RunnerGame";

export type LootItem = {
  name: string;
  description: string;
};

const SOUVENIRS: LootItem[] = [
  { name: "Ticket Stub from Nowhere", description: "A little paper ticket. The date says tomorrow." },
  { name: "Glow Pebble", description: "Warm as toast, bright as a tiny star." },
  { name: "Lantern Mouse Badge", description: "Official assistant to the Lost Arcade." },
  { name: "Moon Moth Sticker", description: "It keeps trying to land on the moon." },
  { name: "Riverglass Marble", description: "A whole blue evening, small enough to pocket." },
  { name: "Pocket-Sized Pinball", description: "It makes one very satisfying plink." },
];

export function rollLoot(summary: RunSummary): LootItem[] {
  const relics = summary.events.filter((event) => event.type === "relic").length;
  const distanceSouvenir = summary.distance_m >= 5000 ? 2 : summary.distance_m >= 1200 ? 1 : 0;
  const count = Math.min(4, Math.max(1, 1 + Math.min(2, relics) + distanceSouvenir));
  const seed = Math.floor(summary.distance_m) + Math.floor(summary.duration_s) + relics * 97;
  const available = [...SOUVENIRS];
  const selected: LootItem[] = [];

  for (let index = 0; index < count && available.length > 0; index += 1) {
    const choice = (seed + index * 37) % available.length;
    selected.push(available.splice(choice, 1)[0]);
  }

  return selected;
}
