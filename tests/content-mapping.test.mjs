import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

async function packages() {
  const directories = await readdir(
    path.join(root, "content-import", "surahs"),
  );
  return Promise.all(
    directories.map(async (directory) => {
      const file = path.join(
        root,
        "content-import",
        "surahs",
        directory,
        "surah.json",
      );
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch {
        return null;
      }
    }),
  ).then((items) => items.filter(Boolean));
}

function findWord(packageData, ayahNumber, position) {
  return packageData.ayahs
    .find((ayah) => ayah.number === ayahNumber)
    ?.words.find((word) => word.position === position);
}

function expectedPackageStatus(packageData) {
  const hasBlockedFamily = Object.values(packageData.teachingEntries ?? {}).some(
    (lesson) =>
      lesson.sarfReview?.auditDecision === "blocked-for-genuine-ambiguity",
  );
  return hasBlockedFamily ? "custom-partial" : "custom-complete";
}

test("all authored occurrences have explicit valid atomic or segmented breakdowns", async () => {
  const all = await packages();
  const custom = all.flatMap((pkg) =>
    pkg.ayahs.flatMap((ayah) =>
      ayah.words
        .filter((word) => word.teachingId)
        .map((word) => ({ pkg, word })),
    ),
  );
  assert.equal(custom.length, 77434);
  for (const { word } of custom) {
    const breakdown = word.breakdown;
    assert.ok(breakdown);
    assert.ok(["atomic", "segmented"].includes(breakdown.mode));
    assert.equal(breakdown.sourceText, word.arabic);
    assert.equal(
      breakdown.parts.length,
      breakdown.mode === "atomic" ? 1 : breakdown.parts.length,
    );
    assert.deepEqual(
      breakdown.parts.map((part) => part.order),
      breakdown.parts.map((_, index) => index + 1),
    );
    assert.equal(
      breakdown.parts.map((part) => part.sourceText).join(""),
      breakdown.sourceText,
    );
    for (const part of breakdown.parts) {
      assert.ok(part.id && part.label && part.meaning && part.kind);
      assert.ok(part.sourceText);
      assert.ok(part.displayText);
    }
  }
});

test("compound roots stay visible while rootless grammatical parts are explained", async () => {
  const all = await packages();
  const byNumber = new Map(all.map((pkg) => [pkg.surah.number, pkg]));
  const bismi = findWord(byNumber.get(1), 1, 1);
  const bismiLesson = byNumber.get(1).teachingEntries[bismi.teachingId];
  assert.equal(bismiLesson.root, "س م و");
  assert.equal(bismi.breakdown.parts[0].rootStatus, "rootless");
  assert.equal(
    bismi.breakdown.parts[0].rootExplanation,
    "No lexical root (preposition)",
  );
  assert.equal(bismi.breakdown.parts[1].rootStatus, "lexical");
  assert.equal(bismi.breakdown.parts[1].root, "س م و");

  const wanas = findWord(byNumber.get(114), 6, 3);
  const wanasLesson = byNumber.get(114).teachingEntries[wanas.teachingId];
  assert.equal(wanasLesson.root, "أ ن س");
  assert.equal(
    wanas.breakdown.parts[0].rootExplanation,
    "No lexical root (connector)",
  );
  assert.equal(wanas.breakdown.parts[1].root, "أ ن س");

  const faba = findWord(byNumber.get(77), 50, 1);
  const fabaLesson = byNumber.get(77).teachingEntries[faba.teachingId];
  assert.equal(faba.arabic, "فَبِأَىِّ");
  assert.equal(faba.breakdown.parts[0].kind, "connector");
  assert.equal(faba.breakdown.parts[0].label, "so / then");
  assert.equal(
    faba.breakdown.parts[0].rootExplanation,
    "No lexical root (connector)",
  );
  assert.equal(faba.breakdown.parts[1].kind, "preposition");
  assert.equal(
    faba.breakdown.parts[1].rootExplanation,
    "No lexical root (preposition)",
  );
  assert.equal(faba.breakdown.parts[2].rootStatus, "lexical");
  assert.equal(faba.breakdown.parts[2].root, "أ ي ي");
  assert.equal(fabaLesson.components[2].root, "أ ي ي");
});

