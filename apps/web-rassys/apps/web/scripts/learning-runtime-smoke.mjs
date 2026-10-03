import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const appRoot = process.cwd();
const tempRoot = await mkdtemp(
  path.join(os.tmpdir(), "rassy-learning-runtime-"),
);
const contentRoot = path.join(tempRoot, "modules");
const notebookRoot = path.join(tempRoot, "thoughts");
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WQAAAABJRU5ErkJggg==",
  "base64",
);
let server;
let baseUrl = "";
let output = "";

const reservePort = async () =>
  new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => resolve(address.port));
    });
  });

const writeImage = async (moduleDir) => {
  const assets = path.join(moduleDir, "assets");
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, "pixel.png"), imageBytes);
};

const liveModule = ({
  slug,
  status = "published",
  version = 1,
  sentence = "Version one is on the shelf.",
}) =>
  [
    "---",
    "schema: rassy-module/v1",
    `slug: ${slug}`,
    `version: ${version}`,
    `status: ${status}`,
    'title: "A live refresh module"',
    'summary: "A fixture used to prove folder discovery in a running production process."',
    'topic: "Runtime checks"',
    "objectives:",
    '  - "See file changes without rebuilding the app."',
    "cover: assets/pixel.png",
    'cover_alt: "One pixel used for the runtime check."',
    "---",
    "",
    "## A live section {#live-section}",
    "",
    sentence,
    "",
    "![A one pixel test image](assets/pixel.png)",
    "",
    ":::idea[An authored teaching block]{#live-idea}",
    "This block is rendered by an application-owned component.",
    ":::",
    "",
  ].join("\n");

const request = async (url) =>
  fetch(`${baseUrl}${url}`, { signal: AbortSignal.timeout(10_000) });

const readModules = async () => {
  const response = await request("/api/learn/modules");
  assert.equal(response.status, 200, `catalog failed: ${response.status}`);
  return (await response.json()).modules.map(({ metadata }) => metadata.slug);
};

