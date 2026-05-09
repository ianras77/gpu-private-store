"use client";

import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import {
  usePersistentRadioPlayer,
  type RadioTrack,
} from "./PersistentRadioPlayerProvider";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  buildRadioChatUrl,
  createRadioChatRequestId,
  ensureRadioChatClientId,
  isRapidDuplicateRadioChatSubmission,
  normalizeRadioChatMessages,
  normalizeRadioChatText,
  type RadioChatMessage,
  type RadioChatRecommendationStatus,
} from "../lib/radio-chat";
import { radioApiLinks } from "../lib/radio-links";
import { formatRadioMood } from "../lib/radio-mood";
import { formatTimeAgo } from "../lib/utils";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => res.json());

type RadioStatus = {
  mood?: string;
  queueDepth?: number;
  queueTarget?: number;
  libraryTracks?: number;
  snippets?: number;
  requestLineDepth?: number;
  requestLine?: string[];
  requestLineItems?: {
    id: string;
    summary: string;
    listenerMessage?: string | null;
    response?: string | null;
    trackId?: string | null;
    trackIds?: string[];
    source?: "chat" | "form" | "featured" | null;
    status?: RadioChatRecommendationStatus | "queued" | "fulfilled" | null;
    intent?: string | null;
    createdAt: number;
    tracks?: Array<{
      id: string;
      title: string;
      artist: string;
      album?: string;
      year?: number;
    }>;
  }[];
  lastTalkAt?: number | null;
  djMode?: string;
  djLastDecisionAt?: number | null;
  djLastPlaylist?: {
    at?: number;
    trackIds?: string[];
    mood?: string;
    reason?: string | null;
  } | null;
  djSaysMeta?: {
    script?: string;
    mood?: string;
    source?: string;
    reason?: string | null;
    trackIds?: string[];
    at?: number;
  } | null;
  libraryLastScanAt?: number | null;
  feedbackTop?: {
    trackId: string;
    score: number;
    title: string;
    artist: string;
  }[];
  llmDirector?: {
    active?: boolean;
    driving?: boolean;
    name?: string;
    model?: string;
  } | null;
};

type DJPayload = {
  script?: string | null;
  mood?: string | null;
  source?: string | null;
  reason?: string | null;
  trackIds?: string[];
  at?: number | null;
};

type BoothDossierCard = {
  label?: string;
  title?: string;
  body?: string;
};

type BoothDossierPayload = {
  headline?: string | null;
  intro?: string | null;
  tags?: string[];
  cards?: BoothDossierCard[];
  deepCut?: string | null;
  nextMove?: string | null;
  at?: number | null;
  source?: string | null;
};

type StationChatPayload = {
  messages: RadioChatMessage[];
};

type RadioNoteTrack = {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  year?: number;
  genres?: string[];
  energy?: number;
};

type RadioNote = {
  id: string;
  title: string;
  excerpt: string;
  mood?: string | null;
  reason?: string | null;
  currentTrack?: RadioNoteTrack | null;
  setlist: RadioNoteTrack[];
  boothDossier?: BoothDossierPayload | null;
  createdAt: string;
};

type RadioNotesPayload = {
  notes: RadioNote[];
};

const seedQuickPrompts = [
  "Take me inside the booth right now.",
  "What part of Ian's taste is showing through this set?",
  "Give me a deep cut note on the record on air.",
  "I have a recommendation for the request line.",
];

const genreText = (track?: RadioTrack | null) =>
  Array.isArray(track?.genres)
    ? track.genres.filter(Boolean).slice(0, 2).join(" / ")
    : "";

const formatTrackStamp = (track?: Partial<RadioTrack> | null) => {
  if (!track?.title) return "Booth warming up";
  const albumLine = track.album ? ` off ${track.album}` : "";
  const yearLine = track.year ? ` (${track.year})` : "";
  return `${track.title} by ${track.artist ?? "Unknown Artist"}${albumLine}${yearLine}`;
};

const formatTrackChip = (track?: Partial<RadioTrack> | null) => {
  if (!track?.title) return "Needle hovering";
  return track.artist ? `${track.title} · ${track.artist}` : track.title;
};

const describeEnergy = (energy?: number) => {
  if (typeof energy !== "number") return "open-ended and smoky";
  if (energy < 0.3) return "slow-burn and intimate";
  if (energy < 0.55) return "warm with an easy shoulder-roll";
  if (energy < 0.75) return "locked in and moving clean";
  return "lit up and pushing hard";
};

const recommendationTone = (status?: RadioChatRecommendationStatus) => {
  if (status === "accepted") return "text-glow";
  if (status === "considering") return "text-cloud/80";
  if (status === "rejected") return "text-comet";
  return "text-cloud/50";
};

const recommendationLabel = (status?: RadioChatRecommendationStatus) => {
  if (status === "accepted") return "On the line";
  if (status === "considering") return "Under consideration";
  if (status === "rejected") return "Passed";
  return null;
};

const boothMoodThemes = [
  {
    shell:
      "radial-gradient(circle_at_10%_12%,rgba(255,230,109,0.18),transparent 28%),radial-gradient(circle_at_86%_10%,rgba(66,245,255,0.16),transparent 34%),linear-gradient(150deg,rgba(8,12,28,0.96),rgba(39,10,48,0.88))",
    mic:
      "linear-gradient(145deg,rgba(30,8,43,0.88),rgba(10,26,39,0.9))",
    note:
      "linear-gradient(160deg,rgba(8,20,36,0.92),rgba(24,12,45,0.82))",
    side:
      "linear-gradient(160deg,rgba(16,9,40,0.9),rgba(15,34,44,0.8))",
  },
  {
    shell:
      "radial-gradient(circle_at_18%_16%,rgba(122,232,255,0.17),transparent 30%),radial-gradient(circle_at_84%_14%,rgba(255,170,108,0.14),transparent 32%),linear-gradient(152deg,rgba(6,18,30,0.96),rgba(20,36,52,0.84))",
    mic:
      "linear-gradient(150deg,rgba(9,30,45,0.9),rgba(22,19,53,0.86))",
    note:
      "linear-gradient(160deg,rgba(9,27,39,0.92),rgba(30,15,40,0.82))",
    side:
      "linear-gradient(160deg,rgba(12,33,44,0.88),rgba(20,15,47,0.8))",
  },
  {
    shell:
      "radial-gradient(circle_at_14%_12%,rgba(255,132,198,0.17),transparent 30%),radial-gradient(circle_at_82%_14%,rgba(90,170,255,0.18),transparent 34%),linear-gradient(152deg,rgba(10,12,32,0.96),rgba(42,9,42,0.84))",
    mic:
      "linear-gradient(145deg,rgba(34,11,48,0.9),rgba(13,24,52,0.88))",
    note:
      "linear-gradient(160deg,rgba(20,12,47,0.92),rgba(10,26,43,0.82))",
    side:
      "linear-gradient(160deg,rgba(32,11,44,0.88),rgba(12,29,47,0.82))",
  },
  {
    shell:
      "radial-gradient(circle_at_12%_12%,rgba(182,255,138,0.14),transparent 28%),radial-gradient(circle_at_88%_14%,rgba(255,214,120,0.16),transparent 32%),linear-gradient(152deg,rgba(8,18,22,0.96),rgba(36,18,41,0.84))",
    mic:
      "linear-gradient(145deg,rgba(18,34,31,0.9),rgba(37,14,42,0.86))",
    note:
      "linear-gradient(160deg,rgba(9,26,31,0.92),rgba(34,16,38,0.82))",
    side:
      "linear-gradient(160deg,rgba(16,33,27,0.88),rgba(34,17,44,0.8))",
  },
] as const;

