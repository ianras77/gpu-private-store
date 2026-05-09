import { LibraryProfile, Snippet, Track } from "../library/types";
import type { RecommendationStatus } from "../station-chat";

export type DJSpecialType =
  | "same-decade"
  | "same-artist"
  | "album-run"
  | "deep-cuts"
  | "genre-pocket";

export type DJProgrammingInfo = {
  mode: "standard" | "special";
  label: string;
  description: string;
  specialType?: DJSpecialType;
  decade?: string;
  artist?: string;
  album?: string;
  genre?: string;
  trackIds?: string[];
};

export type DJTrackPlaybackMode = "full" | "clip";
export type DJTrackPlaybackSegment = "opening" | "middle" | "late";

export type DJTrackPlaybackPlan = {
  trackId: string;
  mode: DJTrackPlaybackMode;
  segment?: DJTrackPlaybackSegment;
  cueInSeconds?: number;
  cueOutSeconds?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  reason?: string;
  title?: string;
  artist?: string;
  duration?: number;
};

export type DJContext = {
  mood: string;
  timeOfDay: string;
  dayOfWeek: string;
  dayPart: string;
  emotionalWeather: string;
  recentTracks: { id: string; title: string; artist: string }[];
  recentArtists: string[];
  queueDepth: number;
  lockedQueueSize?: number;
  nowPlaying?:
    | {
        id?: string;
        title?: string;
        artist?: string;
        album?: string;
        year?: number;
        genres?: string[];
        energy?: number;
      }
    | null;
  librarySample: Track[];
  queuePreview: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    year?: number;
    genres?: string[];
    energy: number;
  }[];
  lockedQueuePreview?: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    year?: number;
    genres?: string[];
    energy: number;
  }[];
  snippetSample: Snippet[];
  libraryProfile: LibraryProfile;
  feedback: { trackId: string; score: number; title?: string; artist?: string }[];
  feedbackTopLiked: { trackId: string; score: number; title: string; artist: string }[];
  feedbackTopDisliked: { trackId: string; score: number; title: string; artist: string }[];
  requests: string[];
  bans: {
    trackIds: string[];
    artists: string[];
  };
  programming?: DJProgrammingInfo | null;
};

export type DJChatMessage = {
  role: "dj" | "listener";
  text: string;
  createdAt?: number;
};

export type DJRequestMatch = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genres?: string[];
  energy: number;
};

export type DJListenerLiveSnapshot = {
  djScript?: string | null;
  djReason?: string | null;
  boothHeadline?: string | null;
  boothIntro?: string | null;
  lineupNote?: string | null;
  contextNote?: string | null;
  listenForNote?: string | null;
  nextMove?: string | null;
  programmingMode?: "standard" | "special" | null;
  programmingLabel?: string | null;
  programmingDescription?: string | null;
  tags?: string[];
  requestLine?: Array<{
    summary: string;
    status?: string | null;
    intent?: string | null;
    response?: string | null;
    tracks?: Array<{
      title: string;
      artist: string;
    }>;
  }>;
};

export type DJDecision = {
  trackId?: string;
  playlist?: string[];
  mood?: string;
  talkScript?: string;
  snippetId?: string;
  reason?: string;
};

export type DJListenerReply = {
  reply: string;
  mood?: string | null;
  recommendationStatus?: RecommendationStatus;
  recommendationSummary?: string | null;
  matchedTrackId?: string | null;
  skipDecision?: "approved" | "rejected" | "none";
  reason?: string | null;
  trackIds?: string[] | null;
};

export interface DJPlugin {
  id: string;
  getPlaylist?(context: DJContext, count: number): Promise<DJDecision | null>;
  getNextTrack(context: DJContext): Promise<DJDecision | null>;
  shouldTalk(context: DJContext): Promise<boolean>;
  getTalkScript(context: DJContext): Promise<string | null>;
  pickSnippet(context: DJContext): Promise<string | null>;
  planTrackPlayback?(
    context: DJContext,
    tracks: Track[]
  ): Promise<DJTrackPlaybackPlan[] | null>;
  replyToListener?(
    context: DJContext,
    input: {
      message: string;
      recentChat: DJChatMessage[];
      requestMatches: DJRequestMatch[];
      requestCandidates?: DJRequestMatch[];
      liveSnapshot?: DJListenerLiveSnapshot | null;
    }
  ): Promise<DJListenerReply | null>;
}
