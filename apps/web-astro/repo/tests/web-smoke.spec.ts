import { test, expect } from "@playwright/test";

test("intake -> chart -> reading", async ({ page }) => {
  await page.goto("/intake");
  await page.locator('input[type="date"]').fill("1990-01-01");
  await page.locator('input[type="time"]').fill("08:30");
  await page.getByPlaceholder("City, Country").fill("New York, USA");
  await page.getByRole("button", { name: /Generate Chart/i }).click();

  await expect(page.getByText("Chart Reveal")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: /View Full Reading/i }).click();

  await page.getByRole("button", { name: /Short/i }).click();
  await expect(page.getByText("Overview")).toBeVisible({ timeout: 60000 });
});
