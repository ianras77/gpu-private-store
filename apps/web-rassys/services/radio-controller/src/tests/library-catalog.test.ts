import { describe, expect, it } from "vitest";
import {
  CATALOG_CACHE_TABLES,
  buildCatalogCacheTruncateSql
} from "../library/catalog";

describe("library catalog persistence", () => {
  it("rebuilds only disposable catalog cache tables", () => {
    expect(CATALOG_CACHE_TABLES).toEqual([
      "LibraryPodcastEpisode",
      "LibraryPodcastSeries",
      "LibrarySnippet",
      "LibraryTrack"
    ]);
    expect(CATALOG_CACHE_TABLES).not.toContain("LibraryTrackInsight");
    expect(CATALOG_CACHE_TABLES).not.toContain("DjScript");
    expect(CATALOG_CACHE_TABLES).not.toContain("PlayLog");
  });

  it("builds a narrow truncate statement for catalog cache rebuilds", () => {
    expect(buildCatalogCacheTruncateSql()).toBe(
      'TRUNCATE TABLE "LibraryPodcastEpisode", "LibraryPodcastSeries", "LibrarySnippet", "LibraryTrack" RESTART IDENTITY CASCADE'
    );
  });
});
