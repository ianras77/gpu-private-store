import { prisma } from "./prisma";

export async function enforceDailyLimit(params: {
  userId: string;
  table: "tale" | "vote";
  limit: number;
}) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count =
    params.table === "tale"
      ? await prisma.tale.count({
          where: {
            authorId: params.userId,
            createdAt: { gte: since }
          }
        })
      : await prisma.vote.count({
          where: {
            userId: params.userId,
            createdAt: { gte: since }
          }
        });

  if (count >= params.limit) {
    const error = new Error("Rate limit exceeded");
    (error as Error & { statusCode?: number }).statusCode = 429;
    throw error;
  }
}
