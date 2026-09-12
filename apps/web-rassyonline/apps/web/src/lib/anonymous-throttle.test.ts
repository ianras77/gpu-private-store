import { describe, expect, it } from "vitest";
import { checkAnonymousThrottle } from "./anonymous-throttle";

describe("anonymous chat throttle", () => {
  it("allows five requests and rejects the sixth within a window", () => {
    const request = new Request("https://rassy.online/api/mastra/chat", { headers: { "x-forwarded-for": "198.51.100.42", "user-agent": "test-browser" } });
    for (let index = 0; index < 5; index += 1) expect(checkAnonymousThrottle(request, 1000)).toEqual({ allowed: true, retryAfter: 0 });
    expect(checkAnonymousThrottle(request, 1001)).toMatchObject({ allowed: false });
  });

  it("resets after the window", () => {
    const request = new Request("https://rassy.online/api/mastra/chat", { headers: { "x-forwarded-for": "198.51.100.43", "user-agent": "test-browser" } });
    for (let index = 0; index < 5; index += 1) checkAnonymousThrottle(request, 2000);
    expect(checkAnonymousThrottle(request, 62_001)).toEqual({ allowed: true, retryAfter: 0 });
  });
});
