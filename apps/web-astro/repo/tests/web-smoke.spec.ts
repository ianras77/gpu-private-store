import { test, expect } from "@playwright/test";

test("intake -> chart -> reading", async ({ page }) => {
  await page.route("**/api/v1/geo/resolve", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ results: [{ id: "new-york-fixture", name: "New York, USA", lat: 40.7128, lon: -74.006, timezone: "America/New_York" }] })
  }));
  await page.goto("/intake");
  await page.locator('input[type="date"]').fill("1990-01-01");
  await page.locator('input[type="time"]').fill("08:30");
  await page.getByPlaceholder("City, Country").fill("New York, USA");
  await page.getByRole("button", { name: "New York, USA" }).click();
  await page.getByRole("button", { name: /Draw My Birth Chart/i }).click();

  await expect(page.getByRole("heading", { name: "Your sky, made legible." })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("tab", { name: "planets" })).toBeVisible();
  await page.getByRole("tab", { name: "aspects" }).click();
  await expect(page.getByRole("tab", { name: "aspects" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Quick" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 60000 });
});