try {
  await mkdir(contentRoot, { recursive: true });
  await mkdir(notebookRoot, { recursive: true });
  await writeFile(
    path.join(notebookRoot, "2026-10-03-notebook-renderer.md"),
    [
      "---",
      "title: Notebook renderer fixture",
      "excerpt: Shared Markdown renderer runtime proof.",
      "---",
      "",
      "## Shared Markdown renderer",
      "",
      "**Markdown** reaches the existing notebook page.",
      "",
      "| Feature | Result |",
      "| --- | --- |",
      "| GFM table | Rendered |",
      "",
    ].join("\n"),
  );
  const publishedDir = path.join(contentRoot, "reading-family-story");
  await cp(
    path.join(appRoot, "examples/learning/reading-family-story"),
    publishedDir,
    { recursive: true },
  );
  await writeImage(publishedDir);
  const nestedAssets = path.join(publishedDir, "assets", "nested");
  await mkdir(nestedAssets, { recursive: true });
  await writeFile(path.join(nestedAssets, "pixel.png"), imageBytes);
  const outsideAsset = path.join(tempRoot, "outside.png");
  await writeFile(outsideAsset, imageBytes);
  await symlink(outsideAsset, path.join(publishedDir, "assets", "linked.png"));
  const publishedFile = path.join(publishedDir, "module.md");
  const publishedText = await readFile(publishedFile, "utf8");
  await writeFile(
    publishedFile,
    `${publishedText}\n\n![Runtime route image](assets/pixel.png)\n`,
  );

  const draftDir = path.join(contentRoot, "draft-only");
  await cp(publishedDir, draftDir, { recursive: true });
  const draftText = (await readFile(path.join(draftDir, "module.md"), "utf8"))
    .replace("slug: reading-family-story", "slug: draft-only")
    .replace("status: published", "status: draft")
    .replace('title: "A story worth keeping"', 'title: "Draft only"');
  await writeFile(path.join(draftDir, "module.md"), draftText);

  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(
    "pnpm",
    ["exec", "next", "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        LEARNING_STORAGE_PATH: contentRoot,
        BLOG_STORAGE_PATH: notebookRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-6000);
  });
  server.stderr.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-6000);
  });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null)
      throw new Error(`Next exited before serving requests.\n${output}`);
    try {
      const response = await request("/api/learn/modules");
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* The listener is still starting. */
    }
    await delay(500);
  }
  assert.ok(ready, `production server did not become ready.\n${output}`);

  const initial = await readModules();
  assert.ok(initial.includes("reading-family-story"));
  assert.ok(
    !initial.includes("draft-only"),
    "draft appeared in the public catalog",
  );
  const publishedPage = await request("/learn/reading-family-story");
  const publishedHtml = await publishedPage.text();
  assert.equal(
    publishedPage.status,
    200,
    "published module detail should be public",
  );
  assert.ok(publishedHtml.includes("A story worth keeping"));
  assert.ok(publishedHtml.includes("Three things to notice"));
  const notebookPage = await request("/notebook");
  const notebookHtml = await notebookPage.text();
  assert.equal(notebookPage.status, 200, "notebook route should render");
  assert.ok(notebookHtml.includes("Notebook renderer fixture"));
  assert.ok(notebookHtml.includes("Shared Markdown renderer"));
  assert.ok(
    notebookHtml.includes("<table"),
    "Notebook should render GFM through the shared Markdown renderer",
  );
  const draftPage = await request("/learn/draft-only");
  assert.equal(
    draftPage.status,
    404,
    "draft detail should return a real 404 response",
  );
  assert.ok(!(await draftPage.text()).includes("Draft only"));

  const publishedAsset = await request(
    "/api/learn/assets/reading-family-story/assets/pixel.png",
  );
  assert.equal(
    publishedAsset.status,
    200,
    "published image should be available",
  );
  assert.equal(publishedAsset.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await publishedAsset.arrayBuffer()), imageBytes);
  const nestedAsset = await request(
    "/api/learn/assets/reading-family-story/assets/nested/pixel.png",
  );
  assert.equal(
    nestedAsset.status,
    200,
    "safe nested image should be available",
  );
  assert.deepEqual(Buffer.from(await nestedAsset.arrayBuffer()), imageBytes);
  assert.equal(
    (await request("/api/learn/assets/reading-family-story/assets/linked.png"))
      .status,
    404,
    "symlinked image must not escape the module folder",
  );
  assert.equal(
    (await request("/api/learn/assets/draft-only/assets/pixel.png")).status,
    404,
    "draft image should stay private",
  );
  assert.equal(
    (
      await request(
        "/api/learn/assets/reading-family-story/assets/%252e%252e/pixel.png",
      )
    ).status,
    404,
    "encoded traversal must be rejected",
  );
  assert.equal(
    (
      await request(
        "/api/learn/assets/reading-family-story/assets/%5c..%5cpixel.png",
      )
    ).status,
    404,
    "backslash paths must be rejected",
  );

  const addedDir = path.join(contentRoot, "live-added");
  await mkdir(addedDir, { recursive: true });
  await writeImage(addedDir);
  await writeFile(
    path.join(addedDir, "module.md"),
    liveModule({ slug: "live-added" }),
  );
  assert.ok(
    !(await readModules()).includes("live-added"),
    "new content bypassed the bounded catalog refresh",
  );
  for (let attempt = 0; attempt < 70; attempt += 1) {
    if ((await readModules()).includes("live-added")) break;
    await delay(500);
  }
  assert.ok(
    (await readModules()).includes("live-added"),
    "new content was not discovered after the 30 second catalog refresh",
  );

  const malformedDir = path.join(contentRoot, "invalid-live");
  await mkdir(malformedDir, { recursive: true });
  const invalidText = liveModule({ slug: "invalid-live" }).replace(
    'title: "A live refresh module"',
    'title: "First title"\ntitle: "Duplicate title"',
  );
  await writeFile(path.join(malformedDir, "module.md"), invalidText);
  assert.equal(
    (await request("/learn/invalid-live")).status,
    404,
    "malformed content added after startup must stay unavailable",
  );
  assert.equal(
    (await request("/learn/live-added")).status,
    200,
    "one malformed module must not take down valid lessons",
  );

  await writeFile(
    path.join(addedDir, "module.md"),
    liveModule({
      slug: "live-added",
      version: 2,
      sentence: "Version two replaced the old lesson without a restart.",
    }),
  );
  const editedResponse = await request("/learn/live-added");
  const editedHtml = await editedResponse.text();
  assert.equal(editedResponse.status, 200);
  assert.ok(
    editedHtml.includes(
      "Version two replaced the old lesson without a restart.",
    ),
  );
  assert.ok(editedHtml.includes("v2"));

  await writeFile(
    path.join(addedDir, "module.md"),
    liveModule({ slug: "live-added", status: "draft", version: 2 }),
  );
  assert.equal(
    (await request("/learn/live-added")).status,
    404,
    "draft detail stayed public",
  );
  assert.equal(
    (await request("/api/learn/assets/live-added/assets/pixel.png")).status,
    404,
    "draft asset stayed public",
  );
  await delay(30_500);
  assert.ok(
    !(await readModules()).includes("live-added"),
    "draft stayed in the public catalog past its refresh window",
  );

  await rm(addedDir, { recursive: true });
  assert.equal(
    (await request("/learn/live-added")).status,
    404,
    "deleted module detail stayed public",
  );
  assert.ok(
    !(await readModules()).includes("live-added"),
    "deleted module stayed in the public catalog",
  );
  console.log(
    "Learning runtime smoke passed: published/draft boundaries, safe images, and live add/edit/unpublish/delete without restarting Next.js.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(5000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await rm(tempRoot, { recursive: true, force: true });
}
