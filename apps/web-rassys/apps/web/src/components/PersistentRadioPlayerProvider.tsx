"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";

export type RadioTrack = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genres?: string[];
  energy?: number;
  albumArtUrl?: string;
  streamUrl?: string;
  lastPlayedAt?: string;
};

type LiveSourceMode = "direct" | "relay";

type RadioQualityHealth = {
  ok?: boolean;
  status?: number;
  checkedWith?: "head" | "range" | "error";
  error?: string;
};

type RadioHealth = {
  ok?: boolean;
  live?: {
    ok?: boolean;
    controllerReady?: boolean;
    controllerStatusOk?: boolean;
    streamActive?: boolean | null;
    queueDepth?: number | null;
    libraryTracks?: number | null;
    error?: string;
  };
  qualities?: {
    mp3?: RadioQualityHealth;
    lossless?: RadioQualityHealth;
  };
};

type RadioPlayStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "error";

type RadioStreamQuality = "lossless" | "mp3";

export type RadioVisualizerFrame = {
  bars: number[];
  energy: number;
  active: boolean;
};

type FeaturedPayload = {
  items?: RadioTrack[];
};

type PersistentRadioPlayerValue = {
  playing: boolean;
  buffering: boolean;
  streamError: string | null;
  playStatus: RadioPlayStatus;
  liveSourceMode: LiveSourceMode;
  useFallback: boolean;
  fallbackLocked: boolean;
  hasInteracted: boolean;
  nowPlaying: RadioTrack | null;
  queueItems: RadioTrack[];
  featuredItems: RadioTrack[];
  fallbackList: RadioTrack[];
  fallbackTrack: RadioTrack | null;
  canFallback: boolean;
  displayNow: RadioTrack | null;
  liveHealth: RadioHealth | null;
  externalStreamUrl: string;
  relayStreamUrl: string;
  activeStreamUrl: string;
  activeLiveQuality: RadioStreamQuality;
  losslessSupported: boolean;
  directMp3Url: string;
  directLosslessUrl: string;
  relayMp3Url: string;
  relayLosslessUrl: string;
  toggle: () => Promise<void>;
  toggleFallback: () => void;
  toggleLiveSourceMode: () => void;
  nextFallbackTrack: () => void;
  subscribeVisualizer: (
    listener: (frame: RadioVisualizerFrame) => void,
  ) => () => void;
};

const PersistentRadioPlayerContext =
  createContext<PersistentRadioPlayerValue | null>(null);

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  return (payload ?? null) as T;
};

const EMPTY_VISUALIZER_FRAME: RadioVisualizerFrame = {
  bars: Array.from({ length: 20 }, () => 0.1),
  energy: 0,
  active: false,
};

const hasPlayableType = (value: string) =>
  value === "probably" || value === "maybe";

const detectLosslessSupport = () => {
  if (typeof window === "undefined") return false;
  const probe = document.createElement("audio");
  return [
    'audio/ogg; codecs="flac"',
    "audio/ogg; codecs=flac",
    "audio/flac",
    "audio/x-flac",
  ].some((type) => hasPlayableType(probe.canPlayType(type)));
};