test("custom lesson components keep explicit root status and category labels", async () => {
  const all = await packages();
  const grammaticalKinds = new Set([
    "suffix",
    "article",
    "preposition",
    "connector",
    "subject-marker",
    "object-pronoun",
    "possessive-pronoun",
    "ending",
  ]);
  for (const pkg of all.filter((item) => item.status.startsWith("custom-"))) {
    for (const lesson of Object.values(pkg.teachingEntries)) {
      for (const component of lesson.components) {
        assert.ok(component.rootStatus, `${pkg.packageId}/${lesson.id}`);
        if (component.rootStatus === "lexical") {
          assert.ok(component.root, `${pkg.packageId}/${lesson.id}`);
          assert.equal(
            grammaticalKinds.has(component.kind),
            false,
            `${pkg.packageId}/${lesson.id}/${component.text}`,
          );
        } else {
          assert.match(
            component.rootExplanation ?? "",
            /^No lexical root \([^()]+\)$/u,
            `${pkg.packageId}/${lesson.id}/${component.text}`,
          );
        }
      }
      if (lesson.root && lesson.components.length > 0) {
        assert.ok(
          lesson.components.some(
            (component) =>
              component.rootStatus === "lexical" &&
              component.root === lesson.root,
          ),
          `${pkg.packageId}/${lesson.id} does not expose its lexical root in components`,
        );
      }
    }
  }
});

test("root picture subtitles are English meanings, not repeated roots or categories", async () => {
  const all = await packages();
  const arabicScript =
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
  const normalize = (value) => value.replace(/\s+/gu, "").trim();
  for (const pkg of all.filter((item) => item.status.startsWith("custom-"))) {
    for (const lesson of Object.values(pkg.teachingEntries)) {
      assert.match(
        lesson.rootPicture,
        /[A-Za-z]/u,
        `${pkg.packageId}/${lesson.id} needs an English root meaning`,
      );
      assert.equal(
        arabicScript.test(lesson.rootPicture),
        false,
        `${pkg.packageId}/${lesson.id} root picture contains Arabic script`,
      );
      if (lesson.root) {
        assert.notEqual(
          normalize(lesson.rootPicture),
          normalize(lesson.root),
          `${pkg.packageId}/${lesson.id} repeats its Arabic root`,
        );
        assert.doesNotMatch(
          lesson.rootPicture,
          /^No lexical root\b/u,
          `${pkg.packageId}/${lesson.id} has a lexical rootless picture`,
        );
      } else {
        const marker = lesson.rootPicture.match(
          /^No lexical root \(([^()]+)\)/u,
        );
        assert.ok(
          marker,
          `${pkg.packageId}/${lesson.id} needs a rootless category`,
        );
        assert.equal(
          lesson.rootPicture.slice(marker[0].length).includes(`(${marker[1]})`),
          false,
          `${pkg.packageId}/${lesson.id} repeats its rootless category`,
        );
      }
    }
  }
});

test("lexical root pictures come from the stable reviewed root dictionary", async () => {
  const all = await packages();
  const rootMeaningData = JSON.parse(
    await readFile(
      path.join(root, "content-import", "root-meanings.json"),
      "utf8",
    ),
  );
  const normalizeRoot = (value) => value.replace(/\s+/gu, "").trim();
  for (const pkg of all.filter((item) => item.status.startsWith("custom-"))) {
    for (const lesson of Object.values(pkg.teachingEntries)) {
      if (!lesson.root) continue;
      const expected = rootMeaningData.meanings[normalizeRoot(lesson.root)];
      assert.ok(
        expected,
        `${pkg.packageId}/${lesson.id} is missing a reviewed root dictionary entry`,
      );
      assert.equal(
        lesson.rootPicture.trim(),
        expected.trim(),
        `${pkg.packageId}/${lesson.id} does not use the stable root meaning`,
      );
      assert.doesNotMatch(
        lesson.rootPicture,
        /^word-family meaning:/u,
        `${pkg.packageId}/${lesson.id} still uses an occurrence-gloss root picture`,
      );
      for (const form of lesson.forms) {
        if (form.difference !== "root skeleton") continue;
        assert.equal(
          form.meaning.trim(),
          expected.trim(),
          `${pkg.packageId}/${lesson.id} root-skeleton form does not use the stable root meaning`,
        );
      }
    }
  }
});

