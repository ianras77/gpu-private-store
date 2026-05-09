import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../src/lib/arcade.ts");
const contents = fs.readFileSync(file, "utf8");
if (!contents.includes("arcadeServices") || contents.length < 20) {
  console.error("Smoke test failed: arcadeServices missing");
  process.exit(1);
}
console.log("Smoke test ok");
