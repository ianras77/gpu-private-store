import { test, expect } from "@playwright/test";

test("brand home stays legible on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const primary = page.getByRole("navigation", { name: "Primary" });
  await expect(primary.getByRole("link", { name: "Your Chart" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Reading" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Compatibility" })).toBeVisible();
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(390);
});
