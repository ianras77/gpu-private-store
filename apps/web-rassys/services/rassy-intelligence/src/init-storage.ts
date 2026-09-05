import { PostgresStore } from "@mastra/pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const storage = new PostgresStore({
  id: "rassy-mastra-postgres",
  connectionString,
  schemaName: process.env.RASSY_MASTRA_SCHEMA ?? "rassy_mastra",
  disableInit: false,
});

await storage.init();
await storage.close();
console.log(JSON.stringify({ ok: true, schema: process.env.RASSY_MASTRA_SCHEMA ?? "rassy_mastra" }));
