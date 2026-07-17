import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(__dirname, "../..");

function readAppFile(fileName: string) {
  return fs.readFileSync(path.join(appRoot, fileName), "utf8");
}

describe("Runtipi packaging", () => {
  it("routes House Chat through the host gateway LLM endpoint", () => {
    const compose = readAppFile("docker-compose.yml");

    expect(compose).toContain(
      "RASSYCODEX_BASE_URL=${RASSYCODEX_BASE_URL:-${RASIES_CAT_BASE_URL:-http://host.docker.internal:8844}}",
    );
    expect(compose).toContain(
      "RASSYCODEX_CHAT_PATH=${RASSYCODEX_CHAT_PATH:-${RASIES_CAT_CHAT_PATH:-/v1/chat/completions}}",
    );
    expect(compose).toContain(
      "RASSYCODEX_API_KEY=${RASSYCODEX_API_KEY:-${RASIES_CAT_API_KEY:-}}",
    );
    expect(compose).toContain(
      "OLLAMA_GENERAL_BASE_URL=${RASIES_OLLAMA_GENERAL_BASE_URL:-http://host.docker.internal:8844}",
    );
    expect(compose).toContain(
      "OLLAMA_EMBED_BASE_URL=${RASIES_OLLAMA_EMBED_BASE_URL:-http://host.docker.internal:8844}",
    );
  });

  it("maps host.docker.internal for every service that calls the host LLM", () => {
    const compose = readAppFile("docker-compose.yml");

    const hostGatewayMappings = compose.match(
      /host\.docker\.internal:host-gateway/g,
    );

    expect(hostGatewayMappings).toHaveLength(2);
  });
});
