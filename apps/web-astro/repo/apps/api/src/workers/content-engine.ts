import "dotenv/config";
import { runWeeklyContentEngine } from "../lib/content-engine";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const intervalMinutes = Number(process.env.CONTENT_ENGINE_INTERVAL_MINUTES ?? 60);
const runOnStart = process.env.CONTENT_ENGINE_RUN_ON_START !== "0";

const runCycle = async () => {
  const startedAt = new Date().toISOString();
  try {
    const result = await runWeeklyContentEngine();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ startedAt, ...result }));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Content engine cycle failed.", error);
  }
};

const main = async () => {
  if (runOnStart) {
    await runCycle();
  }

  if (process.env.CONTENT_ENGINE_RUN_ONCE === "1") {
    return;
  }

  while (true) {
    await sleep(intervalMinutes * 60 * 1000);
    await runCycle();
  }
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
