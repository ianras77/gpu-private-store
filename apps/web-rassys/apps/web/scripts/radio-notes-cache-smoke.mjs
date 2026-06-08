import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../src/lib/radio-notes.ts");
const contents = fs.readFileSync(file, "utf8");

const requiredTokens = [
  "createVolatileCache<RadioNote[]>",
  "notesListCache",
  "RADIO_NOTES_LIST_CACHE_TTL_MS"
];

for (const token of requiredTokens) {
  if (!contents.includes(token)) {
    console.error(`Radio notes cache smoke failed: missing ${token}`);
    process.exit(1);
  }
}

console.log("Radio notes cache smoke ok");
