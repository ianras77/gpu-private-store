import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const story = "Once upon a totally righteous time, " + "magic ".repeat(80);

describe("tales", () => {
  const app = buildApp();

  beforeAll(async () => {
    process.env.DEV_AUTH_BYPASS = "true";
    await prisma.creditLedger.deleteMany();
    await prisma.moderationEvent.deleteMany();
    await prisma.taleEmbedding.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.tale.deleteMany();
    await prisma.imageAsset.deleteMany();
    await prisma.user.deleteMany();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires a complete storyteller profile for named publishing", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/tales",
      headers: { "x-dev-user": "named-author@test.local" },
      payload: {
        title: "Needs a profile",
        body: story
      }
    });

    expect(create.statusCode).toBe(409);
  });

  it("creates and approves a tale", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/tales",
      headers: { "x-dev-user": "author@test.local" },
      payload: {
        title: "Righteous Test Tale",
        body: story,
        isAnonymous: true
      }
    });

    expect(create.statusCode).toBe(200);
    const tale = create.json();

    await prisma.user.update({
      where: { email: "author@test.local" },
      data: { role: "MOD" }
    });

    const approve = await app.inject({
      method: "POST",
      url: `/moderation/tales/${tale.id}/approve`,
      headers: { "x-dev-user": "author@test.local" }
    });

    expect(approve.statusCode).toBe(200);
  });

  it("allows hearting", async () => {
    const tale = await prisma.tale.findFirst({ where: { title: "Righteous Test Tale" } });
    expect(tale).toBeTruthy();

    const vote = await app.inject({
      method: "POST",
      url: `/tales/${tale?.id}/heart`,
      headers: { "x-dev-user": "voter@test.local" }
    });

    expect(vote.statusCode).toBe(200);
  });
});
