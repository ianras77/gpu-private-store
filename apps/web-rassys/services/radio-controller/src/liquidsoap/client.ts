import net from "net";
import { config } from "../config";

const TELNET_GOODBYE = /^Bye!$/i;
const TELNET_STATUS_LINE = /^(END|OK)$/i;
const TELNET_METADATA_LINE = /^([A-Za-z0-9_.-]+)=(.*)$/;

const cleanTelnetResponse = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !TELNET_GOODBYE.test(line))
    .join("\n")
    .trim();

const sendTelnetCommand = (command: string, timeoutMs = 4000) =>
  new Promise<string>((resolve, reject) => {
    const socket = net.createConnection(
      { host: config.LIQUIDSOAP_HOST, port: config.LIQUIDSOAP_TELNET_PORT },
      () => {
        socket.write(`${command}\nquit\n`);
      }
    );

    let buffer = "";
    let settled = false;

    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(cleanTelnetResponse(value));
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
    });
    socket.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });
    socket.on("end", () => {
      finish(buffer);
    });
    socket.on("close", (hadError) => {
      if (!hadError) {
        finish(buffer);
      }
    });
    socket.on("timeout", () => {
      fail(new Error("Liquidsoap telnet timeout"));
    });
    socket.setTimeout(timeoutMs);
  });

export const hasTelnetError = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some(
      (line) =>
        /^ERROR\b/i.test(line) ||
        /^unknown\b/i.test(line) ||
        /^no such command\b/i.test(line)
    );

const needsQuotedTelnetArgument = (value: string) => /[\s"\\]/.test(value);

const quoteTelnetString = (value: string) => JSON.stringify(value);

const parseTelnetMetadataValue = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
};

const parseTelnetMetadata = (value: string) => {
  const metadata: Record<string, string> = {};

  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || TELNET_STATUS_LINE.test(trimmed) || TELNET_GOODBYE.test(trimmed)) {
      continue;
    }

    const match = trimmed.match(TELNET_METADATA_LINE);
    if (!match) continue;

    metadata[match[1]] = parseTelnetMetadataValue(match[2]);
  }

  return metadata;
};

const resolveQueueEntryId = (metadata: Record<string, string>) => {
  const trackId =
    metadata.track_id?.trim() ||
    metadata.trackId?.trim() ||
    metadata.rassy_track_id?.trim() ||
    metadata.rassyTrackId?.trim() ||
    "";
  if (trackId) return trackId;

  const snippetId = metadata.snippet_id?.trim() || metadata.snippetId?.trim() || "";
  if (snippetId) return `snippet:${snippetId}`;

  return null;
};

export const buildQueuePushCommands = (uri: string) => {
  const commands = [`queue.push ${uri}`];
  if (needsQuotedTelnetArgument(uri)) {
    commands.push(`queue.push ${quoteTelnetString(uri)}`);
  }
  return Array.from(new Set(commands));
};

export const pushToQueue = async (uri: string) => {
  const commands = buildQueuePushCommands(uri);
  let lastError: string | null = null;

  for (const command of commands) {
    try {
      // Large FLACs and DJ snippets can take longer for Liquidsoap to acknowledge.
      const response = await sendTelnetCommand(command, 15000);
      if (!hasTelnetError(response)) {
        return true;
      }
      lastError = response || "unknown";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "unknown");
    }
  }

  console.warn("liquidsoap queue push failed", {
    uri,
    attempts: commands.length,
    error: lastError ?? "unknown"
  });
  return false;
};

export const skipCurrent = async () => {
  try {
    return await sendTelnetCommand("radio.skip");
  } catch (error) {
    console.warn("liquidsoap skip failed", error);
    return null;
  }
};

const parseTelnetList = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !TELNET_STATUS_LINE.test(line) &&
        !/^ERROR\b/i.test(line)
    )
    .flatMap((line) => line.split(/\s+/).filter((token) => /^\d+$/.test(token)));

const readRequestMetadata = async (requestId: string) => {
  try {
    const response = await sendTelnetCommand(`request.metadata ${requestId}`);
    if (hasTelnetError(response)) {
      console.warn("liquidsoap request metadata inspection returned an error", {
        requestId,
        response
      });
      return null;
    }

    return parseTelnetMetadata(response);
  } catch (error) {
    console.warn("liquidsoap request metadata inspection failed", {
      requestId,
      error
    });
    return null;
  }
};

export const readQueuedRequests = async () => {
  try {
    const response = await sendTelnetCommand("queue.queue");
    if (hasTelnetError(response)) {
      console.warn("liquidsoap queue inspection returned an error", { response });
      return null;
    }
    return parseTelnetList(response);
  } catch (error) {
    console.warn("liquidsoap queue inspection failed", error);
    return null;
  }
};

export const readQueuedEntries = async () => {
  const requestIds = await readQueuedRequests();
  if (requestIds === null) return null;

  const entries: string[] = [];
  for (const requestId of requestIds) {
    const metadata = await readRequestMetadata(requestId);
    const entryId = metadata ? resolveQueueEntryId(metadata) : null;

    if (!entryId) {
      console.warn("liquidsoap queue entry is missing a usable id", {
        requestId,
        metadata
      });
      return null;
    }

    entries.push(entryId);
  }

  return entries;
};

export const isLiquidsoapReady = async () => {
  try {
    const response = await sendTelnetCommand("queue.queue");
    return !hasTelnetError(response);
  } catch {
    return false;
  }
};

export const fetchMeta = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    Math.max(500, config.LIQUIDSOAP_META_TIMEOUT_MS)
  );

  try {
    const response = await fetch(config.LIQUIDSOAP_META_URL, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return null;

    const data = (await response.json()) as any;
    if (data?.icestats) {
      const source = Array.isArray(data.icestats.source)
        ? data.icestats.source.find((item: any) => item.listenurl?.includes(config.STREAM_MOUNT)) ??
          data.icestats.source[0]
        : data.icestats.source;
      if (!source) return null;
      const raw = source.title ?? source.yp_currently_playing ?? source.song ?? "";
      const [artist, title] = raw.includes(" - ") ? raw.split(" - ", 2) : [source.artist, source.title];
      return {
        title: title ?? source.title ?? "",
        artist: artist ?? source.artist ?? "",
        album: source.album ?? "",
        song: raw,
        track_id: source.track_id ?? source.trackId ?? source["rassy_track_id"] ?? ""
      } as Record<string, string>;
    }
    return data as Record<string, string>;
  } finally {
    clearTimeout(timeoutId);
  }
};
