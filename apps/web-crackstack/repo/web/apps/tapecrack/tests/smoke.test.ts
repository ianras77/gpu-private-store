import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "vitest";

test("smoke", () => {
  expect(2 + 2).toBe(4);
});

test("studio uses shared workbench", () => {
  const file = path.resolve(__dirname, "../app/studio/StudioClient.tsx");
  const content = readFileSync(file, "utf8");
  expect(content).toContain("@crackstack/ui");
  expect(content).toContain("AgentWorkbench");
});

test("landing links into working studio flow", () => {
  const file = path.resolve(__dirname, "../app/page.tsx");
  const content = readFileSync(file, "utf8");
  expect(content).toContain("/studio");
  expect(content).toContain("LandingStatus");
});
