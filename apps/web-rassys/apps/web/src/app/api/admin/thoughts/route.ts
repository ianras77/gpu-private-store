import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/admin-auth";
import { requestCheshireJson } from "../../../../lib/cheshire-client";
import { requestRassyChannelText } from "../../../../lib/rassy-intelligence-client";
import { saveRassyArtifact } from "../../../../lib/artifacts";
import {
  createThought,
  isSupportedThoughtImageFile,
  saveThoughtImages,
} from "../../../../lib/thoughts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  seed: z.string().min(10).max(5000),
  title: z.string().min(3).max(120).optional(),
  mode: z.enum(["assist", "raw"]).optional(),
  imageAlt: z.string().min(2).max(180).optional(),
  imageCaption: z.string().max(240).optional(),
});

const responseSchema = z.object({
  title: z.string().min(3).max(120),
  body: z.string().min(40),
  excerpt: z.string().min(20).max(220).optional(),
});

const callCheshire = async (seed: string, title?: string) => {
  try {
    const text = await requestRassyChannelText("notebook", JSON.stringify({
      task: "Expand this approved admin seed into a draft notebook/blog post.",
      seed,
      title,
      output: 'Return ONLY strict JSON: {"title":"...","body":"...","excerpt":"..."}.',
    }), {
      requestId: `admin-notebook-${Date.now()}`,
      channelId: "notebook",
      viewer: { kind: "admin", id: "admin", roles: ["admin"] },
      permissions: ["admin", "notebook:write"],
      locale: "en",
      timeZone: "UTC",
      modelPolicy: { allowedAliases: ["rassy-mind"], maxCalls: 1, deadlineMs: 35000, priority: "interactive" },
    });
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    return responseSchema.parse(JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean));
  } catch {
    // Compatibility fallback remains until the intelligence path is fully qualified.
  }
  try {
    const response = await requestCheshireJson(
      {
        model: process.env.CHESHIRE_MODEL ?? "rassy-mind",
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content:
              "You are the editor for Ian Rasmussen's site. " +
              "Expand the seed into a clear, personal blog post. " +
              'Return ONLY strict JSON: {"title":"...","body":"...","excerpt":"..."}.',
          },
          {
            role: "user",
            content: JSON.stringify({
              seed,
              title,
              guidance: "Keep it honest, specific, and punchy.",
            }),
          },
        ],
        lane: "admin",
        priority: "low",
        purpose: "admin-thought",
        queueWaitMs: 8000,
        timeoutMs: 35000,
      },
      responseSchema,
    );
    return response.data;
  } catch {
    return null;
  }
};

const parseRequestBody = async (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payload = {
      seed: form.get("seed"),
      title: form.get("title"),
      mode: form.get("mode"),
      imageAlt: form.get("imageAlt"),
      imageCaption: form.get("imageCaption"),
    };
    const parsed = bodySchema.safeParse({
      seed: typeof payload.seed === "string" ? payload.seed : "",
      title:
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title
          : undefined,
      mode: payload.mode === "raw" ? "raw" : "assist",
      imageAlt:
        typeof payload.imageAlt === "string" && payload.imageAlt.trim()
          ? payload.imageAlt
          : undefined,
      imageCaption:
        typeof payload.imageCaption === "string" && payload.imageCaption.trim()
          ? payload.imageCaption
          : undefined,
    });

    const files = form
      .getAll("images")
      .filter(
        (value): value is File => value instanceof File && value.size > 0,
      );

    return { parsed, files };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return { parsed: null, files: [] as File[] };
  }

  return { parsed: bodySchema.safeParse(body), files: [] as File[] };
};

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { parsed, files } = await parseRequestBody(request);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (files.length > 8) {
    return NextResponse.json({ error: "too_many_images" }, { status: 400 });
  }
  if (files.some((file) => file.size > 8 * 1024 * 1024)) {
    return NextResponse.json({ error: "image_too_large" }, { status: 400 });
  }
  if (files.some((file) => !isSupportedThoughtImageFile(file))) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const { seed, title, mode, imageAlt, imageCaption } = parsed.data;
  let finalTitle = title?.trim();
  let finalBody = seed.trim();
  let finalExcerpt: string | undefined;
  let source = "manual";

  if (mode !== "raw") {
    const generated = await callCheshire(finalBody, finalTitle);
    if (generated) {
      finalTitle = generated.title;
      finalBody = generated.body;
      finalExcerpt = generated.excerpt;
      source = "editor";
    }
  }

  let images = [] as Awaited<ReturnType<typeof saveThoughtImages>>;
  if (files.length) {
    try {
      images = await saveThoughtImages(files, {
        alt: imageAlt,
        caption: imageCaption,
        title: finalTitle ?? title ?? "Thought",
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Image processing failed.";
      return NextResponse.json(
        { error: "image_processing_failed", detail },
        { status: 400 },
      );
    }
  }

  const thought = await createThought({
    title: finalTitle ?? "Untitled Thought",
    body: finalBody,
    excerpt: finalExcerpt,
    source,
    images,
  });

  if (source === "editor") {
    await saveRassyArtifact({
      channelId: "notebook",
      kind: "notebook-draft",
      status: "draft",
      ownerResourceId: "admin",
      title: thought.title,
      summary: thought.excerpt ?? undefined,
      bodyMarkdown: thought.body,
      sourceRefs: [{ type: "thought", id: thought.id }],
    }).catch((error) => {
      console.warn("Failed to persist notebook draft artifact", error);
    });
  }

  return NextResponse.json(thought);
}
