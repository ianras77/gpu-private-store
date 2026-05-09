import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 60000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    {
      name: "web-jupiterseek",
      use: { baseURL: process.env.WEB_JUPITERSEEK_URL ?? "http://localhost:3000" }
    },
    {
      name: "web-saturnseer",
      use: { baseURL: process.env.WEB_SATURNSEER_URL ?? "http://localhost:3001" }
    },
    {
      name: "web-saturnleo",
      use: { baseURL: process.env.WEB_SATURNLEO_URL ?? "http://localhost:3002" }
    },
    {
      name: "web-maleficme",
      use: { baseURL: process.env.WEB_MALEFICME_URL ?? "http://localhost:3003" }
    }
  ]
});
