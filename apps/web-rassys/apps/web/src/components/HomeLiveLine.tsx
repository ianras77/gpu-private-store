"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { MessageCircleMore, Radio, Send, Sparkles } from "lucide-react";
import {
  usePersistentRadioPlayer,
  type RadioTrack,
} from "./PersistentRadioPlayerProvider";
import { useRadioHome } from "../lib/radio-home";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { formatRadioMood } from "../lib/radio-mood";
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
import { formatTimeAgo } from "../lib/utils";

type StationChatPayload = {
  messages?: RadioChatMessage[];
};

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`chat_fetch_failed_${response.status}`);
    }
    return response.json();
  });

const formatTrackStamp = (track?: Partial<RadioTrack> | null) => {
  if (!track?.title) return "Mr Rassy is still finding the next turn.";
  const albumLine = track.album ? ` off ${track.album}` : "";
  const yearLine = track.year ? ` (${track.year})` : "";
  return `${track.title} by ${track.artist ?? "Unknown Artist"}${albumLine}${yearLine}`;
};

const recommendationTone = (status?: RadioChatRecommendationStatus) => {
  if (status === "accepted") return "text-glow";
  if (status === "considering") return "text-cloud/80";
  if (status === "rejected") return "text-comet";
  return "text-cloud/55";
};

const recommendationLabel = (status?: RadioChatRecommendationStatus) => {
  if (status === "accepted") return "On the line";
  if (status === "considering") return "Under consideration";
  if (status === "rejected") return "Passed";
  return null;
};

