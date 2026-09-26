import assert from "node:assert/strict";

process.env.DM_JWT_SECRET = "radio-chat-test-secret-0123456789-unique";
const { createRadioChatIdentity, readRadioChatIdentity } = await import("../src/lib/radio-chat-identity.ts");

const first = createRadioChatIdentity();
const second = createRadioChatIdentity();
assert.notEqual(first.id, second.id);
assert.equal(readRadioChatIdentity(first.cookie), first.id);
assert.equal(readRadioChatIdentity(second.cookie), second.id);
assert.equal(readRadioChatIdentity(first.cookie.replace(first.id, second.id)), null);
assert.equal(readRadioChatIdentity(second.id), null);
assert.equal(readRadioChatIdentity(undefined), null);
console.log("Radio chat visitor signatures and isolation passed");