export function PersistentRadioPlayerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAttemptedStreamUrlRef = useRef<string | null>(null);
  const playWatchdogRef = useRef<number | null>(null);
  const bufferRecoveryWatchdogRef = useRef<number | null>(null);
  const liveRetryAttemptsRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const visualizerAnimationFrameRef = useRef<number | null>(null);
  const visualizerBinsRef = useRef<number[]>([...EMPTY_VISUALIZER_FRAME.bars]);
  const visualizerListenersRef = useRef(
    new Set<(frame: RadioVisualizerFrame) => void>(),
  );

  const [playing, setPlaying] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [playStatus, setPlayStatus] = useState<RadioPlayStatus>("idle");
  const [buffering, setBuffering] = useState(false);
  const [liveSourceMode, setLiveSourceMode] =
    useState<LiveSourceMode>("relay");
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackLocked, setFallbackLocked] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [playRequestNonce, setPlayRequestNonce] = useState(0);
  const [losslessSupported, setLosslessSupported] = useState(false);
  const [preferLosslessPlayback, setPreferLosslessPlayback] = useState(false);

  const relayMp3Url = "/api/radio/stream?quality=mp3";
  const relayLosslessUrl = "/api/radio/stream?quality=lossless";
  const directMp3Url =
    process.env.NEXT_PUBLIC_STREAM_URL || relayMp3Url;
  const directLosslessUrl =
    process.env.NEXT_PUBLIC_STREAM_LOSSLESS_URL || relayLosslessUrl;
  const activeLiveQuality: RadioStreamQuality = preferLosslessPlayback
    ? "lossless"
    : "mp3";
  const relayStreamUrl =
    activeLiveQuality === "lossless" ? relayLosslessUrl : relayMp3Url;
  const externalStreamUrl =
    activeLiveQuality === "lossless" ? directLosslessUrl : directMp3Url;

  const { data: nowPlaying } = useSWR<RadioTrack>(
    "/api/radio/now",
    fetcher,
    {
      refreshInterval: 8000,
    },
  );
  const { data: queue } = useSWR<RadioTrack[]>("/api/radio/queue", fetcher, {
    refreshInterval: 12000,
  });
  const { data: featured } = useSWR<FeaturedPayload>(
    "/api/radio/featured",
    fetcher,
    {
      refreshInterval: 60000,
    },
  );
  const { data: liveHealth } = useSWR<RadioHealth>("/api/radio/health", fetcher, {
    refreshInterval: 20000,
  });

  const queueItems = Array.isArray(queue) ? queue : [];
  const featuredItems = Array.isArray(featured?.items) ? featured.items : [];
  const queuePlayable = queueItems.filter((track) => Boolean(track?.streamUrl));
  const featuredPlayable = featuredItems.filter((track) =>
    Boolean(track?.streamUrl),
  );
  const fallbackList = queuePlayable.length ? queuePlayable : featuredPlayable;
  const fallbackTrack =
    fallbackList.length > 0
      ? fallbackList[fallbackIndex % fallbackList.length]
      : null;
  const canFallback = fallbackList.length > 0;
  const activeLiveStreamUrl =
    liveSourceMode === "relay" ? relayStreamUrl : externalStreamUrl;
  const activeStreamUrl =
    useFallback && fallbackTrack?.streamUrl
      ? fallbackTrack.streamUrl
      : activeLiveStreamUrl;
  const displayNow = useFallback && fallbackTrack ? fallbackTrack : nowPlaying;
  const mp3LineHealthy = liveHealth?.qualities?.mp3?.ok;
  const losslessLineHealthy = liveHealth?.qualities?.lossless?.ok;
  const liveStreamActive = liveHealth?.live?.streamActive;
  const anyLiveLineHealthy =
    mp3LineHealthy !== false || losslessLineHealthy !== false;

  const clearPlayWatchdog = useCallback(() => {
    if (typeof window === "undefined") return;
    if (playWatchdogRef.current === null) return;
    window.clearTimeout(playWatchdogRef.current);
    playWatchdogRef.current = null;
  }, []);

  const clearBufferRecoveryWatchdog = useCallback(() => {
    if (typeof window === "undefined") return;
    if (bufferRecoveryWatchdogRef.current === null) return;
    window.clearTimeout(bufferRecoveryWatchdogRef.current);
    bufferRecoveryWatchdogRef.current = null;
  }, []);

  const resetLiveRetries = useCallback(() => {
    liveRetryAttemptsRef.current = 0;
  }, []);

  const emitVisualizerFrame = useCallback((frame: RadioVisualizerFrame) => {
    visualizerListenersRef.current.forEach((listener) => listener(frame));
  }, []);

  const stopVisualizerLoop = useCallback(() => {
    if (typeof window === "undefined") return;
    if (visualizerAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(visualizerAnimationFrameRef.current);
      visualizerAnimationFrameRef.current = null;
    }
    visualizerBinsRef.current = [...EMPTY_VISUALIZER_FRAME.bars];
    emitVisualizerFrame(EMPTY_VISUALIZER_FRAME);
  }, [emitVisualizerFrame]);

  const startVisualizerLoop = useCallback(() => {
    if (typeof window === "undefined") return;
    if (visualizerAnimationFrameRef.current !== null) return;
    const analyser = analyserRef.current;
    if (!analyser) return;

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    let lastTick = 0;

    const tick = (nowMs: number) => {
      visualizerAnimationFrameRef.current = window.requestAnimationFrame(tick);
      if (nowMs - lastTick < 42) return;
      lastTick = nowMs;

      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) {
        const faded = visualizerBinsRef.current.map((value) =>
          Math.max(0.08, value * 0.82),
        );
        visualizerBinsRef.current = faded;
        emitVisualizerFrame({
          bars: faded,
          energy:
            faded.reduce((total, value) => total + value, 0) / faded.length,
          active: false,
        });
        return;
      }

      analyser.getByteFrequencyData(frequencyData);
      const sliceSize = Math.max(1, Math.floor(frequencyData.length / 20));
      const nextBars = Array.from({ length: 20 }, (_, index) => {
        const start = index * sliceSize;
        const end = Math.min(frequencyData.length, start + sliceSize);
        const slice = frequencyData.slice(start, end);
        const average =
          slice.length > 0
            ? slice.reduce((total, value) => total + value, 0) / slice.length
            : 0;
        const normalized = Math.min(1, average / 160);
        const previous = visualizerBinsRef.current[index] ?? 0.1;
        return Math.max(0.08, previous * 0.64 + normalized * 0.36);
      });
      visualizerBinsRef.current = nextBars;
      emitVisualizerFrame({
        bars: nextBars,
        energy:
          nextBars.reduce((total, value) => total + value, 0) / nextBars.length,
        active: true,
      });
    };

    visualizerAnimationFrameRef.current = window.requestAnimationFrame(tick);
  }, [emitVisualizerFrame]);

  const ensureVisualizerReady = useCallback(async () => {
    if (typeof window === "undefined") return;
    const audio = audioRef.current;
    if (!audio) return;

    try {
      const Context =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      if (!Context) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new Context();
      }

      const context = audioContextRef.current;
      if (!context) return;
      if (context.state === "suspended") {
        await context.resume();
      }

      if (!analyserRef.current) {
        const analyser = context.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.86;
        analyser.minDecibels = -92;
        analyser.maxDecibels = -16;
        analyserRef.current = analyser;
      }

      if (!mediaElementSourceRef.current) {
        const source = context.createMediaElementSource(audio);
        source.connect(analyserRef.current);
        analyserRef.current.connect(context.destination);
        mediaElementSourceRef.current = source;
      }

      startVisualizerLoop();
    } catch {
      // Visualizer is decorative; keep playback moving even if setup fails.
    }
  }, [startVisualizerLoop]);

  const subscribeVisualizer = useCallback(
    (listener: (frame: RadioVisualizerFrame) => void) => {
      visualizerListenersRef.current.add(listener);
      listener({
        bars: [...visualizerBinsRef.current],
        energy:
          visualizerBinsRef.current.reduce((total, value) => total + value, 0) /
          visualizerBinsRef.current.length,
        active: playing,
      });
      return () => {
        visualizerListenersRef.current.delete(listener);
      };
    },
    [playing],
  );

  const queueLiveRetry = useCallback(
    (message: string) => {
      if (useFallback) return false;

      const maxAttempts =
        !anyLiveLineHealthy && liveStreamActive === false
          ? 0
          : liveHealth?.ok === false
            ? 1
            : 2;
      if (liveRetryAttemptsRef.current >= maxAttempts) {
        return false;
      }

      liveRetryAttemptsRef.current += 1;
      lastAttemptedStreamUrlRef.current = null;
      setUseFallback(false);
      setStreamError(message);
      setPlaying(true);
      setBuffering(true);
      setPlayStatus("loading");
      setPlayRequestNonce((current) => current + 1);
      return true;
    },
    [anyLiveLineHealthy, liveHealth?.ok, liveStreamActive, useFallback],
  );

  const attemptPlay = useCallback(
    async (
      context?: "user" | "auto",
      options?: { allowFallback?: boolean },
    ) => {
      if (!audioRef.current) return;
      if (
        context === "auto" &&
        lastAttemptedStreamUrlRef.current === activeStreamUrl
      ) {
        return;
      }

      lastAttemptedStreamUrlRef.current = activeStreamUrl;
      clearPlayWatchdog();
      clearBufferRecoveryWatchdog();
      setHasInteracted(true);
      setStreamError(null);
      setBuffering(true);
      setPlayStatus("loading");

      if (!useFallback && liveStreamActive === false && !anyLiveLineHealthy) {
        if (canFallback) {
          lastAttemptedStreamUrlRef.current = null;
          setStreamError(
            "The live line is quiet right now. Pulling something from the stacks.",
          );
          setFallbackLocked(false);
          setUseFallback(true);
          setPlaying(true);
          setBuffering(true);
          setPlayStatus("buffering");
          return;
        }

        setStreamError("The live line is quiet right now. Try again in a moment.");
        setPlaying(false);
        setBuffering(false);
        setPlayStatus("error");
        return;
      }

      if (
        !useFallback &&
        activeLiveQuality === "lossless" &&
        losslessLineHealthy === false
      ) {
        lastAttemptedStreamUrlRef.current = null;
        setPreferLosslessPlayback(false);
        setStreamError("The full-quality line is offline. Catching the steady line.");
        setPlaying(true);
        setBuffering(true);
        setPlayStatus("loading");
        return;
      }

      if (
        !useFallback &&
        activeLiveQuality === "mp3" &&
        mp3LineHealthy === false
      ) {
        if (canFallback) {
          lastAttemptedStreamUrlRef.current = null;
          setStreamError("The station line is offline. Pulling from the stacks.");
          setFallbackLocked(false);
          setUseFallback(true);
          setPlaying(true);
          setBuffering(true);
          setPlayStatus("buffering");
          return;
        }

        setStreamError("The station line is offline right now. Try again in a moment.");
        setPlaying(false);
        setBuffering(false);
        setPlayStatus("error");
        return;
      }

      try {
        await ensureVisualizerReady();
        audioRef.current.muted = false;
        if (audioRef.current.volume <= 0) {
          audioRef.current.volume = 1;
        }
        audioRef.current.load();
        if (typeof window !== "undefined") {
          playWatchdogRef.current = window.setTimeout(() => {
            if (useFallback) {
              setStreamError(
                "That cut is taking its time. Catching the next one.",
              );
              if (fallbackList.length > 1) {
                setFallbackIndex(
                  (current) => (current + 1) % fallbackList.length,
                );
                setPlaying(true);
                setBuffering(true);
                setPlayStatus("buffering");
                return;
              }
              setPlaying(false);
              setBuffering(false);
              setPlayStatus("error");
              return;
            }

            if (activeLiveQuality === "lossless") {
              lastAttemptedStreamUrlRef.current = null;
              setPreferLosslessPlayback(false);
              setStreamError(
                "The full-quality line is taking too long. Catching the steady line.",
              );
              setPlaying(true);
              setBuffering(true);
              setPlayStatus("loading");
              return;
            }

            if (liveSourceMode === "direct") {
              resetLiveRetries();
              lastAttemptedStreamUrlRef.current = null;
              setStreamError(
                "The direct station line is taking too long. Catching the stable line.",
              );
              setLiveSourceMode("relay");
              setPlaying(true);
              setBuffering(true);
              setPlayStatus("buffering");
              return;
            }

            if (
              queueLiveRetry(
                "The station line is taking a beat. Reconnecting the live line.",
              )
            ) {
              return;
            }

            if (canFallback) {
              setStreamError(
                "The station line is taking a beat. Pulling from the stacks.",
              );
              setFallbackLocked(false);
              setUseFallback(true);
              setPlaying(true);
              setBuffering(true);
              setPlayStatus("buffering");
              return;
            }

            setStreamError(
              "The station line is still quiet. Try again in a moment.",
            );
            setPlaying(false);
            setBuffering(false);
            setPlayStatus("error");
          }, 7000);
        }
        await audioRef.current.play();
        setPlaying(true);
        clearPlayWatchdog();
        setBuffering(false);
        setPlayStatus("playing");
      } catch {
        clearPlayWatchdog();
        if (!useFallback && activeLiveQuality === "lossless") {
          lastAttemptedStreamUrlRef.current = null;
          setPreferLosslessPlayback(false);
          setStreamError(
            "The full-quality line slipped. Catching the steady line.",
          );
          setPlaying(true);
          setBuffering(true);
          setPlayStatus("loading");
          return;
        }
        if (!useFallback && liveSourceMode === "direct") {
          resetLiveRetries();
          lastAttemptedStreamUrlRef.current = null;
          setStreamError(
            "The direct station line slipped. Catching the stable line.",
          );
          setLiveSourceMode("relay");
          setPlaying(true);
          setBuffering(true);
          setPlayStatus("buffering");
          return;
        }
        if (
          queueLiveRetry("The live line slipped. Reconnecting the station.")
        ) {
          return;
        }
        const allowFallback = options?.allowFallback ?? !useFallback;
        const shouldFallback = allowFallback && canFallback;
        setPlayStatus(shouldFallback ? "buffering" : "error");
        setStreamError(
          context === "auto"
            ? "The room went quiet for a beat. Catching another line."
            : "That start missed. Tap play again.",
        );
        if (shouldFallback) {
          setFallbackLocked(false);
          setUseFallback(true);
          setPlaying(true);
          return;
        }
        setPlaying(false);
        setBuffering(false);
      }
    },
    [
      activeStreamUrl,
      activeLiveQuality,
      canFallback,
      clearBufferRecoveryWatchdog,
      clearPlayWatchdog,
      ensureVisualizerReady,
      fallbackList.length,
      anyLiveLineHealthy,
      losslessLineHealthy,
      liveSourceMode,
      liveStreamActive,
      mp3LineHealthy,
      queueLiveRetry,
      resetLiveRetries,
      useFallback,
    ],
  );

  const toggle = useCallback(async () => {
    if (!audioRef.current) return;
    setHasInteracted(true);
    if (playing) {
      clearPlayWatchdog();
      resetLiveRetries();
      audioRef.current.pause();
      return;
    }
    resetLiveRetries();
    lastAttemptedStreamUrlRef.current = null;
    await attemptPlay("user", { allowFallback: true });
  }, [attemptPlay, clearPlayWatchdog, playing, resetLiveRetries]);

  const toggleFallback = useCallback(() => {
    setHasInteracted(true);
    if (useFallback) {
      resetLiveRetries();
      setFallbackLocked(false);
      setUseFallback(false);
      setLiveSourceMode("relay");
      setPreferLosslessPlayback(
        losslessSupported && losslessLineHealthy !== false,
      );
      setStreamError(null);
      setPlayStatus(playing ? "loading" : "idle");
      return;
    }

    resetLiveRetries();
    setFallbackLocked(true);
    setUseFallback(true);
    setStreamError(null);
  }, [
    losslessLineHealthy,
    losslessSupported,
    playing,
    resetLiveRetries,
    useFallback,
  ]);

  const toggleLiveSourceMode = useCallback(() => {
    setHasInteracted(true);
    clearPlayWatchdog();
    resetLiveRetries();
    lastAttemptedStreamUrlRef.current = null;
    setUseFallback(false);
    setStreamError(null);
    setLiveSourceMode((current) => (current === "direct" ? "relay" : "direct"));
    setPlayStatus(playing ? "loading" : "idle");
  }, [clearPlayWatchdog, playing, resetLiveRetries]);

  const nextFallbackTrack = useCallback(() => {
    setHasInteracted(true);
    if (fallbackList.length <= 1) return;
    setFallbackIndex((current) => (current + 1) % fallbackList.length);
  }, [fallbackList.length]);

  const recoverFromBuffering = useCallback(() => {
    clearPlayWatchdog();
    clearBufferRecoveryWatchdog();

    if (useFallback) {
      if (fallbackList.length > 1) {
        setStreamError("That cut stalled. Catching the next one.");
        setFallbackIndex((current) => (current + 1) % fallbackList.length);
        setPlaying(true);
        setBuffering(true);
        setPlayStatus("buffering");
        return;
      }

      lastAttemptedStreamUrlRef.current = null;
      setStreamError("That cut stalled. Reloading it now.");
      setPlaying(true);
      setBuffering(true);
      setPlayStatus("loading");
      void attemptPlay("auto", { allowFallback: false });
      return;
    }

    if (activeLiveQuality === "lossless") {
      lastAttemptedStreamUrlRef.current = null;
      setPreferLosslessPlayback(false);
      setStreamError("The full-quality line stalled. Catching the steady line.");
      setPlaying(true);
      setBuffering(true);
      setPlayStatus("loading");
      return;
    }

    if (liveSourceMode === "direct") {
      resetLiveRetries();
      lastAttemptedStreamUrlRef.current = null;
      setStreamError(
        "The direct station line stalled. Catching the stable line.",
      );
      setLiveSourceMode("relay");
      setPlaying(true);
      setBuffering(true);
      setPlayStatus("buffering");
      return;
    }

    if (
      queueLiveRetry("The station line stalled. Reconnecting the live line.")
    ) {
      return;
    }

    if (canFallback) {
      setStreamError(
        "The station line stalled. Pulling from the stacks for a minute.",
      );
      setFallbackLocked(false);
      setUseFallback(true);
      setPlaying(true);
      setBuffering(true);
      setPlayStatus("buffering");
      return;
    }

    lastAttemptedStreamUrlRef.current = null;
    setStreamError("The station line stalled. Reconnecting now.");
    setPlaying(true);
    setBuffering(true);
    setPlayStatus("loading");
    void attemptPlay("auto", { allowFallback: false });
  }, [
    activeLiveQuality,
    attemptPlay,
    canFallback,
    clearBufferRecoveryWatchdog,
    clearPlayWatchdog,
    fallbackList.length,
    liveSourceMode,
    queueLiveRetry,
    resetLiveRetries,
    useFallback,
  ]);

  useEffect(() => {
    const supported = detectLosslessSupport();
    setLosslessSupported(supported);
    setPreferLosslessPlayback(supported);
  }, []);

  useEffect(() => {
    if (!losslessSupported) {
      if (preferLosslessPlayback) {
        setPreferLosslessPlayback(false);
      }
      return;
    }

    if (losslessLineHealthy === false && preferLosslessPlayback) {
      setPreferLosslessPlayback(false);
      return;
    }

    if (
      losslessLineHealthy === true &&
      !preferLosslessPlayback &&
      !playing &&
      !useFallback &&
      liveSourceMode === "relay"
    ) {
      setPreferLosslessPlayback(true);
    }
  }, [
    liveSourceMode,
    losslessLineHealthy,
    losslessSupported,
    playing,
    preferLosslessPlayback,
    useFallback,
  ]);

  useEffect(() => {
    if (!canFallback) {
      setFallbackIndex(0);
      setFallbackLocked(false);
      if (useFallback) setUseFallback(false);
      return;
    }
    setFallbackIndex((current) => Math.min(current, fallbackList.length - 1));
  }, [canFallback, fallbackList.length, useFallback]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (!playing) return;
    if (lastAttemptedStreamUrlRef.current === activeStreamUrl) return;
    void attemptPlay("auto", { allowFallback: true });
  }, [activeStreamUrl, attemptPlay, playRequestNonce, playing]);

  useEffect(() => {
    if (!playing || !buffering || playStatus !== "buffering") {
      clearBufferRecoveryWatchdog();
      return;
    }

    if (typeof window === "undefined") return;

    bufferRecoveryWatchdogRef.current = window.setTimeout(() => {
      recoverFromBuffering();
    }, 6000);

    return () => {
      clearBufferRecoveryWatchdog();
    };
  }, [
    buffering,
    clearBufferRecoveryWatchdog,
    playStatus,
    playing,
    recoverFromBuffering,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("mediaSession" in navigator)) return;

    const session = navigator.mediaSession;
    const title = displayNow?.title ?? "Mr Rassy Live Radio";
    const artist = displayNow?.artist ?? "Mr Rassy";
    const album = displayNow?.album ?? "";
    const artwork = displayNow?.albumArtUrl
      ? [{ src: displayNow.albumArtUrl, sizes: "512x512", type: "image/jpeg" }]
      : [];

    if (typeof window.MediaMetadata !== "undefined") {
      session.metadata = new window.MediaMetadata({
        title,
        artist,
        album,
        artwork,
      });
    }
  }, [
    displayNow?.album,
    displayNow?.albumArtUrl,
    displayNow?.artist,
    displayNow?.title,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // ignore unsupported media actions
      }
    };

    setHandler("play", () => {
      void attemptPlay("user", { allowFallback: true });
    });
    setHandler("pause", () => {
      audioRef.current?.pause();
    });
    setHandler("stop", () => {
      audioRef.current?.pause();
    });
    setHandler(
      "nexttrack",
      useFallback && fallbackList.length > 1
        ? () => {
            setFallbackIndex((current) => (current + 1) % fallbackList.length);
          }
        : null,
    );
    setHandler("previoustrack", null);

    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("stop", null);
      setHandler("nexttrack", null);
      setHandler("previoustrack", null);
    };
  }, [attemptPlay, fallbackList.length, useFallback]);

  useEffect(() => {
    return () => {
      clearPlayWatchdog();
      clearBufferRecoveryWatchdog();
      stopVisualizerLoop();
    };
  }, [clearBufferRecoveryWatchdog, clearPlayWatchdog, stopVisualizerLoop]);

  const value: PersistentRadioPlayerValue = {
    playing,
    buffering,
    streamError,
    playStatus,
    liveSourceMode,
    useFallback,
    fallbackLocked,
    hasInteracted,
    nowPlaying: nowPlaying ?? null,
    queueItems,
    featuredItems,
    fallbackList,
    fallbackTrack,
    canFallback,
    displayNow: displayNow ?? null,
    liveHealth: liveHealth ?? null,
    externalStreamUrl,
    relayStreamUrl,
    activeStreamUrl,
    activeLiveQuality,
    losslessSupported,
    directMp3Url,
    directLosslessUrl,
    relayMp3Url,
    relayLosslessUrl,
    toggle,
    toggleFallback,
    toggleLiveSourceMode,
    nextFallbackTrack,
    subscribeVisualizer,
  };

  return (
    <PersistentRadioPlayerContext.Provider value={value}>
      {children}
      <audio
        key={activeStreamUrl}
        ref={audioRef}
        src={activeStreamUrl}
        preload="none"
        crossOrigin="anonymous"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onEnded={() => {
          clearPlayWatchdog();
          clearBufferRecoveryWatchdog();
          if (!useFallback || fallbackList.length === 0) return;
          setFallbackIndex((current) => (current + 1) % fallbackList.length);
        }}
        onPlay={() => {
          void ensureVisualizerReady();
          if (audioRef.current) {
            audioRef.current.muted = false;
            if (audioRef.current.volume <= 0) {
              audioRef.current.volume = 1;
            }
          }
          setPlayStatus("playing");
        }}
        onPlaying={() => {
          clearPlayWatchdog();
          clearBufferRecoveryWatchdog();
          resetLiveRetries();
          setPlaying(true);
          setBuffering(false);
          setStreamError(null);
          setPlayStatus("playing");
        }}
        onPause={() => {
          clearPlayWatchdog();
          clearBufferRecoveryWatchdog();
          stopVisualizerLoop();
          resetLiveRetries();
          setPlaying(false);
          setPlayStatus("paused");
          setBuffering(false);
        }}
        onWaiting={() => {
          setBuffering(true);
          setPlayStatus("buffering");
        }}
        onStalled={() => {
          setBuffering(true);
          setPlayStatus("buffering");
        }}
        onCanPlay={() => {
          clearBufferRecoveryWatchdog();
          setBuffering(false);
        }}
        onCanPlayThrough={() => {
          clearBufferRecoveryWatchdog();
          setBuffering(false);
        }}
        onError={() => {
          clearPlayWatchdog();
          clearBufferRecoveryWatchdog();
          if (useFallback) {
            setStreamError("That cut slipped away. Catching the next one.");
            if (fallbackList.length > 0) {
              setFallbackIndex((current) => (current + 1) % fallbackList.length);
            }
            setPlaying(true);
            setBuffering(true);
            setPlayStatus("buffering");
            return;
          }
          if (activeLiveQuality === "lossless") {
            lastAttemptedStreamUrlRef.current = null;
            setPreferLosslessPlayback(false);
            setStreamError(
              "The full-quality line slipped. Catching the steady line.",
            );
            setPlaying(true);
            setBuffering(true);
            setPlayStatus("loading");
            return;
          }
          if (liveSourceMode === "direct") {
            resetLiveRetries();
            lastAttemptedStreamUrlRef.current = null;
            setStreamError(
              "The direct station line slipped. Catching the stable line.",
            );
            setLiveSourceMode("relay");
            setPlaying(true);
            setBuffering(true);
            setPlayStatus("buffering");
            return;
          }
          if (
            queueLiveRetry("The live line slipped. Reconnecting the station.")
          ) {
            return;
          }
          setStreamError(
            "The room went quiet for a beat. Pulling something from the stacks.",
          );
          if (canFallback) {
            setFallbackLocked(false);
            setUseFallback(true);
            setPlaying(true);
            setBuffering(true);
            setPlayStatus("buffering");
            return;
          }
          setPlaying(false);
          setPlayStatus("error");
        }}
      />
    </PersistentRadioPlayerContext.Provider>
  );
}

export const usePersistentRadioPlayer = () => {
  const context = useContext(PersistentRadioPlayerContext);
  if (!context) {
    throw new Error(
      "usePersistentRadioPlayer must be used inside PersistentRadioPlayerProvider",
    );
  }
  return context;
};