export function HomeLiveLine() {
  const chatFeedRef = useRef<HTMLDivElement | null>(null);
  const sendLockRef = useRef(false);
  const lastSubmittedRef = useRef<{
    createdAt: number;
    text: string;
  } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatClientId, setChatClientId] = useState<string | null>(null);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const [pendingReply, setPendingReply] = useState<{
    messageId: string;
    sentAt: number;
  } | null>(null);

  const { displayNow, queueItems } = usePersistentRadioPlayer();
  const { data: chatData, mutate: mutateChat } = useSWR<StationChatPayload>(
    chatClientId ? buildRadioChatUrl(chatClientId) : null,
    fetcher,
    {
      refreshInterval: 4000,
      dedupingInterval: 1500,
      revalidateOnFocus: false,
    },
  );
  const { data: home } = useRadioHome();
  const status = home?.status;

  const chatMessages = normalizeRadioChatMessages(
    Array.isArray(chatData?.messages) ? chatData.messages : [],
  );
  const requestLinePreview = Array.isArray(status?.requestLine)
    ? status.requestLine.filter(Boolean).slice(0, 4)
    : [];
  const requestLineItems = Array.isArray(status?.requestLineItems)
    ? status.requestLineItems.slice(0, 4)
    : [];

  const knownTracks = useMemo(() => {
    const trackMap = new Map<string, RadioTrack>();
    [displayNow, ...queueItems].forEach((track) => {
      if (track?.id) trackMap.set(track.id, track);
    });
    return trackMap;
  }, [displayNow, queueItems]);

  const quickPrompts = useMemo(() => {
    const prompts = [
      displayNow?.title ? `Why ${displayNow.title} right now?` : null,
      displayNow?.artist
        ? `Take me deeper into ${displayNow.artist}.`
        : null,
      queueItems[0]?.title ? `Why is ${queueItems[0].title} next?` : null,
      "I have a recommendation for the request line.",
      "What does this hour feel like to you?",
      "Give me a deep cut note on the record in the air.",
      "I'm wrung out. Give me a lane to stay with.",
    ].filter(Boolean) as string[];

    return Array.from(new Set(prompts)).slice(0, 5);
  }, [displayNow, queueItems]);

  useEffect(() => {
    setChatClientId(ensureRadioChatClientId());
  }, []);

  useEffect(() => {
    if (!chatFeedRef.current) return;
    chatFeedRef.current.scrollTo({
      top: chatFeedRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages.length, pendingReply?.messageId]);

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
        setChatStatus("Mr Rassy is cueing a thought...");
        return;
      }

      const replyStatus = payload?.reply?.recommendationStatus as
        | RadioChatRecommendationStatus
        | undefined;
      setPendingReply(null);
      if (replyStatus === "accepted") {
        setChatStatus("Recommendation accepted.");
      } else if (replyStatus === "considering") {
        setChatStatus("Recommendation heard.");
      } else if (replyStatus === "rejected") {
        setChatStatus("Recommendation passed.");
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

  return (
    <section
      id="booth-chat"
      className="mx-auto max-w-6xl scroll-mt-28 px-6 py-10"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_340px]">
        <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,79,216,0.14),transparent_34%),radial-gradient(circle_at_85%_14%,rgba(66,245,255,0.12),transparent_34%),linear-gradient(150deg,rgba(10,13,28,0.96),rgba(33,7,42,0.9))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.35)] md:p-6">
          <div className="absolute inset-0 noise opacity-35" aria-hidden="true" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                  Live Line
                </div>
                <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
                  Talk to Mr Rassy.
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="border-white/15 bg-black/30 text-white">
                  <MessageCircleMore size={12} />
                  Replying live
                </Badge>
                <Badge className="border-white/15 bg-black/30 text-white">
                  {formatRadioMood(status?.mood)}
                </Badge>
              </div>
            </div>

            <div
              ref={chatFeedRef}
              className="mt-5 flex h-[380px] flex-col gap-3 overflow-y-auto rounded-[28px] border border-white/10 bg-black/25 p-4"
              aria-live="polite"
            >
              {chatMessages.slice(-10).map((message) => {
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
                      className={`max-w-[92%] rounded-[22px] border px-4 py-4 ${
                        message.role === "listener"
                          ? "border-white/10 bg-white/10 text-cloud/92"
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
                  <div className="max-w-[92%] rounded-[22px] border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,0.05),rgba(66,245,255,0.08))] px-4 py-4 text-white">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                      <span>Mr Rassy</span>
                      <span>thinking</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-cloud/82">
                      He&apos;s turning that over and will come back on the line in a second.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void sendChat();
                  }
                }}
                placeholder="Ask what he’s hearing, ask for a lane, request a whole pocket of music, recommend a cut, or just talk about life..."
                className="rave-input min-h-[108px] rounded-[26px] px-5 py-4 text-sm leading-7"
              />
              <Button
                className="min-h-[108px] px-8 text-base"
                onClick={() => void sendChat()}
                disabled={chatSending}
              >
                <Send size={18} />
                {chatSending ? "Sending..." : "Send"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
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

            {chatStatus && (
              <div className="mt-3 text-xs text-cloud/70">{chatStatus}</div>
            )}
          </div>
        </div>

        <div className="grid gap-4">
        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(150deg,rgba(11,16,30,0.94),rgba(30,8,48,0.84))] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.28)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                Request Line
              </div>
              <div className="mt-2 text-xs leading-5 text-cloud/56">
                Ask for one cut, a whole mood, an era, or the kind of turn you
                want him to answer with music.
              </div>
            </div>
            <div className="text-xs text-cloud/55">
              {status?.requestLineDepth
                ? `${status.requestLineDepth} live`
                  : "Open line"}
              </div>
            </div>

            {requestLineItems.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {requestLineItems.slice(0, 3).map((item) => {
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
                      {selectedTracks.length > 0 ? (
                        <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-cloud/46">
                          One way he could answer it
                        </div>
                      ) : null}
                      {item.response ? (
                        <div className="mt-3 text-xs leading-6 text-cloud/76">
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
          </div>

          <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.12),transparent_28%),linear-gradient(155deg,rgba(7,16,34,0.95),rgba(20,9,37,0.88))] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.28)]">
            <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
              Room Prompt
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {displayNow?.title ?? "The booth is live."}
            </div>
            <div className="mt-2 text-sm text-cloud/74">
              {displayNow?.artist ?? "Mr Rassy"}
            </div>
            <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-cloud/80">
              {displayNow?.title ? (
                <>
                  <Sparkles size={14} className="mb-3 text-glow" />
                  {formatTrackStamp(displayNow)}
                </>
              ) : (
                <>
                  <Radio size={14} className="mb-3 text-glow" />
                  Start the stream and talk back to the booth.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HomeLiveLine;
