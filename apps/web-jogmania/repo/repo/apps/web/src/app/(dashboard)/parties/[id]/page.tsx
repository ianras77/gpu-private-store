"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Party, WorldEvent } from "@jogmania/api-client";
import type { Route, Workout } from "@jogmania/shared";

export default function PartyDetailPage() {
  const params = useParams();
  const partyId = Array.isArray(params.id) ? params.id[0] : (params.id as string | undefined);
  const { user } = useAuth();
  const api = useApi();
  const [party, setParty] = useState<Party | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedRun, setSelectedRun] = useState("");
  const [loadingEnter, setLoadingEnter] = useState(false);
  const [loadingPlay, setLoadingPlay] = useState(false);

  useEffect(() => {
    if (!user || !partyId) return;
    api.getParty(partyId).then(setParty).catch(() => setParty(null));
    api.listRoutes().then(setRoutes).catch(() => setRoutes([]));
    api.listWorkouts().then(setWorkouts).catch(() => setWorkouts([]));
    api.listWorldEvents(partyId).then(setEvents).catch(() => setEvents([]));
  }, [api, user, partyId]);

  const world = party?.world ?? null;
  const courses = routes.filter((route) => route.is_course);

  useEffect(() => {
    if (world?.route_id) setSelectedCourse(world.route_id);
  }, [world?.route_id]);

  const state = (world?.state_json ?? {}) as Record<string, unknown>;
  const chapter = state.chapter as number | undefined;
  const threat = state.threat as number | undefined;
  const relics = (state.relics as string[]) ?? [];
  const sessions = (state.sessions as number) ?? 0;
  const bossReady = (state.boss_ready as boolean) ?? false;
  const successStreak = (state.success_streak as number) ?? 0;
  const bossesDefeated = (state.bosses_defeated as number) ?? 0;

  const recentRunOptions = useMemo(
    () =>
      workouts
        .slice(0, 6)
        .map((run) => ({
          id: run.id,
          label: `${new Date(run.started_at).toLocaleDateString()} · ${(run.distance_m / 1000).toFixed(2)} km`
        })),
    [workouts]
  );

  const handleEnter = async () => {
    if (!partyId || !selectedCourse || loadingEnter) return;
    setLoadingEnter(true);
    try {
      const updated = await api.enterWorld(partyId, selectedCourse);
      setParty((prev) => (prev ? { ...prev, world: updated } : prev));
    } finally {
      setLoadingEnter(false);
    }
  };

  const handlePlay = async () => {
    if (!partyId || !selectedRun || loadingPlay) return;
    setLoadingPlay(true);
    try {
      const event = await api.playWorld(partyId, selectedRun);
      setEvents((prev) => [event, ...prev]);
    } finally {
      setLoadingPlay(false);
    }
  };

  if (!party) {
    return <div className="text-sm text-jm-muted">Loading party...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 jm-holo">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="jm-kicker">Party</p>
            <h3 className="font-display text-2xl">{party.name}</h3>
            <p className="text-xs text-jm-muted mt-1">One party, one evolving world.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="cyan">{party.members.length} heroes</Badge>
            <Badge tone="magenta">Sessions {sessions}</Badge>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {party.members.map((member) => (
            <span key={member.id} className="jm-chip text-jm-cyan">
              {member.name} · {member.role}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
        <Card className="p-6 jm-holo">
          <p className="jm-kicker">World</p>
          <h3 className="font-display text-xl mt-2">{world?.name ?? "Unbound World"}</h3>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="jm-chip text-jm-acid">Theme {world?.theme ?? "neon"}</span>
            <span className="jm-chip text-jm-muted">Chapter {chapter ?? 1}</span>
            <span className="jm-chip text-jm-magenta">Threat {threat ?? 1}</span>
            <span className="jm-chip text-jm-cyan">Streak {successStreak}/3</span>
            <span className="jm-chip text-jm-acid">Bosses {bossesDefeated}</span>
            {bossReady && <span className="jm-chip text-jm-magenta">Boss Ready</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {relics.length > 0 ? (
              relics.map((relic) => (
                <span key={relic} className="jm-chip text-jm-magenta">Relic · {relic}</span>
              ))
            ) : (
              <span className="text-xs text-jm-muted">No relics claimed yet.</span>
            )}
          </div>
          <div className="mt-5">
            <label className="text-xs text-jm-muted">Enter Course</label>
            <div className="mt-2 flex flex-wrap gap-3">
              <select
                className="jm-input text-xs"
                value={selectedCourse}
                onChange={(event) => setSelectedCourse(event.target.value)}
              >
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handleEnter} disabled={!selectedCourse || loadingEnter}>
                {loadingEnter ? "Entering..." : "Enter World"}
              </Button>
            </div>
          </div>
          <div className="mt-5">
            <label className="text-xs text-jm-muted">Play Session (text-only)</label>
            <div className="mt-2 flex flex-wrap gap-3">
              <select
                className="jm-input text-xs"
                value={selectedRun}
                onChange={(event) => setSelectedRun(event.target.value)}
              >
                <option value="">Select run</option>
                {recentRunOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handlePlay} disabled={!selectedRun || loadingPlay}>
                {loadingPlay ? "Playing..." : "Play Run"}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 jm-holo">
          <p className="jm-kicker">World Log</p>
          <h3 className="font-display text-xl mt-2">Session Archive</h3>
          <div className="mt-4 space-y-3 text-sm text-jm-muted">
            {events.slice(0, 4).map((event) => (
              <div key={event.id} className="p-3 rounded-xl bg-jm-surface/80 border border-white/10">
                <p className="text-xs text-jm-muted">{new Date(event.created_at).toLocaleString()}</p>
                <p className="text-sm text-jm-text mt-1">{event.title}</p>
              </div>
            ))}
            {events.length === 0 && <p className="text-sm text-jm-muted">No sessions yet.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-6 jm-holo">
        <p className="jm-kicker">Dungeon Master Log</p>
        <h3 className="font-display text-xl mt-2">Latest Session</h3>
        <div className="mt-4 space-y-4 text-sm text-jm-muted">
          {events[0]?.payload_json ? (
            <>
              <p className="text-sm text-jm-text">{events[0].payload_json.intro as string}</p>
              {(events[0].payload_json.beats as string[] | undefined)?.map((beat, idx) => (
                <p key={`beat-${idx}`} className="text-sm">{beat}</p>
              ))}
              {(events[0].payload_json.battles as string[] | undefined)?.length ? (
                <div className="mt-3 space-y-2">
                  {(events[0].payload_json.battles as string[]).map((battle, idx) => (
                    <p key={`battle-${idx}`} className="text-xs text-jm-magenta">{battle}</p>
                  ))}
                </div>
              ) : null}
              {(events[0].payload_json.boss_event as { title?: string; defeated?: boolean } | undefined) ? (
                <div className="mt-3 p-3 rounded-xl bg-jm-surface/80 border border-white/10">
                  <p className="text-xs text-jm-muted">Boss Encounter</p>
                  <p className="text-sm text-jm-text">
                    {(events[0].payload_json.boss_event as { title?: string }).title ?? "Warden"}
                  </p>
                  <p className="text-xs text-jm-acid">
                    {(events[0].payload_json.boss_event as { defeated?: boolean }).defeated ? "Defeated" : "Escaped"}
                  </p>
                </div>
              ) : null}
              <p className="text-xs text-jm-acid">{events[0].payload_json.outro as string}</p>
            </>
          ) : (
            <p className="text-sm text-jm-muted">Play a run to generate the first session narrative.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
