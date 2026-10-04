import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanPhotos } from "../library/photos";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

const makeTemporaryDirectory = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rassy-photos-test-"));
  temporaryRoots.push(root);
  return root;
};

describe("scanPhotos", () => {
  it("keeps symlinks from exposing media outside the configured library", async () => {
    const libraryRoot = await makeTemporaryDirectory();
    const outsideRoot = await makeTemporaryDirectory();
    const outsideAlbum = path.join(outsideRoot, "album");

    await mkdir(outsideAlbum);
    await writeFile(path.join(libraryRoot, "inside.jpg"), "inside");
    await writeFile(path.join(outsideRoot, "outside.jpg"), "outside");
    await writeFile(path.join(outsideAlbum, "album.jpg"), "outside album");
    await symlink(
      path.join(outsideRoot, "outside.jpg"),
      path.join(libraryRoot, "outside.jpg"),
    );
    await symlink(outsideAlbum, path.join(libraryRoot, "outside-album"), "dir");

    const items = await scanPhotos(libraryRoot);

    expect(items.map((item) => item.relativePath)).toEqual(["inside.jpg"]);
  });
});
