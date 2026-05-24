import assert from "node:assert/strict";
import { shouldRefreshGammaCompendium } from "./reference-seed";

assert.equal(shouldRefreshGammaCompendium({ existingCount: 0, expectedCount: 4 }), true);
assert.equal(shouldRefreshGammaCompendium({ existingCount: 4, expectedCount: 4 }), false);
assert.equal(shouldRefreshGammaCompendium({ existingCount: 4, expectedCount: 128 }), true);
assert.equal(shouldRefreshGammaCompendium({ existingCount: 200, expectedCount: 128 }), false);

console.log("DM reference seed policy ok");
