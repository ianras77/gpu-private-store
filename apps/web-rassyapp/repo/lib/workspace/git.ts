import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function getCurrentBranch(cwd: string) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd
    });
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

export async function getGitStatusMap(cwd: string) {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
    const map = new Map<string, "modified" | "added" | "deleted" | "renamed">();

    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const status = line.slice(0, 2).trim();
        const rawPath = line.slice(2).trim();
        const path = rawPath.includes(" -> ") ? (rawPath.split(" -> ").pop() ?? rawPath) : rawPath;

        if (!path) return;
        if (status === "??" || status.includes("A")) {
          map.set(path, "added");
        } else if (status.includes("D")) {
          map.set(path, "deleted");
        } else if (status.includes("R")) {
          map.set(path, "renamed");
        } else if (status.includes("M")) {
          map.set(path, "modified");
        }
      });

    return map;
  } catch (error) {
    return new Map();
  }
}

export async function getFileDiff(cwd: string, relativePath: string) {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--", relativePath], { cwd });
    return stdout.trim();
  } catch (error) {
    return "";
  }
}
