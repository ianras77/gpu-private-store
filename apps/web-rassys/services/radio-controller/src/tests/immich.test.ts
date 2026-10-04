import { afterEach, describe, expect, it, vi } from "vitest";
import { scanImmichLibraries } from "../library/immich";

afterEach(() => vi.unstubAllGlobals());

describe("scanImmichLibraries", () => {
  it("includes only explicitly selected albums and the web-rassy prefix", async () => {
    const albums = [
      { id: "public-prefix", albumName: "web-rassy-family" },
      { id: "configured-id", albumName: "Holiday archive" },
      { id: "configured-name", albumName: "Family selections" },
      { id: "private", albumName: "Private camera roll" },
    ];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/api/albums")) {
        return Response.json(albums);
      }
      const id = url.split("/").at(-1);
      return Response.json({
        id,
        albumName: albums.find((album) => album.id === id)?.albumName,
        assets: [
          {
            id: `asset-${id}`,
            type: "IMAGE",
            originalFileName: "family.jpg",
            originalMimeType: "image/jpeg",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const photos = await scanImmichLibraries({
      baseUrl: "http://immich:2283",
      apiKey: "test-key",
      albumId: "configured-id",
      albumName: "Family selections",
    });

    expect(photos.map((photo) => photo.remoteAlbumId).sort()).toEqual([
      "configured-id",
      "configured-name",
      "public-prefix",
    ]);
    expect(photos).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { "x-api-key": "test-key" },
    });
  });
});
