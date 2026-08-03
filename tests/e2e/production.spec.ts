import { expect, test } from "@playwright/test";

test("public source and reviewed lesson routes remain usable", async ({
  page,
}) => {
  await page.goto("/");
  const browseAllSurahsLink = page.getByRole("link", {
    name: "Browse all surahs",
  });
  await expect(browseAllSurahsLink).toHaveAttribute("href", "/surahs");
  const allSurahsLink = page.getByRole("link", { name: "View all surahs" });
  await expect(allSurahsLink).toHaveAttribute("href", "/surahs");
  await allSurahsLink.click();
  await expect(page).toHaveURL(/\/surahs$/);

  await page.goto("/surahs");
  await expect(page).toHaveTitle(/Word Tree/i);
  await expect(page.locator("body")).toContainText("114");

  const searchInput = page.getByLabel("Search all sūrahs and Qur’anic words");
  await searchInput.fill("Al Fatiha");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".search-surah-results")).toContainText(
    "Al-Fātiḥah",
    { timeout: 30_000 },
  );
  await expect(page.locator(".search-result-summary")).toContainText(
    "About 1 match",
    { timeout: 30_000 },
  );

  await searchInput.fill("Lord");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".search-ayah-results")).toContainText("Āyah", {
    timeout: 30_000,
  });

  await searchInput.fill("hell");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".search-result-summary")).toContainText(
    "About 113 matches",
    { timeout: 30_000 },
  );
  await expect(page.locator(".search-ayah-results")).toContainText("Hellfire", {
    timeout: 30_000,
  });
  expect(
    await page.locator(".search-ayah-result mark").count(),
  ).toBeGreaterThan(0);

  await page.goto("/learn/114/1");
  await expect(page.locator("body")).toContainText("Word 1 of 4");
  await expect(page.locator("body")).toContainText("Root");

  await page.goto("/learn/109/1");
  await expect(page.locator("body")).toContainText("Source layer available");
  await expect(page.locator("body")).not.toContainText(
    "Where the word comes from",
  );

  await page.goto("/learn/7/1");
  await expect(page.locator("body")).toContainText("Source layer available");
  await expect(page.locator("body")).toContainText("الٓمٓصٓ");

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

test("word breakdowns preserve Arabic right-to-left component order", async ({
  page,
}) => {
  await page.goto("/learn/114/1");

  const wordChip = page.locator(".word-chip").filter({ hasText: "أَعُوذُ" });
  await wordChip.click();

  const parts = page.locator(".selected-word-breakdown .breakdown-part");
  await expect(parts).toHaveCount(2);
  await expect(parts.first().locator("b")).toHaveText("أَـ");
  await expect(parts.nth(1).locator("b")).toHaveText("عُوذُ");

  const positions = await parts.evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().left),
  );
  expect(positions[0]).toBeGreaterThan(positions[1]);
});

test("presentation grammar and sarf rows are centered and readable", async ({
  page,
}) => {
  await page.goto("/presentation/114/1/word/1");
  const nextSection = page.locator(".presentation-next");
  await nextSection.click();
  await nextSection.click();

  const grammarRow = page.locator(".presentation-grammar-list > div").first();
  await expect(grammarRow).toHaveCSS("display", "flex");
  await expect(grammarRow).toHaveCSS("text-align", "center");
  await expect(grammarRow.locator("span")).toHaveCSS(
    "font-size",
    /^(17|18)px$/,
  );

  await nextSection.click();
  const formRow = page.locator(".presentation-form-list > div").first();
  await expect(formRow).toHaveCSS("display", "flex");
  await expect(formRow).toHaveCSS("text-align", "center");
});
