import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import {
  buildPluginArchive,
  extractToolNamesFromSource,
  loadPluginDraft,
  runDraftChecks,
  savePluginDraft,
  summarizeBuildPayload,
  type PluginBuildReport
} from "@/lib/cat/plugin-builder";
import { fetchForm, fetchJson } from "@/lib/cat/client";

type CatPlugin = {
  id: string;
  name?: string;
  tools?: Array<{ name?: string }>;
};

type PluginsList = {
  installed: CatPlugin[];
};

type CatMessageResponse = {
  content?: unknown;
  text?: unknown;
  message?: unknown;
  why?: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectedPluginId(archiveSlug: string) {
  return archiveSlug.replace(/-/g, "_");
}

function extractText(payload: CatMessageResponse) {
  const candidates = [payload.content, payload.text, payload.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  return "";
}

function extractProcedureChoice(why: unknown) {
  if (!why || typeof why !== "object") return null;
  const interactions = (why as { model_interactions?: unknown }).model_interactions;
  if (!Array.isArray(interactions)) return null;

  const procedureStep = interactions.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as { source?: unknown }).source === "ProceduresAgent.execute_chain";
  });
  if (!procedureStep || typeof procedureStep !== "object") return null;

  const reply = (procedureStep as { reply?: unknown }).reply;
  if (typeof reply !== "string") return null;

  const raw = reply.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  try {
    const parsed = JSON.parse(candidate) as { action?: unknown };
    return typeof parsed.action === "string" ? parsed.action : null;
  } catch {
    return null;
  }
}

function extractModelTraceSummary(why: unknown) {
  if (!why || typeof why !== "object") return "No runtime trace was returned.";
  const interactions = (why as { model_interactions?: unknown }).model_interactions;
  if (!Array.isArray(interactions) || interactions.length === 0) {
    return "No runtime trace was returned.";
  }

  const lines = interactions
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = typeof (item as { source?: unknown }).source === "string"
        ? (item as { source: string }).source
        : "unknown";
      const reply = summarizeBuildPayload((item as { reply?: unknown }).reply);
      return `${source}: ${reply}`;
    })
    .filter(Boolean);

  return lines.join("\n");
}

function hasToolEvidence(outputText: string, toolName: string) {
  const normalizedOutput = outputText.toLowerCase();
  const normalizedTool = toolName.toLowerCase();
  return (
    normalizedOutput.includes(`[${normalizedTool}]`) ||
    normalizedOutput.includes(`tool named ${normalizedTool}`) ||
    normalizedOutput.includes(normalizedTool)
  );
}

function pickExerciseTool(toolNames: string[]) {
  return toolNames.find((name) => name !== "plugin_healthcheck") ?? toolNames[0] ?? null;
}

