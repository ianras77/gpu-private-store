"use client";

import { useEffect, useState } from "react";

interface UserProfile {
  user_id: string;
  display_name: string;
  registered: boolean;
}

interface DatasetResponse {
  datasets?: Array<{ dataset_id: string }>;
}

const IDENTITY_STORAGE_KEY = "crackstack.user.identity";

export function LandingStatus() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("user_demo");
  const [datasetCount, setDatasetCount] = useState<number>(0);
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let userId = "user_demo";
        const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as { user_id?: string };
          if (stored.user_id?.trim()) {
            userId = stored.user_id.trim();
          }
        }
        const [userRes, datasetsRes] = await Promise.all([
          fetch("/api/users/me", { headers: { "X-User-Id": userId } }),
          fetch("/api/datasets"),
        ]);
        if (!userRes.ok || !datasetsRes.ok) {
          throw new Error("Backend routes are not reachable.");
        }
        const user = (await userRes.json()) as UserProfile;
        const datasets = (await datasetsRes.json()) as DatasetResponse;
        setUserLabel(user.registered ? `${user.display_name} (${user.user_id})` : user.user_id);
        setDatasetCount(datasets.datasets?.length ?? 0);
        setBackendReady(true);
      } catch (err: any) {
        setBackendReady(false);
        setError(err.message || "Could not check backend readiness.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <section className="panel runbook">
      <div className="panel-header">
        <h2>Live Backend Readiness</h2>
        <span className="chip">{backendReady ? "connected" : "offline"}</span>
      </div>
      {loading ? (
        <p className="muted">Checking user profile and dataset routes...</p>
      ) : (
        <div className="checklist">
          <div className="check">User context: {userLabel}</div>
          <div className="check">Datasets visible: {datasetCount}</div>
          <div className="check">Workspace route: /playground</div>
          <div className="check">Process route: upload to analyze to preview to approve to run to download</div>
        </div>
      )}
      {error && <p className="muted">{error}</p>}
    </section>
  );
}
