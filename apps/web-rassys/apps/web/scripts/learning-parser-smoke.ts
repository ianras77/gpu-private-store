import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseLearningModule,
  LearningValidationError,
} from "../src/lib/learning/parse";

const fixturePath = path.resolve(
  "examples/learning/reading-family-story/module.md",
);
const fixtureDir = path.dirname(fixturePath);
const fixture = await readFile(fixturePath, "utf8");

const parsed = await parseLearningModule(
  "reading-family-story",
  fixture,
  fixtureDir,
);
assert.equal(parsed.module.metadata.status, "published");
assert.deepEqual(
  parsed.module.sections.map(({ id }) => id),
  ["inherit", "ask", "check", "keep"],
);
assert.deepEqual(Object.keys(parsed.module.checks), ["interpretation-check"]);
assert.equal(
  parsed.module.sections.length,
  4,
  "headings inside code fences must not create sections",
);

const rejects = async (source: string, pattern: RegExp) => {
  await assert.rejects(
    () => parseLearningModule("reading-family-story", source, fixtureDir),
    (error: unknown) => {
      assert.ok(error instanceof LearningValidationError);
      assert.match(error.message, pattern);
      return true;
    },
  );
};

await rejects(
  fixture.replace(
    'title: "A story worth keeping"',
    "title: First\ntitle: Second",
  ),
  /unique/i,
);
await rejects(
  fixture.replace("schema: rassy-module/v1", "schema: rassy-module/v2"),
  /schema/i,
);
await rejects(
  fixture.replace(
    ":::idea[Three things to notice]",
    ":::unknown[Three things to notice]",
  ),
  /unsupported teaching block/i,
);
await rejects(fixture.replace("{#ask}", "{#inherit}"), /duplicate ID/i);
await rejects(
  fixture.replace('"answer": "b"', '"answer": "missing"'),
  /answer must match/i,
);
await rejects(
  fixture.replace(
    "## The story we inherit {#inherit}",
    "## The story we inherit",
  ),
  /explicit trailing ID/i,
);
await rejects(
  fixture.replace(
    "## The story we inherit {#inherit}",
    "## The story we inherit {#inherit}\n\n<script>alert(1)</script>",
  ),
  /raw HTML/i,
);
await rejects(
  `${fixture}\n\n![missing image](assets/missing.png)`,
  /image asset.*unavailable/i,
);
await rejects(`${fixture}\n\n${"x".repeat(512 * 1024)}`, /512 KiB/i);
await rejects(
  fixture.replace(
    "schema: rassy-module/v1",
    "schema: rassy-module/v1\nunknown_field: true",
  ),
  /unrecognized key/i,
);
await rejects(
  fixture
    .replace(
      'title: "A story worth keeping"',
      'title: &module_title "A story worth keeping"',
    )
    .replace(
      'summary: "Explore a family story without losing either its meaning or your curiosity."',
      "summary: *module_title",
    ),
  /alias|maximum/i,
);

console.log(
  "Learning parser smoke passed: fixture, section IDs, custom blocks, checks, limits, and invalid input.",
);
