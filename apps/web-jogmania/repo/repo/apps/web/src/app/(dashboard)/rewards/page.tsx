"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Reward, InventoryItem } from "@jogmania/api-client";

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

  useEffect(() => {
    if (!user) return;
    api.getRewards().then(setRewards).catch(() => setRewards([]));
    api.getInventory().then(setInventory).catch(() => setInventory([]));
  }, [api, user]);

  return (
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
                  <span className="jm-chip text-jm-acid">+{Math.round(reward.payload_json.points)} pts</span>
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
            <h3 className="font-display text-xl mt-2">Gear stash</h3>
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
  );
}