test("every custom lesson exposes a reviewed five-form or limited Ṣarf family", async () => {
  const all = await packages();
  const normalize = (value) =>
    value.normalize("NFC").replace(/[\u0640\s]/gu, "");
  for (const pkg of all.filter((item) => item.status.startsWith("custom-"))) {
    for (const lesson of Object.values(pkg.teachingEntries)) {
      assert.ok(["full", "limited"].includes(lesson.sarfReview?.status));
      assert.ok(lesson.sarfReview.provenance.length > 0);
      if (lesson.sarfReview.status === "full")
        assert.equal(lesson.forms.length, 5);
      else {
        assert.ok(lesson.forms.length >= 1 && lesson.forms.length <= 4);
        assert.ok(lesson.sarfReview.limitedReason);
      }
      assert.ok(
        lesson.forms.length >= 1,
        `${pkg.packageId}/${lesson.id} needs at least one reviewed Ṣarf form`,
      );
      const normalizedForms = lesson.forms.map((item) => normalize(item.form));
      assert.equal(
        new Set(normalizedForms).size,
        normalizedForms.length,
        `${pkg.packageId}/${lesson.id} repeats a Ṣarf form`,
      );
      assert.equal(
        lesson.forms.some((item) =>
          /root[- ]letter|root skeleton|lemma \/ dictionary|case(?:-| )ending pattern|recognition variant|related grammatical form/iu.test(
            `${item.meaning} ${item.difference}`,
          ),
        ),
        false,
        `${pkg.packageId}/${lesson.id} keeps a synthetic Ṣarf placeholder`,
      );
      for (const form of lesson.forms) {
        assert.match(form.form, /[\u0600-\u06FF]/u);
        assert.ok(
          form.meaning &&
            form.difference &&
            form.relationship &&
            form.provenance,
        );
      }
    }
  }
});

test("every limited family has an explicit current audit decision", async () => {
  const all = await packages();
  for (const pkg of all.filter((item) => item.status.startsWith("custom-"))) {
    for (const lesson of Object.values(pkg.teachingEntries)) {
      if (lesson.sarfReview.status !== "limited") continue;
      assert.ok(
        ["confirmed-limited", "blocked-for-genuine-ambiguity"].includes(
          lesson.sarfReview.auditDecision,
        ),
        `${pkg.packageId}/${lesson.id} has no current limited-family decision`,
      );
      if (
        lesson.root.trim() &&
        !/proper\s*(?:name|noun)/iu.test(
          `${lesson.type} ${lesson.grammar} ${lesson.forms[0]?.difference ?? ""}`,
        ) &&
        !/reviewed restricted lexical item/iu.test(
          lesson.sarfReview.limitedReason ?? "",
        )
      )
        assert.equal(
          lesson.sarfReview.auditDecision,
          "blocked-for-genuine-ambiguity",
          `${pkg.packageId}/${lesson.id} is a rootful family silently accepted as limited`,
        );
      else
        assert.equal(
          lesson.sarfReview.auditDecision,
          "confirmed-limited",
          `${pkg.packageId}/${lesson.id} is not explicitly confirmed as a rootless limited family`,
        );
    }
  }
});

test("the current Qur'anic occurrence is always the first Ṣarf row", async () => {
  const all = await packages();
  const normalize = (value) =>
    value.normalize("NFC").replace(/[\u0640\s]/gu, "");
  for (const pkg of all.filter((item) => item.status.startsWith("custom-"))) {
    for (const ayah of pkg.ayahs) {
      for (const word of ayah.words.filter((item) => item.teachingId)) {
        const lesson = pkg.teachingEntries[word.teachingId];
        assert.equal(
          normalize(lesson.forms[0].form),
          normalize(word.arabic),
          `${word.id} does not start with its current Qur'anic form`,
        );
      }
    }
  }
});

test("reference families distinguish full and limited review states", async () => {
  const all = await packages();
  const byNumber = new Map(all.map((pkg) => [pkg.surah.number, pkg]));
  const qul = byNumber.get(114).teachingEntries["lesson:qul"];
  assert.equal(qul.sarfReview.status, "full");
  assert.equal(qul.forms.length, 5);
  assert.equal(qul.forms[0].form, "قُلْ");
  const ya = findWord(byNumber.get(109), 1, 2);
  const yaLesson = byNumber.get(109).teachingEntries[ya.teachingId];
  assert.equal(yaLesson.sarfReview.status, "limited");
  assert.ok(yaLesson.sarfReview.limitedReason);
  assert.ok(yaLesson.forms.length < 5);
});

test("Sūrah 109 preserves the approved Oh vocative wording", async () => {
  const all = await packages();
  const kafirun = all.find((pkg) => pkg.surah.number === 109);
  const ya = findWord(kafirun, 1, 2);
  const lesson = kafirun.teachingEntries[ya.teachingId];
  assert.equal(
    kafirun.ayahs[0].naturalMeaning,
    "Say: Oh you who reject faith.",
  );
  assert.equal(ya.gloss, "Oh");
  assert.equal(lesson.meaning, "Oh");
  assert.equal(lesson.forms[0].meaning, "Oh");
  assert.match(lesson.sentenceRole, /“Oh”/u);
  assert.equal(kafirun.ayahs[0].words[2].breakdown.parts[0].label, "Oh you");
});

