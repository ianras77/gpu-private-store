import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const page = readFileSync(join(root, "app/page.tsx"), "utf8");
const header = readFileSync(join(root, "components/PublicHeader.tsx"), "utf8");
const about = readFileSync(join(root, "app/about/page.tsx"), "utf8");
const archive = readFileSync(join(root, "app/archive/page.tsx"), "utf8");
const taste = readFileSync(join(root, "app/the-cat/page.tsx"), "utf8");
const themes = readFileSync(join(root, "app/themes/page.tsx"), "utf8");
const workflow = readFileSync(join(root, "app/workflow/page.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const homepageSurface = `${page}\n${header}\n${css}`;
const publicEditorialSurface = `${page}\n${header}\n${about}\n${archive}\n${taste}\n${themes}\n${workflow}`;

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

  it("centers research, analysis, writing, and curation without reverting to the storefront", () => {
    for (const required of [
      "research-workbench",
      "analysis-radar",
      "writing-queue",
      "source-ledger",
      "cycle-pulse",
      "Search sweep",
      "Research lanes",
      "Writing queue",
      "Source ledger",
    ]) {
      assert.equal(homepageSurface.includes(required), true, `${required} should be represented in the homepage surface`);
    }
  });

  it("does not explain the website mechanics instead of speaking in BAT voice", () => {
    for (const banned of [
      "BAT now reads like a working desk",
      "The machine is visible now",
      "A medium-term cadence needs a page",
      "The plan is no longer",
      "visible operating room",
      "The newest queue shows",
      "The page will favor",
      "This page is the public version",
      "the reader deserves to see some of the machinery",
      "The page is live now",
      "the notebook shows the process",
      "the site should feel current before it feels polished",
      "the public site to feel like it was dumped straight out of a prompt",
    ]) {
      assert.equal(publicEditorialSurface.includes(banned), false, `${banned} should not appear in public editorial copy`);
    }
  });

  it("keeps the public voice woman-authored, political, and editorial", () => {
    for (const required of [
      "one woman",
      "Trump-world",
      "receipts",
      "I",
      "woman-owned",
    ]) {
      assert.equal(publicEditorialSurface.includes(required), true, `${required} should be represented in public editorial copy`);
    }
  });
});
