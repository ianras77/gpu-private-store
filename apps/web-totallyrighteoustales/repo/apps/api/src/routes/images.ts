import { FastifyPluginAsync } from "fastify";
import { ImageCreateSchema } from "@trt/shared";
import { nanoid } from "nanoid";
import { prisma } from "../lib/prisma";
import { createPresignedUpload, buildPublicUrl } from "../lib/storage";
import { imageQueue } from "../jobs/queues";

const imageRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    const payload = ImageCreateSchema.safeParse(req.body);
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid payload" };
    }

    const purpose = payload.data.purpose ?? "STORY";
    const extension = payload.data.filename.split(".").pop() || "jpg";
    const folder = purpose === "AVATAR" ? "avatars" : "uploads";
    const storageKey = `${folder}/${req.user.id}/${nanoid(10)}.${extension}`;
    const url = buildPublicUrl(storageKey);
    const uploadUrl = await createPresignedUpload(storageKey, payload.data.contentType);

    const image = await prisma.imageAsset.create({
      data: {
        uploaderId: req.user.id,
        storageKey,
        url,
        width: 0,
        height: 0,
        status: "PENDING",
        purpose
      }
    });

    await imageQueue.add("process", { imageId: image.id });

    return { imageId: image.id, uploadUrl, publicUrl: url };
  });
};

export default imageRoutes;
