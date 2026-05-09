"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiBase } from "@/lib/api";

type AnalysisRefreshButtonProps = {
  disabled?: boolean;
  label?: string;
  runningLabel?: string;
  showStatus?: boolean;
  successMessage?: string;
};

export function AnalysisRefreshButton({
  disabled = false,
  label = "Refresh analysis",
  runningLabel = "Refreshing...",
  showStatus = true,
  successMessage = "Analysis refresh finished. Reloading the board...",
}: AnalysisRefreshButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  const refreshAnalysis = async () => {
    setRunning(true);
    setStatus("");
    try {
      const response = await fetch(`${apiBase}/api/v1/analysis/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Analysis refresh failed (${response.status})`);
      }
      setStatus(successMessage);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Analysis refresh failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={refreshAnalysis} disabled={disabled || running}>
        {running ? runningLabel : label}
      </button>
      {showStatus && status ? (
        <p className="form-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}
