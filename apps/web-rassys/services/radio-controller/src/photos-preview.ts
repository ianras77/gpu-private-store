import { spawn } from "child_process";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { logger } from "./logger";

const CACHE_ROOT = "/tmp/rassy-photo-previews";
const HEIF_PATTERN = /\.(heic|heif)$/i;

const buildCachePath = async (sourcePath: string, kind: "image" | "poster") => {
  const stat = await fs.stat(sourcePath);
  const key = createHash("sha1")
    .update(`${kind}:${sourcePath}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex");

  await fs.mkdir(CACHE_ROOT, { recursive: true });
  return path.join(CACHE_ROOT, `${key}.jpg`);
};

const runCommand = async (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(errorOutput.trim() || `${command}_exit_${code}`));
    });
  });

const runFfmpeg = async (args: string[]) => runCommand("ffmpeg", args);

const runHeifConvert = async (sourcePath: string, outputPath: string) =>
  runCommand("heif-convert", [sourcePath, outputPath]);

const ensurePreview = async (sourcePath: string, kind: "image" | "poster") => {
  const outputPath = await buildCachePath(sourcePath, kind);

  try {
    await fs.access(outputPath);
    return outputPath;
  } catch {
    // Cache miss, keep going.
  }

  const args =
    kind === "poster"
      ? ["-hide_banner", "-loglevel", "error", "-y", "-ss", "00:00:00.500", "-i", sourcePath, "-frames:v", "1", "-q:v", "3", outputPath]
      : ["-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath, "-frames:v", "1", "-q:v", "3", outputPath];

  try {
    if (kind === "image" && HEIF_PATTERN.test(sourcePath)) {
      await runHeifConvert(sourcePath, outputPath);
      return outputPath;
    }

    await runFfmpeg(args);
    return outputPath;
  } catch (error) {
    logger.warn({ error, sourcePath, kind }, "Preview generation failed");
    throw error;
  }
};

export const ensureImagePreview = async (sourcePath: string) =>
  ensurePreview(sourcePath, "image");

export const ensureVideoPoster = async (sourcePath: string) =>
  ensurePreview(sourcePath, "poster");
