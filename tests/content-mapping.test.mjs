import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

async function packages() {
  const directories = await readdir(path.join(root, "content-import", "surahs"));
  return Promise.all(directories.map(async (directory) => {
    const file = path.join(root, "content-import", "surahs", directory, "surah.json");
    try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
  })).then((items) => items.filter(Boolean));
}

function findWord(packageData, ayahNumber, position) {
  return packageData.ayahs.find((ayah) => ayah.number === ayahNumber)?.words.find((word) => word.position === position);
}

test("all 58 custom occurrences have explicit valid atomic or segmented breakdowns", async () => {
  const all = await packages();
  const custom = all.flatMap((pkg) => pkg.ayahs.flatMap((ayah) => ayah.words.filter((word) => word.teachingId).map((word) => ({ pkg, word }))));
  assert.equal(custom.length, 58);
  for (const { word } of custom) {
    const breakdown = word.breakdown;
    assert.ok(breakdown);
    assert.ok(["atomic", "segmented"].includes(breakdown.mode));
    assert.equal(breakdown.sourceText, word.arabic);
    assert.equal(breakdown.parts.length, breakdown.mode === "atomic" ? 1 : breakdown.parts.length);
    assert.deepEqual(breakdown.parts.map((part) => part.order), breakdown.parts.map((_, index) => index + 1));
    assert.equal(breakdown.parts.map((part) => part.sourceText).join(""), breakdown.sourceText);
    for (const part of breakdown.parts) {
      assert.ok(part.id && part.label && part.meaning && part.kind);
      assert.ok(part.sourceText);
      assert.ok(part.displayText);
    }
  }
});

test("the six-surah regression layer preserves 127 occurrences and source-only status", async () => {
  const all = await packages();
  const selected = all.filter((pkg) => pkg.surah.number >= 109 && pkg.surah.number <= 114);
  assert.equal(selected.length, 6);
  assert.equal(selected.reduce((sum, pkg) => sum + pkg.ayahs.reduce((n, ayah) => n + ayah.words.length, 0), 0), 127);
  assert.deepEqual(selected.filter((pkg) => pkg.status === "source-only").map((pkg) => pkg.surah.number), [109, 110, 111]);
  assert.deepEqual(selected.filter((pkg) => pkg.status === "custom-complete").map((pkg) => pkg.surah.number), [112, 113, 114]);
});

test("required teaching mappings use exact source parts and display-only joining lines", async () => {
  const all = await packages();
  const byNumber = new Map(all.map((pkg) => [pkg.surah.number, pkg]));
  const audhu = findWord(byNumber.get(113), 1, 2);
  assert.deepEqual(audhu.breakdown.parts.map((part) => part.sourceText), ["أَ", "عُوذُ"]);
  assert.equal(audhu.breakdown.parts[0].displayText, "أَـ");
  assert.equal(audhu.breakdown.parts.map((part) => part.sourceText).join(""), "أَعُوذُ");

  const birabbi = findWord(byNumber.get(113), 1, 3);
  assert.deepEqual(birabbi.breakdown.parts.map((part) => part.sourceText), ["بِ", "رَبِّ"]);
  const walam = findWord(byNumber.get(112), 3, 3);
  assert.deepEqual(walam.breakdown.parts.map((part) => part.sourceText), ["وَ", "لَمْ"]);
  const lahu = findWord(byNumber.get(112), 4, 3);
  assert.equal(lahu.arabic, "لَّهُۥ");
  assert.equal(lahu.breakdown.mode, "atomic");
  assert.equal(lahu.breakdown.parts[0].sourceText, lahu.arabic);
  const wanas = findWord(byNumber.get(114), 6, 3);
  assert.deepEqual(wanas.breakdown.parts.map((part) => part.sourceText), ["وَ", "ٱلنَّاسِ"]);
  const qul = findWord(byNumber.get(114), 1, 1);
  assert.equal(qul.breakdown.mode, "atomic");
  assert.equal(qul.breakdown.parts[0].sourceText, "قُلْ");
});

test("source-only packages do not invent custom teaching", async () => {
  const all = await packages();
  for (const pkg of all.filter((item) => item.status === "source-only")) {
    assert.equal(Object.keys(pkg.teachingEntries).length, 0);
    assert.equal(pkg.ayahs.flatMap((ayah) => ayah.words).some((word) => word.teachingId || word.breakdown), false);
  }
});

test("known authored word assignments remain occurrence-specific", async () => {
  const all = await packages();
  const falaq = all.find((pkg) => pkg.surah.number === 113);
  const nas = all.find((pkg) => pkg.surah.number === 114);
  const falaqWords = falaq.ayahs.flatMap((ayah) => ayah.words);
  const nasWords = nas.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(falaqWords.find((word) => word.arabic === "مِن")?.teachingId, "lesson:min");
  assert.equal(falaqWords.find((word) => word.arabic === "غَاسِقٍ")?.teachingId, "lesson:ghasiq");
  assert.equal(nasWords.find((word) => word.arabic === "مَلِكِ")?.teachingId, "lesson:malik");
  assert.equal(nasWords.find((word) => word.arabic === "إِلَٰهِ")?.teachingId, "lesson:ilah");
  assert.equal(nasWords.find((word) => word.arabic === "مِنَ")?.teachingId, "lesson:min");
});
