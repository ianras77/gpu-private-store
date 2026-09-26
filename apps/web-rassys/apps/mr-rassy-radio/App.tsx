import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MeshGradientView } from "expo-mesh-gradient";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { StatusBar } from "expo-status-bar";
import { Equalizer } from "./src/components/Equalizer";
import { GlassCard } from "./src/components/GlassCard";
import {
  fetchCatSignal,
  fetchListeningRoom,
  fetchPodcastShow,
  fetchRadioDashboard,
  fetchRadioChat,
  sendRadioChat,
  type RadioChatMessage,
  type EasterEggPayload,
  type LibraryTrack,
  type ListeningRoomPayload,
  liveStreamUrl,
  notesArchiveUrl,
  type PodcastEpisode,
  type PodcastSeries,
  type PodcastShowPayload,
  type RadioDashboard,
  siteUrl,
} from "./src/lib/radio";
import { colors, gradients } from "./src/theme";

type Screen = "live" | "library" | "stories";

type PlaySource = {
  kind: "live" | "track" | "episode";
  id: string;
  url: string;
  title: string;
  artist: string;
  albumTitle?: string;
  artworkUrl?: string;
  note?: string;
};

const initialDashboard: RadioDashboard = {
  now: null,
  next: [],
  dj: null,
  hears: null,
  notes: [],
  liveStreamUrl,
};

const initialListeningRoom: ListeningRoomPayload = {
  items: [],
  total: 0,
  offset: 0,
  limit: 0,
  q: null,
  stats: {
    totalTracks: 0,
    losslessTracks: 0,
    highResTracks: 0,
    djIdentifiers: 0,
  },
  djIdentifiers: [],
};

const initialPodcasts: PodcastShowPayload = {
  show: {
    title: "Real Life Bedtime Stories",
    subtitle: "Books told softly, one chapter at a time.",
    description:
      "A bedtime podcast built from the local story shelf.",
  },
  series: [],
  totalSeries: 0,
  totalEpisodes: 0,
  updatedAt: new Date(0).toISOString(),
};

const fallbackCurios: EasterEggPayload[] = [
  {
    badge: "Cat Signal",
    title: "The booth has more than one room now.",
    body: "Live radio, the listening room, and the bedtime shelf are all running from the same stack and the same source folders.",
    cta: "Keep roaming",
    source: "fallback",
  },
  {
    badge: "Night Shelf",
    title: "A quieter lane opened up.",
    body: "Stories can sit beside the live station without losing the feeling that everything belongs to one world.",
    cta: "Stay curious",
    source: "fallback",
  },
];

const formatMood = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "After-hours";
  const cleaned = trimmed.replace(/[_-]+/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const formatTrackMeta = (track?: {
  album?: string;
  year?: number;
  genres?: string[];
  qualityLabel?: string;
} | null) =>
  [track?.album, track?.year, track?.genres?.slice(0, 2).join(" / "), track?.qualityLabel]
    .filter(Boolean)
    .join(" · ");

const formatRelativeTime = (value?: string | number | null) => {
  if (!value) return "just now";
  const at = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(at)) return "just now";

  const diffMs = Date.now() - at;
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 1) return "just now";
  if (Math.abs(diffMinutes) < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return "live";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rem = whole % 60;
  return `${minutes}:${rem.toString().padStart(2, "0")}`;
};

const cleanScript = (value?: string | null) =>
  value?.replace(/\n{3,}/g, "\n\n").trim() ?? "";

const pickFallbackCurio = () =>
  fallbackCurios[
    Math.floor(Date.now() / (15 * 60 * 1000)) % fallbackCurios.length
  ];

