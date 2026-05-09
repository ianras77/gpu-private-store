"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { cn } from "../../lib/utils";

type DmViewer = {
  id: string;
  email: string;
  displayName: string;
};

type DmRole = "dm" | "player";

type CampaignSummary = {
  id: string;
  name: string;
  systemId: string;
  description: string;
  role: DmRole;
  playerCount: number;
  characterCount: number;
  activeQuestCount: number;
  updatedAt: string;
};

type InventoryItem = { id: string; name: string; detail?: string; quantity: number };
type CharacterRecord = {
  id: string;
  userId: string;
  name: string;
  archetype: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  status: string;
  notes?: string;
  inventory: InventoryItem[];
};

type QuestRecord = {
  id: string;
  title: string;
  summary: string;
  status: "active" | "completed" | "failed" | "paused";
  progress: number;
  objectives: Array<{ id: string; text: string; completed: boolean }>;
};

type EventRecord = {
  id: string;
  type: string;
  actorUserId?: string | null;
  actorCharacterId?: string | null;
  summary: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

type PlayerDashboardState = {
  campaign: {
    id: string;
    name: string;
    systemId: string;
    description: string;
    worldState: {
      location: string;
      worldTime: string;
      weather: string;
      activeThreats: string[];
      sceneSummary: string;
      storyBeat: string;
      visualPrompt: string;
    };
  };
  role: DmRole;
  activeCharacter: CharacterRecord | null;
  ownedCharacters: CharacterRecord[];
  party: CharacterRecord[];
  quests: QuestRecord[];
  worldState: {
    location: string;
    worldTime: string;
    weather: string;
    activeThreats: string[];
    sceneSummary: string;
    storyBeat: string;
    visualPrompt: string;
  };
  recentEvents: EventRecord[];
  stats: {
    totalRolls: number;
    criticalSuccesses: number;
    criticalFailures: number;
    averageRollTotal: number | null;
    actionsTaken: number;
    dmResponsesSeen: number;
    lastActionAt: string | null;
    lastRollAt: string | null;
  };
  keyMoments: string[];
  suggestedPrompts: string[];
};

type RollOutcome = {
  roll: {
    expression: string;
    rolls: number[];
    total: number;
    modifier: number;
    criticalSuccess: boolean;
    criticalFailure: boolean;
  };
  summary: string;
  resolution?: {
    turn?: {
      narration?: string;
      shortSummary?: string;
    };
  };
};

type DiceRollTimelineRecord = {
  id: string;
  actorUserId?: string | null;
  actorCharacterId?: string | null;
  turnId?: string | null;
  expression: string;
  rolls: number[];
  total: number;
  summary: string;
  outcomeStatus: string;
  outcomeSummary?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
};

type StateTransitionTimelineRecord = {
  id: string;
  actorUserId?: string | null;
  actorCharacterId?: string | null;
  turnId?: string | null;
  entityType: string;
  entityId?: string | null;
  fieldPath: string;
  transitionType: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
};

const formatAgo = (iso: string | null) => {
  if (!iso) return "n/a";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const compactValue = (value: unknown) => {
  if (value === null || typeof value === "undefined") return "null";
  if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 89)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 120 ? `${serialized.slice(0, 119)}...` : serialized;
  } catch {
    return "unserializable";
  }
};

