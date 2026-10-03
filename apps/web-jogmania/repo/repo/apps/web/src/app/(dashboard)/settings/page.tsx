"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useCrtToggle } from "@/components/ClientProviders";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Workout } from "@jogmania/shared";
import type { Device, RunnerPreferences, RunnerProfile } from "@jogmania/api-client";

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
  const [runnerProfile, setRunnerProfile] = useState<RunnerProfile | null>(null);
  const [savingStory, setSavingStory] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [memoryCleared, setMemoryCleared] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.listWorkouts().then(setWorkouts).catch(() => setWorkouts([]));
    api.listDevices().then(setDevices).catch(() => setDevices([]));
    api.getRunnerProfile().then(setRunnerProfile).catch(() => setRunnerProfile(null));
  }, [api, user]);

  const saveStoryPreference = async (patch: Partial<RunnerPreferences>) => {
    setSavingStory(true);
    try {
      setRunnerProfile(await api.updateRunnerProfile(patch));
    } finally {
      setSavingStory(false);
    }
  };

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
        <h3 className="font-display text-xl mt-2">Arcade sparkle</h3>
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
        <p className="jm-kicker">Your Adventure</p>
        <h3 className="font-display text-xl mt-2">Make the arcade yours</h3>
        <p className="text-sm text-jm-muted mt-2">Jogmania learns from the courses you revisit and the chapters you unlock. Pick the voice and feel you want along the way.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-jm-muted mb-2">Story voice</span>
            <select
              className="jm-input w-full"
              value={runnerProfile?.preferences.adventure_tone ?? "storybook"}
              disabled={!runnerProfile || savingStory}
              onChange={(event) => void saveStoryPreference({ adventure_tone: event.target.value as RunnerPreferences["adventure_tone"] })}
            >
              <option value="storybook">Warm storybook</option>
              <option value="silly">Silly sidekick</option>
              <option value="mystery">Curious mystery</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-jm-muted mb-2">Today&apos;s feeling</span>
            <select
              className="jm-input w-full"
              value={runnerProfile?.preferences.run_intention ?? "surprise"}
              disabled={!runnerProfile || savingStory}
              onChange={(event) => void saveStoryPreference({ run_intention: event.target.value as RunnerPreferences["run_intention"] })}
            >
              <option value="surprise">Surprise me</option>
              <option value="easy">A gentle wander</option>
              <option value="explore">Find something new</option>
              <option value="steady">A familiar rhythm</option>
              <option value="repeat">Visit a favorite</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-jm-surface/70 p-4">
          <div>
            <p className="text-sm">Watch story taps</p>
            <p className="text-xs text-jm-muted mt-1">A soft wrist tap when a little discovery appears.</p>
          </div>
          <Button
            onClick={() => void saveStoryPreference({ haptics_enabled: !runnerProfile?.preferences.haptics_enabled })}
            variant={runnerProfile?.preferences.haptics_enabled ? "primary" : "outline"}
            size="sm"
            disabled={!runnerProfile || savingStory}
          >
            {runnerProfile?.preferences.haptics_enabled ? "On" : "Off"}
          </Button>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-jm-surface/70 p-4">
          <div>
            <p className="text-sm">Optional heart and energy readings</p>
            <p className="mt-1 text-xs text-jm-muted">Off by default. Only used for your own run details, never sparks, unlocks, or story claims.</p>
          </div>
          <Button
            onClick={() => void saveStoryPreference({ health_data_enabled: !runnerProfile?.preferences.health_data_enabled })}
            variant={runnerProfile?.preferences.health_data_enabled ? "primary" : "outline"}
            size="sm"
            disabled={!runnerProfile || savingStory}
          >
            {runnerProfile?.preferences.health_data_enabled ? "On" : "Off"}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-jm-surface/70 p-4">
          <div>
            <p className="text-sm">Story feedback</p>
            <p className="mt-1 text-xs text-jm-muted">Current nudge: {runnerProfile?.preferences.story_feedback ?? "default"}. Your run facts stay yours; this only steers the writing.</p>
          </div>
          <Button size="sm" variant="outline" disabled={!runnerProfile || savingStory} onClick={() => void api.clearRunnerMemory().then(() => { setRunnerProfile(null); setMemoryCleared(true); })}>Clear story memory</Button>
        </div>
        {memoryCleared ? <p className="mt-2 text-xs text-jm-acid">Story memory cleared. Your run history and rewards are untouched.</p> : null}
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
