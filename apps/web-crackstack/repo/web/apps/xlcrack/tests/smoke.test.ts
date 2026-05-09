import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "vitest";

test("smoke", () => {
  expect(1 + 1).toBe(2);
});

test("playground uses shared workbench", () => {
  const file = path.resolve(__dirname, "../app/playground/PlaygroundClient.tsx");
  const content = readFileSync(file, "utf8");
  expect(content).toContain("@crackstack/ui");
  expect(content).toContain("AgentWorkbench");
});

test("landing links into working playground flow", () => {
  const file = path.resolve(__dirname, "../app/page.tsx");
  const content = readFileSync(file, "utf8");
  expect(content).toContain("/playground");
  expect(content).toContain("LandingStatus");
});
