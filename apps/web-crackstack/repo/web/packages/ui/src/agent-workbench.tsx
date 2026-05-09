"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface ToolEvent {
  type: "tool_call";
  name: string;
  arguments: string;
  result: Record<string, any>;
}

interface AssistantEvent {
  type: "assistant";
  content: string;
}

type AgentEvent = ToolEvent | AssistantEvent;

interface DatasetInfo {
  dataset_id: string;
  name?: string;
  description?: string;
  rows?: number;
}

interface SchemaRow {
  name: string;
  type: string;
  nulls: number;
  distinct: number;
}

interface ProfileRow {
  name: string;
  nulls: number;
  top_values: Array<[string, number]>;
}

interface PreviewInfo {
  before_rows: number;
  after_rows: number;
  row_delta_pct: number;
  risk_flags?: string[];
}

interface RunResult {
  dataset_id: string;
  version_id: string;
  row_count: number;
}

interface ExportResult {
  dataset_id: string;
  version_id: string;
  row_count: number;
  table: string;
  schema: string;
}

interface WorkstreamInfo {
  workstream_id: string;
  user_id: string;
  name: string;
  description?: string;
  recipe_steps: Record<string, any>[];
  match_signature: Record<string, any>;
}

interface WorkstreamMatch {
  workstream_id: string;
  name: string;
  score: number;
  matched_columns: number;
  required_columns: number;
}

interface WorkstreamRecommendation {
  recommendation_id: string;
  name: string;
  summary: string;
  confidence: number;
  rationale: string[];
  suggested_steps: Record<string, any>[];
  output_targets: string[];
  prompt_hint: string;
}

interface WorkstreamRunInfo {
  run_id: string;
  output_version_id?: string;
  row_count?: number;
  status: string;
}

interface UserProfileInfo {
  user_id: string;
  display_name: string;
  registered: boolean;
}

export interface AgentWorkbenchProps {
  brand: "xlcrack" | "tapecrack";
  defaultPrompt: string;
  modeChipLabel: string;
  promptTagLabel: string;
  runButtonLabel: string;
  uploadNamePlaceholder: string;
  uploadDescriptionPlaceholder: string;
}

const ANALYZE_PROMPT = "Get schema, sample rows, and column profiles for the dataset.";
const IDENTITY_STORAGE_KEY = "crackstack.user.identity";

