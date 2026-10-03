import assert from "node:assert/strict";
import test from "node:test";
import { resolveCompatibilityAgent } from "./radio-purpose.ts";

test("radio programming and booth purposes reach the registered DJ agent", () => {
  for (const purpose of ["playlist", "playlist-rescue", "talk", "talk-rescue", "track", "track-rescue", "playback-transition-plan", "booth-dossier", "booth-dossier-recovery", "Open set"]) {
    assert.equal(resolveCompatibilityAgent(purpose), "radio-dj", purpose);
  }
});

test("listener, music knowledge, campaign, and generic chat keep their own agents", () => {
  assert.equal(resolveCompatibilityAgent("listener-reply"), "radio-listener");
  assert.equal(resolveCompatibilityAgent("track-intelligence-analysis"), "music-librarian");
  assert.equal(resolveCompatibilityAgent("dm-turn"), "dungeon-master");
  assert.equal(resolveCompatibilityAgent("homepage-chat"), "mr-rassy-host");
});
