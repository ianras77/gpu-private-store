import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { loadPluginDraft, savePluginDraft, type PluginBuildReport } from "@/lib/cat/plugin-builder";
import { generatePluginSource } from "@/lib/cat/plugin-generation";

export const runtime = "nodejs";

function renderReport(report: PluginBuildReport | null | undefined) {
  if (!report) {
    return "No previous build report is available. Repair the draft for stronger Cheshire Cat compatibility and safer tool behavior.";
  }

  return [
    `Last report mode: ${report.mode}`,
    `Last summary: ${report.summary}`,
    "",
    "Checks:",
    ...report.checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.label}: ${check.detail}`),
    "",
    "Steps:",
    ...report.steps.map((step) => `- ${step.status.toUpperCase()} ${step.label}: ${step.detail}`),
    "",
    "Manifest:",
    JSON.stringify(report.manifest, null, 2),
    "",
    `Archive slug: ${report.archive.slug}`,
    `Archive file: ${report.archive.filename}`,
    `Module name: ${report.archive.moduleName}`,
    report.notes ? `Notes: ${report.notes}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const slug =
    typeof (body as { slug?: unknown }).slug === "string"
      ? (body as { slug: string }).slug
      : "my-plugin";
  const goal =
    typeof (body as { goal?: unknown }).goal === "string"
      ? (body as { goal: string }).goal.trim()
      : "";
  const failureContext =
    typeof (body as { failureContext?: unknown }).failureContext === "string"
      ? (body as { failureContext: string }).failureContext.trim()
      : "";

  const draft = await loadPluginDraft(session.userId, slug);
  const reportText = renderReport(draft.lastBuildReport);

  const instructions = [
    "Revise this Cheshire Cat plugin so it is more compatible with live upload, safer to run, and more useful as a shared platform skill.",
    goal ? `Operator goal: ${goal}` : "Operator goal: harden the draft and fix the most likely compatibility issues.",
    "",
    "Repair guidance:",
    "- Return only Python for the plugin module.",
    "- Keep Cheshire Cat compatibility in mind.",
    "- Prefer clear, small tool functions with concise docstrings.",
    "- Avoid placeholder behavior when a safer deterministic response is possible.",
    "- Preserve the spirit of the current capability while making it easier to test and deploy.",
    "",
    "Failure and validation context:",
    failureContext || reportText
  ].join("\n");

  try {
    const output = await generatePluginSource({
      draft,
      instructions,
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId
    });

    const report: PluginBuildReport = {
      mode: "repair",
      summary: "AI repair generated a revised Cheshire Cat plugin draft.",
      ranAt: new Date().toISOString(),
      checks: draft.lastBuildReport?.checks ?? [],
      steps: [
        {
          label: "Review previous build report",
          status: draft.lastBuildReport ? "passed" : "skipped",
          detail: draft.lastBuildReport
            ? `${draft.lastBuildReport.mode} report used as repair context`
            : "No previous build report was available"
        },
        {
          label: "Apply operator repair goal",
          status: goal ? "passed" : "skipped",
          detail: goal || "No explicit repair goal supplied"
        },
        {
          label: "Generate revised plugin module",
          status: "passed",
          detail: "Draft source updated with a new AI-generated module"
        }
      ],
      manifest: draft.lastBuildReport?.manifest ?? {
        name: draft.name,
        version: draft.version,
        description: draft.description,
        author_name: draft.authorName,
        author_url: draft.authorUrl,
        plugin_url: "",
        tags: ["console-builder"],
        thumb: ""
      },
      archive: draft.lastBuildReport?.archive ?? {
        slug: draft.slug,
        filename: `${draft.slug}.zip`,
        moduleName: draft.moduleName
      },
      notes: goal || failureContext || "Repair used the current draft and previous build context."
    };

    const nextDraft = await savePluginDraft(session.userId, {
      ...draft,
      source: output,
      lastBuildReport: report
    });

    return NextResponse.json({ draft: nextDraft, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repair generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
