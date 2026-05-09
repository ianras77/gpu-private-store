import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Launchpad landing copy", () => {
  it("routes inspiration entry points to the active asset shelf tab", () => {
    const homePage = readSource("app/page.tsx");
    const signInPage = readSource("app/sign-in/page.tsx");

    expect(homePage).toContain('/playground?tab=assets');
    expect(homePage).not.toContain('/playground?tab=files');
    expect(signInPage).toContain('/playground?tab=assets');
    expect(signInPage).not.toContain('/playground?tab=files');
  });

  it("avoids shipping localhost-only runtime hints in the public UI", () => {
    const homePage = readSource("app/page.tsx");
    const signInPage = readSource("app/sign-in/page.tsx");

    expect(homePage).not.toContain("Next.js app on :3189");
    expect(homePage).not.toContain("Cheshire Cat on :3185");
    expect(homePage).not.toContain("Qdrant on :6333");
    expect(signInPage).not.toContain("localhost:3185/admin");
  });
});