export default function PlayerDashboardPage() {
  const [viewer, setViewer] = useState<DmViewer | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [state, setState] = useState<PlayerDashboardState | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  const [actionText, setActionText] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastNarration, setLastNarration] = useState<string | null>(null);

  const [rollExpression, setRollExpression] = useState("d20");
  const [rollReason, setRollReason] = useState("");
  const [rollPending, setRollPending] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState<RollOutcome | null>(null);
  const [recentRolls, setRecentRolls] = useState<DiceRollTimelineRecord[]>([]);
  const [recentTransitions, setRecentTransitions] = useState<StateTransitionTimelineRecord[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [streamError, setStreamError] = useState<string | null>(null);

  const refreshTimerRef = useRef<number | null>(null);

  const fetchTimeline = useCallback(async (campaignId: string, silent = false) => {
    if (!silent) setTimelineLoading(true);
    setTimelineError(null);
    try {
      const [rollsResponse, transitionsResponse] = await Promise.all([
        fetch(`/api/dm/campaigns/${campaignId}/rolls?limit=80`, { cache: "no-store" }),
        fetch(`/api/dm/campaigns/${campaignId}/transitions?limit=120`, { cache: "no-store" })
      ]);

      const rollsPayload = (await rollsResponse.json()) as {
        rolls?: DiceRollTimelineRecord[];
        error?: string;
      };
      const transitionsPayload = (await transitionsResponse.json()) as {
        transitions?: StateTransitionTimelineRecord[];
        error?: string;
      };

      if (!rollsResponse.ok || !transitionsResponse.ok) {
        setTimelineError(rollsPayload.error ?? transitionsPayload.error ?? "timeline_failed");
        return;
      }

      setRecentRolls(rollsPayload.rolls ?? []);
      setRecentTransitions(transitionsPayload.transitions ?? []);
    } catch {
      setTimelineError("timeline_failed");
    } finally {
      if (!silent) setTimelineLoading(false);
    }
  }, []);

  const fetchPlayerState = useCallback(
    async (campaignId: string, characterId?: string | null, silent = false) => {
      if (!silent) setStateLoading(true);
      setStateError(null);
      try {
        const query =
          characterId && characterId.trim()
            ? `?characterId=${encodeURIComponent(characterId)}`
            : "";
        const response = await fetch(`/api/dm/campaigns/${campaignId}/player-state${query}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { state?: PlayerDashboardState; error?: string };
        if (!response.ok || !payload.state) {
          setStateError(payload.error ?? "player_state_failed");
          return;
        }
        setState(payload.state);
        if (payload.state.activeCharacter?.id) {
          setSelectedCharacterId(payload.state.activeCharacter.id);
        }
        await fetchTimeline(campaignId, true);
      } catch {
        setStateError("player_state_failed");
      } finally {
        if (!silent) setStateLoading(false);
      }
    },
    [fetchTimeline]
  );

  const fetchCampaigns = useCallback(
    async (preferredCampaignId?: string | null) => {
      setCampaignsLoading(true);
      setCampaignError(null);
      try {
        const response = await fetch("/api/dm/campaigns", { cache: "no-store" });
        const payload = (await response.json()) as { campaigns?: CampaignSummary[]; error?: string };
        if (!response.ok) {
          setCampaignError(payload.error ?? "campaign_list_failed");
          return;
        }
        const next = payload.campaigns ?? [];
        setCampaigns(next);
        const selected =
          preferredCampaignId && next.some((entry) => entry.id === preferredCampaignId)
            ? preferredCampaignId
            : next[0]?.id ?? null;
        setActiveCampaignId(selected);
        if (selected) {
          await fetchPlayerState(selected, selectedCharacterId, true);
        } else {
          setState(null);
          setRecentRolls([]);
          setRecentTransitions([]);
        }
      } catch {
        setCampaignError("campaign_list_failed");
      } finally {
        setCampaignsLoading(false);
      }
    },
    [fetchPlayerState, selectedCharacterId]
  );

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        const response = await fetch("/api/dm/auth/me", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setViewer(null);
          return;
        }
        const payload = (await response.json()) as { user?: DmViewer | null };
        if (!cancelled) setViewer(payload.user ?? null);
      } catch {
        if (!cancelled) setViewer(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!viewer) return;
    void fetchCampaigns();
  }, [fetchCampaigns, viewer]);

  useEffect(() => {
    if (!viewer || !activeCampaignId) {
      setStreamStatus("idle");
      return;
    }

    setStreamStatus("connecting");
    setStreamError(null);
    const stream = new EventSource(`/api/dm/campaigns/${activeCampaignId}/stream`);

    const queueRefresh = () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void fetchPlayerState(activeCampaignId, selectedCharacterId, true);
        refreshTimerRef.current = null;
      }, 400);
    };

    const onReady = () => {
      setStreamStatus("live");
      setStreamError(null);
    };
    const onEvent = (message: MessageEvent) => {
      try {
        const event = JSON.parse(message.data) as EventRecord;
        if (!event?.type) return;
        if (
          [
            "dm_response",
            "player_action",
            "dice_roll",
            "state_patch",
            "quest_update",
            "character_update"
          ].includes(event.type)
        ) {
          queueRefresh();
        }
      } catch {
        // ignore malformed event payload
      }
    };
    const onError = () => {
      setStreamStatus("error");
      setStreamError("Realtime stream reconnecting...");
    };

    stream.addEventListener("ready", onReady as EventListener);
    stream.addEventListener("event", onEvent as EventListener);
    stream.addEventListener("error", onError as EventListener);

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      stream.removeEventListener("ready", onReady as EventListener);
      stream.removeEventListener("event", onEvent as EventListener);
      stream.removeEventListener("error", onError as EventListener);
      stream.close();
    };
  }, [activeCampaignId, fetchPlayerState, selectedCharacterId, viewer]);

  const submitAuth = async () => {
    setAuthPending(true);
    setAuthError(null);
    try {
      const response = await fetch(
        authMode === "login" ? "/api/dm/auth/login" : "/api/dm/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: authMode === "register" ? displayName : undefined
          })
        }
      );
      const payload = (await response.json()) as { user?: DmViewer; error?: string };
      if (!response.ok || !payload.user) {
        setAuthError(payload.error ?? "auth_failed");
        return;
      }
      setViewer(payload.user);
      setPassword("");
      setDisplayName("");
    } catch {
      setAuthError("auth_failed");
    } finally {
      setAuthPending(false);
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/dm/auth/logout", { method: "POST" });
    setViewer(null);
    setCampaigns([]);
    setActiveCampaignId(null);
    setSelectedCharacterId(null);
    setState(null);
    setRecentRolls([]);
    setRecentTransitions([]);
  };

  const sendAction = async () => {
    if (!activeCampaignId || !actionText.trim()) return;
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/dm/campaigns/${activeCampaignId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: actionText.trim(),
          actorCharacterId: selectedCharacterId ?? undefined
        })
      });
      const payload = (await response.json()) as {
        turn?: { narration?: string };
        error?: string;
      };
      if (!response.ok) {
        setActionError(payload.error ?? "action_failed");
        return;
      }
      setActionText("");
      setLastNarration(payload.turn?.narration ?? null);
      await fetchPlayerState(activeCampaignId, selectedCharacterId, true);
    } catch {
      setActionError("action_failed");
    } finally {
      setActionPending(false);
    }
  };

  const rollAndResolve = async () => {
    if (!activeCampaignId) return;
    setRollPending(true);
    setRollError(null);
    try {
      const response = await fetch(`/api/dm/campaigns/${activeCampaignId}/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expression: rollExpression,
          reason: rollReason,
          actorCharacterId: selectedCharacterId ?? undefined,
          autoResolve: true
        })
      });
      const payload = (await response.json()) as RollOutcome & { error?: string };
      if (!response.ok || !payload.roll) {
        setRollError(payload.error ?? "roll_failed");
        return;
      }
      setLastRoll(payload);
      setLastNarration(payload.resolution?.turn?.narration ?? null);
      await fetchPlayerState(activeCampaignId, selectedCharacterId, true);
    } catch {
      setRollError("roll_failed");
    } finally {
      setRollPending(false);
    }
  };

  const activeCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === activeCampaignId) ?? null,
    [activeCampaignId, campaigns]
  );

  const visibleRolls = useMemo(() => {
    if (!selectedCharacterId) return recentRolls.slice(0, 30);
    return recentRolls.filter((roll) => roll.actorCharacterId === selectedCharacterId).slice(0, 30);
  }, [recentRolls, selectedCharacterId]);

  const visibleTransitions = useMemo(() => {
    if (!selectedCharacterId) return recentTransitions.slice(0, 40);
    return recentTransitions
      .filter((entry) => {
        if (entry.actorCharacterId === selectedCharacterId) return true;
        if (entry.entityType === "character" && entry.entityId === selectedCharacterId) return true;
        if (entry.entityType === "inventory_item" && entry.entityId?.startsWith(`${selectedCharacterId}:`)) return true;
        return false;
      })
      .slice(0, 40);
  }, [recentTransitions, selectedCharacterId]);

  if (authLoading) {
    return (
      <main className="min-h-screen px-6 py-16">
        <Card>Loading player dashboard...</Card>
      </main>
    );
  }

  if (!viewer) {
    return (
      <main className="min-h-screen bg-[#05050b] px-6 py-16 text-cloud">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="p-8">
            <p className="text-xs uppercase tracking-[0.35em] text-cloud/60">Player Dashboard</p>
            <h1 className="section-title mt-4 text-4xl">
              Character State <span className="magical-text">Persists Through Play</span>
            </h1>
            <p className="mt-4 text-sm text-cloud/80">
              Gameplay advances through chat and dice. Every turn writes events, updates world and quest state, and keeps character progression visible.
            </p>
            <div className="mt-6 grid gap-2 text-sm text-cloud/70">
              <div className="rave-chip rounded-2xl px-4 py-2">Chat actions become authoritative session turns.</div>
              <div className="rave-chip rounded-2xl px-4 py-2">Dice rolls are persisted as campaign events.</div>
              <div className="rave-chip rounded-2xl px-4 py-2">Player dashboard stays synced via realtime stream + snapshots.</div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex gap-2">
              <Button
                variant={authMode === "login" ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setAuthMode("login")}
              >
                Login
              </Button>
              <Button
                variant={authMode === "register" ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setAuthMode("register")}
              >
                Register
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {authMode === "register" && (
                <input
                  className="rave-input rounded-2xl px-3 py-2 text-sm"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              )}
              <input
                className="rave-input rounded-2xl px-3 py-2 text-sm"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
              />
              <input
                className="rave-input rounded-2xl px-3 py-2 text-sm"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
              />
              {authError && <div className="text-xs text-rose-300">{authError}</div>}
              <Button
                onClick={submitAuth}
                disabled={
                  authPending ||
                  !email.trim() ||
                  !password.trim() ||
                  (authMode === "register" && !displayName.trim())
                }
              >
                {authPending ? "Working..." : authMode === "login" ? "Sign In" : "Create Account"}
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05050b] px-6 py-10 text-cloud">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cloud/60">Player Dashboard</p>
            <h1 className="section-title text-3xl">
              Welcome, <span className="magical-text">{viewer.displayName}</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void fetchCampaigns(activeCampaignId)}>
              Refresh
            </Button>
            <Button variant="secondary" onClick={logout}>
              Sign Out
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <Card className="p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-cloud/60">Session Controls</p>
            <div className="mt-3 grid gap-3">
              <select
                className="rave-input rounded-2xl px-3 py-2 text-sm"
                value={activeCampaignId ?? ""}
                onChange={(event) => {
                  const next = event.target.value || null;
                  setActiveCampaignId(next);
                  if (next) void fetchPlayerState(next, selectedCharacterId);
                }}
                disabled={campaignsLoading}
              >
                <option value="">Select campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} ({campaign.role})
                  </option>
                ))}
              </select>

              <select
                className="rave-input rounded-2xl px-3 py-2 text-sm"
                value={selectedCharacterId ?? ""}
                onChange={(event) => {
                  const next = event.target.value || null;
                  setSelectedCharacterId(next);
                  if (activeCampaignId) void fetchPlayerState(activeCampaignId, next);
                }}
                disabled={!state?.ownedCharacters.length}
              >
                <option value="">Character focus</option>
                {(state?.ownedCharacters ?? []).map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name} ({character.archetype})
                  </option>
                ))}
              </select>

              {campaignError && <div className="text-xs text-rose-300">{campaignError}</div>}
              {stateError && <div className="text-xs text-rose-300">{stateError}</div>}
              {timelineError && <div className="text-xs text-rose-300">{timelineError}</div>}
              {streamError && <div className="text-xs text-amber-300">{streamError}</div>}
            </div>

            <div className="mt-5 grid gap-2 text-xs text-cloud/70">
              <div className="rave-chip rounded-xl px-3 py-2">Stream: {streamStatus}</div>
              <div className="rave-chip rounded-xl px-3 py-2">Timeline: {timelineLoading ? "syncing" : "ready"}</div>
              <div className="rave-chip rounded-xl px-3 py-2">Campaigns: {campaigns.length}</div>
              <div className="rave-chip rounded-xl px-3 py-2">Updated: {formatAgo(activeCampaign?.updatedAt ?? null)}</div>
            </div>
          </Card>

          <Card className="p-5">
            {!activeCampaignId || !state ? (
              <div className="text-sm text-cloud/70">
                {stateLoading ? "Loading player state..." : "Join or select a campaign to start playing."}
              </div>
            ) : (
              <div className="grid gap-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">World Scene</p>
                    <h2 className="mt-2 text-xl text-white">{state.worldState.location}</h2>
                    <p className="mt-2 text-sm text-cloud/80">{state.worldState.sceneSummary}</p>
                    <p className="mt-2 text-xs text-cloud/60">Story beat: {state.worldState.storyBeat}</p>
                    <p className="mt-1 text-xs text-cloud/60">Threats: {state.worldState.activeThreats.join(", ") || "None"}</p>
                  </div>
                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Character Focus</p>
                    {state.activeCharacter ? (
                      <>
                        <h2 className="mt-2 text-xl text-white">
                          {state.activeCharacter.name} <span className="text-sm text-cloud/60">({state.activeCharacter.archetype})</span>
                        </h2>
                        <p className="mt-2 text-sm text-cloud/80">
                          HP {state.activeCharacter.hpCurrent}/{state.activeCharacter.hpMax} (temp {state.activeCharacter.hpTemp})
                        </p>
                        <p className="text-sm text-cloud/80">Status: {state.activeCharacter.status}</p>
                        {state.activeCharacter.notes && (
                          <p className="mt-2 text-xs text-cloud/60">{state.activeCharacter.notes}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-cloud/80">
                        No owned character found yet. Join a campaign and create one.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Chat Action</p>
                    <textarea
                      className="rave-input mt-3 h-24 w-full resize-none rounded-2xl p-3 text-sm"
                      value={actionText}
                      onChange={(event) => setActionText(event.target.value)}
                      placeholder="Describe what your character does next..."
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {state.suggestedPrompts.slice(0, 3).map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="rave-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cloud/70"
                          onClick={() => setActionText(prompt)}
                        >
                          use prompt
                        </button>
                      ))}
                    </div>
                    {actionError && <p className="mt-2 text-xs text-rose-300">{actionError}</p>}
                    <div className="mt-3 flex justify-end">
                      <Button onClick={sendAction} disabled={actionPending || !actionText.trim()}>
                        {actionPending ? "Sending..." : "Send Action"}
                      </Button>
                    </div>
                    {lastNarration && (
                      <p className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-cloud/80">
                        {lastNarration}
                      </p>
                    )}
                  </div>

                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Dice + Resolve</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[0.35fr_0.65fr]">
                      <input
                        className="rave-input rounded-2xl px-3 py-2 text-sm"
                        value={rollExpression}
                        onChange={(event) => setRollExpression(event.target.value)}
                        placeholder="d20"
                      />
                      <input
                        className="rave-input rounded-2xl px-3 py-2 text-sm"
                        value={rollReason}
                        onChange={(event) => setRollReason(event.target.value)}
                        placeholder="Reason (Perception check, etc.)"
                      />
                    </div>
                    {rollError && <p className="mt-2 text-xs text-rose-300">{rollError}</p>}
                    <div className="mt-3 flex justify-end">
                      <Button onClick={rollAndResolve} disabled={rollPending || !rollExpression.trim()}>
                        {rollPending ? "Rolling..." : "Roll + Resolve"}
                      </Button>
                    </div>
                    {lastRoll && (
                      <div
                        className={cn(
                          "mt-3 rounded-xl border p-3 text-sm",
                          lastRoll.roll.criticalSuccess
                            ? "border-emerald-400/40 bg-emerald-950/20"
                            : lastRoll.roll.criticalFailure
                              ? "border-rose-400/40 bg-rose-950/20"
                              : "border-white/10 bg-black/30"
                        )}
                      >
                        <p className="text-cloud/90">{lastRoll.summary}</p>
                        <p className="mt-1 text-xs text-cloud/60">
                          Rolls: {lastRoll.roll.rolls.join(", ")} | Total: {lastRoll.roll.total}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.45fr_0.55fr]">
                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Player Stats</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-cloud/80">
                      <div className="rave-chip rounded-xl px-3 py-2">Rolls: {state.stats.totalRolls}</div>
                      <div className="rave-chip rounded-xl px-3 py-2">Avg Total: {state.stats.averageRollTotal ?? "n/a"}</div>
                      <div className="rave-chip rounded-xl px-3 py-2">Crits: {state.stats.criticalSuccesses}</div>
                      <div className="rave-chip rounded-xl px-3 py-2">Fumbles: {state.stats.criticalFailures}</div>
                      <div className="rave-chip rounded-xl px-3 py-2">Actions: {state.stats.actionsTaken}</div>
                      <div className="rave-chip rounded-xl px-3 py-2">DM Beats: {state.stats.dmResponsesSeen}</div>
                    </div>
                    <p className="mt-3 text-xs text-cloud/60">
                      Last action: {formatAgo(state.stats.lastActionAt)} | Last roll: {formatAgo(state.stats.lastRollAt)}
                    </p>
                  </div>

                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Quest Tracker</p>
                    <div className="mt-3 grid gap-2 text-sm text-cloud/80">
                      {state.quests.length ? (
                        state.quests.slice(0, 6).map((quest) => (
                          <div key={quest.id} className="rave-chip rounded-xl px-3 py-2">
                            <div className="text-white">{quest.title}</div>
                            <div className="text-xs text-cloud/60">
                              {quest.status} • {quest.progress}% • {quest.objectives.filter((obj) => !obj.completed).length} objectives left
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-cloud/70">No quests tracked yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Key Moments</p>
                    <ul className="mt-3 grid gap-2 text-sm text-cloud/80">
                      {state.keyMoments.length ? (
                        state.keyMoments.map((moment, index) => (
                          <li key={`${moment}-${index}`} className="rave-chip rounded-xl px-3 py-2">
                            {moment}
                          </li>
                        ))
                      ) : (
                        <li className="text-cloud/70">No key moments yet.</li>
                      )}
                    </ul>
                  </div>

                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Recent Events</p>
                    <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto text-sm text-cloud/80">
                      {state.recentEvents.length ? (
                        state.recentEvents.slice(0, 24).map((event) => (
                          <div key={event.id} className="rave-chip rounded-xl px-3 py-2">
                            <div className="text-xs uppercase tracking-[0.2em] text-cloud/60">{event.type}</div>
                            <div className="mt-1">{event.summary}</div>
                            <div className="mt-1 text-xs text-cloud/50">{formatAgo(event.createdAt)}</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-cloud/70">No events yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">Roll Timeline (Persisted)</p>
                    <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto text-sm text-cloud/80">
                      {!visibleRolls.length && timelineLoading ? (
                        <p className="text-cloud/70">Loading roll timeline...</p>
                      ) : visibleRolls.length ? (
                        visibleRolls.map((roll) => (
                          <div key={roll.id} className="rave-chip rounded-xl px-3 py-2">
                            <div className="text-xs uppercase tracking-[0.2em] text-cloud/60">
                              {roll.expression} • {roll.outcomeStatus}
                            </div>
                            <div className="mt-1 text-white">{roll.summary}</div>
                            <div className="mt-1 text-xs text-cloud/60">
                              Rolls: {roll.rolls.join(", ")} • Total: {roll.total}
                            </div>
                            <div className="mt-1 text-xs text-cloud/50">{formatAgo(roll.createdAt)}</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-cloud/70">No persisted rolls yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rave-panel rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cloud/60">State Transitions (Persisted)</p>
                    <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto text-sm text-cloud/80">
                      {!visibleTransitions.length && timelineLoading ? (
                        <p className="text-cloud/70">Loading state transitions...</p>
                      ) : visibleTransitions.length ? (
                        visibleTransitions.map((transition) => (
                          <div key={transition.id} className="rave-chip rounded-xl px-3 py-2">
                            <div className="text-xs uppercase tracking-[0.2em] text-cloud/60">
                              {transition.entityType} • {transition.transitionType}
                            </div>
                            <div className="mt-1 text-white">
                              {transition.entityId ?? "n/a"} → {transition.fieldPath}
                            </div>
                            <div className="mt-1 text-xs text-cloud/60">
                              {compactValue(transition.newValue)}
                            </div>
                            <div className="mt-1 text-xs text-cloud/50">{formatAgo(transition.createdAt)}</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-cloud/70">No persisted transitions yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
