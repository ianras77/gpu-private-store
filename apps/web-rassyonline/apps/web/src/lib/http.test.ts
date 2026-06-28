import { describe, expect, test } from "vitest";
import { getRequestOrigin } from "./http";

describe("getRequestOrigin", () => {
  test("uses forwarded host and proto before internal request url", () => {
    const headers = new Headers({
      "x-forwarded-host": "rassy.online",
      "x-forwarded-proto": "https",
      host: "0.0.0.0:3000"
    });

    expect(getRequestOrigin(headers, "http://0.0.0.0:3000/api/auth/logout")).toBe("https://rassy.online");
  });

  test("uses host header when forwarded host is absent", () => {
    const headers = new Headers({ host: "127.0.0.1:3199" });

    expect(getRequestOrigin(headers, "http://0.0.0.0:3000/api/auth/logout")).toBe("http://127.0.0.1:3199");
  });
});
