import { PrismaClient } from "@prisma/client";

let prismaClient: PrismaClient | null = null;

const createPrismaClient = (): PrismaClient => {
  try {
    return new PrismaClient();
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Prisma client is unavailable. Run \"pnpm --filter @astro/api exec prisma generate\" and ensure DATABASE_URL is configured. ${details}`
    );
  }
};

const getPrismaClient = (): PrismaClient => {
  if (!prismaClient) {
    prismaClient = createPrismaClient();
  }
  return prismaClient;
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
