import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { agentRegistry } from "./agents";

export const mastra = new Mastra({
  agents: agentRegistry,
  storage: new PostgresStore({
    id: "rassy-online-mastra-storage",
    connectionString: process.env.DATABASE_URL ?? "postgresql://rassy_online:rassy_online@localhost:5432/rassy_online"
  })
});
export { agentRegistry };
