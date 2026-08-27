import { describe, expect, it } from "vitest";
import { applyLocalChatIntent } from "./chat-intents";

describe("applyLocalChatIntent", () => {
  it("turns search commands into local UI changes", () => {
    expect(applyLocalChatIntent("/search latest Next.js docs")).toEqual({
      kind: "send",
      prompt: "latest Next.js docs",
      updates: { webSearch: "on" },
      notice: "Web search is lit for this request."
    });
    expect(applyLocalChatIntent("/local explain this function")).toEqual({
      kind: "send",
      prompt: "explain this function",
      updates: { webSearch: "off" },
      notice: "This request will stay local to the room."
    });
  });

  it("changes mode and theme without sending a message", () => {
    expect(applyLocalChatIntent("/mode deep-coding")).toEqual({
      kind: "local",
      updates: { mode: "deep-coding" },
      notice: "Mode changed to deep-coding; the next answer will route through that lane."
    });
    expect(applyLocalChatIntent("/theme ember")).toEqual({
      kind: "local",
      updates: { themeId: "ember" },
      notice: "Atmosphere shifted to ember; the room can keep tuning around the conversation."
    });
  });

  it("supports short RassyMind channel aliases", () => {
    expect(applyLocalChatIntent("/code")).toEqual({
      kind: "local",
      updates: { mode: "deep-coding" },
      notice: "Deep Code is steering the thread."
    });
    expect(applyLocalChatIntent("/fast")).toEqual({
      kind: "local",
      updates: { mode: "fast-coding" },
      notice: "Fast Code channel is active for focused implementation."
    });
    expect(applyLocalChatIntent("/know")).toEqual({
      kind: "local",
      updates: { mode: "knowledge" },
      notice: "Knowledge channel is active; enabled documents can shape the answer."
    });
  });

  it("uses channel aliases as send commands when a prompt follows", () => {
    expect(applyLocalChatIntent("/code draft a patch")).toEqual({
      kind: "send",
      prompt: "draft a patch",
      updates: { mode: "deep-coding" },
      notice: "Deep Code is steering the thread."
    });
    expect(applyLocalChatIntent("/know compare these notes")).toEqual({
      kind: "send",
      prompt: "compare these notes",
      updates: { mode: "knowledge" },
      notice: "Knowledge channel is active; enabled documents can shape the answer."
    });
  });
});
