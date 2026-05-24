"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { cn } from "../../lib/utils";
import { NewWorldWizard, type NewWorldSeed } from "../../components/NewWorldWizard";
import { RulesLookup } from "../../components/RulesLookup";
import dmLibrary from "../../data/dm-library-summary.json";

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

type WorldState = {
  location: string;
  worldTime: string;
  weather: string;
  activeThreats: string[];
  sceneSummary: string;
  storyBeat: string;
  visualPrompt: string;
};

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
  inventory: Array<{ id: string; name: string; detail?: string; quantity: number }>;
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
  summary: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

type CampaignRecord = {
  id: string;
  name: string;
  systemId: string;
  description: string;
  worldState: WorldState;
};

type CampaignSnapshot = {
  campaign: CampaignRecord;
  role: DmRole;
  characters: CharacterRecord[];
  quests: QuestRecord[];
  events: EventRecord[];
};

type LogEntry = {
  id: string;
  text: string;
  tone: "story" | "system" | "roll";
  createdAt: number;
};

type CharacterDraft = {
  hpCurrent: string;
  status: string;
  notesAppend: string;
};

type LibrarySystemSummary = {
  id: string;
  name: string;
  manualCount: number;
  categories: Record<string, number | undefined>;
  sampleTitles: string[];
};

type DmSystemRecord = {
  id: string;
  displayName: string;
  description: string;
  rulesPrimer: string;
};

type DmSystemOption = LibrarySystemSummary & {
  description: string;
  rulesPrimer: string;
};

type DmContextPreview = {
  compendiumContext?: Array<{
    id?: string;
    entryType?: string;
    name?: string;
    summary?: string;
  }>;
  pinnedFacts?: Array<{ id?: string; kind?: string; factText?: string; confidence?: number }>;
  recentTurns?: Array<{ id?: string; turnIndex?: number; actionText?: string; narration?: string; status?: string }>;
  semanticMemory?: Array<{ sourceType?: string; sourceId?: string; text?: string; score?: number }>;
  rollingSummaries?: Array<{ id?: string; summary?: string }>;
  contextMeta?: {
    generatedAt?: string;
    totalCompendiumHits?: number;
    totalFacts?: number;
    totalRecentTurns?: number;
    totalSemanticHits?: number;
  };
};

const dice = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const quickActions = [
  "Roll initiative for the next encounter.",
  "Advance world time and describe immediate consequences.",
  "Reveal a new threat tied to current objectives.",
  "Generate a vivid scene continuation."
];

const toLogTone = (eventType: string): LogEntry["tone"] => {
  if (eventType === "state_patch" || eventType === "quest_update" || eventType === "character_update") {
    return "system";
  }
  return "story";
};

const summarizeQuestObjectives = (quests: QuestRecord[]) =>
  quests
    .flatMap((quest) =>
      quest.objectives
        .filter((objective) => !objective.completed)
        .map((objective) => ({ id: `${quest.id}:${objective.id}`, text: `${quest.title}: ${objective.text}` }))
    )
    .slice(0, 8);

const formatAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const eventToLogEntry = (event: EventRecord): LogEntry => ({
  id: event.id,
  text: event.summary,
  tone: toLogTone(event.type),
  createdAt: new Date(event.createdAt).getTime()
});

const makeIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const librarySystems = dmLibrary.systems as LibrarySystemSummary[];
const librarySystemMap = new Map(librarySystems.map((system) => [system.id, system]));

const fallbackSystemRecords: DmSystemRecord[] = [
  {
    id: "gamma-world",
    displayName: "Gamma World",
    description: "Post-apocalyptic science-fantasy with mutations, salvage tech, and faction conflict.",
    rulesPrimer: "Gamma World emphasizes consequences, unstable technology, and evolving world state."
  },
  {
    id: "generic",
    displayName: "Generic RPG",
    description: "System-agnostic fallback for narrative RPG sessions.",
    rulesPrimer: "Maintain continuity, bounded state changes, and explicit consequences."
  }
];

const toSystemOption = (system: DmSystemRecord): DmSystemOption => {
  const libraryMatch = librarySystemMap.get(system.id);
  return {
    id: system.id,
    name: libraryMatch?.name ?? system.displayName,
    description: system.description,
    rulesPrimer: system.rulesPrimer,
    manualCount: libraryMatch?.manualCount ?? 0,
    categories: libraryMatch?.categories ?? {},
    sampleTitles: libraryMatch?.sampleTitles ?? []
  };
};

const fallbackSystems = fallbackSystemRecords.map(toSystemOption);

const pickPreferredSystemId = (systems: DmSystemOption[]) =>
  systems.find((system) => system.id === "gamma-world")?.id ?? systems[0]?.id ?? "gamma-world";

