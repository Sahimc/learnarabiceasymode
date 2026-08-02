import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("authored breakdowns cover the complete word and preserve display joins", async () => {
  for (const directory of ["113-al-falaq", "114-al-nas"]) {
    const packageData = JSON.parse(
      await readFile(
        new URL(`content-import/surahs/${directory}/surah.json`, root),
        "utf8",
      ),
    );
    const word = packageData.ayahs[0].words[1];
    assert.equal(word.arabic, "أَعُوذُ");
    assert.equal(word.breakdown.sourceText, word.arabic);
    assert.deepEqual(
      word.breakdown.parts.map((part) => part.sourceText),
      ["أَ", "عُوذُ"],
    );
    assert.equal(
      word.breakdown.parts.map((part) => part.sourceText).join(""),
      word.breakdown.sourceText,
    );
    assert.equal(word.breakdown.parts[0].displayText, "أَـ");
  }
});

test("complete starter packages keep each word mapped to a teaching lesson", async () => {
  const directories = ["112-al-ikhlas", "113-al-falaq", "114-al-nas"];

  for (const directory of directories) {
    const packageData = JSON.parse(
      await readFile(
        new URL(`content-import/surahs/${directory}/surah.json`, root),
        "utf8",
      ),
    );
    for (const ayah of packageData.ayahs) {
      for (const [index, word] of ayah.words.entries()) {
        assert.equal(word.position, index + 1);
        assert.equal(
          word.id,
          `word:${packageData.number}:${ayah.number}:${index + 1}`,
        );
        assert.ok(word.arabic.length > 0);
        assert.match(
          word.teachingId,
          /^lesson:/,
          `${directory} ${ayah.number}:${word.position} is missing a teaching lesson`,
        );
      }
    }
  }
});

test("Al-Falaq and Al-Nas use the specific lessons for previously misassigned words", async () => {
  const [falaq, nas] = await Promise.all([
    readFile(
      new URL("content-import/surahs/113-al-falaq/surah.json", root),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("content-import/surahs/114-al-nas/surah.json", root),
      "utf8",
    ).then(JSON.parse),
  ]);

  const falaqLessons = new Map(
    falaq.ayahs
      .flatMap((ayah) => ayah.words)
      .map((word) => [word.arabic, word.teachingId]),
  );
  const nasLessons = new Map(
    nas.ayahs
      .flatMap((ayah) => ayah.words)
      .map((word) => [word.arabic, word.teachingId]),
  );

  assert.equal(falaqLessons.get("مِن"), "lesson:min");
  assert.equal(falaqLessons.get("مَا"), "lesson:ma");
  assert.equal(falaqLessons.get("غَاسِقٍ"), "lesson:ghasiq");
  assert.equal(falaqLessons.get("حَاسِدٍ"), "lesson:hasid");
  assert.equal(nasLessons.get("مَلِكِ"), "lesson:malik");
  assert.equal(nasLessons.get("إِلَٰهِ"), "lesson:ilah");
  assert.equal(nasLessons.get("مِن"), "lesson:min");
  assert.equal(nasLessons.get("مِنَ"), "lesson:min");
});
