"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useCrtToggle } from "@/components/ClientProviders";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Workout } from "@jogmania/shared";
import type { Device } from "@jogmania/api-client";

function titleize(value: string) {
  if (value === "ios") return "iPhone";
  if (value === "watch" || value === "watchos") return "Apple Watch";
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SettingsPage() {
  const { user } = useAuth();
  const api = useApi();
  const [enabled, setEnabled] = useCrtToggle();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.listWorkouts().then(setWorkouts).catch(() => setWorkouts([]));
    api.listDevices().then(setDevices).catch(() => setDevices([]));
  }, [api, user]);

  const pairingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach((device) => {
      if (!device.companion_device_id) return;
      counts[device.companion_device_id] = (counts[device.companion_device_id] ?? 0) + 1;
    });
    return counts;
  }, [devices]);

  const handleExport = async (id: string) => {
    setExportError(null);
    setExportUrl(null);
    try {
      const res = await api.exportWorkout(id);
      setExportUrl(res.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setExportError(message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p className="jm-kicker">Profile</p>
        <h3 className="font-display text-xl mt-2">Runner identity</h3>
        <div className="mt-4 text-sm text-jm-muted">
          <p>Email</p>
          <p className="text-jm-text">{user?.email ?? "Not connected"}</p>
        </div>
      </Card>

      <Card className="p-6">
        <p className="jm-kicker">Display</p>
        <h3 className="font-display text-xl mt-2">Console effects</h3>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-sm">CRT Overlay</p>
            <p className="text-xs text-jm-muted">Optional retro scanlines.</p>
          </div>
          <Button
            onClick={() => setEnabled(!enabled)}
            variant={enabled ? "primary" : "outline"}
            size="sm"
          >
            {enabled ? "On" : "Off"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="jm-kicker">Devices</p>
            <h3 className="font-display text-xl mt-2">Connected gear</h3>
          </div>
          <Badge tone={devices.length ? "cyan" : "slate"}>{devices.length} connected</Badge>
        </div>
        <p className="text-sm text-jm-muted mt-2">iPhone and Apple Watch sync status for this account.</p>
        <div className="mt-4 space-y-3">
          {devices.map((device) => {
            const linked = Boolean(device.companion_device_id || pairingCounts[device.device_id]);
            return (
              <div
                key={device.id}
                className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm text-jm-text">{device.name ?? titleize(device.platform)}</p>
                  <p className="text-xs text-jm-muted mt-1">
                    {titleize(device.platform)} · Last seen {new Date(device.last_seen_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-jm-muted mt-1">
                    {device.last_sync_at
                      ? `Last workout sync ${new Date(device.last_sync_at).toLocaleString()}`
                      : "Waiting for first workout sync"}
                  </p>
                </div>
                <Badge tone={linked ? "cyan" : "slate"}>{linked ? "Linked" : "Standalone"}</Badge>
              </div>
            );
          })}
          {devices.length === 0 && (
            <div className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl text-xs text-jm-muted">
              No devices connected yet. Sign in on iPhone or sync a watch run to register gear.
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <p className="jm-kicker">Export</p>
        <h3 className="font-display text-xl mt-2">Export Data</h3>
        <p className="text-sm text-jm-muted mt-2">Generate a JSON export for any run.</p>
        <div className="mt-4 space-y-3">
          {workouts.slice(0, 3).map((run) => (
            <div key={run.id} className="flex items-center justify-between p-3 bg-jm-surface/80 border border-white/10 rounded-xl">
              <span className="text-xs">{new Date(run.started_at).toLocaleDateString()}</span>
              <Button onClick={() => handleExport(run.id)} size="sm">
                Export
              </Button>
            </div>
          ))}
        </div>
        {exportUrl && (
          <p className="text-xs text-jm-acid mt-4">
            Export ready:{" "}
            <a className="underline" href={exportUrl} target="_blank" rel="noreferrer">
              Open JSON
            </a>
          </p>
        )}
        {exportError && (
          <p className="text-xs text-jm-magenta mt-4">
            {exportError}
          </p>
        )}
      </Card>
    </div>
  );
}
