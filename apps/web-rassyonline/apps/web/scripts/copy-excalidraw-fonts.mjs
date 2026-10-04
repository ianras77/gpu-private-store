import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(appRoot, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const destination = join(appRoot, "public/excalidraw-assets/fonts");

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });
