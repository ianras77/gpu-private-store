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
import { fetchForm } from "@/lib/cat/client";

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

  const draft = await loadPluginDraft(session.userId, slug);
  const checks = runDraftChecks(draft);
  if (!checks.ok) {
    const archive = buildPluginArchive(draft, {
      ownerUserId: session.userId,
      namespaceByUser: true
    });
    const report: PluginBuildReport = {
      mode: "deploy",
      summary: "Deploy blocked because the draft did not pass static checks.",
      ranAt: new Date().toISOString(),
      checks: checks.checks,
      steps: [
        {
          label: "Static draft checks",
          status: "failed",
          detail: `${checks.checks.filter((item) => item.ok).length}/${checks.checks.length} checks passing`
        },
        {
          label: "Deploy to Cheshire Cat",
          status: "skipped",
          detail: "Skipped until static checks pass"
        }
      ],
      manifest: archive.manifest,
      archive: {
        slug: archive.archiveSlug,
        filename: archive.filename,
        moduleName: archive.moduleName
      }
    };

    await savePluginDraft(session.userId, {
      slug: draft.slug,
      lastBuildReport: report
    });

    return NextResponse.json(
      {
        error: "Plugin checks failed",
        checks: checks.checks,
        report
      },
      { status: 400 }
    );
  }

  const archive = buildPluginArchive(draft, {
    ownerUserId: session.userId,
    namespaceByUser: true
  });

  const form = new FormData();
  form.append(
    "file",
    new Blob([archive.buffer], { type: "application/zip" }),
    archive.filename
  );

  try {
    const data = await fetchForm<Record<string, unknown>>("/plugins/upload", form, {
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId
    });

    const report: PluginBuildReport = {
      mode: "deploy",
      summary: "Draft deployed to Cheshire Cat.",
      ranAt: new Date().toISOString(),
      checks: checks.checks,
      steps: [
        {
          label: "Static draft checks",
          status: "passed",
          detail: `${checks.checks.length}/${checks.checks.length} checks passing`
        },
        {
          label: "Archive assembly",
          status: "passed",
          detail: `${archive.filename} with module ${archive.moduleName}`
        },
        {
          label: "Deploy to Cheshire Cat",
          status: "passed",
          detail: summarizeBuildPayload(data)
        }
      ],
      manifest: archive.manifest,
      archive: {
        slug: archive.archiveSlug,
        filename: archive.filename,
        moduleName: archive.moduleName
      },
      notes: summarizeBuildPayload(data)
    };

    await savePluginDraft(session.userId, {
      slug: draft.slug,
      lastBuildReport: report
    });

    return NextResponse.json({
      ok: true,
      checks: checks.checks,
      archive: { slug: archive.archiveSlug, filename: archive.filename, moduleName: archive.moduleName },
      result: data,
      report
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deploy failed";
    const report: PluginBuildReport = {
      mode: "deploy",
      summary: "Static checks passed, but deployment to Cheshire Cat failed.",
      ranAt: new Date().toISOString(),
      checks: checks.checks,
      steps: [
        {
          label: "Static draft checks",
          status: "passed",
          detail: `${checks.checks.length}/${checks.checks.length} checks passing`
        },
        {
          label: "Archive assembly",
          status: "passed",
          detail: `${archive.filename} with module ${archive.moduleName}`
        },
        {
          label: "Deploy to Cheshire Cat",
          status: "failed",
          detail: message
        }
      ],
      manifest: archive.manifest,
      archive: {
        slug: archive.archiveSlug,
        filename: archive.filename,
        moduleName: archive.moduleName
      },
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