const hashMood = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const getBoothMoment = (date = new Date()) => {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(date);
  const hour = date.getHours();

  if (hour < 5) {
    return {
      weekday,
      label: "deep night",
      scene: "the quiet edge before morning",
      chip: `${weekday} / deep night`,
    };
  }
  if (hour < 9) {
    return {
      weekday,
      label: "daybreak",
      scene: "first light on the floorboards",
      chip: `${weekday} / daybreak`,
    };
  }
  if (hour < 13) {
    return {
      weekday,
      label: "late morning",
      scene: "the cleaner side of the day",
      chip: `${weekday} / late morning`,
    };
  }
  if (hour < 18) {
    return {
      weekday,
      label: "afternoon drift",
      scene: "the middle stretch where the room loosens up",
      chip: `${weekday} / afternoon`,
    };
  }
  if (hour < 22) {
    return {
      weekday,
      label: "nightfall",
      scene: "the hour when the room starts leaning toward the speakers",
      chip: `${weekday} / nightfall`,
    };
  }
  return {
    weekday,
    label: "after-hours",
    scene: "the part of the night where the edges glow a little harder",
    chip: `${weekday} / after-hours`,
  };
};

export function RadioTower({
  showDeckPlayer = true,
}: {
  showDeckPlayer?: boolean;
}) {
  const chatFeedRef = useRef<HTMLDivElement | null>(null);
  const sendLockRef = useRef(false);
  const lastSubmittedRef = useRef<{
    createdAt: number;
    text: string;
  } | null>(null);
  const [voteStatus, setVoteStatus] = useState<string | null>(null);
  const [voting, setVoting] = useState<"up" | "down" | null>(null);
  const [queueing, setQueueing] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatClientId, setChatClientId] = useState<string | null>(null);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const [pendingReply, setPendingReply] = useState<{
    messageId: string;
    sentAt: number;
  } | null>(null);

  const {
    buffering,
    canFallback,
    displayNow,
    externalStreamUrl,
    fallbackTrack,
    fallbackList,
    featuredItems,
    liveHealth,
    liveSourceMode,
    nextFallbackTrack,
    playStatus,
    playing,
    queueItems,
    streamError,
    toggle,
    toggleFallback,
    toggleLiveSourceMode,
    useFallback,
  } = usePersistentRadioPlayer();
  const libraryUrl =
    process.env.NEXT_PUBLIC_MUSIC_LIBRARY_URL || "/listening-room";
  const { data: dj } = useSWR<DJPayload>("/api/radio/dj", fetcher, {
    refreshInterval: 10000,
  });
  const { data: hears } = useSWR<BoothDossierPayload>(
    "/api/radio/hears",
    fetcher,
    {
      refreshInterval: 20000,
    },
  );
  const { data: status } = useSWR<RadioStatus>("/api/radio/status", fetcher, {
    refreshInterval: 15000,
  });
  const { data: notesData } = useSWR<RadioNotesPayload>(
    "/api/radio/notes?limit=3",
    fetcher,
    {
      refreshInterval: 60000,
    },
  );
  const { data: chatData, mutate: mutateChat } = useSWR<StationChatPayload>(
    chatClientId ? buildRadioChatUrl(chatClientId) : null,
    fetcher,
    {
      refreshInterval: 4000,
      dedupingInterval: 1500,
      revalidateOnFocus: false,
    },
  );
  const chatMessages = normalizeRadioChatMessages<RadioChatMessage>(
    Array.isArray(chatData?.messages) ? chatData.messages : [],
  );
  const recentNotes = Array.isArray(notesData?.notes) ? notesData.notes : [];
  const feedbackTrackId = displayNow?.id;

  const { data: feedbackSummary } = useSWR(
    feedbackTrackId ? `/api/radio/feedback?trackId=${feedbackTrackId}` : null,
    fetcher,
    { refreshInterval: 20000 },
  );

  useEffect(() => {
    setChatClientId(ensureRadioChatClientId());
  }, []);

  useEffect(() => {
    if (!pendingReply) return;

    const receivedReply = chatMessages.some(
      (message) => message.role === "dj" && message.createdAt >= pendingReply.sentAt,
    );
    if (receivedReply) {
      setPendingReply(null);
      setChatStatus((current) =>
        current?.includes("cueing")
          ? "Mr Rassy is back on the line."
          : current,
      );
      return;
    }

    const ageMs = Date.now() - pendingReply.sentAt;
    if (ageMs > 30_000) {
      setPendingReply(null);
      setChatStatus("Mr Rassy is still thinking. Give him another pass in a second.");
      return;
    }

    const timer = window.setTimeout(() => {
      void mutateChat();
    }, ageMs < 12_000 ? 900 : 1500);

    return () => window.clearTimeout(timer);
  }, [chatMessages, mutateChat, pendingReply]);

  const sendVote = async (vote: "up" | "down") => {
    if (!displayNow?.title && !displayNow?.id) return;
    setVoteStatus(null);
    setVoting(vote);
    const res = await fetch("/api/radio/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vote,
        trackId: displayNow?.id,
        title: displayNow?.title,
        artist: displayNow?.artist,
      }),
    });
    if (res.ok) {
      setVoteStatus(
        vote === "up"
          ? "Saved. Mr Rassy heard that one loud and clear."
          : "Saved. Mr Rassy will steer away from it.",
      );
    } else {
      setVoteStatus("Vote failed.");
    }
    setVoting(null);
  };

  const queueFeatured = async (trackId: string) => {
    setQueueStatus(null);
    setQueueing(trackId);
    const res = await fetch("/api/radio/queue-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    if (res.ok) {
      const payload = (await res.json().catch(() => null)) as
        | { mode?: string | null }
        | null;
      setQueueStatus(
        payload?.mode === "already-live"
          ? "That one is already in the run."
          : "Mr Rassy pinned it to the request line.",
      );
    } else {
      setQueueStatus("That call missed. Try it again in a moment.");
    }
    setQueueing(null);
  };

  const sendChat = async (preset?: string) => {
    const message = (preset ?? chatInput).trim();
    if (!message || chatSending || sendLockRef.current) return;
    const normalizedMessage = normalizeRadioChatText(message);
    const latestListenerMessage = [...chatMessages]
      .reverse()
      .find((entry) => entry.role === "listener");

    if (
      isRapidDuplicateRadioChatSubmission(message, lastSubmittedRef.current) ||
      isRapidDuplicateRadioChatSubmission(message, latestListenerMessage)
    ) {
      setChatStatus("That one is already on the line. Give Mr Rassy a second.");
      return;
    }

    const activeClientId = chatClientId ?? ensureRadioChatClientId();
    if (!activeClientId) {
      setChatStatus("The line is still warming up.");
      return;
    }
    if (!chatClientId) {
      setChatClientId(activeClientId);
    }

    sendLockRef.current = true;
    lastSubmittedRef.current = {
      createdAt: Date.now(),
      text: normalizedMessage,
    };
    setChatSending(true);
    setChatStatus("Sending to Mr Rassy...");
    setPendingReply(null);
    const requestId = createRadioChatRequestId();
    if (!preset) {
      setChatInput("");
    }

    try {
      const response = await fetch("/api/radio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, clientId: activeClientId, requestId }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setPendingReply(null);
        lastSubmittedRef.current = null;
        setChatStatus("The booth missed that one. Try again in a second.");
        await mutateChat();
        return;
      }

      if (Array.isArray(payload?.messages)) {
        mutateChat({ messages: payload.messages }, { revalidate: false });
      } else {
        await mutateChat();
      }

      if (payload?.pending) {
        const latestListenerMessage = normalizeRadioChatMessages<RadioChatMessage>(
          Array.isArray(payload?.messages) ? payload.messages : [],
        )
          .filter((entry) => entry.role === "listener")
          .at(-1);
        setPendingReply({
          messageId: latestListenerMessage?.id ?? requestId,
          sentAt: latestListenerMessage?.createdAt ?? Date.now(),
        });
        setChatStatus(
          "Mr Rassy is cueing a thought and will come back on the line.",
        );
        return;
      }

      const replyStatus = payload?.reply?.recommendationStatus as
        | RadioChatRecommendationStatus
        | undefined;
      setPendingReply(null);
      if (replyStatus === "accepted") {
        setChatStatus(
          "Recommendation accepted. Mr Rassy pinned it to the line.",
        );
      } else if (replyStatus === "considering") {
        setChatStatus(
          "Recommendation heard. Mr Rassy is waiting for the right pocket.",
        );
      } else if (replyStatus === "rejected") {
        setChatStatus("Recommendation rejected. The booth let it pass.");
      } else {
        setChatStatus("Mr Rassy came back on the mic.");
      }
    } catch {
      setPendingReply(null);
      lastSubmittedRef.current = null;
      setChatStatus("The booth missed that one. Try again in a second.");
      await mutateChat();
    } finally {
      sendLockRef.current = false;
      setChatSending(false);
    }
  };

  const lastTalk = status?.lastTalkAt
    ? formatTimeAgo(new Date(status.lastTalkAt).toISOString())
    : "-";
  const djLast = status?.djLastDecisionAt
    ? formatTimeAgo(new Date(status.djLastDecisionAt).toISOString())
    : "-";
  const djLastPlaylist = status?.djLastPlaylist;
  const djPlaylistAt = djLastPlaylist?.at
    ? formatTimeAgo(new Date(djLastPlaylist.at).toISOString())
    : null;
  const djPlaylistTracks = Array.isArray(djLastPlaylist?.trackIds)
    ? djLastPlaylist.trackIds
    : [];
  const queueTarget = Number(status?.queueTarget ?? 6);
  const queueDepth = Number(status?.queueDepth ?? 0);
  const queuePercent = Math.max(
    0,
    Math.min(100, Math.round((queueDepth / Math.max(1, queueTarget)) * 100)),
  );

  const knownTracks = new Map<string, RadioTrack>();
  [...queueItems, ...featuredItems].forEach((track) => {
    if (track?.id) knownTracks.set(track.id, track);
  });
  if (displayNow?.id) knownTracks.set(displayNow.id, displayNow);

  const streamState =
    queueDepth > 0 && displayNow?.title ? "locked in" : "warming up";
  const totalUp = feedbackSummary?.totals?.up ?? 0;
  const totalDown = feedbackSummary?.totals?.down ?? 0;
  const netScore = feedbackSummary?.score ?? totalUp - totalDown;
  const topFeedback = Array.isArray(status?.feedbackTop)
    ? status.feedbackTop
    : [];
  const scanAge = status?.libraryLastScanAt
    ? formatTimeAgo(new Date(status.libraryLastScanAt).toISOString())
    : "never";
  const djTrackIds =
    Array.isArray(dj?.trackIds) && dj.trackIds.length > 0
      ? dj.trackIds
      : djPlaylistTracks;
  const djThought =
    dj?.script ??
    status?.djSaysMeta?.script ??
    "Mr Rassy is cueing the next turn.";
  const djThoughtAt = dj?.at ?? status?.djSaysMeta?.at ?? null;
  const djThoughtAge = djThoughtAt
    ? formatTimeAgo(new Date(djThoughtAt).toISOString())
    : "just now";
  const djReason =
    dj?.reason ?? status?.djSaysMeta?.reason ?? djLastPlaylist?.reason ?? null;
  const boothMood =
    dj?.mood ?? status?.djSaysMeta?.mood ?? status?.mood ?? "after-hours";
  const currentGenre = genreText(displayNow);
  const topListenerPick = topFeedback[0];
  const queueNext = queueItems[0];
  const queueAfter = queueItems[1];
  const requestLinePreview = Array.isArray(status?.requestLine)
    ? status.requestLine.filter(Boolean).slice(0, 4)
    : [];
  const requestLineItems = Array.isArray(status?.requestLineItems)
    ? status.requestLineItems.slice(0, 4)
    : [];
  const recentCalls = requestLineItems.slice(0, 2);
  const requestLineDepth = Math.max(
    Number(status?.requestLineDepth ?? 0),
    requestLinePreview.length,
    requestLineItems.length,
  );
  const currentEnergy = describeEnergy(displayNow?.energy);
  const boothSnapshot = [
    {
      label: "Now",
      value: formatTrackChip(displayNow),
      meta: currentGenre || boothMood,
    },
    {
      label: "On deck",
      value: queueNext ? formatTrackChip(queueNext) : "Setting the next turn",
      meta: queueAfter
        ? `Then ${formatTrackChip(queueAfter)}`
        : "Mr Rassy is feeling for the seam",
    },
    {
      label: "Request line",
      value: requestLineDepth
        ? `${requestLineDepth} live ${requestLineDepth === 1 ? "call" : "calls"}`
        : "Open line",
      meta:
        requestLinePreview[0] ??
        requestLineItems[0]?.summary ??
        "Throw one on the line",
    },
    {
      label: "Crowd",
      value: topListenerPick ? topListenerPick.title : "Waiting on the room",
      meta: topListenerPick
        ? topListenerPick.artist
        : "Votes are still coming in",
    },
    {
      label: "Last move",
      value: djThoughtAge,
      meta: djReason ?? "Fresh from the booth",
    },
  ];
  const fallbackBoothCards: BoothDossierCard[] = [
    {
      label: "Tone",
      title: currentGenre || "Current weather",
      body: currentGenre
        ? `${currentGenre} is all over the edges, and the energy feels ${currentEnergy}.`
        : `The record in the air feels ${currentEnergy}.`,
    },
    {
      label: displayNow?.year || displayNow?.album ? "History" : "Shelf",
      title: displayNow?.album
        ? `${displayNow.album}${displayNow.year ? ` · ${displayNow.year}` : ""}`
        : `${displayNow?.artist ?? "Current artist"} in focus`,
      body: displayNow?.album
        ? `${displayNow.title} is coming out of ${displayNow.album}${displayNow.year ? ` (${displayNow.year})` : ""}, which is putting real weight in the room.`
        : displayNow?.year
          ? `${displayNow.title} is carrying a ${displayNow.year} pulse through the room tonight.`
          : "This one feels like a shelf-pull chosen for grain, atmosphere, and shape instead of cheap novelty.",
    },
    {
      label: "Why now",
      title: queueNext?.title ? `${queueNext.title} on deck` : "Set logic",
      body: queueNext
        ? `Next up is ${formatTrackStamp(queueNext)}, so the turn after this record already has shape.`
        : "Mr Rassy is still sketching the next turn in the headphones.",
    },
  ];
  const fallbackBoothTags = Array.from(
    new Set(
      [
        boothMood,
        currentGenre || null,
        displayNow?.year ? `${Math.floor(displayNow.year / 10) * 10}s` : null,
        topListenerPick?.artist ? `crowd: ${topListenerPick.artist}` : null,
        queueNext?.artist ? `next: ${queueNext.artist}` : null,
      ].filter(Boolean) as string[],
    ),
  ).slice(0, 5);
  const fallbackBoothDossier: BoothDossierPayload = {
    headline: displayNow?.title
      ? `${displayNow.title} is shaping the room.`
      : "Mr Rassy is listening for the next seam.",
    intro: displayNow?.title
      ? `${formatTrackStamp(displayNow)} is landing with ${currentEnergy} energy and a ${boothMood} lean.`
      : "The booth is still warming up and listening for the next turn.",
    tags: fallbackBoothTags,
    cards: fallbackBoothCards,
    deepCut: topListenerPick
      ? `${topListenerPick.title} by ${topListenerPick.artist} is getting the strongest push from the room right now.`
      : requestLinePreview[0]
        ? `The request line is buzzing about ${requestLinePreview[0]}.`
        : djThought,
    nextMove: queueNext
      ? formatTrackStamp(queueNext)
      : "The next move is still taking shape.",
    at: djThoughtAt,
    source: "fallback",
  };
  const boothDossier =
    hears && Array.isArray(hears.cards) && hears.cards.length
      ? hears
      : fallbackBoothDossier;
  const boothCards = (
    Array.isArray(boothDossier.cards) ? boothDossier.cards : fallbackBoothCards
  )
    .filter((card) => card?.body)
    .slice(0, 3);
  const boothHeadline =
    boothDossier.headline ??
    fallbackBoothDossier.headline ??
    "What Mr Rassy Hears";
  const boothIntro =
    boothDossier.intro ?? fallbackBoothDossier.intro ?? djThought;
  const boothTags =
    Array.isArray(boothDossier.tags) && boothDossier.tags.length
      ? boothDossier.tags.filter(Boolean).slice(0, 6)
      : fallbackBoothTags;
  const boothDeepCut =
    boothDossier.deepCut ?? fallbackBoothDossier.deepCut ?? djThought;
  const boothNextMove =
    boothDossier.nextMove ??
    fallbackBoothDossier.nextMove ??
    "The next move is still taking shape.";
  const boothHearingAt = boothDossier.at ?? djThoughtAt;
  const boothHearingAge = boothHearingAt
    ? formatTimeAgo(new Date(boothHearingAt).toISOString())
    : "just now";
  const boothSourceLabel =
    boothDossier.source === "llm" ? "Long listen" : "Booth jot";
  const boothSourceHint =
    boothDossier.source === "llm"
      ? "A longer note from the booth, catching the lineage, the texture, and the shape of the turn."
      : "A quick note from the booth while the night's shape is still fresh.";
  const boothSourceTone =
    boothDossier.source === "llm"
      ? "border-aurora/20 bg-aurora/10 text-cloud/88"
      : "border-white/10 bg-black/20 text-cloud/68";
  const lineupItems: Array<{
    key: string;
    label: string;
    track: Partial<RadioTrack>;
    note: string;
  }> = [];
  const lineupKeys = new Set<string>();
  const addLineupTrack = (
    track: Partial<RadioTrack> | null | undefined,
    label: string,
    note: string,
  ) => {
    if (!track?.title) return;
    const key =
      track.id ?? `${label}-${track.title}-${track.artist ?? "unknown"}`;
    if (lineupKeys.has(key)) return;
    lineupKeys.add(key);
    lineupItems.push({ key, label, track, note });
  };

  addLineupTrack(displayNow, "On air", `${boothMood} · ${currentEnergy}`);
  queueItems.slice(0, 3).forEach((track, index) => {
    addLineupTrack(
      track,
      index === 0 ? "On deck" : index === 1 ? "Then" : "Later",
      index === 0
        ? (djReason ?? "Next move taking shape")
        : genreText(track) || "Held just off the fader",
    );
  });
  djTrackIds.forEach((trackId) => {
    const track = knownTracks.get(trackId);
    addLineupTrack(
      track,
      "Picked",
      djPlaylistAt
        ? `Pulled together ${djPlaylistAt}`
        : "Part of tonight's run",
    );
  });

  const boothPrompts = Array.from(
    new Set(
      [
        displayNow?.title
          ? `Why did you put ${displayNow.title} on right now?`
          : null,
        displayNow?.artist
          ? `Give me a deeper note on ${displayNow.artist}.`
          : null,
        queueNext?.title
          ? `What makes ${queueNext.title} the next move?`
          : null,
        ...seedQuickPrompts,
      ].filter(Boolean) as string[],
    ),
  ).slice(0, 3);

  const directionName = "Mr Rassy";
  const directionActive = status?.llmDirector?.driving === true;
  const directionOnline = status?.llmDirector?.active !== false;
  const directionLine = directionName;
  const directionBadge = directionActive
    ? "Locked in"
    : directionOnline
      ? "Reading the room"
      : "By feel";
  const boothMoment = getBoothMoment();
  const moodLabel = formatRadioMood(boothMood);
  const boothTheme =
    boothMoodThemes[hashMood(`${boothMood}-${boothMoment.chip}`) % boothMoodThemes.length];
  const boothSceneTitle =
    moodLabel.toLowerCase() === boothMoment.label
      ? `${boothMoment.weekday} ${boothMoment.label}`
      : `${boothMoment.weekday} ${boothMoment.label} in ${moodLabel}`;
  const directionSummary = directionActive
    ? `${directionName} has ${boothMoment.scene} tonight, cueing turns, shaping transitions, and feeding the booth its next thought from a ${moodLabel.toLowerCase()} center.`
    : directionOnline
      ? `${directionName} is reading ${boothMoment.scene} closely right now, keeping the room in a ${moodLabel.toLowerCase()} drift while the next move comes into focus.`
      : `The booth is riding ${boothMoment.scene} by instinct tonight, still holding a ${moodLabel.toLowerCase()} lean.`;
  const boothSupportCards = boothSnapshot.slice(1);
  const featuredNote = recentNotes[0] ?? null;
  const supportingNotes = recentNotes.slice(1, 3);
  const signalValue = useFallback
    ? "Stacks"
    : liveSourceMode === "direct"
      ? "Raw feed"
      : "Stable line";
  const signalMeta = useFallback
    ? fallbackTrack?.title
      ? `covering with ${fallbackTrack.title}`
      : "holding the room from the shelves"
    : liveHealth?.ok === false
      ? "the live line blinked recently"
      : playing
        ? buffering
          ? "needle catching now"
          : "carrying the room clean"
        : "ready when you are";
  const deskCards = [
    {
      label: "Crowd score",
      value: `${netScore}`,
      meta: `+${totalUp} / -${totalDown}`,
    },
    {
      label: "Signal path",
      value: signalValue,
      meta: signalMeta,
    },
    {
      label: "Request line",
      value: requestLineDepth
        ? `${requestLineDepth} live ${requestLineDepth === 1 ? "call" : "calls"}`
        : "Open line",
      meta:
        requestLinePreview[0] ??
        requestLineItems[0]?.summary ??
        "Throw one on the line",
    },
    {
      label: "Next move",
      value: queueNext ? formatTrackChip(queueNext) : "Still sketching",
      meta: queueAfter
        ? `Then ${formatTrackChip(queueAfter)}`
        : "Listening for the seam",
    },
  ];
  const libraryIsExternal = /^https?:\/\//i.test(libraryUrl);
  const libraryHostLabel = libraryIsExternal
    ? libraryUrl.replace(/^https?:\/\//, "")
    : "listening room";
  const stationMetrics = [
    {
      label: "Queue",
      value: `${queueDepth} / ${queueTarget}`,
      meta: "moves lined up",
    },
    {
      label: "Signal",
      value:
        liveHealth?.ok === true
          ? "Locked in"
          : liveHealth?.ok === false
            ? "A little shaky"
            : "Listening",
      meta: useFallback
        ? "from the stacks"
        : liveSourceMode === "direct"
          ? "from the direct station line"
          : "through the stable line",
    },
    {
      label: "Last shift",
      value: djLast,
      meta:
        lastTalk === "-"
          ? "waiting on a booth break"
          : `last mic break ${lastTalk}`,
    },
  ];

  useEffect(() => {
    if (!chatFeedRef.current) return;
    chatFeedRef.current.scrollTo({
      top: chatFeedRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages.length, pendingReply?.messageId]);

  return (
    <section id="radio" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-16">
      <div className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section-title text-3xl">
            <span className="magical-text">Mr Rassy</span> Live Radio
          </h2>
          <div className="rave-chip flex items-center gap-2 rounded-full px-3 py-1 text-xs uppercase tracking-[0.3em] text-cloud/70">
            <span className="glow-dot h-2 w-2 rounded-full" />
            On Air
          </div>
          <div className="flex items-end gap-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <span
                key={`eq-${index}`}
                className="eq-bar h-4 w-1 rounded-full"
                style={{ animationDelay: `${index * 0.1}s` }}
              />
            ))}
          </div>
        </div>
        <p className="max-w-4xl text-cloud/80">
          This is the booth: live records, live taste, live talk, and a running
          memory of the set. Ask Mr Rassy what he is spinning, throw a
          recommendation on the line, or drop into the archive when you want the
          full history of how the night has been moving.
        </p>
      </div>

      <Card
        id="booth-chat"
        className="space-y-6 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.08),transparent_24%),radial-gradient(circle_at_88%_0%,rgba(66,245,255,0.12),transparent_32%),linear-gradient(145deg,rgba(10,13,28,0.94),rgba(33,7,42,0.9))]"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,79,216,0.14),transparent_34%),linear-gradient(145deg,rgba(17,6,31,0.88),rgba(8,15,32,0.92))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                  Talk To Mr Rassy
                </div>
                <div className="mt-3 max-w-2xl text-sm leading-7 text-cloud/78">
                  Ask about what&apos;s playing, ask why a record made the cut,
                  or throw something onto the line. This is the quickest way to
                  hear Mr Rassy talk back.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="text-glow">replying live</Badge>
                <Badge
                  className={
                    directionActive
                      ? "text-glow"
                      : directionOnline
                        ? "text-cloud/80"
                        : "text-comet"
                  }
                >
                  {directionBadge}
                </Badge>
              </div>
            </div>

            <div
              ref={chatFeedRef}
              className="mt-4 flex h-[360px] flex-col gap-3 overflow-y-auto rounded-[26px] border border-white/10 bg-black/30 p-4"
              aria-live="polite"
            >
              {chatMessages.map((message) => {
                const matchedTrack = message.matchedTrackId
                  ? knownTracks.get(message.matchedTrackId)
                  : null;
                const label = recommendationLabel(message.recommendationStatus);
                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "listener" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-[22px] border px-4 py-4 ${
                        message.role === "listener"
                          ? "border-white/10 bg-white/10 text-cloud/90"
                          : "border-white/12 bg-[linear-gradient(150deg,rgba(255,255,255,0.08),rgba(255,79,216,0.08))] text-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                        <span>
                          {message.role === "listener" ? "You" : "Mr Rassy"}
                        </span>
                        <span>
                          {formatTimeAgo(
                            new Date(message.createdAt).toISOString(),
                          ) || "just now"}
                        </span>
                        {label && (
                          <span
                            className={recommendationTone(
                              message.recommendationStatus,
                            )}
                          >
                            {label}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm leading-7">{message.text}</p>
                      {matchedTrack && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-cloud/70">
                          Pulled from the crate:{" "}
                          {formatTrackStamp(matchedTrack)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {!chatMessages.length && (
                <div className="flex h-full items-center justify-center text-sm text-cloud/70">
                  Waiting for Mr Rassy to answer...
                </div>
              )}

              {pendingReply && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-[22px] border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,0.05),rgba(66,245,255,0.08))] px-4 py-4 text-white">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                      <span>Mr Rassy</span>
                      <span>thinking</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-cloud/82">
                      He&apos;s turning that over and will come right back with a thought.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendChat();
                  }
                }}
                placeholder="Ask what he's hearing, ask for a lane, request a whole pocket, or just talk to him..."
                className="rave-input w-full flex-1 rounded-full px-4 py-3 text-sm sm:min-w-[220px]"
              />
              <Button
                variant="secondary"
                onClick={() => void sendChat()}
                disabled={chatSending}
              >
                {chatSending ? "Sending..." : "Send to Mr Rassy"}
              </Button>
            </div>
            {chatStatus && (
              <div className="mt-2 text-xs text-cloud/70">{chatStatus}</div>
            )}
          </div>

          <div className="rounded-[32px] border border-white/10 bg-black/20 p-5 shadow-[0_18px_46px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                Request Line
              </div>
              <div className="text-xs text-cloud/55">
                {requestLineDepth ? `${requestLineDepth} live` : "Open line"}
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-cloud/76">
              Broad asks, specific cuts, and the ways Mr Rassy is answering
              them with music.
            </p>

            {recentCalls.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {recentCalls.map((item) => {
                  const label =
                    recommendationLabel(
                      item.status === "accepted" ||
                        item.status === "considering" ||
                        item.status === "rejected"
                        ? item.status
                        : undefined,
                    ) ??
                    "On the line";
                  const selectedTracks = Array.isArray(item.tracks)
                    ? item.tracks.slice(0, 3)
                    : [];
                  return (
                    <div
                      key={`request-${item.id}`}
                      className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`text-[10px] uppercase tracking-[0.22em] ${recommendationTone(
                            item.status === "accepted" ||
                              item.status === "considering" ||
                              item.status === "rejected"
                              ? item.status
                              : undefined,
                          )}`}
                        >
                          {label}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-cloud/45">
                          {formatTimeAgo(
                            new Date(item.createdAt).toISOString(),
                          )}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-white">
                        {item.summary}
                      </div>
                      {item.listenerMessage ? (
                        <div className="mt-2 text-xs leading-6 text-cloud/68">
                          Ask: {item.listenerMessage}
                        </div>
                      ) : null}
                      {selectedTracks.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedTracks.map((track) => (
                            <span
                              key={`${item.id}-${track.id}`}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cloud/70"
                            >
                              {track.title} · {track.artist}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {item.response ? (
                        <div className="mt-3 text-xs leading-6 text-cloud/72">
                          {item.response}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : requestLinePreview.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {requestLinePreview.slice(0, 3).map((request, index) => (
                  <div
                    key={`${request}-${index}`}
                    className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-4"
                  >
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                      Waiting in the booth
                    </div>
                    <div className="mt-2 text-sm leading-6 text-white">
                      {request}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-cloud/70">
                The line is open. Send something unexpected.
              </div>
            )}

            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() =>
                void sendChat("I have a recommendation for the request line.")
              }
              disabled={chatSending}
            >
              Send a recommendation
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_360px]">
          <div className="flex flex-col gap-6">
            <div
              id="live-booth-notebook"
              className="rounded-[32px] border border-white/10 p-6 shadow-[0_26px_80px_rgba(0,0,0,0.34)]"
              style={{ backgroundImage: boothTheme.shell }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                    Live Booth Notebook
                  </div>
                  <h3 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
                    {boothSceneTitle}
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-cloud/78">
                    {directionSummary}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/60">
                  <span className="rave-chip rounded-full px-3 py-2">
                    {directionBadge}
                  </span>
                  <span className="rave-chip rounded-full px-3 py-2">
                    {boothMoment.chip}
                  </span>
                  <span className="rave-chip rounded-full px-3 py-2">
                    {moodLabel}
                  </span>
                  <span className="rave-chip rounded-full px-3 py-2">
                    {djThoughtAge}
                  </span>
                </div>
              </div>

              <div
                className="mt-6 rounded-[30px] border border-white/10 p-5 md:p-6"
                style={{ backgroundImage: boothTheme.mic }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
                    Mr Rassy has the room
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-cloud/55">
                    {directionLine}
                  </div>
                </div>
                <div className="mt-4 text-[10px] uppercase tracking-[0.28em] text-cloud/58">
                  {boothMoment.scene}
                </div>
                <p className="mt-4 text-base leading-8 text-cloud/94 md:text-lg">
                  {djThought}
                </p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div
                  className="rounded-[28px] border border-white/10 p-5"
                  style={{ backgroundImage: boothTheme.note }}
                >
                  <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
                    Why this turn works
                  </div>
                  <p className="mt-3 text-sm leading-7 text-cloud/84">
                    {djReason ?? boothIntro}
                  </p>
                </div>

                <div className="grid gap-3">
                  <div
                    className="rounded-[24px] border border-white/10 p-4"
                    style={{ backgroundImage: boothTheme.side }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                        Room tone
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.22em] text-cloud/55">
                        {directionBadge}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      {directionLine}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-cloud/68">
                      {directionSummary}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-cloud/55">
                      <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2">
                        {djThoughtAge}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2">
                        {lastTalk === "-"
                          ? "No recent mic break"
                          : `Mic ${lastTalk}`}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                      Prompt the booth
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {boothPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-cloud/70 transition hover:text-white"
                          onClick={() => void sendChat(prompt)}
                          disabled={chatSending}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {boothSupportCards.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.2)]"
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/45">
                      {item.label}
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-5 text-white">
                      {item.value}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-cloud/62">
                      {item.meta}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.14),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(66,245,255,0.16),transparent_30%),linear-gradient(155deg,rgba(7,16,34,0.96),rgba(20,9,37,0.9))] p-6 shadow-[0_26px_80px_rgba(0,0,0,0.32)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                    What Mr Rassy Hears
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">
                    {boothHeadline}
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 text-[10px] uppercase tracking-[0.2em] md:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-2 ${boothSourceTone}`}
                    >
                      {boothSourceLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-cloud/55">
                      {boothHearingAge}
                    </span>
                  </div>
                  <span className="max-w-xs text-[11px] normal-case tracking-normal text-cloud/45 md:text-right">
                    {boothSourceHint}
                  </span>
                </div>
              </div>

              <p className="mt-4 max-w-4xl text-base leading-8 text-cloud/86">
                {boothIntro}
              </p>

              {boothTags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/60">
                  {boothTags.map((tag) => (
                    <span
                      key={tag}
                      className="rave-chip rounded-full px-3 py-2"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {boothCards.map((card, index) => (
                  <div
                    key={`${card.label ?? "card"}-${index}`}
                    className={`rounded-[24px] border px-5 py-5 transition duration-300 hover:-translate-y-0.5 ${
                      index === 0
                        ? "border-white/16 bg-[linear-gradient(145deg,rgba(255,79,216,0.08),rgba(0,0,0,0.25))]"
                        : "border-white/10 bg-black/25"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                      {card.label ?? "Note"}
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {card.title ?? "Booth note"}
                    </div>
                    <div className="mt-3 text-sm leading-7 text-cloud/82">
                      {card.body}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_310px]">
                <div className="rounded-[26px] border border-white/10 bg-black/20 px-5 py-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                    Deep Scan
                  </div>
                  <p className="mt-3 text-sm leading-7 text-cloud/82">
                    {boothDeepCut}
                  </p>
                </div>

                <div className="flex flex-col gap-4 rounded-[26px] border border-white/10 bg-black/15 px-5 py-5">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                      Carry the signal
                    </div>
                    <div className="mt-3 text-base font-semibold text-white">
                      {boothNextMove}
                    </div>
                    <div className="mt-3 text-xs leading-6 text-cloud/64">
                      Save the station to another player, or nudge Mr Rassy for
                      a sharper note on the record filling the room.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      className="px-4 py-2 text-xs"
                      onClick={() =>
                        void sendChat(
                          displayNow?.artist
                            ? `Give me an even deeper note on ${displayNow.artist}.`
                            : "Take me deeper into what you are hearing right now.",
                        )
                      }
                    >
                      Ask deeper
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      className="px-4 py-2 text-xs"
                    >
                      <a href={radioApiLinks.channel.m3u.mp3}>MP3 M3U</a>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      className="px-4 py-2 text-xs"
                    >
                      <a href={radioApiLinks.channel.m3u.lossless}>
                        Lossless M3U
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      className="px-4 py-2 text-xs"
                    >
                      <a href={radioApiLinks.channel.xspf.mp3}>MP3 XSPF</a>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      className="px-4 py-2 text-xs"
                    >
                      <a href={radioApiLinks.channel.xspf.lossless}>
                        Lossless XSPF
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      className="px-4 py-2 text-xs"
                    >
                      <a
                        href={externalStreamUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open active line
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {showDeckPlayer ? (
              <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,79,216,0.14),transparent_34%),radial-gradient(circle_at_90%_12%,rgba(66,245,255,0.12),transparent_34%),linear-gradient(150deg,rgba(9,13,26,0.95),rgba(40,10,42,0.88))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.36)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                    On Air Deck
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">
                    {displayNow?.title ?? "Needle in the air"}
                  </div>
                  <div className="mt-1 text-sm text-cloud/75">
                    {displayNow?.artist ?? "Mr Rassy"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{formatRadioMood(boothMood)}</Badge>
                  <Badge
                    className={
                      streamState === "locked in" ? "text-glow" : "text-laser"
                    }
                  >
                    {streamState}
                  </Badge>
                  <Badge>{signalValue}</Badge>
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-[136px_minmax(0,1fr)]">
                <div className="relative h-[136px] overflow-hidden rounded-[24px] border border-white/10 bg-black/40">
                  {displayNow?.albumArtUrl ? (
                    <Image
                      src={displayNow.albumArtUrl}
                      alt={displayNow.title ?? "Album art"}
                      fill
                      sizes="136px"
                      className="object-cover"
                      loading="lazy"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-cloud/60">
                      No Art
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col justify-center gap-3">
                  <div className="text-sm leading-7 text-cloud/82">
                    {formatTrackStamp(displayNow)}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-cloud/60">
                    {displayNow?.album && (
                      <span className="rave-chip rounded-full px-3 py-2">
                        {displayNow.album}
                      </span>
                    )}
                    {displayNow?.year && (
                      <span className="rave-chip rounded-full px-3 py-2">
                        {displayNow.year}
                      </span>
                    )}
                    {currentGenre && (
                      <span className="rave-chip rounded-full px-3 py-2">
                        {currentGenre}
                      </span>
                    )}
                    {typeof displayNow?.energy === "number" && (
                      <span className="rave-chip rounded-full px-3 py-2">
                        Energy {Math.round(displayNow.energy * 100)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {deskCards.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4"
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/45">
                      {item.label}
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-5 text-white">
                      {item.value}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-cloud/62">
                      {item.meta}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[28px] border border-white/10 bg-black/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
                  Transport + feedback
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={toggle} disabled={playStatus === "loading"}>
                    {playing
                      ? "Pause"
                      : playStatus === "loading"
                        ? "Loading..."
                        : "Play"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={toggleFallback}
                    disabled={!canFallback}
                  >
                    {useFallback ? "Back to the live room" : "Hear the stacks"}
                  </Button>
                  {!useFallback && (
                    <Button variant="secondary" onClick={toggleLiveSourceMode}>
                      {liveSourceMode === "direct"
                        ? "Back to the stable line"
                        : "Try the direct station line"}
                    </Button>
                  )}
                  {useFallback && fallbackList.length > 1 && (
                    <Button
                      variant="secondary"
                      onClick={nextFallbackTrack}
                    >
                      Next cut
                    </Button>
                  )}
                  <a
                    className="text-xs text-cloud/80 underline decoration-dotted"
                    href={externalStreamUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open station stream
                  </a>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    className="px-4 py-1 text-xs"
                    onClick={() => sendVote("up")}
                    disabled={voting !== null}
                  >
                    {voting === "up" ? "Sending..." : "Love this"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-4 py-1 text-xs"
                    onClick={() => sendVote("down")}
                    disabled={voting !== null}
                  >
                    {voting === "down" ? "Sending..." : "Not this one"}
                  </Button>
                  {voteStatus && (
                    <div className="text-xs text-cloud/70">{voteStatus}</div>
                  )}
                </div>

                {streamError && (
                  <div className="mt-3 text-xs text-comet">{streamError}</div>
                )}
                {buffering && (
                  <div className="mt-1 text-xs text-cloud/60">
                    Needle catching. Hold tight...
                  </div>
                )}
                {useFallback && (
                  <div className="mt-1 text-xs text-cloud/70">
                    A nearby cut is keeping the room warm for a minute.
                  </div>
                )}
                {!useFallback && (
                  <div className="mt-1 text-xs text-cloud/70">
                    {liveSourceMode === "direct"
                      ? "You're hearing the direct station line."
                      : "You're hearing the stable live line through the site relay."}
                  </div>
                )}
                <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs leading-6 text-cloud/68">
                  The radio now keeps playing while you move around the site.
                  Use the header control or the booth buttons whenever you want
                  to stop it.
                </div>
              </div>
              </div>
            ) : null}

            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(150deg,rgba(11,16,30,0.94),rgba(30,8,48,0.84))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                  Notes From Mr Rassy
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="px-3 py-1 text-[11px]"
                >
                  <Link href="/radio/notes">Full archive</Link>
                </Button>
              </div>

              {featuredNote ? (
                <div className="mt-4">
                  <Link
                    href={`/radio/notes#${featuredNote.id}`}
                    className="group block"
                  >
                    <div className="rounded-[28px] border border-white/10 bg-black/20 p-5 transition duration-300 group-hover:-translate-y-0.5 group-hover:border-white/20">
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/58">
                        <span className="rave-chip rounded-full px-3 py-2">
                          {formatRadioMood(featuredNote.mood)}
                        </span>
                        <span className="rave-chip rounded-full px-3 py-2">
                          {formatTimeAgo(featuredNote.createdAt) || "recent"}
                        </span>
                        <span className="rave-chip rounded-full px-3 py-2">
                          {featuredNote.setlist.length} track
                          {featuredNote.setlist.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-4 text-xl font-semibold text-white transition group-hover:text-glow">
                        {featuredNote.title}
                      </div>
                      <p className="mt-3 text-sm leading-7 text-cloud/82">
                        {featuredNote.excerpt}
                      </p>
                      <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4">
                        <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                          Captured with the turn
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {featuredNote.currentTrack?.title ??
                            featuredNote.setlist[0]?.title ??
                            "Saved booth turn"}
                        </div>
                        <div className="mt-1 text-xs text-cloud/68">
                          {featuredNote.currentTrack?.artist ??
                            featuredNote.setlist[0]?.artist ??
                            "Mr Rassy"}
                        </div>
                        {featuredNote.boothDossier?.headline && (
                          <div className="mt-3 text-xs leading-5 text-cloud/72">
                            {featuredNote.boothDossier.headline}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>

                  {supportingNotes.length > 0 && (
                    <div className="mt-4 grid gap-3">
                      {supportingNotes.map((note) => (
                        <Link
                          key={note.id}
                          href={`/radio/notes#${note.id}`}
                          className="group block rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-white/20"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                            <span>{formatRadioMood(note.mood)}</span>
                            <span>
                              {formatTimeAgo(note.createdAt) || "recent"}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-white transition group-hover:text-glow">
                            {note.title}
                          </div>
                          <div className="mt-2 text-xs leading-6 text-cloud/72">
                            {note.excerpt}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-cloud/70">
                  More notes will land here as the night goes on.
                </div>
              )}
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(150deg,rgba(9,15,31,0.96),rgba(16,39,52,0.82))] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                  Tonight&apos;s Run
                </div>
                <div className="text-xs text-cloud/55">
                  {lineupItems.length
                    ? `${lineupItems.length} moves in frame`
                    : "Still sketching"}
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-cloud/76">
                The current record, the next few cuts, and the tracks Mr Rassy
                has already touched.
              </p>
              {lineupItems.length > 0 ? (
                <div className="mt-4 flex flex-col gap-3">
                  {lineupItems.slice(0, 6).map((item) => (
                    <div
                      key={item.key}
                      className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-glow">
                            {item.label}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {item.track.title}
                          </div>
                          <div className="text-[11px] uppercase tracking-[0.2em] text-cloud/55">
                            {item.track.artist ?? "Unknown Artist"}
                          </div>
                        </div>
                        {item.track.year && (
                          <div className="text-[10px] uppercase tracking-[0.2em] text-cloud/45">
                            {item.track.year}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-cloud/70">
                        {item.note}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-cloud/70">
                  He is still sketching the next run.
                </div>
              )}
            </div>

            <div className="rounded-[32px] border border-white/10 bg-black/20 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                  Room Snapshot
                </div>
                <div className="text-xs text-cloud/55">
                  {queueDepth} / {queueTarget} lined up
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#42f5ff,#ff4fd8,#ffe66d)]"
                  style={{ width: `${queuePercent}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {stationMetrics.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-4"
                  >
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/45">
                      {item.label}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      {item.value}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-cloud/62">
                      {item.meta}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2 text-xs text-cloud/70">
                <div>
                  Room favourite:{" "}
                  {topListenerPick
                    ? `${topListenerPick.title} by ${topListenerPick.artist}`
                    : "the room is still deciding"}
                </div>
                <div>Last library sweep: {scanAge}</div>
                <div>
                  Library on hand: {status?.libraryTracks ?? "-"} records |{" "}
                  {status?.snippets ?? "-"} stings
                </div>
                <div>
                  Listen elsewhere:{" "}
                  <a
                    className="text-glow underline decoration-dotted"
                    href={libraryUrl}
                    {...(libraryIsExternal
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                  >
                    {libraryHostLabel}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="section-title text-2xl">
            Recent Pulls From The Crate
          </h3>
          <span className="text-xs uppercase tracking-[0.3em] text-cloud/60">
            Freshly touched records
          </span>
        </div>
        {queueStatus && (
          <div className="text-xs text-cloud/70">{queueStatus}</div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {featuredItems.map((track) => (
            <div
              key={track.id ?? `${track.artist ?? "track"}-${track.title ?? "unknown"}`}
              className="group relative flex items-center gap-4 overflow-hidden rounded-2xl rave-chip p-4"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                {track.albumArtUrl ? (
                  <Image
                    src={track.albumArtUrl}
                    alt={track.title ?? "Album art"}
                    fill
                    sizes="56px"
                    className="object-cover"
                    loading="lazy"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-cloud/60">
                    No Art
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {track.title}
                </div>
                <div className="truncate text-xs text-cloud/70">
                  {track.artist}
                </div>
                {track.lastPlayedAt && (
                  <div className="text-[10px] uppercase tracking-[0.2em] text-cloud/50">
                    {formatTimeAgo(track.lastPlayedAt)} touched
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {track.streamUrl && (
                  <a
                    className="text-xs font-semibold text-glow"
                    href={track.streamUrl}
                  >
                    Play
                  </a>
                )}
                <Button
                  variant="secondary"
                  className="px-3 py-1 text-[11px]"
                  onClick={() => track.id && queueFeatured(track.id)}
                  disabled={!track.id || queueing === track.id}
                >
                  {queueing === track.id ? "Sending..." : "Put on the line"}
                </Button>
              </div>
            </div>
          ))}
          {!featuredItems.length && (
            <div className="rave-chip rounded-2xl p-4 text-sm text-cloud/70 md:col-span-3">
              More records will show up here as the crate keeps turning.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