export default function DungeonMasterPage() {
  const [viewer, setViewer] = useState<DmViewer | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [systems, setSystems] = useState<DmSystemOption[]>(fallbackSystems);
  const [systemsLoading, setSystemsLoading] = useState(false);
  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [activeSystemId, setActiveSystemId] = useState(pickPreferredSystemId(fallbackSystems));

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CampaignSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [newCampaignName, setNewCampaignName] = useState("Frontier of Echoes");
  const [newCampaignDescription, setNewCampaignDescription] = useState(
    "A dangerous frontier campaign where the party must secure a foothold, survive rival factions, and uncover what is destabilizing the region."
  );
  const [createCampaignPending, setCreateCampaignPending] = useState(false);
  const [createCampaignError, setCreateCampaignError] = useState<string | null>(null);

  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterArchetype, setNewCharacterArchetype] = useState("");
  const [newCharacterHpMax, setNewCharacterHpMax] = useState("30");
  const [createCharacterPending, setCreateCharacterPending] = useState(false);
  const [createCharacterError, setCreateCharacterError] = useState<string | null>(null);
  const [patchCharacterPendingId, setPatchCharacterPendingId] = useState<string | null>(null);
  const [patchCharacterError, setPatchCharacterError] = useState<string | null>(null);
  const [characterDrafts, setCharacterDrafts] = useState<Record<string, CharacterDraft>>({});

  const [promptText, setPromptText] = useState("");
  const [promptPending, setPromptPending] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState("");
  const [contextPreview, setContextPreview] = useState<DmContextPreview | null>(null);
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState<string | null>(null);

  const [rollingDie, setRollingDie] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState({ die: "d20", value: 17, verdict: "success", id: 0 });

  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [streamError, setStreamError] = useState<string | null>(null);

  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerRef = useRef<number | null>(null);
  const activeCampaignIdRef = useRef<string | null>(null);

  const activeSystem = useMemo(
    () => systems.find((system) => system.id === activeSystemId) ?? systems[0],
    [activeSystemId, systems]
  );
  const sessionSystemId = snapshot?.campaign.systemId ?? activeSystemId;
  const sessionSystem = useMemo(
    () => systems.find((system) => system.id === sessionSystemId) ?? activeSystem,
    [activeSystem, sessionSystemId, systems]
  );

  const worldStateRows = useMemo(() => {
    if (!snapshot) return [];
    const world = snapshot.campaign.worldState;
    return [
      { label: "Location", value: world.location },
      { label: "World Time", value: world.worldTime },
      { label: "Weather", value: world.weather },
      { label: "Active Threats", value: world.activeThreats.join(", ") || "None" }
    ];
  }, [snapshot]);

  const objectiveRows = useMemo(() => (snapshot ? summarizeQuestObjectives(snapshot.quests) : []), [snapshot]);

  const aggregatedInventory = useMemo(() => {
    if (!snapshot) return [];
    const map = new Map<string, { item: string; detail: string; qty: number }>();
    for (const character of snapshot.characters) {
      for (const item of character.inventory) {
        const key = item.name.toLowerCase();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            item: item.name,
            detail: item.detail ?? character.name,
            qty: item.quantity
          });
          continue;
        }
        existing.qty += item.quantity;
      }
    }
    return [...map.values()].sort((left, right) => right.qty - left.qty).slice(0, 12);
  }, [snapshot]);

  const terminalEntries = useMemo(
    () => [...logEntries].sort((left, right) => left.createdAt - right.createdAt).slice(-18),
    [logEntries]
  );

  const primaryObjective = objectiveRows[0]?.text ?? "Awaiting the next party decision.";

  const contextStats = useMemo(() => {
    const meta = contextPreview?.contextMeta;
    return [
      {
        label: "Compendium",
        value: meta?.totalCompendiumHits ?? contextPreview?.compendiumContext?.length ?? 0
      },
      {
        label: "Facts",
        value: meta?.totalFacts ?? contextPreview?.pinnedFacts?.length ?? 0
      },
      {
        label: "Turns",
        value: meta?.totalRecentTurns ?? contextPreview?.recentTurns?.length ?? 0
      },
      {
        label: "Memory",
        value: meta?.totalSemanticHits ?? contextPreview?.semanticMemory?.length ?? 0
      }
    ];
  }, [contextPreview]);

  const topCompendiumItems = useMemo(
    () => (contextPreview?.compendiumContext ?? []).slice(0, 4),
    [contextPreview]
  );

  const logContainerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { staggerChildren: 0.08 } }
    }),
    []
  );

  const logItemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 14 },
      show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } }
    }),
    []
  );

  const resultVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 10, scale: 0.98 },
      show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" } }
    }),
    []
  );

  const addLocalLog = (text: string, tone: LogEntry["tone"]) => {
    const entry: LogEntry = {
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      tone,
      createdAt: Date.now()
    };
    setLogEntries((prev) => [entry, ...prev].slice(0, 30));
  };

  const applySnapshot = useCallback((nextSnapshot: CampaignSnapshot) => {
    setSnapshot(nextSnapshot);
    setActiveSystemId(nextSnapshot.campaign.systemId);
    const eventLogs = nextSnapshot.events
      .slice()
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map(eventToLogEntry)
      .slice(0, 24);

    seenEventIdsRef.current = new Set(nextSnapshot.events.map((entry) => entry.id));

    setLogEntries((prev) => {
      const localRolls = prev.filter((entry) => entry.id.startsWith("roll-")).slice(0, 6);
      return [...localRolls, ...eventLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    });
  }, []);

  const fetchSnapshot = useCallback(
    async (campaignId: string, silent = false) => {
      if (!silent) setSnapshotLoading(true);
      try {
        const response = await fetch(`/api/dm/campaigns/${campaignId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("snapshot_load_failed");
        }
        const payload = (await response.json()) as { campaign?: CampaignSnapshot };
        if (payload.campaign) {
          applySnapshot(payload.campaign);
        }
      } finally {
        if (!silent) setSnapshotLoading(false);
      }
    },
    [applySnapshot]
  );

  const scheduleSnapshotRefresh = useCallback(
    (campaignId: string) => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void fetchSnapshot(campaignId, true);
        refreshTimerRef.current = null;
      }, 500);
    },
    [fetchSnapshot]
  );

  const fetchCampaigns = useCallback(
    async (preferredCampaignId?: string) => {
      setCampaignLoading(true);
      setCampaignError(null);
      try {
        const response = await fetch("/api/dm/campaigns", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("campaign_list_failed");
        }
        const payload = (await response.json()) as { campaigns?: CampaignSummary[] };
        const nextCampaigns = payload.campaigns ?? [];
        setCampaigns(nextCampaigns);

        const selectedId =
          preferredCampaignId ??
          (activeCampaignIdRef.current && nextCampaigns.some((entry) => entry.id === activeCampaignIdRef.current)
            ? activeCampaignIdRef.current
            : nextCampaigns[0]?.id ?? null);

        setActiveCampaignId(selectedId);
        if (selectedId) {
          await fetchSnapshot(selectedId);
        } else {
          setSnapshot(null);
          setLogEntries([]);
          seenEventIdsRef.current = new Set();
        }
      } catch (error) {
        console.error(error);
        setCampaignError("Failed to load campaigns.");
      } finally {
        setCampaignLoading(false);
      }
    },
    [fetchSnapshot]
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
    let cancelled = false;

    const loadSystems = async () => {
      setSystemsLoading(true);
      setSystemsError(null);
      try {
        const response = await fetch("/api/dm/systems", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("system_list_failed");
        }
        const payload = (await response.json()) as { systems?: DmSystemRecord[] };
        const nextSystems = (payload.systems?.length ? payload.systems : fallbackSystemRecords).map(toSystemOption);
        if (!cancelled) {
          setSystems(nextSystems);
        }
      } catch {
        if (!cancelled) {
          setSystems(fallbackSystems);
          setSystemsError("Using fallback rulesets while the full catalog loads.");
        }
      } finally {
        if (!cancelled) {
          setSystemsLoading(false);
        }
      }
    };

    void loadSystems();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!viewer) return;
    void fetchCampaigns();
  }, [fetchCampaigns, viewer]);

  useEffect(() => {
    if (!systems.some((system) => system.id === activeSystemId)) {
      setActiveSystemId(pickPreferredSystemId(systems));
    }
  }, [activeSystemId, systems]);

  useEffect(() => {
    activeCampaignIdRef.current = activeCampaignId;
  }, [activeCampaignId]);

  useEffect(() => {
    if (!snapshot) return;
    setCharacterDrafts((prev) => {
      const next: Record<string, CharacterDraft> = {};
      for (const character of snapshot.characters) {
        const existing = prev[character.id];
        next[character.id] = {
          hpCurrent: String(character.hpCurrent),
          status: existing?.status ?? character.status,
          notesAppend: existing?.notesAppend ?? ""
        };
      }
      return next;
    });
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot?.characters.some((character) => character.id === selectedActorId)) {
      setSelectedActorId("");
    }
  }, [selectedActorId, snapshot]);

  useEffect(() => {
    if (!viewer || !activeCampaignId || !snapshot) {
      setContextPreview(null);
      setContextPreviewError(null);
      setContextPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setContextPreviewLoading(true);
      setContextPreviewError(null);
      try {
        const params = new URLSearchParams({
          actionText: promptText.trim() || primaryObjective
        });
        if (selectedActorId) params.set("actorCharacterId", selectedActorId);
        const response = await fetch("/api/dm/campaigns/" + activeCampaignId + "/context?" + params.toString(), {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error("context_preview_failed");
        }
        const payload = (await response.json()) as { context?: DmContextPreview };
        setContextPreview(payload.context ?? null);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setContextPreviewError("Context packet offline.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setContextPreviewLoading(false);
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeCampaignId, primaryObjective, promptText, selectedActorId, snapshot, viewer]);

  useEffect(() => {
    if (!viewer || !activeCampaignId) {
      setStreamStatus("idle");
      return;
    }

    setStreamStatus("connecting");
    setStreamError(null);

    const stream = new EventSource(`/api/dm/campaigns/${activeCampaignId}/stream`);

    const onReady = () => {
      setStreamStatus("live");
      setStreamError(null);
    };

    const onEvent = (message: MessageEvent) => {
      try {
        const event = JSON.parse(message.data) as EventRecord;
        if (!event?.id || seenEventIdsRef.current.has(event.id)) return;

        seenEventIdsRef.current.add(event.id);
        const entry = eventToLogEntry(event);
        setLogEntries((prev) => [entry, ...prev].slice(0, 30));

        if (
          event.type === "dm_response" ||
          event.type === "state_patch" ||
          event.type === "quest_update" ||
          event.type === "character_update"
        ) {
          scheduleSnapshotRefresh(activeCampaignId);
        }
      } catch {
        // ignore malformed event payloads
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
      stream.removeEventListener("ready", onReady as EventListener);
      stream.removeEventListener("event", onEvent as EventListener);
      stream.removeEventListener("error", onError as EventListener);
      stream.close();
    };
  }, [activeCampaignId, scheduleSnapshotRefresh, viewer]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

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
        setAuthError(payload.error ?? "Authentication failed.");
        return;
      }

      setViewer(payload.user);
      setPassword("");
      setAuthError(null);
    } catch {
      setAuthError("Authentication failed.");
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
    setSnapshot(null);
    setLogEntries([]);
    setCharacterDrafts({});
    seenEventIdsRef.current = new Set();
  };

  const createCampaign = async (input?: {
    name?: string;
    description?: string;
    systemId?: string;
    bootstrapPrompt?: string;
    worldSeed?: NewWorldSeed;
  }) => {
    setCreateCampaignPending(true);
    setCreateCampaignError(null);

    try {
      const name = input?.name?.trim() || newCampaignName.trim();
      const description = input?.description?.trim() || newCampaignDescription.trim();
      const systemId = input?.systemId?.trim() || activeSystemId || pickPreferredSystemId(systems);

      const response = await fetch("/api/dm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          systemId,
          bootstrap: true,
          ...(input?.worldSeed ? { worldSeed: input.worldSeed } : {}),
          ...(input?.bootstrapPrompt ? { bootstrapPrompt: input.bootstrapPrompt } : {})
        })
      });

      const payload = (await response.json()) as {
        campaign?: CampaignSnapshot;
        error?: string;
      };

      if (!response.ok || !payload.campaign) {
        setCreateCampaignError(
          payload.error === "system_not_supported"
            ? "That ruleset is not available yet. Pick one from the supported list and try again."
            : payload.error ?? "Campaign creation failed."
        );
        return;
      }

      applySnapshot(payload.campaign);
      const nextCampaignId = payload.campaign.campaign.id;
      await fetchCampaigns(nextCampaignId);
      addLocalLog(`Created campaign '${payload.campaign.campaign.name}'.`, "system");
    } catch {
      setCreateCampaignError("Campaign creation failed.");
    } finally {
      setCreateCampaignPending(false);
    }
  };

  const createCampaignFromWizard = async (seed: NewWorldSeed) => {
    const selectedSystem = systems.find((system) => system.id === seed.systemId) ?? activeSystem;
    const factionsLine = seed.factions.length ? seed.factions.join(", ") : "fractured local powers";
    const threatLine = seed.threat.length ? seed.threat.join(", ") : "a danger still gathering itself";
    const partyLine = seed.partyFocus.length ? seed.partyFocus.join(", ") : "survivors";
    const stakesLine = seed.stakes.length ? seed.stakes.join(", ") : "hold on to something worth saving";
    const description = [
      `${seed.genre} with a ${seed.tone.toLowerCase()} pulse, built for ${partyLine}.`,
      seed.openingSituation,
      `The campaign opens in ${seed.startingPoint}, with ${factionsLine} in motion and ${threatLine} closing in.`,
      `The party is pulled forward because ${seed.playerHook.charAt(0).toLowerCase()}${seed.playerHook.slice(1)}`,
      `If they fail, they risk ${stakesLine.toLowerCase()}.`,
      `A hidden complication waits beneath it all: ${seed.campaignTwist}`
    ].join(" ");
    const bootstrapPrompt = [
      `Build the opening scene for ${seed.worldName}.`,
      `Run this like a ${selectedSystem?.name ?? "tabletop RPG"} campaign.`,
      selectedSystem?.rulesPrimer ? `Rules primer: ${selectedSystem.rulesPrimer}` : "",
      `Tone: ${seed.tone}. Genre: ${seed.genre}. Pacing: ${seed.pacing}.`,
      `Starting point: ${seed.startingPoint}.`,
      `Opening situation: ${seed.openingSituation}.`,
      `Party hook: ${seed.playerHook}.`,
      `Factions: ${factionsLine}.`,
      `Threats: ${threatLine}.`,
      `Tech level: ${seed.techLevel}.`,
      `Party focus: ${partyLine}.`,
      `Stakes: ${stakesLine}.`,
      `Landmark: ${seed.landmark}.`,
      `Hidden twist to foreshadow without fully resolving: ${seed.campaignTwist}.`,
      `Table lines and veils: ${seed.tableLines}.`,
      "Give the table a vivid first scene, one immediate decision, one memorable face or faction pressure point, and two or three actionable leads."
    ].join(" ");

    setActiveSystemId(seed.systemId);
    setNewCampaignName(seed.worldName);
    setNewCampaignDescription(description);
    await createCampaign({
      name: seed.worldName,
      description,
      systemId: seed.systemId,
      bootstrapPrompt,
      worldSeed: seed
    });
  };

  const updateCharacterDraft = (characterId: string, patch: Partial<CharacterDraft>) => {
    setCharacterDrafts((prev) => ({
      ...prev,
      [characterId]: {
        hpCurrent: patch.hpCurrent ?? prev[characterId]?.hpCurrent ?? "0",
        status: patch.status ?? prev[characterId]?.status ?? "Ready",
        notesAppend: patch.notesAppend ?? prev[characterId]?.notesAppend ?? ""
      }
    }));
  };

  const adjustCharacterHpDraft = (characterId: string, delta: number, hpMax: number) => {
    const current = Number(characterDrafts[characterId]?.hpCurrent ?? "0");
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, Math.min(hpMax, safeCurrent + delta));
    updateCharacterDraft(characterId, { hpCurrent: String(next) });
  };

  const createCharacter = async () => {
    if (!activeCampaignId) {
      setCreateCharacterError("Select a campaign first.");
      return;
    }

    const name = newCharacterName.trim();
    const archetype = newCharacterArchetype.trim();
    const hpMax = Number(newCharacterHpMax);

    if (!name || !archetype || !Number.isFinite(hpMax) || hpMax < 1) {
      setCreateCharacterError("Enter a valid name, archetype, and HP max.");
      return;
    }

    setCreateCharacterPending(true);
    setCreateCharacterError(null);
    try {
      const response = await fetch(`/api/dm/campaigns/${activeCampaignId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          archetype,
          level: 1,
          hpCurrent: hpMax,
          hpMax,
          hpTemp: 0,
          status: "Ready",
          notes: "Created via DM console"
        })
      });

      const payload = (await response.json()) as {
        character?: CharacterRecord;
        error?: string;
      };

      if (!response.ok || !payload.character) {
        setCreateCharacterError(payload.error ?? "Character creation failed.");
        return;
      }

      setNewCharacterName("");
      setNewCharacterArchetype("");
      setNewCharacterHpMax("30");
      addLocalLog(`Character created: ${payload.character.name}`, "system");
      scheduleSnapshotRefresh(activeCampaignId);
    } catch {
      setCreateCharacterError("Character creation failed.");
    } finally {
      setCreateCharacterPending(false);
    }
  };

  const saveCharacterPatch = async (characterId: string) => {
    if (!activeCampaignId || !snapshot) return;

    const character = snapshot.characters.find((entry) => entry.id === characterId);
    const draft = characterDrafts[characterId];
    if (!character || !draft) return;

    const body: Record<string, unknown> = {};
    const hpCurrent = Number(draft.hpCurrent);
    if (Number.isFinite(hpCurrent) && hpCurrent !== character.hpCurrent) {
      body.hpCurrent = Math.max(0, Math.min(character.hpMax, Math.round(hpCurrent)));
    }
    if (draft.status.trim() && draft.status.trim() !== character.status) {
      body.status = draft.status.trim();
    }
    if (draft.notesAppend.trim()) {
      body.notesAppend = draft.notesAppend.trim();
    }

    if (!Object.keys(body).length) return;

    setPatchCharacterPendingId(characterId);
    setPatchCharacterError(null);
    try {
      const response = await fetch(`/api/dm/campaigns/${activeCampaignId}/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPatchCharacterError(payload.error ?? "Character update failed.");
        return;
      }

      updateCharacterDraft(characterId, { notesAppend: "" });
      addLocalLog(`Character updated: ${character.name}`, "system");
      scheduleSnapshotRefresh(activeCampaignId);
    } catch {
      setPatchCharacterError("Character update failed.");
    } finally {
      setPatchCharacterPendingId(null);
    }
  };

  const sendPrompt = async () => {
    if (!activeCampaignId) {
      setPromptError("Create or select a campaign first.");
      return;
    }

    const text = promptText.trim();
    if (!text) return;

    setPromptPending(true);
    setPromptError(null);

    try {
      const response = await fetch(`/api/dm/campaigns/${activeCampaignId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": makeIdempotencyKey()
        },
        body: JSON.stringify({
          actionText: text,
          actorCharacterId: selectedActorId || undefined
        })
      });

      const payload = (await response.json()) as {
        turn?: { narration?: string };
        snapshot?: CampaignSnapshot;
        error?: string;
        retryAfterSeconds?: number;
      };

      if (!response.ok) {
        if (payload.error === "rate_limited") {
          setPromptError(`Rate limited. Retry in ${payload.retryAfterSeconds ?? 1}s.`);
          return;
        }
        setPromptError(payload.error ?? "Prompt failed.");
        return;
      }

      if (payload.snapshot) {
        applySnapshot(payload.snapshot);
      } else {
        scheduleSnapshotRefresh(activeCampaignId);
      }

      if (payload.turn?.narration) {
        addLocalLog(payload.turn.narration, "story");
      }

      setPromptText("");
    } catch {
      setPromptError("Prompt failed.");
    } finally {
      setPromptPending(false);
    }
  };

  const getVerdict = (sides: number, value: number) => {
    if (sides === 20) {
      if (value === 20) return "critical success";
      if (value === 1) return "critical fail";
      if (value >= 15) return "success";
      if (value <= 5) return "fail";
      return "mixed";
    }
    return "rolled";
  };

  const rollDie = (die: string) => {
    const sides = Number.parseInt(die.slice(1), 10);
    const value = Math.floor(Math.random() * sides) + 1;
    const verdict = getVerdict(sides, value);

    setLastRoll((prev) => ({ die, value, verdict, id: prev.id + 1 }));
    setRollingDie(die);

    const entry: LogEntry = {
      id: `roll-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: `Rolled ${die} and got ${value} (${verdict}).`,
      tone: "roll",
      createdAt: Date.now()
    };

    setLogEntries((prev) => [entry, ...prev].slice(0, 30));
    setTimeout(() => setRollingDie(null), 520);
  };

  if (authLoading) {
    return (
      <main className="min-h-screen">
        <section className="mx-auto flex max-w-4xl items-center justify-center px-6 py-28">
          <Card className="w-full max-w-xl text-center">
            <div className="text-xs uppercase tracking-[0.35em] text-cloud/60">Dungeon Master</div>
            <h1 className="section-title mt-3 text-3xl">
              Preparing <span className="magical-text">session state</span>
            </h1>
            <p className="mt-3 text-sm text-cloud/70">
              Checking authentication and loading your campaign memory.
            </p>
          </Card>
        </section>
      </main>
    );
  }

  if (!viewer) {
    return (
      <main className="min-h-screen">
        <section className="relative overflow-hidden py-20">
          <div className="absolute inset-0 noise" aria-hidden="true" />
          <div className="absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-aurora/35 blur-3xl animate-float" />
          <div className="relative mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="glass-panel rounded-[36px] p-8 md:p-12">
              <div className="text-[11px] uppercase tracking-[0.5em] text-cloud/60">Dungeon Master</div>
              <h1 className="section-title mt-4 text-4xl md:text-6xl">
                Persistent <span className="magical-text">RPG World</span> Engine
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-cloud/80">
                Login is required. The world, player stats, inventory, quest progress, and DM timeline are saved per account and updated on every action.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-cloud/60">
                <span className="rave-chip rounded-full px-3 py-2">Account Required</span>
                <span className="rave-chip rounded-full px-3 py-2">Session Memory</span>
                <span className="rave-chip rounded-full px-3 py-2">Live DM</span>
                <span className="rave-chip rounded-full px-3 py-2">Ruleset Aware</span>
              </div>
            </div>

            <Card className="h-fit">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Access</div>
              <div className="mt-3 flex gap-2 text-xs uppercase tracking-[0.25em] text-cloud/70">
                <button
                  className={cn("rave-chip rounded-full px-3 py-2", authMode === "login" ? "text-white" : "text-cloud/60")}
                  type="button"
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  className={cn("rave-chip rounded-full px-3 py-2", authMode === "register" ? "text-white" : "text-cloud/60")}
                  type="button"
                  onClick={() => setAuthMode("register")}
                >
                  Register
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {authMode === "register" && (
                  <label className="grid gap-2 text-xs uppercase tracking-[0.3em] text-cloud/60">
                    Display Name
                    <input
                      className="rave-input rounded-2xl px-4 py-3 text-sm"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="name"
                    />
                  </label>
                )}
                <label className="grid gap-2 text-xs uppercase tracking-[0.3em] text-cloud/60">
                  Email
                  <input
                    className="rave-input rounded-2xl px-4 py-3 text-sm"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                  />
                </label>
                <label className="grid gap-2 text-xs uppercase tracking-[0.3em] text-cloud/60">
                  Password
                  <input
                    className="rave-input rounded-2xl px-4 py-3 text-sm"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  />
                </label>
                {authError && <div className="text-xs text-rose-300">{authError}</div>}
                <Button type="button" onClick={submitAuth} disabled={authPending}>
                  {authPending ? "Working..." : authMode === "login" ? "Sign In" : "Create Account"}
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden pt-20">
        <div className="absolute inset-0 noise" aria-hidden="true" />
        <div className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-aurora/40 blur-3xl animate-float" />
        <div className="absolute top-20 left-10 h-44 w-44 rounded-full bg-comet/35 blur-3xl animate-drift" />
        <div className="absolute bottom-10 right-10 h-52 w-52 rounded-full bg-glow/30 blur-3xl animate-pulseGlow" />

        <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-14">
          <div className="glass-panel rounded-[36px] p-8 md:p-12">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="flex flex-col gap-5">
                <div className="text-[11px] uppercase tracking-[0.5em] text-cloud/60">Online Dungeon Master</div>
                <h1 className="section-title text-4xl md:text-6xl">
                  Persistent <span className="magical-text">Session Console</span>
                </h1>
                <p className="max-w-2xl text-lg text-cloud/80">
                  Account-scoped campaigns with persistent world state, character stats, quests, inventory, and world-aware narration.
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-cloud/60">
                  <span className="rave-chip rounded-full px-3 py-2">Server Authoritative</span>
                  <span className="rave-chip rounded-full px-3 py-2">Context-Aware LLM</span>
                  <span className="rave-chip rounded-full px-3 py-2">Persistent Campaigns</span>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rave-panel rounded-3xl p-5">
                  <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Campaign Vault</div>
                  <div className="mt-3 grid gap-3">
                    <label className="grid gap-2 text-xs uppercase tracking-[0.3em] text-cloud/60">
                      Active ruleset
                      <select
                        className="rave-input rounded-2xl px-3 py-2 text-sm text-white"
                        value={activeSystemId}
                        onChange={(event) => setActiveSystemId(event.target.value)}
                        disabled={!systems.length || systemsLoading}
                      >
                        {systems.map((system) => (
                          <option key={system.id} value={system.id}>
                            {system.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-xs uppercase tracking-[0.3em] text-cloud/60">
                      Campaign
                      <select
                        className="rave-input rounded-2xl px-3 py-2 text-sm text-white"
                        value={activeCampaignId ?? ""}
                        onChange={(event) => {
                          const next = event.target.value || null;
                          setActiveCampaignId(next);
                          if (next) void fetchSnapshot(next);
                        }}
                        disabled={!campaigns.length || campaignLoading}
                      >
                        {!campaigns.length ? (
                          <option value="">No campaigns yet</option>
                        ) : (
                          campaigns.map((campaign) => (
                            <option key={campaign.id} value={campaign.id}>
                              {campaign.name}
                            </option>
                          ))
                        )}
                      </select>
                    </label>

                    <div className="flex items-center justify-between text-xs text-cloud/60">
                      <span>{campaignLoading ? "Loading campaigns..." : `${campaigns.length} campaigns`}</span>
                      <span>{systemsLoading ? "Rulesets: loading" : `Rulesets: ${systems.length}`}</span>
                    </div>

                    {campaignError && <div className="text-xs text-rose-300">{campaignError}</div>}
                    {systemsError && <div className="text-xs text-amber-200">{systemsError}</div>}
                    {streamError && <div className="text-xs text-amber-200">{streamError}</div>}
                    {!systemsError && <div className="text-xs text-cloud/60">Stream: {streamStatus}</div>}

                    <div className="grid gap-2">
                      <input
                        className="rave-input rounded-2xl px-3 py-2 text-sm"
                        value={newCampaignName}
                        onChange={(event) => setNewCampaignName(event.target.value)}
                        placeholder="Campaign name"
                      />
                      <textarea
                        className="rave-input h-20 resize-none rounded-2xl px-3 py-2 text-sm"
                        value={newCampaignDescription}
                        onChange={(event) => setNewCampaignDescription(event.target.value)}
                        placeholder="Describe the campaign seed..."
                      />
                    </div>

                    {createCampaignError && <div className="text-xs text-rose-300">{createCampaignError}</div>}

                    <div className="flex gap-3">
                      <Button
                        className="flex-1"
                        onClick={() => void createCampaign()}
                        disabled={
                          createCampaignPending ||
                          systemsLoading ||
                          !systems.length ||
                          !newCampaignName.trim() ||
                          !newCampaignDescription.trim()
                        }
                      >
                        {createCampaignPending ? "Creating..." : "Create Campaign"}
                      </Button>
                      <Button className="flex-1" variant="secondary" onClick={logout}>
                        Sign Out ({viewer.displayName})
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rave-chip rounded-3xl p-5 text-sm text-cloud/80">
                  <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Status</div>
                  <div className="mt-3 grid gap-2">
                    <div className="flex items-center justify-between">
                      <span>Snapshot</span>
                      <span className="text-white">{snapshotLoading ? "Syncing..." : "Ready"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Role</span>
                      <span className="text-white">{snapshot?.role ?? "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Players</span>
                      <span className="text-white">{campaigns.find((entry) => entry.id === activeCampaignId)?.playerCount ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="new-world">
            <NewWorldWizard
              systems={systems}
              initialSystemId={activeSystemId}
              onSystemChange={setActiveSystemId}
              onGenerateWorld={createCampaignFromWizard}
              generating={createCampaignPending}
            />
          </div>
        </div>
      </section>

      <section id="session" className="mx-auto max-w-6xl px-6 pb-20">
        {!activeCampaignId || !snapshot ? (
          <Card className="text-center">
            <div className="text-xs uppercase tracking-[0.35em] text-cloud/60">No Active Campaign</div>
            <h2 className="section-title mt-3 text-3xl">Create Your First Campaign</h2>
            <p className="mt-3 text-sm text-cloud/70">
              Use the campaign vault above to create your first world, then start sending DM actions.
            </p>
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            <div className="dm-handheld xl:col-span-2" data-testid="gamma-terminal-screen">
              <div className="dm-handheld-topbar">
                <div>
                  <div className="dm-handheld-kicker">Gamma Terminal</div>
                  <h2 className="dm-handheld-title">{snapshot.campaign.name}</h2>
                </div>
                <div
                  className={cn(
                    "dm-status-light",
                    streamStatus === "live" && "is-live",
                    streamStatus === "error" && "is-error"
                  )}
                >
                  {streamStatus}
                </div>
              </div>

              <div className="dm-lcd">
                <div className="dm-lcd-hud">
                  {[
                    { label: "SYS", value: sessionSystem?.name ?? snapshot.campaign.systemId },
                    { label: "LOC", value: snapshot.campaign.worldState.location },
                    { label: "TIME", value: snapshot.campaign.worldState.worldTime },
                    { label: "WX", value: snapshot.campaign.worldState.weather }
                  ].map((item) => (
                    <div key={item.label} className="dm-hud-cell">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="dm-world-readout">
                  <div>
                    <span className="dm-readout-label">Threats</span>
                    <p>{snapshot.campaign.worldState.activeThreats.join(" / ") || "None tracked"}</p>
                  </div>
                  <div>
                    <span className="dm-readout-label">Beat</span>
                    <p>{snapshot.campaign.worldState.storyBeat}</p>
                  </div>
                  <div className="md:col-span-2">
                    <span className="dm-readout-label">Objective</span>
                    <p>{primaryObjective}</p>
                  </div>
                </div>

                <div className="dm-terminal-layout">
                  <div className="dm-terminal-feed" aria-live="polite">
                    {terminalEntries.length ? (
                      terminalEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className={cn(
                            "dm-terminal-line",
                            entry.tone === "roll" && "is-roll",
                            entry.tone === "system" && "is-system",
                            entry.tone === "story" && "is-story"
                          )}
                        >
                          <span className="dm-terminal-time">
                            {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="dm-terminal-prompt">{entry.tone === "story" ? "DM" : entry.tone.toUpperCase()}</span>
                          <span>{entry.text}</span>
                        </div>
                      ))
                    ) : (
                      <div className="dm-terminal-empty">Awaiting first command.</div>
                    )}
                  </div>

                  <div className="dm-context-panel" data-testid="dm-context-display">
                    <div className="dm-context-header">
                      <span>DM Packet</span>
                      <span>{contextPreviewLoading ? "SYNC" : contextPreview ? "READY" : "IDLE"}</span>
                    </div>
                    <div className="dm-context-grid">
                      {contextStats.map((stat) => (
                        <div key={stat.label}>
                          <span>{stat.label}</span>
                          <strong>{stat.value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="dm-context-list">
                      {topCompendiumItems.length ? (
                        topCompendiumItems.map((item) => (
                          <div key={item.id ?? item.name}>
                            <span>{item.entryType ?? "ref"}</span>
                            <strong>{item.name}</strong>
                          </div>
                        ))
                      ) : (
                        <div>
                          <span>ref</span>
                          <strong>No compendium hits for this command.</strong>
                        </div>
                      )}
                    </div>
                    {contextPreviewError && <div className="dm-context-error">{contextPreviewError}</div>}
                  </div>
                </div>

                <div className="dm-command-line" data-testid="dm-command-line">
                  <select
                    className="dm-command-actor"
                    value={selectedActorId}
                    onChange={(event) => setSelectedActorId(event.target.value)}
                  >
                    <option value="">Narrator</option>
                    {snapshot.characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="dm-command-input"
                    value={promptText}
                    onChange={(event) => setPromptText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendPrompt();
                      }
                    }}
                    placeholder="Command the DM..."
                    rows={2}
                  />
                  <Button variant="primary" onClick={sendPrompt} disabled={promptPending || !promptText.trim()}>
                    {promptPending ? "Sending" : "Send"}
                  </Button>
                </div>

                <div className="dm-quick-row">
                  {quickActions.map((action) => (
                    <button key={action} type="button" onClick={() => setPromptText(action)}>
                      {action}
                    </button>
                  ))}
                </div>
                {promptError && <div className="dm-context-error">{promptError}</div>}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.35em] text-cloud/60">Live Session</div>
                  <h2 className="section-title text-3xl">
                    {snapshot.campaign.name} <span className="magical-text">Command Center</span>
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-cloud/60">
                  <span className="rave-chip rounded-full px-3 py-2">Ruleset: {sessionSystem?.name ?? snapshot.campaign.systemId}</span>
                  <span className="rave-chip rounded-full px-3 py-2">Campaign: {snapshot.campaign.id.slice(-6)}</span>
                  <span className="rave-chip rounded-full px-3 py-2">Updated {formatAgo(campaigns.find((entry) => entry.id === snapshot.campaign.id)?.updatedAt ?? new Date().toISOString())}</span>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rave-panel rounded-3xl p-5">
                  <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">World State</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {worldStateRows.map((stat) => (
                      <div key={stat.label} className="rave-chip rounded-2xl px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.25em] text-cloud/60">{stat.label}</div>
                        <div className="mt-2 text-sm text-cloud/80">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 text-sm text-cloud/80">{snapshot.campaign.worldState.sceneSummary}</div>
                  <div className="mt-2 text-xs text-cloud/60">Story beat: {snapshot.campaign.worldState.storyBeat}</div>
                  <div className="mt-5">
                    <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Objectives</div>
                    <ul className="mt-3 grid gap-2 text-sm text-cloud/80">
                      {objectiveRows.length ? (
                        objectiveRows.map((objective) => (
                          <li key={objective.id} className="rave-chip rounded-2xl px-4 py-2">
                            {objective.text}
                          </li>
                        ))
                      ) : (
                        <li className="rave-chip rounded-2xl px-4 py-2">No incomplete objectives.</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rave-panel rounded-3xl p-5">
                    <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Party Roster</div>
                    <div className="mt-3 grid gap-2">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          className="rave-input rounded-2xl px-3 py-2 text-sm"
                          placeholder="Character name"
                          value={newCharacterName}
                          onChange={(event) => setNewCharacterName(event.target.value)}
                        />
                        <input
                          className="rave-input rounded-2xl px-3 py-2 text-sm"
                          placeholder="Archetype"
                          value={newCharacterArchetype}
                          onChange={(event) => setNewCharacterArchetype(event.target.value)}
                        />
                        <input
                          className="rave-input rounded-2xl px-3 py-2 text-sm"
                          placeholder="HP max"
                          type="number"
                          min={1}
                          max={1000}
                          value={newCharacterHpMax}
                          onChange={(event) => setNewCharacterHpMax(event.target.value)}
                        />
                      </div>
                      {createCharacterError && <div className="text-xs text-rose-300">{createCharacterError}</div>}
                      <Button
                        variant="secondary"
                        onClick={createCharacter}
                        disabled={
                          createCharacterPending ||
                          !newCharacterName.trim() ||
                          !newCharacterArchetype.trim() ||
                          !newCharacterHpMax.trim()
                        }
                      >
                        {createCharacterPending ? "Creating..." : "Add Character"}
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {snapshot.characters.length ? (
                        snapshot.characters.map((member) => (
                          <div key={member.id} className="rave-chip rounded-2xl px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold text-white">{member.name}</div>
                                <div className="text-xs uppercase tracking-[0.2em] text-cloud/60">{member.archetype}</div>
                              </div>
                              <div className="text-right text-xs text-cloud/70">
                                <div className="text-white">{member.hpCurrent} / {member.hpMax} (temp {member.hpTemp})</div>
                                <div>{member.status}</div>
                              </div>
                            </div>
                            {member.notes && <div className="mt-2 text-xs text-cloud/60">{member.notes}</div>}
                            {snapshot.role === "dm" && (
                              <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className="rave-chip rounded-full px-3 py-1 text-xs"
                                      onClick={() => adjustCharacterHpDraft(member.id, -5, member.hpMax)}
                                    >
                                      -5
                                    </button>
                                    <button
                                      type="button"
                                      className="rave-chip rounded-full px-3 py-1 text-xs"
                                      onClick={() => adjustCharacterHpDraft(member.id, 5, member.hpMax)}
                                    >
                                      +5
                                    </button>
                                  </div>
                                  <input
                                    className="rave-input rounded-2xl px-3 py-2 text-sm"
                                    type="number"
                                    min={0}
                                    max={member.hpMax}
                                    value={characterDrafts[member.id]?.hpCurrent ?? String(member.hpCurrent)}
                                    onChange={(event) =>
                                      updateCharacterDraft(member.id, { hpCurrent: event.target.value })
                                    }
                                  />
                                  <input
                                    className="rave-input rounded-2xl px-3 py-2 text-sm"
                                    value={characterDrafts[member.id]?.status ?? member.status}
                                    onChange={(event) =>
                                      updateCharacterDraft(member.id, { status: event.target.value })
                                    }
                                  />
                                </div>
                                <textarea
                                  className="rave-input h-16 resize-none rounded-2xl px-3 py-2 text-sm"
                                  placeholder="Append DM note..."
                                  value={characterDrafts[member.id]?.notesAppend ?? ""}
                                  onChange={(event) =>
                                    updateCharacterDraft(member.id, { notesAppend: event.target.value })
                                  }
                                />
                                <Button
                                  variant="secondary"
                                  onClick={() => saveCharacterPatch(member.id)}
                                  disabled={patchCharacterPendingId === member.id}
                                >
                                  {patchCharacterPendingId === member.id ? "Saving..." : "Save Character Patch"}
                                </Button>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-cloud/70">No characters created yet.</div>
                      )}
                    </div>
                    {patchCharacterError && <div className="mt-3 text-xs text-rose-300">{patchCharacterError}</div>}
                  </div>
                  <div className="rave-panel rounded-3xl p-5">
                    <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Quest Board</div>
                    <div className="mt-3 grid gap-2 text-sm text-cloud/80">
                      {snapshot.quests.length ? (
                        snapshot.quests.slice(0, 6).map((quest) => (
                          <div key={quest.id} className="rave-chip rounded-2xl px-4 py-2">
                            {quest.title} ({quest.status}, {quest.progress}%)
                          </div>
                        ))
                      ) : (
                        <div className="rave-chip rounded-2xl px-4 py-2">No quests available.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[0.65fr_1.35fr]">
                <div className="rave-panel rounded-3xl p-5">
                  <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Shared Inventory</div>
                  <div className="mt-4 grid gap-3">
                    {aggregatedInventory.length ? (
                      aggregatedInventory.map((entry) => (
                        <div key={entry.item} className="flex items-center justify-between text-sm text-cloud/80">
                          <div>
                            <div className="text-white">{entry.item}</div>
                            <div className="text-xs uppercase tracking-[0.2em] text-cloud/60">{entry.detail}</div>
                          </div>
                          <div className="rave-chip rounded-full px-3 py-1 text-xs text-cloud/70">{entry.qty}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-cloud/70">No inventory tracked yet.</div>
                    )}
                  </div>
                </div>

                <div className="rave-panel rounded-3xl p-5">
                  <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Context Relay</div>
                  <div className="mt-4 grid gap-3 text-sm text-cloud/80">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {contextStats.map((stat) => (
                        <div key={stat.label} className="rave-chip rounded-2xl px-4 py-3">
                          <div className="text-[11px] uppercase tracking-[0.25em] text-cloud/60">{stat.label}</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rave-chip rounded-2xl px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.25em] text-cloud/60">Top References</div>
                      <div className="mt-3 grid gap-2">
                        {topCompendiumItems.length ? (
                          topCompendiumItems.map((item) => (
                            <div key={item.id ?? item.name} className="flex items-start justify-between gap-3">
                              <span className="text-white">{item.name}</span>
                              <span className="text-[10px] uppercase tracking-[0.2em] text-cloud/50">{item.entryType ?? "ref"}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-cloud/60">No references matched yet.</div>
                        )}
                      </div>
                    </div>
                    {contextPreviewError && <div className="text-xs text-amber-200">{contextPreviewError}</div>}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              <RulesLookup
                activeSystemId={sessionSystemId}
                activeSystemName={sessionSystem?.name ?? snapshot?.campaign.systemId}
              />

              <div className="rave-panel rounded-3xl p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Dice Roller</div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs uppercase tracking-[0.3em] text-cloud/70">
                  {dice.map((die) => (
                    <motion.button
                      key={die}
                      className={cn(
                        "rave-chip rounded-2xl px-3 py-4 transition hover:text-white",
                        rollingDie === die && "animate-raveBeat text-white shadow-[0_0_18px_rgba(66,245,255,0.55)]"
                      )}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => rollDie(die)}
                      type="button"
                    >
                      {die}
                    </motion.button>
                  ))}
                </div>
                <motion.div
                  key={lastRoll.id}
                  variants={resultVariants}
                  initial="hidden"
                  animate="show"
                  className="mt-4 text-xs text-cloud/60"
                >
                  Last roll: {lastRoll.die} = {lastRoll.value} ({lastRoll.verdict})
                </motion.div>
              </div>

              <div className="rave-panel rounded-3xl p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Session Log</div>
                <motion.div className="mt-4 grid gap-3 text-sm text-cloud/80" variants={logContainerVariants} initial="hidden" animate="show">
                  {logEntries.length ? (
                    logEntries.map((entry) => (
                      <motion.div
                        key={entry.id}
                        layout
                        variants={logItemVariants}
                        className={cn(
                          "rave-chip rounded-2xl px-4 py-3",
                          entry.tone === "roll" &&
                            "border border-glow/40 bg-[linear-gradient(145deg,rgba(14,4,26,0.9),rgba(18,10,40,0.8))] text-white shadow-[0_0_18px_rgba(66,245,255,0.25)]"
                        )}
                      >
                        {entry.text}
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-sm text-cloud/70">No session events yet.</div>
                  )}
                </motion.div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
