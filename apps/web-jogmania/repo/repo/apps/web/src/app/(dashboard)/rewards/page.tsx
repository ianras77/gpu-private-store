"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Reward, InventoryItem, ProgressionLedgerEntry } from "@jogmania/api-client";

const keepsakes: Record<string, { icon: string; name: string; note: string }> = {
  "arcade-token": { icon: "🪙", name: "Prize tin tokens", note: "A little jingle for every real-world adventure." },
  "chrono-spark": { icon: "⌚", name: "Chrono spark", note: "A tiny thank-you for bringing the Watch along." },
  "course-map-fragment": { icon: "🗺️", name: "Map corners", note: "New trails leave new corners on your map." },
  "postcard-fragment": { icon: "📮", name: "Postcard scraps", note: "Familiar paths add another little memory." },
  "arcade-decoration": { icon: "🎏", name: "Arcade decorations", note: "Trinkets for making the Lost Arcade yours." },
  "glow-band": { icon: "🏮", name: "Lantern band", note: "Your first little bit of arcade glow." },
  "trail-postcard": { icon: "📮", name: "Postcard from the Path", note: "Your first visit gave this trail its own little postbox." },
  "mouse-badge": { icon: "🐭", name: "Mouse Window Badge", note: "A familiar loop means the lantern mouse knows just where to wave." },
  "singing-seed": { icon: "🌷", name: "Singing Garden Seed", note: "This seed hums the arcade theme. It has not found the right key yet." },
  "bridge-ribbon": { icon: "🎏", name: "Bunting Bridge Ribbon", note: "A bright little ribbon from a path that has become a friend." },
  "loopkeeper-pin": { icon: "📍", name: "Loopkeeper Pin", note: "A tiny badge for a trail full of shared footsteps." },
};

const ledgerLabels: Record<string, string> = {
  "run-complete": "You showed up for an adventure",
  "course-discovered": "A new trail joined your map",
  "course-familiarity": "A familiar trail remembered you",
  "arcade-attraction": "Your arcade opened a new attraction",
  "watch-link": "Your Watch joined the crew",
  "arcade-level-up": "Your arcade grew a new corner",
  "course-chapter": "A new page opened on a familiar trail",
};

function titleize(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rewardLabel(reward: Reward) {
  const label = reward.payload_json?.label;
  return typeof label === "string" ? label : titleize(reward.type);
}

function rewardSummary(reward: Reward) {
  const summary = reward.payload_json?.summary;
  return typeof summary === "string" ? summary : null;
}

export default function RewardsPage() {
  const { user } = useAuth();
  const api = useApi();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<ProgressionLedgerEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    api.getRewards().then(setRewards).catch(() => setRewards([]));
    api.getInventory().then(setInventory).catch(() => setInventory([]));
    api.getProgressionLedger().then(setLedger).catch(() => setLedger([]));
  }, [api, user]);

  return (
    <div className="space-y-6">
      <Card className="jm-holo p-6">
        <p className="jm-kicker">The pocket collection</p>
        <h3 className="mt-2 font-display text-2xl">Little things you brought home</h3>
        <p className="mt-2 text-sm text-jm-muted">Every keepsake has a story. Nothing here expires, and no pace is needed.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(keepsakes).map(([key, item]) => {
            const quantity = inventory.find((entry) => entry.item_key === key)?.quantity ?? 0;
            return <div key={key} className={`rounded-2xl border p-4 ${quantity ? "border-jm-cyan/35 bg-jm-surface/80" : "border-white/10 bg-black/20 opacity-60"}`}>
              <div className="flex items-center gap-3"><span className="text-3xl" aria-hidden="true">{item.icon}</span><div><p className="text-sm text-jm-text">{item.name}</p><p className="text-xs text-jm-cyan">{quantity ? `Pocketed ×${quantity}` : "Waiting to be found"}</p></div></div>
              <p className="mt-3 text-xs leading-5 text-jm-muted">{item.note}</p>
            </div>;
          })}
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="jm-kicker">Rewards</p>
            <h3 className="font-display text-xl mt-2">Arcade unlocks</h3>
          </div>
          <Badge tone="acid">{rewards.length} earned</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {rewards.map((reward) => (
            <div key={reward.id} className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{rewardLabel(reward)}</p>
                {typeof reward.payload_json?.points === "number" ? (
                  <span className="jm-chip text-jm-acid">+{Math.round(reward.payload_json.points)} sparks</span>
                ) : null}
              </div>
              {rewardSummary(reward) ? (
                <p className="text-xs text-jm-muted mt-2">{rewardSummary(reward)}</p>
              ) : null}
              <p className="text-xs text-jm-muted mt-2">{new Date(reward.earned_at).toLocaleDateString()}</p>
            </div>
          ))}
          {rewards.length === 0 && <p className="text-sm text-jm-muted">No rewards yet.</p>}
        </div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="jm-kicker">Inventory</p>
            <h3 className="font-display text-xl mt-2">Pocket souvenirs</h3>
          </div>
          <Badge tone="cyan">{inventory.length} items</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {inventory.map((item) => (
            <div key={item.id} className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl flex justify-between">
              <span className="text-sm">{titleize(item.item_key)}</span>
              <span className="jm-chip text-jm-cyan">x{item.quantity}</span>
            </div>
          ))}
          {inventory.length === 0 && <p className="text-sm text-jm-muted">No inventory items yet.</p>}
        </div>
      </Card>
      </div>
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="jm-kicker">The arcade remembers</p><h3 className="mt-2 font-display text-xl">How the sparks got here</h3></div><Badge tone="cyan">{ledger.length} moments</Badge></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {ledger.map((entry) => <div key={entry.id} className="rounded-xl border border-white/10 bg-jm-surface/70 p-3">
            <p className="text-sm text-jm-text">{ledgerLabels[entry.reason_code] ?? titleize(entry.reason_code)}</p>
            <p className="mt-1 text-xs text-jm-muted">{entry.reason_code === "run-complete" ? `A real run added ${entry.sparks} sparks.` : "Earned from a saved run. Progress is permanent."}</p>
            <p className="mt-2 text-[11px] text-jm-muted">{new Date(entry.created_at).toLocaleDateString()} · record v{entry.ledger_version}</p>
          </div>)}
          {ledger.length === 0 ? <p className="text-sm text-jm-muted">Your first run will write the first page.</p> : null}
        </div>
      </Card>
    </div>
  );
}