const ActionButton = ({
  label,
  onPress,
  secondary = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  small?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.buttonShell,
      small && styles.buttonSmall,
      secondary ? styles.buttonSecondary : styles.buttonPrimary,
      pressed && styles.buttonPressed,
    ]}
  >
    {secondary ? null : (
      <LinearGradient
        colors={gradients.button}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    )}
    <Text
      style={[
        styles.buttonLabel,
        secondary && styles.buttonLabelSecondary,
        small && styles.buttonLabelSmall,
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

const TabButton = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.tabButton,
      active && styles.tabButtonActive,
      pressed && styles.buttonPressed,
    ]}
  >
    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
  </Pressable>
);

const LibraryRow = ({
  title,
  subtitle,
  meta,
  badges,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  badges?: string[];
  active?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.listRow,
      active && styles.listRowActive,
      pressed && styles.buttonPressed,
    ]}
  >
    <View style={styles.listRowBody}>
      <Text style={styles.listRowTitle}>{title}</Text>
      <Text style={styles.listRowSubtitle}>{subtitle}</Text>
      {meta ? <Text style={styles.listRowMeta}>{meta}</Text> : null}
      {badges?.length ? (
        <View style={styles.badgeRow}>
          {badges.slice(0, 3).map((badge) => (
            <View key={badge} style={styles.badgeChip}>
              <Text style={styles.badgeChipText}>{badge}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
    <View style={styles.cuePill}>
      <Text style={styles.cuePillText}>{active ? "Loaded" : "Cue"}</Text>
    </View>
  </Pressable>
);

export default function App() {
  const [dashboard, setDashboard] = useState<RadioDashboard>(initialDashboard);
  const [listeningRoom, setListeningRoom] = useState<ListeningRoomPayload>(initialListeningRoom);
  const [podcasts, setPodcasts] = useState<PodcastShowPayload>(initialPodcasts);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<RadioChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [chatPendingSince, setChatPendingSince] = useState<number | null>(null);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("live");
  const [query, setQuery] = useState("");
  const [curio, setCurio] = useState<EasterEggPayload>(pickFallbackCurio);
  const [curioLoading, setCurioLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<PlaySource>({
    kind: "live",
    id: "live",
    url: liveStreamUrl,
    title: "Mr Rassy Radio",
    artist: "Live booth",
    albumTitle: "Live stream",
    note: "Stable relay from the booth.",
  });

  const player = useAudioPlayer(liveStreamUrl, {
    updateInterval: 750,
  });
  const status = useAudioPlayerStatus(player);

  const loadSnapshot = async (mode: "initial" | "refresh" | "poll") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);

    try {
      const shouldRefreshShelves =
        mode !== "poll" || listeningRoom.items.length === 0 || podcasts.series.length === 0;

      const [dashboardResult] = await Promise.allSettled([fetchRadioDashboard()]);
      const shelfResults = shouldRefreshShelves
        ? await Promise.allSettled([fetchListeningRoom(), fetchPodcastShow()])
        : [];

      const libraryResult = shouldRefreshShelves ? shelfResults[0] : null;
      const podcastResult = shouldRefreshShelves ? shelfResults[1] : null;
      const anySucceeded =
        dashboardResult.status === "fulfilled" ||
        (libraryResult?.status === "fulfilled" ? true : false) ||
        (podcastResult?.status === "fulfilled" ? true : false);

      if (dashboardResult.status === "fulfilled") {
        setDashboard(dashboardResult.value);
      }

      if (libraryResult?.status === "fulfilled") {
        setListeningRoom(libraryResult.value);
      }
      if (podcastResult?.status === "fulfilled") {
        setPodcasts(podcastResult.value);
      }
      if (anySucceeded) {
        setError(null);
      } else if (
        mode !== "poll" ||
        (!dashboard.now && listeningRoom.items.length === 0 && podcasts.series.length === 0)
      ) {
        setError("The stack is taking a breath. Pull again in a second.");
      }
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    }
  };

  const loadCurio = async () => {
    setCurioLoading(true);
    try {
      const payload = await fetchCatSignal();
      setCurio(payload);
    } catch {
      setCurio(pickFallbackCurio());
    } finally {
      setCurioLoading(false);
    }
  };

  const loadChat = async () => {
    try {
      const result = await fetchRadioChat();
      setChatMessages(Array.isArray(result.messages) ? result.messages : []);
      if (chatPending && chatPendingSince && result.messages?.some((item) => item.role === "dj" && item.createdAt >= chatPendingSince)) {
        setChatPending(false);
        setChatPendingSince(null);
        setChatStatus("Mr Rassy is back on the mic.");
      }
    } catch {
      setChatStatus("The booth is unavailable. Pull to retry.");
    }
  };

  const sendChat = async () => {
    const message = chatInput.trim();
    if (message.length < 2 || chatPending) return;
    setChatPending(true);
    setChatStatus("Sending to the booth…");
    const requestId = `native-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
    try {
      const result = await sendRadioChat(message, requestId);
      setChatMessages(Array.isArray(result.messages) ? result.messages : []);
      setChatInput("");
      if (!result.pending) {
        setChatPending(false);
        setChatPendingSince(null);
        setChatStatus(result.reply?.replySource === "error" ? "The booth lost that reply. Try again." : "Mr Rassy is back on the mic.");
      } else {
        const latestListener = [...(result.messages ?? [])].reverse().find((item) => item.role === "listener");
        setChatPendingSince(latestListener?.createdAt ?? Date.now());
        setChatStatus("Mr Rassy is shaping a reply…");
      }
    } catch {
      setChatPending(false);
      setChatPendingSince(null);
      setChatStatus("The booth missed that. Try sending again.");
    }
  };

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });

    void loadSnapshot("initial");
    void loadChat();
    void loadCurio();

    const pollId = setInterval(() => {
      void loadSnapshot("poll");
    }, 25000);
    const curioId = setInterval(() => {
      void loadCurio();
    }, 15 * 60 * 1000);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void loadSnapshot("poll");
        void loadCurio();
      }
    });

    return () => {
      clearInterval(pollId);
      clearInterval(curioId);
      subscription.remove();
      player.clearLockScreenControls();
      player.pause();
    };
  }, [player]);

  useEffect(() => {
    if (!chatPending) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 30_000) {
        setChatPending(false);
        setChatPendingSince(null);
        setChatStatus("Still no reply. Try again in a moment.");
      } else {
        void loadChat();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [chatPending, chatPendingSince]);

  useEffect(() => {
    if (activeSource.kind !== "live") return;
    if (!dashboard.now?.title) return;
    setActiveSource((current) => ({
      ...current,
      title: dashboard.now?.title ?? current.title,
      artist: dashboard.now?.artist ?? "Mr Rassy",
      albumTitle: dashboard.now?.album ?? "Live booth",
      artworkUrl: dashboard.now?.albumArtUrl ?? current.artworkUrl,
      note: dashboard.dj?.script ?? current.note,
      url: dashboard.liveStreamUrl || liveStreamUrl,
    }));
  }, [
    activeSource.kind,
    dashboard.dj?.script,
    dashboard.liveStreamUrl,
    dashboard.now?.album,
    dashboard.now?.albumArtUrl,
    dashboard.now?.artist,
    dashboard.now?.title,
  ]);

  useEffect(() => {
    if (!status.playing) {
      player.clearLockScreenControls();
      return;
    }

    player.setActiveForLockScreen(
      true,
      {
        title: activeSource.title,
        artist: activeSource.artist,
        albumTitle: activeSource.albumTitle,
        artworkUrl: activeSource.artworkUrl,
      },
      {
        showSeekBackward: activeSource.kind !== "live",
        showSeekForward: activeSource.kind !== "live",
      },
    );
  }, [
    activeSource.albumTitle,
    activeSource.artist,
    activeSource.artworkUrl,
    activeSource.kind,
    activeSource.title,
    player,
    status.playing,
  ]);

  const playSource = async (source: PlaySource) => {
    try {
      player.replace({ uri: source.url });
      if (source.kind === "episode") {
        player.setPlaybackRate(1);
      } else {
        player.setPlaybackRate(1);
      }
      await player.play();
      setActiveSource(source);
      setError(null);
      return true;
    } catch {
      setError("That source needs another tap before it opens cleanly.");
      return false;
    }
  };

  useEffect(() => {
    if (activeSource.kind !== "live" || !status.isBuffering) return;
    const timer = setTimeout(() => {
      const fallback = listeningRoom.items.find((track) => Boolean(track.streamUrl || track.id));
      if (!fallback) {
        setError("The live line stalled. Try Play live again when the station returns.");
        return;
      }
      void playSource({
        kind: "track",
        id: fallback.id,
        url: fallback.streamUrl || `${siteUrl}/api/library/tracks/${fallback.id}/stream`,
        title: fallback.title,
        artist: fallback.artist,
        albumTitle: fallback.album,
        artworkUrl: fallback.albumArtUrl,
        note: "Library fallback while the live line recovers.",
      }).then((ok) => { if (ok) setError("The live line stalled. Playing a record from the library."); });
    }, 10000);
    return () => clearTimeout(timer);
  }, [activeSource.kind, listeningRoom.items, status.isBuffering]);

  const playLive = async () => {
    await playSource({
      kind: "live",
      id: "live",
      url: dashboard.liveStreamUrl || liveStreamUrl,
      title: dashboard.now?.title ?? "Mr Rassy Radio",
      artist: dashboard.now?.artist ?? "Live booth",
      albumTitle: dashboard.now?.album ?? "Live stream",
      artworkUrl: dashboard.now?.albumArtUrl,
      note: dashboard.dj?.script ?? "Stable relay from the booth.",
    });
  };

  const togglePlayback = async () => {
    try {
      if (status.playing) {
        player.pause();
      } else {
        await player.play();
      }
    } catch {
      setError("Playback slipped. Try that source one more time.");
    }
  };

  const seekBy = (seconds: number) => {
    const nextTime = Math.max(0, (status.currentTime ?? 0) + seconds);
    void player.seekTo(nextTime);
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const currentIndex = speeds.findIndex((value) => value === (status.playbackRate || 1));
    const next = speeds[(currentIndex + 1) % speeds.length] ?? 1;
    player.setPlaybackRate(next);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const library = Array.isArray(listeningRoom.items) ? listeningRoom.items : [];
  const filteredTracks = library.filter((track) => {
    if (!normalizedQuery) return true;
    return [track.title, track.artist, track.album, track.qualityLabel]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const hiResTracks = library.filter(
    (track) =>
      Boolean(track.lossless) &&
      ((track.bitsPerSample ?? 0) > 16 || (track.sampleRate ?? 0) > 48000),
  );
  const filteredSeries = podcasts.series
    .map((series) => ({
      ...series,
      episodes: series.episodes.filter((episode) => {
        if (!normalizedQuery) return true;
        return [series.title, episode.title, episode.description, episode.qualityLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    }))
    .filter((series) => series.episodes.length > 0 || !normalizedQuery);
  const visibleTracks = filteredTracks.slice(0, normalizedQuery ? 60 : 18);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingShell}>
          <ActivityIndicator color={colors.accent2} size="large" />
          <Text style={styles.loadingText}>Building the stack for your phone…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill}>
        <MeshGradientView
          style={StyleSheet.absoluteFill}
          columns={4}
          rows={4}
          points={[
            [0.1, 0.15],
            [0.9, 0.05],
            [0.8, 0.75],
            [0.25, 0.9],
          ]}
          colors={[colors.accent, colors.accent4, colors.accent2, "#12001e"]}
        />
        <View style={styles.baseOverlay} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            tintColor={colors.accent2}
            refreshing={refreshing}
            onRefresh={() => void loadSnapshot("refresh")}
          />
        }
      >
        <GlassCard style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.eyebrow}>MR RASSY // MOBILE</Text>
              <Text style={styles.heroTitle}>One stack. Three ways to listen.</Text>
              <Text style={styles.heroBody}>
                Live radio, the local listening room, and Real Life Bedtime Stories all sit inside the same app now.
              </Text>
            </View>
            <Equalizer active={status.playing} />
          </View>

          <View style={styles.tabRow}>
            <TabButton label="Live" active={screen === "live"} onPress={() => setScreen("live")} />
            <TabButton
              label="Library"
              active={screen === "library"}
              onPress={() => setScreen("library")}
            />
            <TabButton
              label="Stories"
              active={screen === "stories"}
              onPress={() => setScreen("stories")}
            />
          </View>
        </GlassCard>

        <GlassCard style={styles.playerCard}>
          <View style={styles.playerCardContent}>
            <View style={styles.playerCoverShell}>
              {activeSource.artworkUrl ? (
                <Image source={{ uri: activeSource.artworkUrl }} style={styles.playerCover} />
              ) : (
                <LinearGradient
                  colors={gradients.hero}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.playerFallback}
                >
                  <Text style={styles.playerFallbackText}>
                    {activeSource.kind === "episode" ? "STORY" : activeSource.kind === "track" ? "TRACK" : "LIVE"}
                  </Text>
                </LinearGradient>
              )}
            </View>

            <View style={styles.playerMeta}>
              <Text style={styles.playerEyebrow}>
                {activeSource.kind === "live"
                  ? "Live room"
                  : activeSource.kind === "track"
                    ? "Listening room"
                    : "Bedtime stories"}
              </Text>
              <Text style={styles.playerTitle}>{activeSource.title}</Text>
              <Text style={styles.playerSubtitle}>{activeSource.artist}</Text>
              {activeSource.albumTitle ? (
                <Text style={styles.playerAlbum}>{activeSource.albumTitle}</Text>
              ) : null}
              {activeSource.note ? (
                <Text style={styles.playerNote} numberOfLines={3}>
                  {activeSource.note}
                </Text>
              ) : null}

              <View style={styles.transportRow}>
                <ActionButton
                  label={status.playing ? "Pause" : "Play"}
                  onPress={() => void togglePlayback()}
                />
                <ActionButton label="-15s" secondary small onPress={() => seekBy(-15)} />
                <ActionButton label="+15s" secondary small onPress={() => seekBy(15)} />
                <ActionButton
                  label={`${status.playbackRate?.toFixed(2).replace(/\.00$/, "") || "1"}x`}
                  secondary
                  small
                  onPress={cycleSpeed}
                />
              </View>

              <View style={styles.progressRow}>
                <Text style={styles.progressText}>{formatDuration(status.currentTime)}</Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${
                          status.duration > 0
                            ? Math.min(100, (status.currentTime / status.duration) * 100)
                            : status.playing
                              ? 18
                              : 0
                        }%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {activeSource.kind === "live" ? "live" : formatDuration(status.duration)}
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {error ? (
          <GlassCard style={styles.alertCard}>
            <Text style={styles.alertText}>{error}</Text>
          </GlassCard>
        ) : null}

        <GlassCard style={styles.curioCard}>
          <View style={styles.curioHeader}>
            <Text style={styles.sectionEyebrow}>{curio.badge}</Text>
            {curioLoading ? <ActivityIndicator color={colors.accent2} size="small" /> : null}
          </View>
          <Text style={styles.sectionTitle}>{curio.title}</Text>
          <Text style={styles.sectionBody}>{curio.body}</Text>
          <ActionButton
            label={curio.cta}
            secondary
            onPress={() => void Linking.openURL(siteUrl)}
          />
        </GlassCard>

        {screen === "live" ? (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={styles.sectionEyebrow}>Live booth</Text>
              <Text style={styles.sectionTitle}>
                {dashboard.now?.title ?? "The station is breathing in place."}
              </Text>
              <Text style={styles.sectionBody}>
                {dashboard.dj?.script ??
                  "Mr Rassy is waiting for the next transition to open up in the room."}
              </Text>

              <View style={styles.metricRow}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Mood</Text>
                  <Text style={styles.metricValue}>{formatMood(dashboard.dj?.mood)}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Notes</Text>
                  <Text style={styles.metricValue}>{dashboard.notes.length}</Text>
                </View>
              </View>

              <View style={styles.inlineActionRow}>
                <ActionButton label="Play live" onPress={() => void playLive()} />
                <ActionButton
                  label="Notes archive"
                  secondary
                  onPress={() => void Linking.openURL(notesArchiveUrl)}
                />
              </View>
              <Text style={styles.sectionEyebrow}>Next in the room</Text>
              {dashboard.next.length ? dashboard.next.slice(0, 3).map((track, index) => (
                <Text key={track.id ?? `${index}-${track.title}`} style={styles.sectionBody}>
                  {index + 1}. {track.title ?? "Untitled"} · {track.artist ?? "Unknown artist"}
                </Text>
              )) : <Text style={styles.sectionBody}>The next set is being cued.</Text>}
            </GlassCard>

            <GlassCard style={styles.sectionCard}>
              <Text style={styles.sectionEyebrow}>Talk to Mr Rassy</Text>
              {chatMessages.slice(-4).map((item) => (
                <Text key={item.id} style={styles.sectionBody}>
                  {item.role === "dj" ? "Mr Rassy" : "You"}: {item.text}
                </Text>
              ))}
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask the booth or request a record"
                placeholderTextColor={colors.cloudSoft}
                style={styles.searchInput}
                accessibilityLabel="Message Mr Rassy"
              />
              <ActionButton label={chatPending ? "Waiting for reply" : "Send to booth"} onPress={() => void sendChat()} />
              {chatStatus ? <Text style={styles.sectionBody}>{chatStatus}</Text> : null}
            </GlassCard>

            {dashboard.notes.slice(0, 3).map((note) => (
              <GlassCard key={note.id} style={styles.sectionCard}>
                <Text style={styles.sectionEyebrow}>
                  {note.eventType.toUpperCase()} · {formatRelativeTime(note.createdAt)}
                </Text>
                <Text style={styles.sectionTitle}>{note.title}</Text>
                <Text style={styles.sectionBody}>{note.excerpt}</Text>
                {note.currentTrack ? (
                  <ActionButton
                    label="Play this cut"
                    secondary
                    onPress={() =>
                      void playSource({
                        kind: "track",
                        id: note.currentTrack?.id || note.id,
                        url: note.currentTrack?.id
                          ? `${siteUrl}/api/library/tracks/${note.currentTrack.id}/stream`
                          : dashboard.liveStreamUrl || liveStreamUrl,
                        title: note.currentTrack?.title || note.title,
                        artist: note.currentTrack?.artist || "Mr Rassy",
                        albumTitle: note.currentTrack?.album,
                        artworkUrl: note.currentTrack?.albumArtUrl,
                        note: cleanScript(note.script),
                      })
                    }
                  />
                ) : null}
              </GlassCard>
            ))}
          </>
        ) : null}

        {screen === "library" ? (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={styles.sectionEyebrow}>Listening room</Text>
              <Text style={styles.sectionTitle}>Search the local shelves</Text>
              <Text style={styles.sectionBody}>
                These files are coming from the mounted music library inside the same stack, with the DJ identifiers sitting beside them for live-station texture.
              </Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search title, artist, album"
                placeholderTextColor={colors.cloudSoft}
                style={styles.searchInput}
              />
              <View style={styles.metricRow}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Tracks</Text>
                  <Text style={styles.metricValue}>
                    {filteredTracks.length}
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Hi-res</Text>
                  <Text style={styles.metricValue}>{hiResTracks.length}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>DJ IDs</Text>
                  <Text style={styles.metricValue}>
                    {listeningRoom.djIdentifiers.length}
                  </Text>
                </View>
              </View>
              <View style={styles.metricHintRow}>
                {hiResTracks.slice(0, 3).map((track) => (
                  <View key={track.id} style={styles.badgeChip}>
                    <Text style={styles.badgeChipText}>
                      {track.qualityLabel || "Lossless"}
                    </Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            {visibleTracks.map((track) => (
              <LibraryRow
                key={track.id}
                title={track.title}
                subtitle={`${track.artist}${track.album ? ` · ${track.album}` : ""}`}
                meta={[formatTrackMeta(track), formatDuration(track.duration)]
                  .filter(Boolean)
                  .join(" · ")}
                badges={[
                  track.lossless ? "Lossless" : null,
                  track.bitsPerSample && track.bitsPerSample > 16
                    ? `${track.bitsPerSample}-bit`
                    : null,
                  track.sampleRate && track.sampleRate > 48000
                    ? `${Math.round(track.sampleRate / 1000)}kHz`
                    : null,
                ].filter(Boolean) as string[]}
                active={activeSource.kind === "track" && activeSource.id === track.id}
                onPress={() =>
                  void playSource({
                    kind: "track",
                    id: track.id,
                    url: track.streamUrl || `${siteUrl}/api/library/tracks/${track.id}/stream`,
                    title: track.title,
                    artist: track.artist,
                    albumTitle: track.album,
                    artworkUrl: track.albumArtUrl,
                    note: track.qualityLabel,
                  })
                }
              />
            ))}
          </>
        ) : null}

        {screen === "stories" ? (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={styles.sectionEyebrow}>Real Life Bedtime Stories</Text>
              <Text style={styles.sectionTitle}>{podcasts.show.title}</Text>
              <Text style={styles.sectionBody}>{podcasts.show.description}</Text>
              <View style={styles.inlineActionRow}>
                <ActionButton
                  label="Open feed"
                  onPress={() => void Linking.openURL(`${siteUrl}/real-life-bedtime-stories/feed.xml`)}
                />
                <ActionButton
                  label="Site page"
                  secondary
                  onPress={() => void Linking.openURL(`${siteUrl}/real-life-bedtime-stories`)}
                />
              </View>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search chapter or book title"
                placeholderTextColor={colors.cloudSoft}
                style={styles.searchInput}
              />
            </GlassCard>

            {filteredSeries.map((series: PodcastSeries) => (
              <GlassCard key={series.id} style={styles.sectionCard}>
                <Text style={styles.sectionEyebrow}>
                  {series.episodeCount} chapters · {formatRelativeTime(series.updatedAt)}
                </Text>
                <Text style={styles.sectionTitle}>{series.title}</Text>
                <Text style={styles.sectionBody}>
                  {series.description ||
                    "A book series pulled from the mounted podcast shelf."}
                </Text>

                <View style={styles.storyList}>
                  {series.episodes.slice(0, normalizedQuery ? 24 : 6).map((episode: PodcastEpisode) => (
                    <LibraryRow
                      key={episode.id}
                      title={episode.title}
                      subtitle={series.title}
                      meta={[
                        episode.episodeNumber
                          ? `Episode ${String(episode.episodeNumber).padStart(2, "0")}`
                          : null,
                        formatDuration(episode.duration),
                        episode.qualityLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      badges={[
                        "Episode",
                        episode.rssReady ? "RSS-ready" : null,
                        episode.qualityLabel,
                      ].filter(Boolean) as string[]}
                      active={activeSource.kind === "episode" && activeSource.id === episode.id}
                      onPress={() =>
                        void playSource({
                          kind: "episode",
                          id: episode.id,
                          url:
                            episode.streamUrl ||
                            `${siteUrl}/api/podcasts/episodes/${episode.id}/stream`,
                          title: episode.title,
                          artist: podcasts.show.title,
                          albumTitle: series.title,
                          artworkUrl: episode.artworkUrl || series.artworkUrl,
                          note: episode.description,
                        })
                      }
                    />
                  ))}
                </View>
              </GlassCard>
            ))}
          </>
        ) : null}

        <View style={styles.footerPad}>
          <Text style={styles.footerText}>
            {siteUrl.replace(/^https?:\/\//, "")} · self-contained player stack
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  baseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,2,12,0.76)",
  },
  loadingShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    color: colors.ink,
    fontSize: 16,
    letterSpacing: 0.4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 16,
  },
  heroCard: {
    marginTop: 8,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  eyebrow: {
    color: colors.cloudSoft,
    fontSize: 11,
    letterSpacing: 3.2,
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 34,
  },
  heroBody: {
    marginTop: 12,
    color: colors.cloud,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 290,
  },
  tabRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 12,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  tabLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  tabLabelActive: {
    color: "#120414",
  },
  playerCard: {
    overflow: "hidden",
  },
  playerCardContent: {
    gap: 18,
  },
  playerCoverShell: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  playerCover: {
    width: "100%",
    height: "100%",
  },
  playerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playerFallbackText: {
    color: colors.ink,
    fontSize: 24,
    letterSpacing: 4,
    fontWeight: "700",
  },
  playerMeta: {
    gap: 10,
  },
  playerEyebrow: {
    color: colors.cloudSoft,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  playerTitle: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "700",
  },
  playerSubtitle: {
    color: colors.cloud,
    fontSize: 16,
    fontWeight: "600",
  },
  playerAlbum: {
    color: colors.cloudSoft,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  playerNote: {
    marginTop: 4,
    color: colors.cloud,
    fontSize: 14,
    lineHeight: 22,
  },
  transportRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  progressRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent2,
  },
  progressText: {
    color: colors.cloudSoft,
    fontSize: 12,
    minWidth: 40,
  },
  alertCard: {
    borderColor: "rgba(255,230,109,0.24)",
  },
  alertText: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 22,
  },
  curioCard: {
    gap: 12,
  },
  curioHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionCard: {
    gap: 12,
  },
  sectionEyebrow: {
    color: colors.cloudSoft,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  sectionTitle: {
    marginTop: 6,
    color: colors.ink,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
  },
  sectionBody: {
    marginTop: 10,
    color: colors.cloud,
    fontSize: 15,
    lineHeight: 24,
  },
  metricRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    color: colors.cloudSoft,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 24,
    fontWeight: "700",
  },
  metricHintRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inlineActionRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  searchInput: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.ink,
    fontSize: 15,
  },
  listRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 16,
  },
  listRowActive: {
    borderColor: "rgba(66,245,255,0.45)",
    backgroundColor: "rgba(66,245,255,0.08)",
  },
  listRowBody: {
    flex: 1,
    gap: 4,
  },
  listRowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  listRowSubtitle: {
    color: colors.cloud,
    fontSize: 13,
    lineHeight: 20,
  },
  listRowMeta: {
    color: colors.cloudSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  badgeRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badgeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  badgeChipText: {
    color: colors.cloud,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cuePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cuePillText: {
    color: colors.ink,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: "600",
  },
  storyList: {
    marginTop: 12,
    gap: 10,
  },
  buttonShell: {
    overflow: "hidden",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonSmall: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
  },
  buttonPrimary: {
    backgroundColor: colors.accent4,
  },
  buttonSecondary: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  buttonLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  buttonLabelSecondary: {
    color: colors.ink,
  },
  buttonLabelSmall: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  footerPad: {
    paddingVertical: 8,
    alignItems: "center",
  },
  footerText: {
    color: colors.cloudSoft,
    fontSize: 12,
    letterSpacing: 0.4,
  },
});
