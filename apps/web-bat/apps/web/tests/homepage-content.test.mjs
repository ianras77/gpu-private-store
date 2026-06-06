import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const page = readFileSync(join(root, "app/page.tsx"), "utf8");
const header = readFileSync(join(root, "components/PublicHeader.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const homepageSurface = `${page}\n${header}\n${css}`;

describe("public homepage research-desk direction", () => {
  it("does not ship the old merch/poster/slogan storefront language", () => {
    for (const banned of [
      "brand-shop-window",
      "brand-shop",
      "merch-preview",
      "slogan-wall",
      "slogan-grid",
      "slogan-tile",
      "brand-pun-strip",
      "masthead-merch-lines",
      'tone: "tee"',
      'tone: "poster"',
      'tone: "sticker"',
      ".merch-preview-card.tee",
      ".merch-preview-card.poster",
      ".merch-preview-card.sticker",
    ]) {
      assert.equal(homepageSurface.includes(banned), false, `${banned} should not appear on the public homepage surface`);
    }
  });

  it("centers the live research, analysis, writing, and curation machine", () => {
    for (const required of [
      "research-workbench",
      "analysis-radar",
      "writing-queue",
      "source-ledger",
      "cycle-pulse",
      "30-search sweep",
      "Research lanes",
      "Writing queue",
      "Source ledger",
    ]) {
      assert.equal(homepageSurface.includes(required), true, `${required} should be represented in the homepage surface`);
    }
  });
});
