import type { Env } from "../../env.js";
import { getHouseStatus } from "../../status.js";
import { getThoughtsForHouse } from "../../thoughts.js";
import { getStoriesForHouse } from "../../stories.js";

export type HouseBrief = { mood: string; mission: string; surprise: string; prompts: string[] };

export async function runHouseBriefWorkflow(env: Env): Promise<HouseBrief> {
  const [status, thoughts, stories] = await Promise.allSettled([getHouseStatus(env), getThoughtsForHouse(env), getStoriesForHouse(env)]);
  const up = status.status === "fulfilled" ? status.value.items.filter((item) => item.state === "up").length : 0;
  const latestThought = thoughts.status === "fulfilled" ? thoughts.value[0]?.title : undefined;
  const latestStory = stories.status === "fulfilled" ? stories.value.books?.[0]?.title : undefined;
  return {
    mood: up > 0 ? "The house is open, the kettle is thinking about it, and I’m here." : "The house is taking a quiet moment; no need to rush it.",
    mission: latestThought ? `If you have a minute, there’s a little note waiting: “${latestThought}”.` : "Bring me one small snag from today and I’ll help turn it into the next easy step.",
    surprise: latestStory ? `A bedtime story is waiting for later: “${latestStory}”.` : "Ask for something useful, oddly specific, or a little silly.",
    prompts: ["Rescue the next two hours", "Make a five-minute backup habit", "Plan an easy dinner", "Write a family note"],
  };
}
