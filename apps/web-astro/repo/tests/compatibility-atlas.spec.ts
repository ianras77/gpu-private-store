import { test, expect } from "@playwright/test";

test("signed-in compatibility creates a durable Mastra Atlas", async ({ page }) => {
  const planRequests: Array<Record<string, unknown>> = [];
  await page.goto("/");
  await page.addInitScript(() => {
    localStorage.setItem("astro_chart_current", JSON.stringify({
      id: "chart-local-qa",
      chartProfileId: "profile-qa",
      locationLabel: "Portland, USA",
      meta: { timezone: "America/Los_Angeles" },
      points: []
    }));
    localStorage.setItem("astro_auth_session", JSON.stringify({
      token: "browser-qa-token",
      user: { id: "user-qa", email: "qa@example.test", displayName: "Atlas QA" }
    }));
  });
  await page.route("**/api/v1/geo/resolve", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ results: [{ id: "partner-location", name: "New York, USA", lat: 40.7128, lon: -74.006, timezone: "America/New_York" }] })
  }));
  await page.route("**/api/v1/chart/natal", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ chart: { points: [], meta: { timezone: "America/New_York" } } })
  }));
  await page.route("**/api/v1/report-runs", async (route) => {
    planRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ run: { id: "run-qa" } }) });
  });
  await page.route("**/api/v1/report-runs/run-qa/execute", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "completed", artifact: {
      cover: { title: "A relationship atlas", excerpt: "A grounded story across two charts." },
      navigation: [{ key: "relationship-synthesis", title: "Relationship pattern" }],
      sections: [{ key: "relationship-synthesis", title: "Relationship pattern", body: ["A shared pattern grounded in both charts."], factRefs: ["synastry:venus-mars"], status: "complete" }],
      practicalIntegration: { reflections: ["What feels mutual?"], practices: [], questions: [] },
      disclaimer: "A reflective reading."
    } })
  }));

  await page.goto("/compatibility");
  await page.locator('input[type="date"]').fill("1992-11-04");
  await page.locator('input[type="time"]').fill("09:15");
  await page.getByPlaceholder("City, Country").fill("New York, USA");
  await page.getByRole("button", { name: "New York, USA" }).click();
  await page.getByRole("button", { name: "Long Form" }).click();

  await expect(page.getByRole("heading", { name: "A relationship atlas" })).toBeVisible();
  await expect(page.getByText("Built from 1 chart facts")).toBeVisible();
  expect(planRequests).toHaveLength(1);
  expect(planRequests[0]).toMatchObject({
    chartProfileId: "profile-qa",
    kind: "compatibility",
    depth: "deep"
  });
});
