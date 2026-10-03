import { expect, test } from "@playwright/test";

test("public source and reviewed lesson routes remain usable", async ({
  page,
}) => {
  test.setTimeout(60_000);

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
  await expect(page.locator(".selected-word-breakdown")).not.toContainText(
    "Source morphology",
  );

  await page.goto("/learn/114/3");
  await expect(page.locator(".surah-card")).toHaveCount(3);
  await expect(page.locator(".surah-card.selected")).toContainText("An-Nās");
  await expect(page.locator("body")).not.toContainText("Starter scope");
  await expect(page.locator("body")).not.toContainText(
    "complete starter sūrahs",
  );
  await expect(page.locator("body")).not.toContainText("accounts required");
  await expect(page.locator(".current-surah-count")).toHaveText("6 āyāt");

  await page.goto("/learn/111/1");
  await expect(page.locator("body")).toContainText("Complete Word Tree");
  await expect(page.locator("body")).not.toContainText(
    "Custom content in progress",
  );
  await expect(page.locator("body")).toContainText("perished / was ruined");
  await expect(
    page.locator(".selected-word-breakdown .breakdown-part"),
  ).toHaveCount(2);
  await expect(page.locator(".selected-word-breakdown")).toContainText(
    "feminine marker",
  );
  await page.locator(".word-chip").nth(4).click();
  await expect(page.locator(".selected-word-breakdown")).toContainText(
    "he perished",
  );
  await page.goto("/learn/111/5");
  await expect(page.locator("body")).toContainText("twisted fibre");
  await page.locator(".word-chip").nth(1).click();
  await expect(page.locator(".selected-word-breakdown")).toContainText(
    "her",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const wordHeaderBounds = await page
    .locator(".word-focus-copy")
    .evaluate((copy) => {
      const label = copy.querySelector(".card-kicker")?.getBoundingClientRect();
      const arabic = copy.querySelector("h4")?.getBoundingClientRect();
      return { labelBottom: label?.bottom ?? 0, arabicTop: arabic?.top ?? 0 };
    });
  expect(wordHeaderBounds.labelBottom).toBeLessThanOrEqual(
    wordHeaderBounds.arabicTop,
  );

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

test("selected words show source-backed surface and deeper morphology", async ({
  page,
}) => {
  await page.goto("/learn/113/1");
  await page.locator(".word-chip").nth(1).click();
  await expect(
    page.locator(".selected-word-breakdown .breakdown-part"),
  ).toHaveCount(2);
  await expect(page.locator(".selected-word-breakdown")).toContainText("أَـ");
  await expect(page.locator(".selected-word-breakdown")).toContainText("عُوذُ");
  await expect(page.locator(".morphology-analysis")).toContainText("Root");

  await page.goto("/learn/113/4");
  await page.locator(".word-chip").nth(2).click();
  await expect(
    page.locator(".selected-word-breakdown .breakdown-part"),
  ).toHaveCount(2);
  await expect(page.locator(".selected-word-breakdown")).toContainText("ٱلْ");
  await expect(page.locator(".morphology-analysis")).toContainText(
    "Deeper formation",
  );
  await expect(page.locator(".morphology-analysis")).toContainText("نَفَّاثَة");

  await page.goto("/learn/114/2");
  await page.locator(".word-chip").first().click();
  await expect(
    page.locator(".selected-word-breakdown .breakdown-part"),
  ).toHaveCount(1);
  await expect(page.locator(".morphology-analysis")).toContainText("genitive");
  await expect(page.locator(".morphology-analysis")).not.toContainText(
    "Source morphology",
  );
  await page.goto("/learn/109/1");
  await expect(page.locator(".source-morphology")).toContainText(
    "Imported morphology evidence",
  );
  await expect(
    page.locator(".source-morphology .morphology-analysis"),
  ).toContainText("Root");

  for (const [ayah, position] of [
    [1, 3],
    [2, 1],
    [3, 1],
    [5, 4],
  ]) {
    await page.goto(`/learn/114/${ayah}`);
    await page.locator(".word-chip").nth(position).click();
    await expect(
      page.locator(".selected-word-breakdown .breakdown-part"),
    ).toHaveCount(2);
    await expect(page.locator(".selected-word-breakdown")).toContainText(
      "humankind",
    );
    await expect(page.locator(".selected-word-breakdown")).not.toContainText(
      "main word",
    );
  }
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
