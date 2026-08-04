import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const compose = readFileSync(path.resolve(__dirname, "../../../../docker-compose.yml"), "utf8");

const serviceBlock = (service: string) => {
  const match = compose.match(new RegExp(`\\n  ${service}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:|$)`));
  if (!match) throw new Error(`Missing ${service} service in docker-compose.yml`);
  return match[1];
};

describe("music symlink mounts", () => {
  it.each(["radio-controller", "liquidsoap"])(
    "%s exposes the absolute symlink target read-only",
    (service) => {
      expect(serviceBlock(service)).toContain("- /mnt/cannonball:/mnt/cannonball:ro");
    }
  );
});
