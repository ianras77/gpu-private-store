import { afterAll, beforeAll, describe, expect, it } from "vitest";

const requiredEnv = {
  REDIS_URL: "redis://127.0.0.1:6379",
  DATABASE_URL: "postgresql://rassy:password@127.0.0.1:5432/rassy",
  RADIO_ADMIN_API_KEY: "test-radio-admin-key",
  MUSIC_LIBRARY_PATH: "/media/music",
  SNIPPETS_PATH: "/media/dj",
  PODCAST_LIBRARY_PATH: "/media/podcasts",
  ICECAST_SOURCE_PASSWORD: "source-password",
  ICECAST_ADMIN_PASSWORD: "admin-password",
  ICECAST_RELAY_PASSWORD: "relay-password",
} as const;

const previousEnv = new Map<string, string | undefined>();

let buildQueuePushCommands: typeof import("../liquidsoap/client").buildQueuePushCommands;
let hasTelnetError: typeof import("../liquidsoap/client").hasTelnetError;

beforeAll(async () => {
  for (const [key, value] of Object.entries(requiredEnv)) {
    previousEnv.set(key, process.env[key]);
    process.env[key] = value;
  }

  ({ buildQueuePushCommands, hasTelnetError } = await import("../liquidsoap/client"));
});

describe("hasTelnetError", () => {
  it("does not treat ordinary metadata text as a telnet error", () => {
    expect(
      hasTelnetError('album="Unknown Pleasures"\ntitle="Candidate"\ntrack_id="abc123"\nEND')
    ).toBe(false);
  });

  it("still catches actual telnet error lines", () => {
    expect(hasTelnetError("ERROR: no such request\nEND")).toBe(true);
    expect(hasTelnetError("Unknown command queue.nope\nEND")).toBe(true);
  });
});

afterAll(() => {
  for (const [key, value] of previousEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
});

describe("buildQueuePushCommands", () => {
  it("keeps a simple request path as a single telnet command", () => {
    expect(buildQueuePushCommands("/music/test.flac")).toEqual([
      "queue.push /music/test.flac"
    ]);
  });

  it("adds a quoted retry form for paths with whitespace", () => {
    expect(buildQueuePushCommands("/music/Side A/track 01.flac")).toEqual([
      "queue.push /music/Side A/track 01.flac",
      'queue.push "/music/Side A/track 01.flac"'
    ]);
  });

  it("quotes annotate requests without losing metadata", () => {
    const uri =
      'annotate:title="Night Drive",artist="Rassy":/music/Side A/track 01.flac';

    expect(buildQueuePushCommands(uri)).toEqual([
      `queue.push ${uri}`,
      'queue.push "annotate:title=\\"Night Drive\\",artist=\\"Rassy\\":/music/Side A/track 01.flac"'
    ]);
  });
});
