import type { LootItem } from "@/lib/loot";
import NeonButton from "./NeonButton";

export default function LootModal({
  items,
  onClose
}: {
  items: LootItem[] | null;
  onClose: () => void;
}) {
  if (!items) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
      <div className="pixel-border w-full max-w-md rounded-2xl bg-[#0b0b16] p-6 text-center">
        <div className="font-pixel text-neon-pink mb-4">Loot Cache</div>
        <div className="space-y-3 text-sm">
          {items.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="rounded-xl bg-black/50 p-3">
              <div className="text-neon-yellow text-xs uppercase">{item.rarity}</div>
              <div className="text-white text-lg">{item.name}</div>
              <div className="text-white/60 text-xs">{item.description}</div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <NeonButton label="Back to Cabinet" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
