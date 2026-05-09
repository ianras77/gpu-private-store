"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AnalysisRefreshButton } from "@/components/AnalysisRefreshButton";
import { apiBase } from "@/lib/api";

export function AdminQuickActions() {
  const router = useRouter();
  const [runningAction, setRunningAction] = useState("");
  const [status, setStatus] = useState("");

  const running = runningAction !== "";

  const postJson = async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Run failed (${response.status})`);
    }
    return (await response.json()) as T;
  };

  const runPipeline = async () => {
    setRunningAction("pipeline");
    setStatus("");
    try {
      await postJson("/api/v1/admin/pipeline/run-now");
      setStatus("Pipeline cycle finished. Refreshing mission control...");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Run failed");
    } finally {
      setRunningAction("");
    }
  };

  const publishReady = async () => {
    setRunningAction("publish-ready");
    setStatus("");
    try {
      const payload = await postJson<{
        published_editorial_count?: number;
        published_social_count?: number;
        homepage_status?: string;
      }>("/api/v1/admin/publish-ready");
      setStatus(
        `Published ${payload.published_editorial_count ?? 0} stories, ${payload.published_social_count ?? 0} social assets, and refreshed the homepage (${payload.homepage_status ?? "draft"}).`,
      );
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Publish-ready run failed");
    } finally {
      setRunningAction("");
    }
  };

  const runBurst = async () => {
    setRunningAction("burst");
    setStatus("");
    try {
      await postJson("/api/v1/admin/pipeline/run-now");
      const payload = await postJson<{
        published_editorial_count?: number;
        published_social_count?: number;
        homepage_status?: string;
      }>("/api/v1/admin/publish-ready");
      setStatus(
        `Burst complete. Published ${payload.published_editorial_count ?? 0} stories, ${payload.published_social_count ?? 0} social assets, and left the homepage ${payload.homepage_status ?? "draft"}.`,
      );
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Burst failed");
    } finally {
      setRunningAction("");
    }
  };

  return (
    <article className="story-panel quick-actions-panel">
      <p className="section-kicker">Quick actions</p>
      <h3>Run the desk from here</h3>
      <p>Kick off a cycle, force a publish-ready packaging pass, or run a full burst that researches, writes, and puts the best package on the site.</p>
      <div className="quick-actions-grid">
        <button type="button" onClick={runPipeline} disabled={running}>
          {runningAction === "pipeline" ? "Running..." : "Run pipeline now"}
        </button>
        <button type="button" onClick={publishReady} disabled={running}>
          {runningAction === "publish-ready" ? "Packaging..." : "Publish ready package"}
        </button>
        <button type="button" onClick={runBurst} disabled={running}>
          {runningAction === "burst" ? "Bursting..." : "Run full burst"}
        </button>
        <AnalysisRefreshButton disabled={running} showStatus={false} />
        <button type="button" onClick={() => router.refresh()} disabled={running}>
          Refresh board
        </button>
        <Link href="/admin/settings" className="button-link muted small">
          Open settings
        </Link>
        <Link href="/admin/analysis" className="button-link muted small">
          Open analysis
        </Link>
        <Link href="/admin/inbox" className="button-link muted small">
          Inspect inbox
        </Link>
        <Link href="/admin/trends" className="button-link muted small">
          Inspect trends
        </Link>
        <Link href="/admin/social" className="button-link muted small">
          Open social studio
        </Link>
      </div>
      {status ? (
        <p className="form-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </article>
  );
}
