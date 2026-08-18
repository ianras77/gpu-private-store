import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function readJson(url: URL): Record<string, unknown> {
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

describe("Rassy Online package metadata", () => {
  test("keeps the app, package, and lockfile versions aligned", () => {
    const config = readJson(new URL("../../../../config.json", import.meta.url));
    const packageJson = readJson(new URL("../../package.json", import.meta.url));
    const packageLock = readJson(new URL("../../package-lock.json", import.meta.url));
    const lockPackages = packageLock.packages as Record<string, { version?: string }>;

    expect(config.version).toBe("0.1.6");
    expect(config.tipi_version).toBe(4);
    expect(packageJson.version).toBe(config.version);
    expect(packageLock.version).toBe(config.version);
    expect(lockPackages[""].version).toBe(config.version);
  });
});
