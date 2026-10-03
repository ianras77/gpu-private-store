"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Party, WorldEvent } from "@jogmania/api-client";
import type { Route } from "@jogmania/shared";

export default function PartyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = Array.isArray(params.id) ? params.id[0] : (params.id as string | undefined);
  const { user } = useAuth();
  const api = useApi();
  const [party, setParty] = useState<Party | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [loadingEnter, setLoadingEnter] = useState(false);
  const [ticketCopied, setTicketCopied] = useState(false);

  useEffect(() => {
    if (!user || !partyId) return;
    api.getParty(partyId).then(setParty).catch(() => setParty(null));
    api.listRoutes().then(setRoutes).catch(() => setRoutes([]));
    api.listWorldEvents(partyId).then(setEvents).catch(() => setEvents([]));
  }, [api, user, partyId]);

  const world = party?.world ?? null;
  const courses = routes.filter((route) => route.is_course);

  useEffect(() => {
    if (world?.route_id) setSelectedCourse(world.route_id);
  }, [world?.route_id]);

  const state = (world?.state_json ?? {}) as Record<string, unknown>;
  const arcade = (state.arcade as Record<string, unknown> | undefined) ?? {};
  const lights = (arcade.chapter_lights as string[] | undefined) ?? [];
  const project = (arcade.project as { runs?: number; target_runs?: number; complete?: boolean; title?: string; message?: string } | undefined) ?? {};
  const projectPercent = Math.min(100, Math.round((Number(project.runs ?? 0) / Math.max(1, Number(project.target_runs ?? 12))) * 100));

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

  const copyCrewTicket = async () => {
    if (!party) return;
    try {
      await navigator.clipboard.writeText(party.invite_code);
      setTicketCopied(true);
    } catch {
      setTicketCopied(false);
    }
  };

  const leaveCrew = async () => {
    if (!partyId || !party || party.is_worldkeeper) return;
    await api.leaveParty(partyId);
    router.replace("/parties");
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
            <p className="text-xs text-jm-muted mt-1">A tiny crew, a real route, an arcade that grows with every run.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="cyan">{party.members.length} pals</Badge>
            <Badge tone="magenta">{Number(arcade.runs ?? 0)} adventures</Badge>
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
          <p className="jm-kicker">Your outdoor arcade</p>
          <h3 className="font-display text-xl mt-2">{world?.name ?? "The Lost Arcade"}</h3>
          <p className="mt-2 text-sm text-jm-muted">{String(arcade.chapter ?? "Marquee Mystery")} · One new corner of this little place wakes up with every saved run.</p>
          <div className="mt-4 rounded-2xl border border-jm-cyan/25 bg-gradient-to-br from-[#30124b] via-[#10162d] to-[#06353c] p-5">
            <div className="flex min-h-24 items-end gap-2" aria-label="Arcade lights">
              {["🎟️", "🎯", "🪙", "🐭", "🎈"].map((emoji, index) => (
                <div key={emoji} className={`flex h-16 w-12 items-center justify-center rounded-t-2xl border border-white/10 text-2xl transition ${index < lights.length ? "bg-neon-yellow/20 shadow-[0_0_18px_rgba(255,216,77,0.35)]" : "bg-black/30 opacity-35"}`}>
                  {emoji}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {lights.map((light) => <span key={light} className="jm-chip text-jm-acid">✦ {light}</span>)}
              {!lights.length ? <span className="text-xs text-jm-muted">The marquee is waiting for its first spark.</span> : null}
            </div>
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
          {party.is_worldkeeper ? <div className="mt-5">
            <p className="text-xs text-jm-muted">Choose the real course where this world lives. Every saved run on it adds a new light.</p>
          </div> : <p className="mt-5 text-xs text-jm-muted">Your course and run details stay in your account. When you save an ordinary run, one new light appears here for the whole crew.</p>}
          <div className="mt-5 rounded-2xl border border-jm-magenta/20 bg-jm-surface/80 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="jm-kicker">Crew project</p><p className="mt-1 text-base text-jm-text">{project.title ?? "The Grand Reopening"}</p></div><Badge tone={project.complete ? "acid" : "magenta"}>{project.complete ? "The doors are open!" : `${Number(project.runs ?? 0)} / ${Number(project.target_runs ?? 12)} runs`}</Badge></div>
            <p className="mt-2 text-xs text-jm-muted">{project.message ?? "Every crew member's ordinary run adds one candle to the grand reopening. No shared pace board, no schedule, no pressure."}</p>
            <div className="jm-meter mt-3" role="progressbar" aria-valuenow={projectPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Grand Reopening progress"><span style={{ width: `${projectPercent}%` }} /></div>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-jm-muted">Invite a running pal. They add lights to this same arcade; your route, pace and run details stay yours.</p>
            <p className="mt-2 font-mono text-lg tracking-[0.18em] text-jm-acid">{party.invite_code}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void copyCrewTicket()}>{ticketCopied ? "Ticket copied" : "Copy crew ticket"}</Button>
              {!party.is_worldkeeper ? <Button size="sm" variant="ghost" onClick={() => void leaveCrew()}>Leave crew</Button> : null}
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
        <p className="jm-kicker">The latest little change</p>
        <h3 className="font-display text-xl mt-2">World Postcard</h3>
        <div className="mt-4 space-y-4 text-sm text-jm-muted">
          {events[0]?.payload_json ? (
            <>
              <p className="text-sm text-jm-text">{events[0].title}</p>
              {(events[0].payload_json.arcade_change as { message?: string; light?: string; chapter?: string } | undefined)?.message ? (
                <div className="mt-3 rounded-xl border border-jm-yellow/20 bg-jm-surface/80 p-4">
                  <p className="text-sm text-jm-acid">{(events[0].payload_json.arcade_change as { message: string }).message}</p>
                  <p className="mt-2 text-xs text-jm-muted">A new little thing is glowing inside {world?.name ?? "the arcade"}.</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-jm-muted">Play a run to generate the first session narrative.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
