import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.resolve(__dirname, "../src/app/dungeon-master/page.tsx"), "utf8");

const requiredTokens = [
  'data-testid="gamma-terminal-screen"',
  'data-testid="dm-command-line"',
  'data-testid="dm-context-display"',
  "Gamma Terminal"
];

for (const token of requiredTokens) {
  if (!page.includes(token)) {
    console.error(`DM console smoke failed: missing ${token}`);
    process.exit(1);
  }
}

console.log("DM console smoke ok");
