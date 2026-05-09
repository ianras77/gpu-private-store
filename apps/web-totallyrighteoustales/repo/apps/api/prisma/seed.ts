import { PrismaClient, TaleStatus, UserRole } from "@prisma/client";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

const adjectives = ["Anonymous", "Wandering", "Mythic", "Hidden", "Righteous", "Stellar", "Brave", "Quiet", "Ethereal"];
const animals = ["Badger", "Otter", "Raven", "Fox", "Lynx", "Heron", "Wolf", "Hare", "Moth"];

function makePseudonym() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj} ${animal} #${num}`;
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@totallyrighteoustales.local";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  const admin = existing ||
    (await prisma.user.create({
      data: {
        email: adminEmail,
        pseudonym: makePseudonym(),
        displayName: "Moonbeam Keeper",
        bio: "Collector of gentle myths and moonlit plot twists.",
        avatarSeed: nanoid(10),
        role: UserRole.ADMIN,
        creditsTotal: 100
      }
    }));

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@totallyrighteoustales.local" },
    update: {},
    create: {
      email: "demo@totallyrighteoustales.local",
      pseudonym: makePseudonym(),
      displayName: "Maple Storysmith",
      bio: "Writes tiny wonders with a pocket full of improbable snacks.",
      avatarSeed: nanoid(10),
      creditsTotal: 12
    }
  });

  await prisma.tale.createMany({
    data: [
      {
        authorId: admin.id,
        title: "The Day the Moon Wore Sneakers",
        body: "".padEnd(420, "Once upon a time, the moon decided it was tired of boots and asked the stars for something lighter. "),
        status: TaleStatus.APPROVED,
        approvedAt: new Date(),
        hotScore: 2.1,
        topScore: 12,
        score: 12,
        upvotes: 12,
        downvotes: 0,
        storyPrompt:
          "Write a playful bedtime myth about the moon deciding to trade gravity for delight."
      },
      {
        authorId: demoUser.id,
        title: "A Very Righteous Sandwich",
        body: "".padEnd(410, "The sandwich was a hero, layered with lettuce of justice and a tomato of destiny. "),
        status: TaleStatus.APPROVED,
        approvedAt: new Date(),
        hotScore: 1.2,
        topScore: 3,
        score: 3,
        upvotes: 3,
        downvotes: 0,
        isAnonymous: true
      }
    ]
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
