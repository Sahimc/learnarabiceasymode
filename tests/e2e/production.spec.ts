import { expect, test } from "@playwright/test";

test("public source and reviewed lesson routes remain usable", async ({
  page,
}) => {
  await page.goto("/surahs");
  await expect(page).toHaveTitle(/Word Tree/i);
  await expect(page.locator("body")).toContainText("114");

  await page.goto("/learn/114/1");
  await expect(page.locator("body")).toContainText("Word 1 of 4");
  await expect(page.locator("body")).toContainText("Root");

  await page.goto("/learn/109/1");
  await expect(page.locator("body")).toContainText("Source layer available");
  await expect(page.locator("body")).not.toContainText(
    "Where the word comes from",
  );

  const health = await page.request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).status).toBe("ok");
});

test("mobile lesson has no uncontrolled horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/learn/114/1");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