test("the six-surah regression layer preserves 127 occurrences and reviewed status", async () => {
  const all = await packages();
  const selected = all.filter(
    (pkg) => pkg.surah.number >= 109 && pkg.surah.number <= 114,
  );
  assert.equal(selected.length, 6);
  assert.equal(
    selected.reduce(
      (sum, pkg) =>
        sum + pkg.ayahs.reduce((n, ayah) => n + ayah.words.length, 0),
      0,
    ),
    127,
  );
  assert.deepEqual(
    selected.map((pkg) => pkg.status),
    selected.map(expectedPackageStatus),
  );
});

test("Juz 28 Sūrahs 58–66 have complete custom teaching", async () => {
  const all = await packages();
  const batch = all.filter(
    (pkg) => pkg.surah.number >= 58 && pkg.surah.number <= 66,
  );
  assert.equal(batch.length, 9);
  assert.deepEqual(batch.map((pkg) => pkg.status), batch.map(expectedPackageStatus));
  const words = batch.flatMap((pkg) => pkg.ayahs.flatMap((ayah) => ayah.words));
  assert.equal(words.length, 2618);
  assert.equal(words.filter((word) => word.teachingId).length, 2618);
  assert.equal(words.filter((word) => word.breakdown).length, 2618);
  assert.ok(batch.every((pkg) => pkg.ayahs.every((ayah) => ayah.translation)));
});

test("Juz 28 preserves the approved Oh vocative wording", async () => {
  const all = await packages();
  const normalize = (value) =>
    value
      .normalize("NFC")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/gu, "");
  const vocatives = all
    .filter((pkg) => pkg.surah.number >= 58 && pkg.surah.number <= 66)
    .flatMap((pkg) =>
      pkg.ayahs.flatMap((ayah) =>
        ayah.words
          .map((word) => ({ pkg, word }))
          .filter(({ word }) => {
            const base = normalize(word.arabic);
            return base === "يا" || base === "يأيها";
          }),
      ),
    );
  assert.ok(vocatives.length > 0);
  for (const { pkg, word } of vocatives) {
    const lesson = pkg.teachingEntries[word.teachingId];
    assert.match(word.gloss, /^Oh\b/u, `${word.id} needs Oh wording`);
    if (normalize(word.arabic) === "يا") assert.equal(word.gloss, "Oh");
    if (normalize(word.arabic) === "يأيها")
      assert.match(word.gloss, /^Oh you\b/u, `${word.id} needs Oh you wording`);
    assert.equal(lesson.meaning, word.gloss);
  }
});

test("Juz 27 has complete authored occurrence coverage for Sūrahs 51–57", async () => {
  const all = await packages();
  const juz27 = all.filter(
    (pkg) => pkg.surah.number >= 51 && pkg.surah.number <= 57,
  );
  assert.equal(juz27.length, 7);
  const adhDhariyat = juz27.find((pkg) => pkg.surah.number === 51);
  assert.equal(adhDhariyat.ayahs.flatMap((ayah) => ayah.words).filter((word) => word.teachingId).length, 360);
  assert.ok(adhDhariyat.ayahs.filter((ayah) => ayah.number < 31).some((ayah) => ayah.words.some((word) => word.teachingId)));
  assert.ok(adhDhariyat.ayahs.filter((ayah) => ayah.number >= 31).some((ayah) => ayah.words.some((word) => word.teachingId)));
  const juz27CompletedRange = juz27.filter((pkg) => pkg.surah.number >= 52);
  assert.deepEqual(
    juz27CompletedRange.map((pkg) => pkg.status),
    juz27CompletedRange.map(expectedPackageStatus),
  );
  const juz27Words = juz27.flatMap((pkg) =>
    pkg.ayahs.flatMap((ayah) => ayah.words.filter((word) => word.teachingId)),
  );
  assert.equal(juz27Words.length, 2678);
  assert.equal(juz27Words.filter((word) => word.breakdown).length, 2678);
});

test("Sūrah 1 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const fatiha = all.find((pkg) => pkg.surah.number === 1);
  assert.equal(fatiha.status, expectedPackageStatus(fatiha));
  const words = fatiha.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 29);
  assert.equal(words.filter((word) => word.teachingId).length, 29);
  assert.equal(
    words.filter((word) => word.breakdown?.mode === "atomic").length,
    10,
  );
  assert.equal(
    words.filter((word) => word.breakdown?.mode === "segmented").length,
    19,
  );
  const guidance = words.find((word) => word.id === "word:1:6:1");
  assert.deepEqual(
    guidance.breakdown.parts.map((part) => part.sourceText),
    ["ٱهْدِ", "نَا"],
  );
});

