import { describe, expect, test } from "vitest";
import { buildHealthReport } from "./runtipi-health";

describe("buildHealthReport", () => {
  test("reports stage one readiness when required runtime settings are present", () => {
    const report = buildHealthReport({
      RASSY_ONLINE_PUBLIC_BASE_URL: "https://rassy.online",
      RASSYCODEX_BASE_URL: "http://host.docker.internal:8844",
      DATABASE_URL: "postgresql://rassy:secret@postgres:5432/rassy_online",
      QDRANT_URL: "http://rassy-online-qdrant:6333",
      RASSY_ONLINE_UPLOAD_ROOT: "/data/uploads"
    });

    expect(report.ok).toBe(true);
    expect(report.stage).toBe("stage-1-runtipi-skeleton");
    expect(report.dependencies.rassycodex.configured).toBe(true);
    expect(report.dependencies.database.configured).toBe(true);
    expect(report.dependencies.database.target).toBe("postgresql://rassy:***@postgres:5432/rassy_online");
    expect(report.dependencies.qdrant.configured).toBe(true);
    expect(report.missing).toEqual([]);
  });

  test("lists missing required runtime settings", () => {
    const report = buildHealthReport({});

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([
      "RASSY_ONLINE_PUBLIC_BASE_URL",
      "RASSYCODEX_BASE_URL",
      "DATABASE_URL",
      "QDRANT_URL",
      "RASSY_ONLINE_UPLOAD_ROOT"
    ]);
  });
});
