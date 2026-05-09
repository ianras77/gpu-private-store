import { describe, expect, test } from "bun:test";
import { appInfoSchema, dynamicComposeSchema } from "@runtipi/common/schemas";
import { fromError } from "zod-validation-error";
import { type } from "arktype";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const appsRoot = path.join(process.cwd(), "apps");

const getApps = async () => {
  const entries = await fs.promises.readdir(appsRoot);

  return entries.filter((entry) => {
    const stat = fs.statSync(path.join(appsRoot, entry));
    return stat.isDirectory();
  });
};

const getFile = async (app: string, file: string) => {
  const filePath = path.join(appsRoot, app, file);

  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
};

describe("app store structure", async () => {
  const apps = await getApps();

  for (const app of apps) {
    for (const file of ["config.json", "docker-compose.yml", "metadata/logo.jpg", "metadata/description.md"]) {
      test(`${app} includes ${file}`, async () => {
        expect(await getFile(app, file)).not.toBeNull();
      });
    }

    test(`${app} folder matches config.json id`, async () => {
      const fileContent = await getFile(app, "config.json");
      const parsed = JSON.parse(fileContent || "{}");

      expect(parsed.id).toBe(app);
    });
  }
});

describe("app configs", async () => {
  const apps = await getApps();

  for (const app of apps) {
    test(`${app} has a valid config.json`, async () => {
      const fileContent = await getFile(app, "config.json");
      const parsed = appInfoSchema.omit("urn")(JSON.parse(fileContent || "{}"));

      if (parsed instanceof type.errors) {
        console.error(`Error parsing config.json for ${app}:`, fromError(parsed).toString());
      }

      expect(parsed instanceof type.errors).toBe(false);
    });
  }
});

describe("app compose files", async () => {
  const apps = await getApps();

  for (const app of apps) {
    test(`${app} has a valid docker-compose.yml`, async () => {
      const fileContent = await getFile(app, "docker-compose.yml");
      const parsed = dynamicComposeSchema(parse(fileContent || "{}"));

      if (parsed instanceof type.errors) {
        console.error(`Error parsing docker-compose.yml for ${app}:`, fromError(parsed).toString());
      }

      expect(parsed instanceof type.errors).toBe(false);
    });
  }
});