test("Sūrahs 106–108 have complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  for (const [number, count] of [
    [106, 17],
    [107, 25],
    [108, 10],
  ]) {
    const pkg = all.find((item) => item.surah.number === number);
    assert.equal(pkg.status, expectedPackageStatus(pkg));
    const words = pkg.ayahs.flatMap((ayah) => ayah.words);
    assert.equal(words.length, count);
    assert.equal(words.filter((word) => word.teachingId).length, count);
    assert.equal(words.filter((word) => word.breakdown).length, count);
  }
});

test("Sūrah 104 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const humazah = all.find((pkg) => pkg.surah.number === 104);
  assert.equal(humazah.status, expectedPackageStatus(humazah));
  const words = humazah.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 33);
  assert.equal(words.filter((word) => word.teachingId).length, 33);
  assert.equal(words.filter((word) => word.breakdown).length, 33);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:104:1:2")
      .breakdown.parts.map((part) => part.sourceText),
    ["لِّ", "كُلِّ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:104:8:2")
      .breakdown.parts.map((part) => part.sourceText),
    ["عَلَيْ", "هِم"],
  );
});

test("Sūrah 103 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const asr = all.find((pkg) => pkg.surah.number === 103);
  assert.equal(asr.status, expectedPackageStatus(asr));
  const words = asr.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 14);
  assert.equal(words.filter((word) => word.teachingId).length, 14);
  assert.equal(words.filter((word) => word.breakdown).length, 14);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:103:1:1")
      .breakdown.parts.map((part) => part.sourceText),
    ["وَ", "ٱلْ", "عَصْرِ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:103:3:7")
      .breakdown.parts.map((part) => part.sourceText),
    ["بِ", "ٱلْ", "حَقِّ"],
  );
});

test("Sūrah 102 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const takathur = all.find((pkg) => pkg.surah.number === 102);
  assert.equal(takathur.status, expectedPackageStatus(takathur));
  const words = takathur.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 28);
  assert.equal(words.filter((word) => word.teachingId).length, 28);
  assert.equal(words.filter((word) => word.breakdown).length, 28);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:102:1:1")
      .breakdown.parts.map((part) => part.sourceText),
    ["أَلْهَىٰ", "كُمُ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:102:8:2")
      .breakdown.parts.map((part) => part.sourceText),
    ["لَ", "تُسْـَٔلُ", "نَّ"],
  );
  assert.equal(words.find((word) => word.id === "word:102:8:4").gloss, "about");
});

test("Sūrah 101 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const qariah = all.find((pkg) => pkg.surah.number === 101);
  assert.equal(qariah.status, expectedPackageStatus(qariah));
  const words = qariah.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 36);
  assert.equal(words.filter((word) => word.teachingId).length, 36);
  assert.equal(words.filter((word) => word.breakdown).length, 36);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:101:4:4")
      .breakdown.parts.map((part) => part.sourceText),
    ["كَ", "ٱلْ", "فَرَاشِ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:101:6:4")
      .breakdown.parts.map((part) => part.sourceText),
    ["مَوَٰزِينُ", "هُۥ"],
  );
  assert.equal(
    words.find((word) => word.id === "word:101:10:4").gloss,
    "what that is",
  );
});

test("Sūrah 100 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const adiyat = all.find((pkg) => pkg.surah.number === 100);
  assert.equal(adiyat.status, expectedPackageStatus(adiyat));
  const words = adiyat.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 40);
  assert.equal(words.filter((word) => word.teachingId).length, 40);
  assert.equal(words.filter((word) => word.breakdown).length, 40);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:100:4:2")
      .breakdown.parts.map((part) => part.sourceText),
    ["بِ", "هِۦ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:100:6:3")
      .breakdown.parts.map((part) => part.sourceText),
    ["لِ", "رَبِّ", "هِۦ"],
  );
  assert.equal(
    words.find((word) => word.id === "word:100:11:5").gloss,
    "is fully Acquainted",
  );
});

test("Sūrah 99 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const zalzalah = all.find((pkg) => pkg.surah.number === 99);
  assert.equal(zalzalah.status, expectedPackageStatus(zalzalah));
  const words = zalzalah.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 36);
  assert.equal(words.filter((word) => word.teachingId).length, 36);
  assert.equal(words.filter((word) => word.breakdown).length, 36);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:99:5:1")
      .breakdown.parts.map((part) => part.sourceText),
    ["بِ", "أَنَّ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:99:6:5")
      .breakdown.parts.map((part) => part.sourceText),
    ["لِّ", "يُرَ", "وْا۟"],
  );
  assert.equal(words.find((word) => word.id === "word:99:8:5").gloss, "evil");
});

