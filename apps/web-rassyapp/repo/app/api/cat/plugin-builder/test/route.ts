import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import {
  buildPluginArchive,
  loadPluginDraft,
  runDraftChecks,
  savePluginDraft,
  summarizeBuildPayload,
  type PluginBuildReport
} from "@/lib/cat/plugin-builder";
import { fetchForm, fetchJson } from "@/lib/cat/client";

function pickPluginId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const direct = obj.id ?? obj.plugin_id ?? obj.name;
  if (typeof direct === "string" && direct.trim()) return direct;
  if (obj.plugin && typeof obj.plugin === "object") {
    const nested = obj.plugin as Record<string, unknown>;
    const candidate = nested.id ?? nested.plugin_id ?? nested.name;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const slug =
    body && typeof body === "object" && typeof (body as { slug?: unknown }).slug === "string"
      ? (body as { slug: string }).slug
      : "my-plugin";
  const catUpload =
    body && typeof body === "object" && Boolean((body as { catUpload?: unknown }).catUpload);
  const cleanup =
    body && typeof body === "object" && Boolean((body as { cleanup?: unknown }).cleanup);

  const draft = await loadPluginDraft(session.userId, slug);
  const checks = runDraftChecks(draft);
  const archive = buildPluginArchive(draft, {
    ownerUserId: session.userId,
    namespaceByUser: true
  });

  const baseReport: PluginBuildReport = {
    mode: catUpload ? "live-test" : "checks",
    summary: checks.ok
      ? catUpload
        ? "Draft checks passed and a live Cheshire Cat upload test completed."
        : "Draft checks passed."
      : "Draft checks need attention before upload.",
    ranAt: new Date().toISOString(),
    checks: checks.checks,
    steps: [
      {
        label: "Static draft checks",
        status: checks.ok ? "passed" : "failed",
        detail: `${checks.checks.filter((item) => item.ok).length}/${checks.checks.length} checks passing`
      },
      {
        label: "Archive assembly",
        status: checks.ok ? "passed" : "skipped",
        detail: checks.ok
          ? `${archive.filename} with module ${archive.moduleName}`
          : "Skipped until the draft passes static validation"
      },
      {
        label: "Live Cheshire Cat upload",
        status: catUpload ? "skipped" : "skipped",
        detail: catUpload ? "Waiting for live upload result" : "Not requested for this run"
      }
    ],
    manifest: archive.manifest,
    archive: {
      slug: archive.archiveSlug,
      filename: archive.filename,
      moduleName: archive.moduleName
    }
  };

  if (!catUpload || !checks.ok) {
    const report =
      catUpload && !checks.ok
        ? {
            ...baseReport,
            steps: [
              baseReport.steps[0],
              baseReport.steps[1],
              {
                label: "Live Cheshire Cat upload",
                status: "skipped" as const,
                detail: "Skipped because static checks failed"
              }
            ]
          }
        : baseReport;

    await savePluginDraft(session.userId, {
      slug: draft.slug,
      lastBuildReport: report
    });

    return NextResponse.json({
      ok: checks.ok,
      checks: checks.checks,
      catUpload: false,
      report
    });
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([archive.buffer], { type: "application/zip" }),
    archive.filename
  );

  try {
    const uploadResult = await fetchForm<Record<string, unknown>>("/plugins/upload", form, {
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId
    });

    let cleanupResult: unknown = null;
    if (cleanup) {
      const pluginId = pickPluginId(uploadResult);
      if (pluginId) {
        cleanupResult = await fetchJson<unknown>(`/plugins/${encodeURIComponent(pluginId)}`, {
          method: "DELETE",
          token: session.engineJwt,
          userId: resolveEngineUserId(session),
          appUserId: session.userId
        }).catch((error) => {
          const message = error instanceof Error ? error.message : "Cleanup failed";
          return { error: message };
        });
      }
    }

    const report: PluginBuildReport = {
      ...baseReport,
      summary: "Draft checks passed and the live Cheshire Cat upload test succeeded.",
      steps: [
        baseReport.steps[0],
        baseReport.steps[1],
        {
          label: "Live Cheshire Cat upload",
          status: "passed",
          detail: summarizeBuildPayload(uploadResult)
        },
        {
          label: "Cleanup uploaded plugin",
          status: cleanup ? "passed" : "skipped",
          detail: cleanup ? summarizeBuildPayload(cleanupResult) : "Cleanup not requested"
        }
      ],
      notes:
        cleanup && cleanupResult
          ? summarizeBuildPayload(cleanupResult)
          : "Live upload test completed."
    };

    await savePluginDraft(session.userId, {
      slug: draft.slug,
      lastBuildReport: report
    });

    return NextResponse.json({
      ok: true,
      checks: checks.checks,
      catUpload: true,
      uploadResult,
      cleanup: cleanupResult,
      report
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live Cat upload failed";
    const report: PluginBuildReport = {
      ...baseReport,
      summary: "Draft checks passed, but the live Cheshire Cat upload test failed.",
      steps: [
        baseReport.steps[0],
        baseReport.steps[1],
        {
          label: "Live Cheshire Cat upload",
          status: "failed",
          detail: message
        }
      ],
      notes: message
    };

    await savePluginDraft(session.userId, {
      slug: draft.slug,
      lastBuildReport: report
    });

    return NextResponse.json(
      {
        error: message,
        checks: checks.checks,
        report
      },
      { status: 502 }
    );
  }
}
