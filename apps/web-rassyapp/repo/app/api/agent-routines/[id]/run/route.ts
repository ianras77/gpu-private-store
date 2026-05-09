import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { fetchJson } from "@/lib/cat/client";
import { getCatProfileConfig } from "@/lib/cat/topology";
import { prisma } from "@/lib/db";
import { buildRobloxRoutinePrompt } from "@/lib/studio/prompt";
import { buildWriterHandoff, getNextWriterStage, getWriterStage } from "@/lib/studio/writer-team";

export const runtime = "nodejs";

const RunRoutineSchema = z.object({
  input: z.string().max(8_000).optional(),
  trigger: z.enum(["manual", "system"]).default("manual")
});

function trimText(input: string, maxChars: number) {
  return input.length > maxChars ? `${input.slice(0, maxChars)}...` : input;
}

function parseJsonRecord(raw?: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mergeRoutineContext(options: {
  workspaceContext?: string | null;
  projectSnapshot?: string | null;
  dependencyHandoff?: string | null;
  stageKey?: string | null;
  agentKey?: string | null;
}) {
  const stage = getWriterStage(options.stageKey);
  const nextStage = getNextWriterStage(options.stageKey);

  return JSON.stringify(
    {
      workspaceContext: parseJsonRecord(options.workspaceContext),
      projectSnapshot: parseJsonRecord(options.projectSnapshot),
      dependencyHandoff: parseJsonRecord(options.dependencyHandoff),
      writerStage: stage
        ? {
            stageKey: stage.stageKey,
            title: stage.title,
            mission: stage.mission,
            outputLabel: stage.outputLabel,
            handoffLabel: stage.handoffLabel,
            engineProfile: stage.engineProfile,
            focusPoints: stage.focusPoints
          }
        : null,
      writerAgentKey: options.agentKey ?? null,
      nextStage: nextStage
        ? {
            stageKey: nextStage.stageKey,
            title: nextStage.title,
            outputLabel: nextStage.outputLabel
          }
        : null
    },
    null,
    2
  );
}

function pickRoutineProfile(options: { kind: string; stageKey?: string | null }) {
  const stage = getWriterStage(options.stageKey);
  if (stage) {
    return getCatProfileConfig(stage.engineProfile);
  }
  if (options.kind === "skill") {
    return getCatProfileConfig("builder");
  }
  if (options.kind === "loop") {
    return getCatProfileConfig("critic");
  }
  return getCatProfileConfig("planner");
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = RunRoutineSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const routine = await prisma.agentRoutine.findFirst({
    where: { id: context.params.id, userId: session.userId },
    include: { session: true }
  });
  if (!routine) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (routine.status === "Paused") {
    return NextResponse.json({ error: "Routine is paused" }, { status: 409 });
  }

  const dependencyRoutine = routine.dependsOnRoutineId
    ? await prisma.agentRoutine.findFirst({
        where: {
          id: routine.dependsOnRoutineId,
          workspaceId: routine.workspaceId
        },
        select: {
          id: true,
          handoffJson: true
        }
      })
    : null;
  if (dependencyRoutine && !dependencyRoutine.handoffJson) {
    return NextResponse.json(
      {
        error: "This writer stage is waiting for the previous stage to produce a handoff."
      },
      { status: 409 }
    );
  }

  const run = await prisma.agentRoutineRun.create({
    data: {
      routineId: routine.id,
      status: "Running",
      trigger: parsed.data.trigger,
      startedAt: new Date()
    }
  });

  const workspaceRun = await prisma.workspaceRun.create({
    data: {
      workspaceId: routine.workspaceId,
      sessionId: routine.sessionId ?? null,
      routineId: routine.id,
      label: `${routine.name} (${routine.kind})`,
      status: "Running"
    }
  });

  try {
    const profile = pickRoutineProfile({
      kind: routine.kind,
      stageKey: routine.stageKey
    });
    const output = await fetchJson<unknown>("/message", {
      method: "POST",
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId,
      workspaceId: routine.workspaceId,
      httpBase: profile.httpBase,
      timeoutMs: 45_000,
      retries: 0,
      body: JSON.stringify({
        text: buildRobloxRoutinePrompt({
          name: routine.name,
          kind: routine.kind,
          description: routine.description,
          promptBrief: routine.promptBrief,
          contextJson: mergeRoutineContext({
            workspaceContext: routine.workspaceContextJson,
            projectSnapshot: routine.projectSnapshotJson,
            dependencyHandoff: dependencyRoutine?.handoffJson ?? null,
            stageKey: routine.stageKey,
            agentKey: routine.agentKey
          }),
          input: parsed.data.input
        })
      })
    });

    const outputText =
      typeof output === "string"
        ? output
        : output && typeof output === "object"
          ? JSON.stringify(output)
          : String(output ?? "");
    const completedAt = new Date();
    const writerStage = getWriterStage(routine.stageKey);
    const handoff = writerStage
      ? buildWriterHandoff({
          stage: writerStage,
          outputText,
          routineName: routine.name,
          completedAt
        })
      : null;

    await prisma.agentRoutineRun.update({
      where: { id: run.id },
      data: {
        status: "Passed",
        stageStatus: writerStage ? "Passed" : null,
        outputText,
        handoffJson: handoff ? JSON.stringify(handoff) : null,
        completedAt
      }
    });

    await prisma.workspaceRun.update({
      where: { id: workspaceRun.id },
      data: { status: "Passed" }
    });

    await prisma.agentRoutine.update({
      where: { id: routine.id },
      data: {
        lastRunAt: completedAt,
        handoffJson: handoff ? JSON.stringify(handoff) : routine.handoffJson
      }
    });

    return NextResponse.json({
      ok: true,
      run: {
        id: run.id,
        status: "Passed",
        stageStatus: writerStage ? "Passed" : null,
        outputText,
        outputPreview: trimText(outputText, 240),
        handoff,
        completedAt: completedAt.toISOString()
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Routine execution failed";
    const completedAt = new Date();

    await prisma.agentRoutineRun.update({
      where: { id: run.id },
      data: {
        status: "Failed",
        stageStatus: routine.stageKey ? "Failed" : null,
        errorText: message,
        completedAt
      }
    });

    await prisma.workspaceRun.update({
      where: { id: workspaceRun.id },
      data: { status: "Failed" }
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