test("Sūrah 98 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const bayyinah = all.find((pkg) => pkg.surah.number === 98);
  assert.equal(bayyinah.status, expectedPackageStatus(bayyinah));
  const words = bayyinah.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 94);
  assert.equal(words.filter((word) => word.teachingId).length, 94);
  assert.equal(words.filter((word) => word.breakdown).length, 94);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:98:1:8")
      .breakdown.parts.map((part) => part.sourceText),
    ["وَ", "ٱلْ", "مُشْرِكِينَ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:98:5:4")
      .breakdown.parts.map((part) => part.sourceText),
    ["لِ", "يَعْبُدُ", "وا۟"],
  );
  assert.equal(
    words.find((word) => word.id === "word:98:8:5").gloss,
    "perpetual residence",
  );
});

test("Sūrah 97 has complete custom teaching and certified ayah translations", async () => {
  const all = await packages();
  const qadr = all.find((pkg) => pkg.surah.number === 97);
  assert.equal(qadr.status, expectedPackageStatus(qadr));
  const words = qadr.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 30);
  assert.equal(words.filter((word) => word.teachingId).length, 30);
  assert.equal(words.filter((word) => word.breakdown).length, 30);
  assert.deepEqual(
    qadr.ayahs.map((ayah) => ayah.translation),
    [
      "Indeed, We sent the Qur'an down during the Night of Decree.",
      "And what can make you know what is the Night of Decree?",
      "The Night of Decree is better than a thousand months.",
      "The angels and the Spirit descend therein by permission of their Lord for every matter.",
      "Peace it is until the emergence of dawn.",
    ],
  );
  assert.equal(
    qadr.ayahs[0].arabic,
    "إِنَّآ أَنزَلْنَـٰهُ فِى لَيْلَةِ ٱلْقَدْرِ",
  );
  assert.equal(qadr.ayahs[0].sourceRawArabic.startsWith("بِّسْمِ"), true);
});

test("Sūrah 96 has complete custom teaching and certified ayah translations", async () => {
  const all = await packages();
  const alaq = all.find((pkg) => pkg.surah.number === 96);
  assert.equal(alaq.status, expectedPackageStatus(alaq));
  const words = alaq.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 72);
  assert.equal(words.filter((word) => word.teachingId).length, 72);
  assert.equal(words.filter((word) => word.breakdown).length, 72);
  assert.equal(
    alaq.ayahs[0].translation,
    "Recite in the name of your Lord who created -",
  );
  assert.equal(
    alaq.ayahs[18].translation,
    "No! Do not obey him. But prostrate and draw near [to Allah].",
  );
});

test("Sūrah 95 has complete custom teaching and corrected visible source", async () => {
  const all = await packages();
  const tin = all.find((pkg) => pkg.surah.number === 95);
  assert.equal(tin.status, expectedPackageStatus(tin));
  const words = tin.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 34);
  assert.equal(words.filter((word) => word.teachingId).length, 34);
  assert.equal(words.filter((word) => word.breakdown).length, 34);
  assert.equal(tin.ayahs[0].arabic, "وَٱلتِّينِ وَٱلزَّيْتُونِ");
  assert.equal(tin.ayahs[0].sourceRawArabic.startsWith("بِّسْمِ"), true);
  assert.equal(
    tin.ayahs[7].translation,
    "Is not Allah the most just of judges?",
  );
});

test("Sūrah 94 has complete custom teaching and certified ayah translations", async () => {
  const all = await packages();
  const sharh = all.find((pkg) => pkg.surah.number === 94);
  assert.equal(sharh.status, expectedPackageStatus(sharh));
  const words = sharh.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 27);
  assert.equal(words.filter((word) => word.teachingId).length, 27);
  assert.equal(words.filter((word) => word.breakdown).length, 27);
  assert.equal(
    sharh.ayahs[0].translation,
    "Did We not expand for you, [O Muhammad], your breast?",
  );
  assert.equal(
    sharh.ayahs[7].translation,
    "And to your Lord direct [your] longing.",
  );
});

test("Sūrah 93 has complete custom teaching and certified ayah translations", async () => {
  const all = await packages();
  const duha = all.find((pkg) => pkg.surah.number === 93);
  assert.equal(duha.status, expectedPackageStatus(duha));
  const words = duha.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 40);
  assert.equal(words.filter((word) => word.teachingId).length, 40);
  assert.equal(words.filter((word) => word.breakdown).length, 40);
  assert.equal(duha.ayahs[0].translation, "By the morning brightness");
  assert.equal(
    duha.ayahs[10].translation,
    "But as for the favor of your Lord, report [it].",
  );
  assert.equal(duha.ayahs[3].words[0].breakdown.parts.length, 1);
});

