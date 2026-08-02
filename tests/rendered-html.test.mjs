import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("prototype removes the starter shell and keeps the app public", async () => {
  const [page, layout, packageJson, plan] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("docs/prompt-2-production-plan.md", root), "utf8"),
  ]);

  assert.match(page, /PrototypeApp/);
  assert.match(layout, /Word Tree/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|signin/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(plan, /No account/i);
  assert.match(plan, /P0\.1 Environment lock/);
});

test("starter import packages cover all six required sūrahs", async () => {
  const expected = [
    "109-al-kafirun",
    "110-an-nasr",
    "111-al-masad",
    "112-al-ikhlas",
    "113-al-falaq",
    "114-al-nas",
  ];
  for (const directory of expected) {
    const manifest = await readFile(
      new URL(`content-import/surahs/${directory}/manifest.json`, root),
      "utf8",
    );
    assert.match(manifest, /"schemaVersion": 1/);
    assert.match(manifest, /"includedAyahs"/);
    await readFile(
      new URL(`content-import/surahs/${directory}/surah.json`, root),
      "utf8",
    );
  }
});