async function waitForPluginRegistration(options: {
  pluginId: string;
  token: string;
  userId: string;
  appUserId: string;
}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const plugins = await fetchJson<PluginsList>("/plugins/", {
      method: "GET",
      token: options.token,
      userId: options.userId,
      appUserId: options.appUserId,
      retries: 0,
      timeoutMs: 12_000
    }).catch(() => null);

    const installed = plugins?.installed ?? [];
    const match = installed.find((plugin) => plugin.id === options.pluginId) ?? null;
    if (match) {
      return match;
    }

    await sleep(1_000);
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

  const draft = await loadPluginDraft(session.userId, slug);
  const checks = runDraftChecks(draft);
  const archive = buildPluginArchive(draft, {
    ownerUserId: session.userId,
    namespaceByUser: true
  });
  const parsedToolNames = extractToolNamesFromSource(draft.source);
  const fallbackTool = pickExerciseTool(parsedToolNames);

  if (!checks.ok) {
    const report: PluginBuildReport = {
      mode: "runtime",
      summary: "Runtime harness blocked because the draft did not pass static checks.",
      ranAt: new Date().toISOString(),
      checks: checks.checks,
      steps: [
        {
          label: "Static draft checks",
          status: "failed",
          detail: `${checks.checks.filter((item) => item.ok).length}/${checks.checks.length} checks passing`
        },
        {
          label: "Upload plugin to Cheshire Cat",
          status: "skipped",
          detail: "Skipped until static checks pass"
        },
        {
          label: "Exercise runtime tool",
          status: "skipped",
          detail: "Skipped until the plugin can be uploaded"
        }
      ],
      manifest: archive.manifest,
      archive: {
        slug: archive.archiveSlug,
        filename: archive.filename,
        moduleName: archive.moduleName
      },
      notes: fallbackTool
        ? `Parsed draft tool candidate: ${fallbackTool}`
        : "No @tool function was parsed from the draft source."
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
      appUserId: session.userId,
      retries: 0,
      timeoutMs: 20_000
    });

    const pluginId = expectedPluginId(archive.archiveSlug);
    const installedPlugin = await waitForPluginRegistration({
      pluginId,
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId
    });

    const installedToolNames = (installedPlugin?.tools ?? [])
      .map((tool) => tool.name)
      .filter((name): name is string => Boolean(name));
    const exerciseTool = pickExerciseTool(installedToolNames) ?? fallbackTool;

    if (!installedPlugin || !exerciseTool) {
      const report: PluginBuildReport = {
        mode: "runtime",
        summary: "Plugin upload completed, but the runtime harness could not find a registered tool to exercise.",
        ranAt: new Date().toISOString(),
        checks: checks.checks,
        steps: [
          {
            label: "Static draft checks",
            status: "passed",
            detail: `${checks.checks.length}/${checks.checks.length} checks passing`
          },
          {
            label: "Upload plugin to Cheshire Cat",
            status: "passed",
            detail: summarizeBuildPayload(uploadResult)
          },
          {
            label: "Await plugin registration",
            status: installedPlugin ? "passed" : "failed",
            detail: installedPlugin
              ? `Plugin ${installedPlugin.id} registered in Cheshire Cat`
              : `Timed out waiting for ${pluginId} to appear in the plugin registry`
          },
          {
            label: "Exercise runtime tool",
            status: "failed",
            detail: exerciseTool
              ? `No registered tool metadata was returned for ${exerciseTool}`
              : "No tool names were available to exercise"
          }
        ],
        manifest: archive.manifest,
        archive: {
          slug: archive.archiveSlug,
          filename: archive.filename,
          moduleName: archive.moduleName
        },
        notes: installedToolNames.length
          ? `Installed tools: ${installedToolNames.join(", ")}`
          : `Parsed tools from source: ${parsedToolNames.join(", ") || "none"}`
      };

      await savePluginDraft(session.userId, {
        slug: draft.slug,
        lastBuildReport: report
      });

      return NextResponse.json(
        {
          error: "Plugin registered without an exercisable tool",
          checks: checks.checks,
          report,
          uploadResult
        },
        { status: 502 }
      );
    }

    const runtimePrompt = [
      `Use the Cheshire Cat tool named ${exerciseTool} right now.`,
      "Do not answer from general knowledge.",
      "Choose that tool explicitly and use it to validate the plugin.",
      "After the tool attempt, respond with a short result grounded in the tool output."
    ].join(" ");

    const runtimeResult = await fetchJson<CatMessageResponse>("/message", {
      method: "POST",
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId,
      timeoutMs: 60_000,
      retries: 0,
      body: JSON.stringify({ text: runtimePrompt })
    });

    const why = runtimeResult.why;
    const chosenAction = extractProcedureChoice(why);
    const finalText = extractText(runtimeResult).trim();
    const actionMatched = chosenAction === exerciseTool || hasToolEvidence(finalText, exerciseTool);
    const outputPresent = finalText.length > 0;
    const report: PluginBuildReport = {
      mode: "runtime",
      summary:
        actionMatched && outputPresent
          ? "Runtime harness uploaded the plugin, selected the intended tool, and captured a runtime response."
          : "Runtime harness found a gap between plugin registration and reliable tool execution.",
      ranAt: new Date().toISOString(),
      checks: checks.checks,
      steps: [
        {
          label: "Static draft checks",
          status: "passed",
          detail: `${checks.checks.length}/${checks.checks.length} checks passing`
        },
        {
          label: "Upload plugin to Cheshire Cat",
          status: "passed",
          detail: summarizeBuildPayload(uploadResult)
        },
        {
          label: "Await plugin registration",
          status: "passed",
          detail: `Plugin ${installedPlugin.id} registered with tools: ${installedToolNames.join(", ")}`
        },
        {
          label: "Select target tool in runtime",
          status: actionMatched ? "passed" : "failed",
          detail: chosenAction
            ? `Cheshire Cat selected ${chosenAction}; expected ${exerciseTool}`
            : hasToolEvidence(finalText, exerciseTool)
              ? `No procedure action was parsed, but the runtime output explicitly referenced ${exerciseTool}`
              : `No procedure action was parsed; expected ${exerciseTool}`
        },
        {
          label: "Capture runtime output",
          status: outputPresent ? "passed" : "failed",
          detail: outputPresent ? finalText : "The runtime returned an empty message."
        }
      ],
      manifest: archive.manifest,
      archive: {
        slug: archive.archiveSlug,
        filename: archive.filename,
        moduleName: archive.moduleName
      },
      notes: [
        `Target tool: ${exerciseTool}`,
        `Procedure choice: ${chosenAction ?? "none"}`,
        `Runtime trace:`,
        extractModelTraceSummary(why)
      ].join("\n")
    };

    await savePluginDraft(session.userId, {
      slug: draft.slug,
      lastBuildReport: report
    });

    return NextResponse.json({
      ok: actionMatched && outputPresent,
      checks: checks.checks,
      report,
      plugin: {
        id: installedPlugin.id,
        name: installedPlugin.name,
        tools: installedToolNames
      },
      runtime: {
        targetTool: exerciseTool,
        chosenAction,
        outputText: finalText,
        raw: runtimeResult
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime harness failed";
    const report: PluginBuildReport = {
      mode: "runtime",
      summary: "Runtime harness failed before a usable tool trace was captured.",
      ranAt: new Date().toISOString(),
      checks: checks.checks,
      steps: [
        {
          label: "Static draft checks",
          status: "passed",
          detail: `${checks.checks.length}/${checks.checks.length} checks passing`
        },
        {
          label: "Upload plugin to Cheshire Cat",
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
