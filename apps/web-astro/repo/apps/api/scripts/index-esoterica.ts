import "dotenv/config";
import { runEsotericaIngest } from "../src/lib/esoterica-ingestor";

const main = async () => {
  const result = await runEsotericaIngest({
    dryRun: process.argv.includes("--dry-run") || process.env.ESOTERICA_DRY_RUN === "1",
    writeJsonl: process.env.ESOTERICA_WRITE_JSONL === "1"
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        sourceDir: result.sourceDir,
        filesDiscovered: result.filesDiscovered,
        filesPlanned: result.filesPlanned,
        filesSkipped: result.filesSkipped,
        filesFailed: result.filesFailed,
        chunksPlanned: result.chunksPlanned,
        chunksEmbedded: result.chunksEmbedded,
        chunksUpserted: result.chunksUpserted,
        collection: result.collection,
        statusPath: result.statusPath,
        errors: result.errors
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
