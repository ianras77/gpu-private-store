import { Agent } from "@mastra/core/agent";
import type { Env } from "../env.js";
import { HOUSE_CONSTITUTION } from "./policy.js";
import { rassymindModel } from "./models/rassymind.js";
import { createHouseDirectoryTool } from "./tools/house-directory.js";
import { createArchiveTool } from "./tools/archive.js";
import { createHouseStatusTool } from "./tools/status.js";

export function createHouseAgent(env: Env) {
  return new Agent({
    id: "house-agent",
    name: "House Chat",
    instructions: HOUSE_CONSTITUTION,
    model: rassymindModel(env),
    tools: { houseDirectory: createHouseDirectoryTool(env), searchHouseArchive: createArchiveTool(env), getHouseStatus: createHouseStatusTool(env) },
  });
}

export type HouseAgent = ReturnType<typeof createHouseAgent>;
