import type { Quest } from "@/lib/quest";

export default function QuestPanel({
  quest,
  courseName
}: {
  quest?: Quest | null;
  courseName?: string;
}) {
  return (
    <div className="pixel-border rounded-2xl bg-[#0c0c1b]/80 p-4 text-sm">
      <div className="font-pixel text-neon-yellow text-xs mb-2">
        Course Challenge{courseName ? ` - ${courseName}` : ""}
      </div>
      <div className="text-lg text-white">{quest?.title ?? "Loading quest..."}</div>
      <div className="text-white/70 mt-2">{quest?.goal ?? "Syncing course targets."}</div>
      <div className="text-neon-green mt-3 text-xs">Reward: {quest?.reward ?? "???"}</div>
      <div className="text-white/40 mt-1 text-[10px]">Seed: {quest?.seed ?? "--"}</div>
    </div>
  );
}