test("Sūrah 92 has complete custom teaching and certified ayah translations", async () => {
  const all = await packages();
  const layl = all.find((pkg) => pkg.surah.number === 92);
  assert.equal(layl.status, expectedPackageStatus(layl));
  const words = layl.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 71);
  assert.equal(words.filter((word) => word.teachingId).length, 71);
  assert.equal(words.filter((word) => word.breakdown).length, 71);
  assert.equal(layl.ayahs[0].translation, "By the night when it covers");
  assert.equal(layl.ayahs[20].translation, "And he is going to be satisfied.");
});

test("Sūrah 91 has complete custom teaching and certified ayah translations", async () => {
  const all = await packages();
  const shams = all.find((pkg) => pkg.surah.number === 91);
  assert.equal(shams.status, expectedPackageStatus(shams));
  const words = shams.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 54);
  assert.equal(words.filter((word) => word.teachingId).length, 54);
  assert.equal(words.filter((word) => word.breakdown).length, 54);
  assert.equal(shams.ayahs[0].translation, "By the sun and its brightness");
  assert.equal(
    shams.ayahs[12].translation,
    'And the messenger of Allah [Salih] said to them, "[Do not harm] the she-camel of Allah or [prevent her from] her drink."',
  );
  assert.equal(
    shams.ayahs[14].translation,
    "And He does not fear the consequence thereof.",
  );
});

test("Sūrahs 78–90 have complete custom teaching and certified ayah translations", async () => {
  const all = await packages();
  const batch = all.filter(
    (pkg) => pkg.surah.number >= 78 && pkg.surah.number <= 90,
  );
  assert.equal(batch.length, 13);
  assert.equal(
    batch.reduce(
      (total, pkg) => total + pkg.ayahs.flatMap((ayah) => ayah.words).length,
      0,
    ),
    1498,
  );
  for (const pkg of batch) {
    assert.equal(pkg.status, expectedPackageStatus(pkg));
    const words = pkg.ayahs.flatMap((ayah) => ayah.words);
    assert.equal(words.filter((word) => word.teachingId).length, words.length);
    assert.equal(words.filter((word) => word.breakdown).length, words.length);
    assert.ok(pkg.ayahs.every((ayah) => ayah.translation.length > 0));
  }
  assert.equal(
    all.find((pkg) => pkg.surah.number === 90).ayahs[0].translation,
    "I swear by this city, Makkah -",
  );
  assert.equal(
    all.find((pkg) => pkg.surah.number === 78).ayahs[0].translation,
    "About what are they asking one another?",
  );
});

test("Sūrah 105 has complete custom teaching for every visible occurrence", async () => {
  const all = await packages();
  const feel = all.find((pkg) => pkg.surah.number === 105);
  assert.equal(feel.status, expectedPackageStatus(feel));
  const words = feel.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 23);
  assert.equal(words.filter((word) => word.teachingId).length, 23);
  assert.equal(words.filter((word) => word.breakdown).length, 23);
  assert.deepEqual(
    words
      .find((word) => word.id === "word:105:1:5")
      .breakdown.parts.map((part) => part.sourceText),
    ["رَبُّ", "كَ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:105:3:2")
      .breakdown.parts.map((part) => part.sourceText),
    ["عَلَيْ", "هِمْ"],
  );
});

test("required teaching mappings use exact source parts and display-only joining lines", async () => {
  const all = await packages();
  const byNumber = new Map(all.map((pkg) => [pkg.surah.number, pkg]));
  const audhu = findWord(byNumber.get(113), 1, 2);
  assert.deepEqual(
    audhu.breakdown.parts.map((part) => part.sourceText),
    ["أَ", "عُوذُ"],
  );
  assert.equal(audhu.breakdown.parts[0].displayText, "أَـ");
  assert.equal(
    audhu.breakdown.parts.map((part) => part.sourceText).join(""),
    "أَعُوذُ",
  );

  const birabbi = findWord(byNumber.get(113), 1, 3);
  assert.deepEqual(
    birabbi.breakdown.parts.map((part) => part.sourceText),
    ["بِ", "رَبِّ"],
  );
  const walam = findWord(byNumber.get(112), 3, 3);
  assert.deepEqual(
    walam.breakdown.parts.map((part) => part.sourceText),
    ["وَ", "لَمْ"],
  );
  const lahu = findWord(byNumber.get(112), 4, 3);
  assert.equal(lahu.arabic, "لَّهُۥ");
  assert.equal(lahu.breakdown.mode, "atomic");
  assert.equal(lahu.breakdown.parts[0].sourceText, lahu.arabic);
  const wanas = findWord(byNumber.get(114), 6, 3);
  assert.deepEqual(
    wanas.breakdown.parts.map((part) => part.sourceText),
    ["وَ", "ٱلنَّاسِ"],
  );
  const qul = findWord(byNumber.get(114), 1, 1);
  assert.equal(qul.breakdown.mode, "atomic");
  assert.equal(qul.breakdown.parts[0].sourceText, "قُلْ");
});