export function AgentWorkbench({
  brand,
  defaultPrompt,
  modeChipLabel,
  promptTagLabel,
  runButtonLabel,
  uploadNamePlaceholder,
  uploadDescriptionPlaceholder,
}: AgentWorkbenchProps) {
  const [userId, setUserId] = useState("user_demo");
  const [userIdInput, setUserIdInput] = useState("user_demo");
  const [displayName, setDisplayName] = useState("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileInfo | null>(null);
  const [identityHydrated, setIdentityHydrated] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [schema, setSchema] = useState<SchemaRow[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [steps, setSteps] = useState<Record<string, any>[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [riskFlags, setRiskFlags] = useState<string[]>([]);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string>("");
  const [toolLog, setToolLog] = useState<ToolEvent[]>([]);
  const [prompt, setPrompt] = useState<string>(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string>("");
  const [uploadDescription, setUploadDescription] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sqlServerEnabled, setSqlServerEnabled] = useState<boolean | null>(null);
  const [exportHost, setExportHost] = useState("localhost");
  const [exportPort, setExportPort] = useState(1433);
  const [exportDatabase, setExportDatabase] = useState("");
  const [exportUsername, setExportUsername] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [exportSchema, setExportSchema] = useState("dbo");
  const [exportTable, setExportTable] = useState("");
  const [exportIfExists, setExportIfExists] = useState<"fail" | "replace" | "append">(
    "fail"
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [workstreamName, setWorkstreamName] = useState("Revenue Crack Stream");
  const [workstreamDescription, setWorkstreamDescription] = useState("");
  const [workstreams, setWorkstreams] = useState<WorkstreamInfo[]>([]);
  const [workstreamMatches, setWorkstreamMatches] = useState<WorkstreamMatch[]>([]);
  const [recommendations, setRecommendations] = useState<WorkstreamRecommendation[]>([]);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string>("");
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState<string>("");
  const [workstreamRun, setWorkstreamRun] = useState<WorkstreamRunInfo | null>(null);
  const [workstreamLoading, setWorkstreamLoading] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [workstreamSaving, setWorkstreamSaving] = useState(false);
  const [workstreamRunning, setWorkstreamRunning] = useState(false);
  const [workstreamError, setWorkstreamError] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  const applyEvents = useCallback((events: AgentEvent[]) => {
    const tools: ToolEvent[] = [];
    events.forEach((event) => {
      if (event.type === "assistant") {
        setAssistantMessage(event.content);
        return;
      }
      tools.push(event);
      if (event.name === "list_datasets") {
        const nextDatasets = event.result.datasets || [];
        setDatasets(nextDatasets);
        if (nextDatasets.length > 0) {
          setDataset((prev) => {
            const active = prev?.dataset_id;
            const next = active
              ? nextDatasets.find((item: DatasetInfo) => item.dataset_id === active) ??
                nextDatasets[0]
              : nextDatasets[0];
            return next ?? null;
          });
        }
      }
      if (event.name === "get_schema") {
        setSchema(event.result.schema || []);
      }
      if (event.name === "sample_rows") {
        setSampleRows(event.result.rows || []);
      }
      if (event.name === "profile_columns") {
        setProfiles(event.result.profiles || []);
      }
      if (event.name === "propose_recipe") {
        setSteps(event.result.recipe?.steps || []);
        setRiskFlags(event.result.risk_flags || []);
      }
      if (event.name === "validate_recipe") {
        setValidationWarnings(event.result.warnings || []);
        setRiskFlags(event.result.risk_flags || []);
      }
      if (event.name === "preview_recipe") {
        setPreview(event.result.preview || null);
        setRiskFlags(event.result.preview?.risk_flags || []);
      }
      if (event.name === "request_approval") {
        setApprovalToken(event.result.approval_token || null);
      }
      if (event.name === "run_recipe") {
        setRunResult(event.result.result || null);
        const nextRows = event.result.result?.row_count;
        if (nextRows) {
          setDataset((prev) => (prev ? { ...prev, rows: nextRows } : prev));
        }
      }
      if (event.name === "list_workstreams") {
        setWorkstreams(event.result.workstreams || []);
      }
      if (event.name === "recommend_workstreams") {
        setRecommendations(event.result.recommendations || []);
        setRecommendationError(null);
      }
      if (event.name === "recognize_workstreams") {
        setWorkstreamMatches(event.result.matches || []);
      }
      if (event.name === "save_workstream") {
        const item = event.result.workstream;
        if (item?.workstream_id) {
          setWorkstreams((prev) => [item, ...prev.filter((ws) => ws.workstream_id !== item.workstream_id)]);
          setSelectedWorkstreamId(item.workstream_id);
        }
      }
      if (event.name === "run_workstream") {
        const run = event.result.run;
        const result = event.result.result;
        if (run) {
          setWorkstreamRun({
            run_id: run.run_id,
            output_version_id: result?.version_id,
            row_count: result?.row_count,
            status: run.status || "completed",
          });
        }
      }
    });
    if (tools.length) {
      setToolLog((prev) => [...prev, ...tools].slice(-30));
    }
  }, []);

  const sendPrompt = useCallback(
    async (activeThreadId: string, message: string, activeDatasetId?: string) => {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({
          thread_id: activeThreadId,
          message,
          dataset_id: activeDatasetId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Agent call failed");
      }
      applyEvents(data.events || []);
    },
    [applyEvents, userId]
  );

  const runPrompt = useCallback(
    async (message: string, overrideThreadId?: string, overrideDatasetId?: string) => {
      const activeThreadId = overrideThreadId ?? threadId;
      if (!activeThreadId) return;
      setLoading(true);
      setError(null);
      try {
        await sendPrompt(activeThreadId, message, overrideDatasetId ?? dataset?.dataset_id);
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [dataset?.dataset_id, sendPrompt, threadId]
  );

  const loadUserProfile = useCallback(
    async (activeUserId: string) => {
      const response = await fetch("/api/users/me", {
        headers: { "X-User-Id": activeUserId },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to load user profile");
      }
      setUserProfile(data as UserProfileInfo);
      if ((data as UserProfileInfo).registered) {
        setDisplayName((data as UserProfileInfo).display_name || activeUserId);
        setIdentityStatus(`Signed in as ${(data as UserProfileInfo).display_name}`);
      } else {
        setIdentityStatus(`Using ${activeUserId} (not signed up yet)`);
      }
    },
    []
  );

  const applyUser = useCallback(() => {
    const nextUserId = userIdInput.trim() || "user_demo";
    setUserIdInput(nextUserId);
    setUserId(nextUserId);
    setIdentityError(null);
    setIdentityStatus(`Using ${nextUserId}`);
    localStorage.setItem(
      IDENTITY_STORAGE_KEY,
      JSON.stringify({ user_id: nextUserId, display_name: displayName || nextUserId })
    );
  }, [displayName, userIdInput]);

  const handleSignup = useCallback(async () => {
    const nextUserId = userIdInput.trim() || "user_demo";
    setIdentitySaving(true);
    setIdentityError(null);
    setIdentityStatus(null);
    try {
      if (nextUserId !== userId) {
        setUserId(nextUserId);
      }
      const response = await fetch("/api/users/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": nextUserId,
        },
        body: JSON.stringify({
          display_name: displayName.trim() || nextUserId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Signup failed");
      }
      const profile = data as UserProfileInfo;
      setUserProfile(profile);
      setDisplayName(profile.display_name);
      setIdentityStatus(`Signed up as ${profile.display_name}`);
      localStorage.setItem(
        IDENTITY_STORAGE_KEY,
        JSON.stringify({ user_id: nextUserId, display_name: profile.display_name })
      );
    } catch (err: any) {
      setIdentityError(err.message || "Signup failed");
    } finally {
      setIdentitySaving(false);
    }
  }, [displayName, userId, userIdInput]);

  const loadWorkstreams = useCallback(async () => {
    setWorkstreamLoading(true);
    setWorkstreamError(null);
    try {
      const response = await fetch("/api/workstreams", {
        headers: { "X-User-Id": userId },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to load workstreams");
      }
      setWorkstreams(data.workstreams || []);
    } catch (err: any) {
      setWorkstreamError(err.message || "Failed to load workstreams");
    } finally {
      setWorkstreamLoading(false);
    }
  }, [userId]);

  const handleRecognizeWorkstreams = useCallback(async () => {
    if (!dataset) {
      setWorkstreamError("Select a dataset first.");
      return;
    }
    setWorkstreamLoading(true);
    setWorkstreamError(null);
    try {
      const response = await fetch("/api/workstreams/recognize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({ dataset_id: dataset.dataset_id, min_score: 0.5, limit: 5 }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to recognize workstreams");
      }
      setWorkstreamMatches(data.matches || []);
    } catch (err: any) {
      setWorkstreamError(err.message || "Failed to recognize workstreams");
    } finally {
      setWorkstreamLoading(false);
    }
  }, [dataset, userId]);

  const handleSaveWorkstream = useCallback(async () => {
    if (!dataset) {
      setWorkstreamError("Select a dataset first.");
      return;
    }
    if (!steps.length) {
      setWorkstreamError("Generate a recipe before saving a workstream.");
      return;
    }
    setWorkstreamSaving(true);
    setWorkstreamError(null);
    try {
      const response = await fetch("/api/workstreams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({
          dataset_id: dataset.dataset_id,
          name: workstreamName.trim() || "Saved Crack Stream",
          description: workstreamDescription.trim() || null,
          steps,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to save workstream");
      }
      const created = data as WorkstreamInfo;
      setWorkstreams((prev) => [created, ...prev.filter((ws) => ws.workstream_id !== created.workstream_id)]);
      setSelectedWorkstreamId(created.workstream_id);
    } catch (err: any) {
      setWorkstreamError(err.message || "Failed to save workstream");
    } finally {
      setWorkstreamSaving(false);
    }
  }, [dataset, steps, userId, workstreamDescription, workstreamName]);

  const handleRecommendWorkstreams = useCallback(async () => {
    if (!dataset) {
      setRecommendationError("Select a dataset first.");
      return;
    }
    setRecommendationLoading(true);
    setRecommendationError(null);
    try {
      const response = await fetch("/api/workstreams/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({ dataset_id: dataset.dataset_id, limit: 4 }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to generate recommendations");
      }
      const items = (data.recommendations || []) as WorkstreamRecommendation[];
      setRecommendations(items);
      if (items.length) {
        setSelectedRecommendationId(items[0].recommendation_id);
      }
    } catch (err: any) {
      setRecommendationError(err.message || "Failed to generate recommendations");
    } finally {
      setRecommendationLoading(false);
    }
  }, [dataset, userId]);

  const handleRunSavedWorkstream = useCallback(async () => {
    if (!dataset) {
      setWorkstreamError("Select a dataset first.");
      return;
    }
    if (!selectedWorkstreamId) {
      setWorkstreamError("Select a saved workstream.");
      return;
    }
    setWorkstreamRunning(true);
    setWorkstreamError(null);
    try {
      const response = await fetch(`/api/workstreams/${selectedWorkstreamId}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({ dataset_id: dataset.dataset_id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to run workstream");
      }
      setWorkstreamRun({
        run_id: data.run_id,
        output_version_id: data.output_version_id,
        row_count: data.row_count,
        status: data.status,
      });
      if (data.row_count) {
        setDataset((prev) => (prev ? { ...prev, rows: data.row_count } : prev));
      }
    } catch (err: any) {
      setWorkstreamError(err.message || "Failed to run workstream");
    } finally {
      setWorkstreamRunning(false);
    }
  }, [dataset, selectedWorkstreamId, userId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as { user_id?: string; display_name?: string };
      if (stored.user_id) {
        setUserId(stored.user_id);
        setUserIdInput(stored.user_id);
      }
      if (stored.display_name) {
        setDisplayName(stored.display_name);
      }
    } catch {
      // best effort only
    } finally {
      setIdentityHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!identityHydrated) return;
    const init = async () => {
      setLoading(true);
      try {
        await loadUserProfile(userId);
        const response = await fetch("/api/agent/threads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": userId,
          },
          body: JSON.stringify({ brand }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Failed to create thread");
        }
        setThreadId(data.thread_id);
        if (data.dataset_id) {
          setDataset({ dataset_id: data.dataset_id, name: data.dataset_id });
        }
        await sendPrompt(data.thread_id, ANALYZE_PROMPT, data.dataset_id);
        await loadWorkstreams();
      } catch (err: any) {
        setError(err.message || "Failed to initialize");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [brand, identityHydrated, loadUserProfile, loadWorkstreams, sendPrompt, userId]);

  useEffect(() => {
    const checkSqlServer = async () => {
      try {
        const response = await fetch("/api/datasets/sqlserver/status");
        const data = await response.json();
        setSqlServerEnabled(Boolean(data.enabled));
      } catch {
        setSqlServerEnabled(null);
      }
    };
    checkSqlServer();
  }, []);

  useEffect(() => {
    if (!threadId) return;
    loadWorkstreams();
  }, [loadWorkstreams, threadId]);

  useEffect(() => {
    if (!dataset) return;
    const baseName = dataset.name || dataset.dataset_id;
    const sanitized = baseName
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    setExportTable((prev) => (prev ? prev : sanitized || "dataset_export"));
    setExportResult(null);
    setExportError(null);
    setDownloadError(null);
    setRecommendations([]);
    setSelectedRecommendationId("");
    setRecommendationError(null);
    setWorkstreamMatches([]);
    setWorkstreamRun(null);
  }, [dataset]);

  const resetWorkflow = () => {
    setSchema([]);
    setSampleRows([]);
    setProfiles([]);
    setSteps([]);
    setValidationWarnings([]);
    setPreview(null);
    setRiskFlags([]);
    setApprovalToken(null);
    setRunResult(null);
    setAssistantMessage("");
    setToolLog([]);
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError("Select a CSV, TXT, or XLSX file to upload.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setExportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      if (uploadName) formData.append("name", uploadName);
      if (uploadDescription) formData.append("description", uploadDescription);

      const response = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }
      const nextDataset = {
        dataset_id: data.dataset_id,
        name: data.name,
        description: uploadDescription || undefined,
        rows: data.row_count,
      } satisfies DatasetInfo;
      setDataset(nextDataset);
      setDatasets((prev) => [nextDataset, ...prev.filter((item) => item.dataset_id !== data.dataset_id)]);
      resetWorkflow();
      if (threadId) {
        await runPrompt(ANALYZE_PROMPT, threadId, data.dataset_id);
      }
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDatasetSelect = async (datasetId: string) => {
    const selected = datasets.find((item) => item.dataset_id === datasetId) ?? null;
    setDataset(selected);
    resetWorkflow();
    if (selected && threadId) {
      await runPrompt(ANALYZE_PROMPT, threadId, selected.dataset_id);
    }
  };

  const handleExport = async () => {
    if (!dataset) {
      setExportError("Upload or select a dataset first.");
      return;
    }
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const response = await fetch(`/api/datasets/${dataset.dataset_id}/export/sqlserver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: exportHost,
          port: exportPort,
          database: exportDatabase,
          username: exportUsername,
          password: exportPassword,
          schema: exportSchema,
          table: exportTable,
          if_exists: exportIfExists,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Export failed");
      }
      setExportResult(data);
    } catch (err: any) {
      setExportError(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!dataset) {
      setDownloadError("Upload or select a dataset first.");
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch(`/api/datasets/${dataset.dataset_id}/download`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Download failed");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const matched = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = matched?.[1] || `${dataset.dataset_id}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const revenueNulls = useMemo(() => schema.find((col) => col.name === "revenue")?.nulls, [schema]);
  const dateDistinct = useMemo(() => schema.find((col) => col.name === "invoice_date")?.distinct, [schema]);
  const regionDistinct = useMemo(() => schema.find((col) => col.name === "region")?.distinct, [schema]);
  const regionProfile = useMemo(
    () => profiles.find((col) => col.name === "region")?.top_values ?? [],
    [profiles]
  );

  const inferRiskFlagsFromSteps = useCallback((nextSteps: Record<string, any>[]): string[] => {
    const flags = new Set<string>();
    nextSteps.forEach((step) => {
      const stepType = String(step.type || "").toLowerCase();
      if (stepType === "filter" || stepType === "drop" || stepType === "delete") {
        flags.add("row_deletion");
      }
      if (stepType === "cast" || stepType === "normalize_dates") {
        flags.add("type_change");
      }
    });
    return Array.from(flags);
  }, []);

  const buildGuidedPrompt = useCallback((recommendation: WorkstreamRecommendation): string => {
    const stepHints = recommendation.suggested_steps.map((step) => {
      const stepType = String(step.type || "");
      if (stepType === "normalize_dates" && step.column) {
        return `Normalize dates in ${step.column}.`;
      }
      if (stepType === "map_values" && step.column) {
        return `Map aliases in ${step.column} using ${step.map || "a canonical mapping"}.`;
      }
      if (stepType === "filter" && step.expr) {
        return `Filter rows using ${step.expr}.`;
      }
      return `Apply ${stepType}.`;
    });
    const summary = stepHints.length ? stepHints.join(" ") : "Profile schema and infer safest cleanup steps.";
    return `Use template "${recommendation.name}". ${summary} Preview impact, validate warnings, and request approval before run.`;
  }, []);

  const applyRecommendation = useCallback(
    (recommendation: WorkstreamRecommendation) => {
      const nextSteps = recommendation.suggested_steps || [];
      setSelectedRecommendationId(recommendation.recommendation_id);
      setSteps(nextSteps);
      setRiskFlags(inferRiskFlagsFromSteps(nextSteps));
      setValidationWarnings([]);
      setPreview(null);
      setRunResult(null);
      setApprovalToken(null);
      setPrompt(buildGuidedPrompt(recommendation));
      setWorkstreamName(`${recommendation.name} Stream`);
    },
    [buildGuidedPrompt, inferRiskFlagsFromSteps]
  );

  const runGuidedRecommendation = useCallback(
    async (recommendation: WorkstreamRecommendation) => {
      if (!dataset) {
        setRecommendationError("Select a dataset first.");
        return;
      }
      const guidedPrompt = buildGuidedPrompt(recommendation);
      applyRecommendation(recommendation);
      await runPrompt(guidedPrompt, undefined, dataset.dataset_id);
    },
    [applyRecommendation, buildGuidedPrompt, dataset, runPrompt]
  );

  const runRecipe = async () => {
    if (!approvalToken) return;
    await runPrompt(`Use approval token ${approvalToken} and run the recipe steps now.`);
  };

  return (
    <>
      <section className="toolbar">
        <div className="dataset-pill">
          <span className="tag">Dataset</span>
          <strong>{dataset?.name || dataset?.dataset_id || "Loading"}</strong>
          <span className="chip">{dataset?.rows || preview?.before_rows || "—"} rows</span>
          <span className="chip">{modeChipLabel}</span>
        </div>
        <div className="toolbar-actions">
          <label className="field" style={{ minWidth: 180 }}>
            <span>User ID</span>
            <input
              value={userIdInput}
              onChange={(event) => setUserIdInput(event.target.value)}
              placeholder="user_demo"
            />
          </label>
          <label className="field" style={{ minWidth: 180 }}>
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Data Analyst"
            />
          </label>
          <button className="button ghost" onClick={applyUser} disabled={loading}>
            Switch user
          </button>
          <button className="button ghost" onClick={handleSignup} disabled={identitySaving}>
            {identitySaving ? "Saving user…" : "Sign up once"}
          </button>
          <button className="button ghost" onClick={() => runPrompt("List datasets again.")}>
            Refresh
          </button>
          <button className="button primary" onClick={() => runPrompt(prompt)} disabled={loading}>
            {loading ? "Running…" : "Run preview"}
          </button>
        </div>
      </section>

      {error && <div className="panel error">{error}</div>}
      {identityError && <div className="panel error">{identityError}</div>}
      {identityStatus && (
        <div className="panel-callout">
          <span className="tag">User profile</span>
          <p>
            {identityStatus}
            {userProfile?.registered ? ` · id ${userProfile.user_id}` : ""}
          </p>
        </div>
      )}

      <section className="panel upload-panel">
        <div className="panel-header">
          <span className="tag">Upload</span>
          <span className="chip">CSV · TXT · XLSX</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Dataset name</span>
            <input
              value={uploadName}
              onChange={(event) => setUploadName(event.target.value)}
              placeholder={uploadNamePlaceholder}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <input
              value={uploadDescription}
              onChange={(event) => setUploadDescription(event.target.value)}
              placeholder={uploadDescriptionPlaceholder}
            />
          </label>
          <label className="field">
            <span>Active dataset</span>
            <select value={dataset?.dataset_id ?? ""} onChange={(event) => handleDatasetSelect(event.target.value)}>
              <option value="">Select dataset</option>
              {datasets.map((item) => (
                <option key={item.dataset_id} value={item.dataset_id}>
                  {item.name || item.dataset_id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="upload">
          <div>
            <strong>{uploadFile?.name || "Drop a file or browse"}</strong>
            <p className="muted">CSV, TXT, TSV, or Excel</p>
          </div>
          <input
            type="file"
            accept=".csv,.txt,.tsv,.xls,.xlsx"
            onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
          />
        </div>
        <div className="panel-actions">
          <button className="button primary" onClick={handleUpload} disabled={uploading || !uploadFile}>
            {uploading ? "Uploading…" : "Upload dataset"}
          </button>
          <button
            className="button ghost"
            onClick={() =>
              dataset
                ? runPrompt(ANALYZE_PROMPT, threadId ?? undefined, dataset.dataset_id)
                : null
            }
            disabled={!dataset || loading}
          >
            Analyze dataset
          </button>
        </div>
        {uploadError && <div className="panel error">{uploadError}</div>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <span className="tag">Guided Templates</span>
          <span className="chip">{recommendations.length} recommendations</span>
        </div>
        <p className="muted">
          Keep UI simple: detect the best stream from your real file, apply, then run guided preview/approval.
        </p>
        <div className="panel-actions">
          <button
            className="button primary"
            onClick={handleRecommendWorkstreams}
            disabled={recommendationLoading || !dataset}
          >
            {recommendationLoading ? "Detecting…" : "Detect template recommendations"}
          </button>
          <button
            className="button ghost"
            onClick={() =>
              runPrompt("Recommend the best template for this dataset and explain why.")
            }
            disabled={loading || !dataset}
          >
            Ask agent for recommendations
          </button>
        </div>
        {recommendations.length ? (
          <div className="recommendation-grid">
            {recommendations.map((recommendation) => (
              <article
                key={recommendation.recommendation_id}
                className={`recommendation-card ${
                  selectedRecommendationId === recommendation.recommendation_id ? "active" : ""
                }`}
              >
                <div className="recommendation-head">
                  <strong>{recommendation.name}</strong>
                  <span className="chip">{Math.round(recommendation.confidence * 100)}% fit</span>
                </div>
                <p>{recommendation.summary}</p>
                <ul className="profile-list">
                  {recommendation.rationale.slice(0, 3).map((line) => (
                    <li key={line}>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="recommendation-actions">
                  <button
                    className="button ghost"
                    onClick={() => applyRecommendation(recommendation)}
                  >
                    Use template
                  </button>
                  <button
                    className="button primary"
                    onClick={() => runGuidedRecommendation(recommendation)}
                    disabled={loading}
                  >
                    {loading && selectedRecommendationId === recommendation.recommendation_id
                      ? "Running…"
                      : "Run guided flow"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-callout">
            <span className="tag">No recommendations yet</span>
            <p>Upload/select a dataset and click detect to create agentic template options.</p>
          </div>
        )}
        {recommendationError && <div className="panel error">{recommendationError}</div>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <span className="tag">Saved Workstreams</span>
          <span className="chip">{workstreams.length} streams</span>
        </div>
        <p className="muted">
          Save modular crack streams per user, recognize known templates on new datasets, and rerun.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Stream name</span>
            <input
              value={workstreamName}
              onChange={(event) => setWorkstreamName(event.target.value)}
              placeholder="Revenue Crack Stream"
            />
          </label>
          <label className="field">
            <span>Description</span>
            <input
              value={workstreamDescription}
              onChange={(event) => setWorkstreamDescription(event.target.value)}
              placeholder="Known incoming CSV feed"
            />
          </label>
          <label className="field">
            <span>Saved stream</span>
            <select
              value={selectedWorkstreamId}
              onChange={(event) => setSelectedWorkstreamId(event.target.value)}
            >
              <option value="">Select workstream</option>
              {workstreams.map((stream) => (
                <option key={stream.workstream_id} value={stream.workstream_id}>
                  {stream.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="panel-actions">
          <button
            className="button primary"
            onClick={handleSaveWorkstream}
            disabled={workstreamSaving || !dataset || !steps.length}
          >
            {workstreamSaving ? "Saving…" : "Save stream"}
          </button>
          <button
            className="button ghost"
            onClick={handleRecognizeWorkstreams}
            disabled={workstreamLoading || !dataset}
          >
            {workstreamLoading ? "Matching…" : "Recognize stream"}
          </button>
          <button className="button ghost" onClick={loadWorkstreams} disabled={workstreamLoading}>
            Refresh streams
          </button>
          <button
            className="button ghost"
            onClick={handleRunSavedWorkstream}
            disabled={workstreamRunning || !dataset || !selectedWorkstreamId}
          >
            {workstreamRunning ? "Running…" : "Run selected stream"}
          </button>
        </div>
        {workstreamMatches.length ? (
          <div className="panel-callout">
            <span className="tag">Template matches</span>
            <ul className="profile-list">
              {workstreamMatches.map((match) => (
                <li key={match.workstream_id}>
                  <span>
                    {match.name} ({match.workstream_id})
                  </span>
                  <span className="muted">
                    score {Math.round(match.score * 100)}% · {match.matched_columns}/
                    {match.required_columns} cols
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {workstreamRun ? (
          <div className="panel-callout">
            <span className="tag">Workstream run</span>
            <p>
              {workstreamRun.run_id} · {workstreamRun.status}
              {workstreamRun.output_version_id ? ` · ${workstreamRun.output_version_id}` : ""}
              {typeof workstreamRun.row_count === "number" ? ` · ${workstreamRun.row_count} rows` : ""}
            </p>
          </div>
        ) : null}
        {workstreamError && <div className="panel error">{workstreamError}</div>}
      </section>

      <section className="workbench">
        <div className="panel column">
          <div className="panel-header">
            <span className="tag">Data context</span>
            <span className="chip">live schema</span>
          </div>
          <div className="metric-grid">
            <div className="metric">
              <span>Null revenue</span>
              <strong>{revenueNulls ?? "—"}</strong>
            </div>
            <div className="metric">
              <span>Distinct dates</span>
              <strong>{dateDistinct ?? "—"}</strong>
            </div>
            <div className="metric">
              <span>Distinct regions</span>
              <strong>{regionDistinct ?? "—"}</strong>
            </div>
          </div>
          <div className="schema">
            <div className="schema-row header">
              <span>Column</span>
              <span>Type</span>
              <span>Nulls</span>
            </div>
            {schema.length ? (
              schema.map((col) => (
                <div className="schema-row" key={col.name}>
                  <span>{col.name}</span>
                  <span>{col.type}</span>
                  <span>{col.nulls}</span>
                </div>
              ))
            ) : (
              <div className="schema-row">
                <span>Loading schema…</span>
                <span>—</span>
                <span>—</span>
              </div>
            )}
          </div>
          {regionProfile.length ? (
            <div className="panel-callout">
              <span className="tag">Top regions</span>
              <ul className="profile-list">
                {regionProfile.map(([value, count]) => (
                  <li key={value}>
                    <span>{value}</span>
                    <span className="muted">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="sample">
            <div className="panel-header">
              <span className="tag">Sample rows</span>
              <span className="chip">tool: sample_rows</span>
            </div>
            <div className="table">
              <div className="row header">
                {schema.slice(0, 3).map((col) => (
                  <span key={col.name}>{col.name}</span>
                ))}
              </div>
              {sampleRows.slice(0, 3).map((row, index) => (
                <div className="row" key={index}>
                  {schema.slice(0, 3).map((col) => (
                    <span key={col.name}>{row[col.name] ?? "—"}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel column">
          <div className="panel-header">
            <span className="tag">Recipe builder</span>
            <span className="chip">tool: propose_recipe</span>
          </div>
          <div className="step-list">
            {steps.length ? (
              steps.map((step, index) => (
                <div className="step" key={index}>
                  <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.type}</strong>
                    <p>{step.column || step.expr || "Configured"}</p>
                  </div>
                  <span className={`chip ${riskFlags.includes("row_deletion") ? "warning" : ""}`}>
                    {step.type}
                  </span>
                </div>
              ))
            ) : (
              <div className="step">
                <span className="step-index">—</span>
                <div>
                  <strong>No recipe yet</strong>
                  <p>Run a preview to generate steps.</p>
                </div>
                <span className="chip">waiting</span>
              </div>
            )}
          </div>
          <div className="panel-callout">
            <span className="tag">{promptTagLabel}</span>
            <textarea className="prompt-box" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            <div className="prompt-actions">
              <button className="button primary" onClick={() => runPrompt(prompt)} disabled={loading}>
                {loading ? "Running…" : "Run preview"}
              </button>
            </div>
          </div>
          <div className="panel-header">
            <span className="tag">Validation</span>
            <span className="chip">tool: validate_recipe</span>
          </div>
          <div className="checklist">
            {validationWarnings.length ? (
              validationWarnings.map((warning, index) => <div className="check" key={index}>{warning}</div>)
            ) : (
              <div className="check">No validation warnings yet.</div>
            )}
          </div>
          {assistantMessage && (
            <div className="panel-callout">
              <span className="tag">Assistant</span>
              <p>{assistantMessage}</p>
            </div>
          )}
        </div>

        <div className="panel column">
          <div className="panel-header">
            <span className="tag">Preview & approval</span>
            <span className="chip">tool: preview_recipe</span>
          </div>
          <div className="diff-grid">
            <div className="diff-row header">
              <span>Metric</span>
              <span>Before</span>
              <span>After</span>
            </div>
            <div className="diff-row">
              <span>Rows</span>
              <span>{preview?.before_rows ?? "—"}</span>
              <span className="minus">{preview?.after_rows ?? "—"}</span>
            </div>
            <div className="diff-row">
              <span>Row delta</span>
              <span>0%</span>
              <span className={preview?.row_delta_pct && preview.row_delta_pct < 0 ? "minus" : "plus"}>
                {preview ? `${preview.row_delta_pct}%` : "—"}
              </span>
            </div>
          </div>
          <div className="approval">
            <span>{riskFlags.length ? `Approval required: ${riskFlags.join(", ")}` : "No approval required"}</span>
            <button className="button ghost" onClick={() => runPrompt("Request approval for this recipe.")}>
              Request approval
            </button>
          </div>
          {approvalToken && (
            <div className="panel-callout">
              <span className="tag">Approval token</span>
              <p className="mono">{approvalToken}</p>
            </div>
          )}
          <div className="panel-actions">
            <button className="button primary" onClick={runRecipe} disabled={!approvalToken || loading}>
              {runButtonLabel}
            </button>
            <button
              className="button ghost"
              onClick={() => document.getElementById("export-panel")?.scrollIntoView({ behavior: "smooth" })}
            >
              Export version
            </button>
          </div>
          {runResult && (
            <div className="panel-callout">
              <span className="tag">Run result</span>
              <p>
                New version <strong>{runResult.version_id}</strong> · {runResult.row_count} rows
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="panel export-panel" id="export-panel">
        <div className="panel-header">
          <span className="tag">Export</span>
          <span className={`chip ${sqlServerEnabled ? "" : "warning"}`}>
            SQL Server {sqlServerEnabled === false ? "disabled" : ""}
          </span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Host</span>
            <input value={exportHost} onChange={(event) => setExportHost(event.target.value)} />
          </label>
          <label className="field">
            <span>Port</span>
            <input type="number" value={exportPort} onChange={(event) => setExportPort(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Database</span>
            <input value={exportDatabase} onChange={(event) => setExportDatabase(event.target.value)} placeholder="finance" />
          </label>
          <label className="field">
            <span>Schema</span>
            <input value={exportSchema} onChange={(event) => setExportSchema(event.target.value)} />
          </label>
          <label className="field">
            <span>Table</span>
            <input value={exportTable} onChange={(event) => setExportTable(event.target.value)} />
          </label>
          <label className="field">
            <span>If exists</span>
            <select
              value={exportIfExists}
              onChange={(event) => setExportIfExists(event.target.value as "fail" | "replace" | "append")}
            >
              <option value="fail">Fail</option>
              <option value="replace">Replace</option>
              <option value="append">Append</option>
            </select>
          </label>
          <label className="field">
            <span>Username</span>
            <input value={exportUsername} onChange={(event) => setExportUsername(event.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} />
          </label>
        </div>
        <div className="panel-actions">
          <button className="button primary" onClick={handleExport} disabled={exporting || !dataset}>
            {exporting ? "Exporting…" : "Export to SQL Server"}
          </button>
          <button className="button ghost" onClick={handleDownloadCsv} disabled={downloading || !dataset}>
            {downloading ? "Downloading…" : "Download latest CSV"}
          </button>
          <span className="chip">Dataset: {dataset?.name || dataset?.dataset_id || "none"}</span>
        </div>
        {exportError && <div className="panel error">{exportError}</div>}
        {downloadError && <div className="panel error">{downloadError}</div>}
        {exportResult && (
          <div className="panel-callout">
            <span className="tag">Export complete</span>
            <p>
              {exportResult.row_count} rows → {exportResult.schema}.{exportResult.table}
            </p>
          </div>
        )}
      </section>

      <section className="panel tool-log">
        <div className="panel-header">
          <span className="tag">Tool call log</span>
          <span className="chip">{toolLog.length} events</span>
        </div>
        {toolLog.length ? (
          toolLog.map((event, index) => (
            <div className="tool-log-item" key={`${event.name}-${index}`}>
              <span className="tool-name">{event.name}()</span>
              <p>{JSON.stringify(event.result)}</p>
            </div>
          ))
        ) : (
          <div className="tool-log-item">Waiting for tool calls…</div>
        )}
      </section>
    </>
  );
}
