import { buildServer } from "./server";
import { hydrateLibraryFromCatalog, startScheduler } from "./scheduler";
import { config } from "./config";
import { logger } from "./logger";

const start = async () => {
  const app = buildServer();
  await hydrateLibraryFromCatalog();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  logger.info(`radio-controller listening on ${config.PORT}`);
  await startScheduler();
};

start().catch((err) => {
  logger.error(err);
  process.exit(1);
});