test("Sūrah 111 Āyah 1 preserves its complete custom teaching mappings", async () => {
  const all = await packages();
  const masad = all.find((pkg) => pkg.surah.number === 111);
  assert.equal(masad.status, expectedPackageStatus(masad));
  const words = masad.ayahs.find((ayah) => ayah.number === 1).words;
  assert.deepEqual(
    words.map((word) => word.teachingId),
    [
      "lesson:111:tabbat",
      "lesson:111:yadaa",
      "lesson:111:abi",
      "lesson:111:lahab",
      "lesson:111:watabba",
    ],
  );
  assert.deepEqual(
    words[0].breakdown.parts.map((part) => part.sourceText),
    ["تَبَّ", "تْ"],
  );
  assert.equal(words[1].breakdown.sourceText, "يَدَا");
  assert.equal(words[2].breakdown.mode, "atomic");
  assert.deepEqual(
    words[4].breakdown.parts.map((part) => part.sourceText),
    ["وَ", "تَبَّ"],
  );
});

test("complete Sūrah 111 resolves every visible word explicitly", async () => {
  const all = await packages();
  const masad = all.find((pkg) => pkg.surah.number === 111);
  const words = masad.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(words.length, 23);
  assert.equal(words.filter((word) => word.teachingId).length, 23);
  assert.equal(
    words.filter((word) => word.breakdown?.mode === "segmented").length,
    10,
  );
  assert.equal(
    words.filter((word) => word.breakdown?.mode === "atomic").length,
    13,
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:111:2:3")
      .breakdown.parts.map((part) => part.sourceText),
    ["عَنْ", "هُ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:111:3:1")
      .breakdown.parts.map((part) => part.sourceText),
    ["سَ", "يَصْلَىٰ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:111:4:3")
      .breakdown.parts.map((part) => part.sourceText),
    ["الْ", "حَطَبِ"],
  );
  assert.deepEqual(
    words
      .find((word) => word.id === "word:111:5:2")
      .breakdown.parts.map((part) => part.sourceText),
    ["جِيدِ", "هَا"],
  );
});

test("source-only packages do not invent custom teaching", async () => {
  const all = await packages();
  for (const pkg of all.filter((item) => item.status === "source-only")) {
    assert.equal(Object.keys(pkg.teachingEntries).length, 0);
    assert.equal(
      pkg.ayahs
        .flatMap((ayah) => ayah.words)
        .some((word) => word.teachingId || word.breakdown),
      false,
    );
  }
});

test("source packages keep the basmalah out of visible ayah one", async () => {
  const all = await packages();
  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .normalize("NFC")
      .replace(/[\u0640\s]/g, "");
  const basmala = ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"].map(
    normalize,
  );
  for (const pkg of all) {
    if ([1, 9].includes(pkg.surah.number)) continue;
    const firstAyah = pkg.ayahs.find((ayah) => ayah.number === 1);
    const visible = firstAyah.arabic
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map(normalize);
    assert.notDeepEqual(visible, basmala);
  }
});

test("known authored word assignments remain occurrence-specific", async () => {
  const all = await packages();
  const falaq = all.find((pkg) => pkg.surah.number === 113);
  const nas = all.find((pkg) => pkg.surah.number === 114);
  const falaqWords = falaq.ayahs.flatMap((ayah) => ayah.words);
  const nasWords = nas.ayahs.flatMap((ayah) => ayah.words);
  assert.equal(
    falaqWords.find((word) => word.arabic === "مِن")?.teachingId,
    "lesson:min",
  );
  assert.equal(
    falaqWords.find((word) => word.arabic === "غَاسِقٍ")?.teachingId,
    "lesson:ghasiq",
  );
  assert.equal(
    nasWords.find((word) => word.arabic === "مَلِكِ")?.teachingId,
    "lesson:malik",
  );
  assert.equal(
    nasWords.find((word) => word.arabic === "إِلَٰهِ")?.teachingId,
    "lesson:ilah",
  );
  assert.equal(
    nasWords.find((word) => word.arabic === "مِنَ")?.teachingId,
    "lesson:114:6:1",
  );
});
