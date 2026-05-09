import { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma";

const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const [leaders, stories] = await Promise.all([
      prisma.user.findMany({
        where: {
          deletedAt: null,
          displayName: { not: null }
        },
        orderBy: { creditsTotal: "desc" },
        take: 20,
        include: {
          avatarImage: true,
          tales: {
            where: { status: "APPROVED", deletedAt: null },
            select: { upvotes: true }
          }
        }
      }),
      prisma.tale.findMany({
        where: { status: "APPROVED", deletedAt: null },
        orderBy: [{ upvotes: "desc" }, { hotScore: "desc" }, { createdAt: "desc" }],
        take: 20,
        include: {
          image: true,
          author: {
            include: { avatarImage: true }
          }
        }
      })
    ]);

    return {
      storytellers: leaders.map((user) => ({
        userId: user.id,
        pseudonym: user.pseudonym,
        displayName: user.displayName || user.pseudonym,
        avatarUrl: user.avatarImage?.url ?? null,
        creditsTotal: user.creditsTotal,
        storyCount: user.tales.length,
        totalHearts: user.tales.reduce((sum, tale) => sum + tale.upvotes, 0)
      })),
      stories: stories.map((tale) => ({
        id: tale.id,
        title: tale.title,
        excerpt: tale.body.slice(0, 240),
        authorPseudonym: tale.isAnonymous
          ? "Anonymous storyteller"
          : tale.author.displayName || tale.author.pseudonym,
        authorAvatarUrl: tale.isAnonymous ? null : tale.author.avatarImage?.url ?? null,
        createdAt: tale.createdAt.toISOString(),
        status: tale.status,
        assistMode: tale.assistMode,
        storyPrompt: tale.storyPrompt,
        isAnonymous: tale.isAnonymous,
        hotScore: tale.hotScore,
        topScore: tale.topScore,
        imageUrl: tale.image?.url ?? null,
        upvotes: tale.upvotes,
        downvotes: tale.downvotes
      }))
    };
  });
};

export default leaderboardRoutes;
