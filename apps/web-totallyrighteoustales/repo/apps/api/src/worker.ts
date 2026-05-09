import "dotenv/config";
import IORedis from "ioredis";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "./lib/prisma";
import { autoModerateText } from "./lib/moderation";
import { aiEnabled, moderateText } from "./lib/ai";
import { fetchObjectBuffer, putObjectBuffer } from "./lib/storage";
import { stripExif, readMetadata, detectFace } from "./lib/image";
import { computeHotScore } from "./lib/ranking";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
}) as unknown as ConnectionOptions;

const hotScoreQueue = new Queue("hotScore", { connection });

async function scheduleHotScore() {
  await hotScoreQueue.add(
    "recompute",
    {},
    {
      repeat: { every: 10 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: true
    }
  );
}

new Worker(
  "moderation",
  async (job) => {
    const { taleId } = job.data as { taleId: string };
    const tale = await prisma.tale.findUnique({ where: { id: taleId } });
    if (!tale) return;

    const result = aiEnabled() ? await moderateText(tale.body) : autoModerateText(tale.body);

    await prisma.moderationEvent.create({
      data: {
        taleId,
        source: "AUTO",
        result: result.result,
        categoriesJson: result.categories,
        scoreJson: result.scores,
        notes: result.notes
      }
    });

    if (result.result === "BLOCK") {
      await prisma.tale.update({
        where: { id: taleId },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectionReason: result.notes ?? "Auto-rejected"
        }
      });
    }
  },
  { connection }
);

new Worker(
  "image",
  async (job) => {
    const { imageId } = job.data as { imageId: string };
    const image = await prisma.imageAsset.findUnique({ where: { id: imageId } });
    if (!image) return;

    const buffer = await fetchObjectBuffer(image.storageKey);
    if (!buffer) {
      await prisma.imageAsset.update({
        where: { id: imageId },
        data: { status: "REJECTED", hasFace: false }
      });
      await prisma.moderationEvent.create({
        data: {
          imageId,
          source: "AUTO",
          result: "BLOCK",
          notes: "Image not found in storage"
        }
      });
      return;
    }

    const stripped = await stripExif(buffer);
    const meta = await readMetadata(stripped);
    const contentType = meta.format ? `image/${meta.format}` : "image/jpeg";
    await putObjectBuffer(image.storageKey, contentType, stripped);
    const hasFace = await detectFace(stripped);
    const shouldRejectForFace = image.purpose === "STORY" && hasFace;

    await prisma.imageAsset.update({
      where: { id: imageId },
      data: {
        status: shouldRejectForFace ? "REJECTED" : "APPROVED",
        hasFace,
        width: meta.width,
        height: meta.height
      }
    });

    await prisma.moderationEvent.create({
      data: {
        imageId,
        source: "AUTO",
        result: shouldRejectForFace ? "BLOCK" : "PASS",
        notes: shouldRejectForFace
          ? "Face detected in story image"
          : image.purpose === "AVATAR" && hasFace
          ? "Avatar image processed"
          : "Image processed"
      }
    });
  },
  { connection }
);

new Worker(
  "hotScore",
  async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tales = await prisma.tale.findMany({
      where: { status: "APPROVED", createdAt: { gte: since } }
    });

    for (const tale of tales) {
      const hotScore = computeHotScore(tale.score, tale.createdAt);
      await prisma.tale.update({
        where: { id: tale.id },
        data: { hotScore }
      });
    }
  },
  { connection }
);

scheduleHotScore().catch((err) => {
  console.error(err);
});
