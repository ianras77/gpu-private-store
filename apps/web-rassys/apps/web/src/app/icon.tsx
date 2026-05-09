import { ImageResponse } from "next/og";
import { fetchRadio } from "../lib/radio-api";
import { serverConfig } from "../lib/server-config";
import { fetchUpstream } from "../lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = {
  width: 64,
  height: 64,
};
export const contentType = "image/png";

type IconTrack = {
  id?: string;
  title: string;
  artist: string;
};

type NotesPayload = {
  notes?: Array<{
    currentTrack?: IconTrack | null;
    setlist?: IconTrack[];
  }>;
};

const hashDay = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const collectDailyTracks = (payload: NotesPayload | null) => {
  const tracks = Array.isArray(payload?.notes) ? payload.notes : [];
  const seen = new Set<string>();
  const picks: IconTrack[] = [];

  const add = (track?: IconTrack | null) => {
    if (!track?.title || !track.artist) return;
    const key = track.id ?? `${track.artist}::${track.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    picks.push(track);
  };

  for (const note of tracks) {
    add(note.currentTrack);
    (Array.isArray(note.setlist) ? note.setlist : []).forEach(add);
  }

  return picks;
};

const buildArtworkDataUri = async (trackId: string) => {
  const base = serverConfig.RADIO_CONTROLLER_URL.replace(/\/$/, "");
  const response = await fetchUpstream(
    `${base}/public/library/tracks/${encodeURIComponent(trackId)}/artwork`,
    { method: "GET" },
    {
      timeoutMs: Number(process.env.RADIO_ICON_TIMEOUT_MS ?? 5000),
      retries: 0,
      retryDelayMs: 0,
    },
  );
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
};

const getDailyArtwork = async () => {
  const notes = await fetchRadio<NotesPayload>(
    "/public/notes?limit=18",
    undefined,
    {
      timeoutMs: Number(process.env.RADIO_ICON_NOTES_TIMEOUT_MS ?? 4500),
      retries: 0,
      retryDelayMs: 0,
    },
  ).catch(() => null);
  const tracks = collectDailyTracks(notes);
  if (tracks.length === 0) return null;

  const dayKey = new Date().toISOString().slice(0, 10);
  const selectedTrack = tracks[hashDay(dayKey) % tracks.length] ?? null;
  if (!selectedTrack?.id) return { track: selectedTrack, artwork: null };

  try {
    const artwork = await buildArtworkDataUri(selectedTrack.id);
    return {
      track: selectedTrack,
      artwork,
    };
  } catch {
    return {
      track: selectedTrack,
      artwork: null,
    };
  }
};

export default async function Icon() {
  const daily = await getDailyArtwork().catch(() => null);
  const track = daily?.track ?? null;
  const artwork = daily?.artwork ?? null;
  const monogram = (track?.artist ?? "Rassy").charAt(0).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          overflow: "hidden",
          borderRadius: 16,
          background:
            "linear-gradient(160deg, rgba(9,17,34,1) 0%, rgba(35,10,46,1) 52%, rgba(10,36,51,1) 100%)",
        }}
      >
        {artwork ? (
          <img
            src={artwork}
            alt={track ? `${track.title} by ${track.artist}` : "Daily album artwork"}
            width={64}
            height={64}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              artwork
                ? "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%)"
                : "linear-gradient(160deg, rgba(255,230,109,0.24) 0%, rgba(255,79,216,0.12) 48%, rgba(66,245,255,0.12) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 7,
            right: 7,
            display: "flex",
            width: 18,
            height: 18,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 9999,
            background: "rgba(255,255,255,0.18)",
            color: "white",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {monogram}
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            padding: "0 8px 8px 8px",
            color: "white",
            lineHeight: 1.08,
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              fontSize: 8,
              opacity: 0.72,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {track ? "Daily Cut" : "Rassy"}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textShadow: "0 2px 10px rgba(0,0,0,0.38)",
            }}
          >
            {track?.title?.slice(0, 18) ?? "Mr Rassy"}
          </span>
        </div>
      </div>
    ),
    size,
  );
}
