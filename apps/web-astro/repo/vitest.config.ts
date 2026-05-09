import path from "path";
import { defineConfig } from "vitest/config";

const cacheRoot = path.resolve(__dirname, ".vitest");
const cacheDir = path.join(cacheRoot, path.basename(process.cwd()));

export default defineConfig({
  cacheDir,
  test: {
    passWithNoTests: true
  }
});
