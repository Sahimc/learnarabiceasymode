import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getWordLesson, surahs } from "../app/data/fixtures";
import { surahMeta } from "./surah-meta";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = path.join(
  root,
  "content-import",
  "sources",
  "tanzil",
  "quran-uthmani.txt",
);
const packagesRoot = path.join(root, "content-import", "surahs");

const normalize = (value: string) =>
  value.normalize("NFC").replace(/[\u0640\s]/g, "");
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const fixedSlugs: Record<number, string> = {
  109: "al-kafirun",
  110: "an-nasr",
  111: "al-masad",
  112: "al-ikhlas",
  113: "al-falaq",
  114: "al-nas",
};

type PackageWord = {
  id: string;
  position: number;
  arabic: string;
  transliteration?: string;
  gloss?: string;
  teachingId?: string;
  occurrenceRole?: string;
  sourceReferences: {
    provider: string;
    recordKey: string;
    version: string;
    attribution: string;
  }[];
  breakdown?: unknown;
};

function inferKind(text: string, order: number, total: number) {
  if (order === total && (text.startsWith("ٱل") || text.startsWith("ال")))
    return "article";
  if (order === 1 && ["أَ", "بِ", "وَ", "لِ", "فَ", "كَ"].includes(text))
    return "prefix";
  if (order === total && text.length <= 2) return "ending";
  return order === 1 ? "prefix" : "stem";
}

function makeAtomic(word: string, occurrenceId: string, meaning: string) {
  return {
    id: `breakdown:${occurrenceId}`,
    mode: "atomic",
    sourceText: word,
    parts: [
      {
        id: `breakdown:${occurrenceId}:part:whole`,
        order: 1,
        sourceText: word,
        displayText: word,
        label: "Whole word",
        meaning,
        kind: "whole",
      },
    ],
  };
}

function makeSegmented(
  word: string,
  occurrenceId: string,
  parts: {
    sourceText: string;
    displayText?: string;
    label: string;
    meaning: string;
    kind?: string;
  }[],
) {
  return {
    id: `breakdown:${occurrenceId}`,
    mode: "segmented",
    sourceText: word,
    parts: parts.map((part, index) => ({
      id: `breakdown:${occurrenceId}:part:${index + 1}`,
      order: index + 1,
      sourceText: part.sourceText,
      displayText: part.displayText ?? part.sourceText,
      label: part.label,
      meaning: part.meaning,
      kind: part.kind ?? inferKind(part.sourceText, index + 1, parts.length),
    })),
  };
}

function resolveBreakdown(
  word: string,
  occurrenceId: string,
  lesson: ReturnType<typeof getWordLesson>,
) {
  if (!lesson) return undefined;
  if (normalize(word) === normalize("أَعُوذُ")) {
    return makeSegmented(word, occurrenceId, [
      {
        sourceText: "أَ",
        displayText: "أَـ",
        label: "I",
        meaning: "the person doing the action",
        kind: "prefix",
      },
      {
        sourceText: "عُوذُ",
        label: "seek refuge",
        meaning: "the main verb stem",
        kind: "stem",
      },
    ]);
  }
  if (normalize(word) === normalize("بِرَبِّ")) {
    return makeSegmented(word, occurrenceId, [
      {
        sourceText: "بِ",
        displayText: "بِـ",
        label: "with / by",
        meaning: "an attached preposition",
        kind: "preposition",
      },
      {
        sourceText: "رَبِّ",
        label: "Lord",
        meaning: "the one who sustains",
        kind: "stem",
      },
    ]);
  }
  if (normalize(word) === normalize("وَلَمْ")) {
    return makeSegmented(word, occurrenceId, [
      {
        sourceText: "وَ",
        displayText: "وَـ",
        label: "and",
        meaning: "an attached connector",
        kind: "connector",
      },
      {
        sourceText: "لَمْ",
        label: "did not",
        meaning: "a past-negating particle",
        kind: "stem",
      },
    ]);
  }
  if (normalize(word) === normalize("وَٱلنَّاسِ")) {
    return makeSegmented(word, occurrenceId, [
      {
        sourceText: "وَ",
        displayText: "وَـ",
        label: "and",
        meaning: "an attached connector",
        kind: "connector",
      },
      {
        sourceText: "ٱلنَّاسِ",
        label: "humankind",
        meaning: "the people / humankind",
        kind: "article",
      },
    ]);
  }

  const legacy = lesson.components ?? [];
  const legacyText = legacy.map((part) => part.text).join("");
  if (legacy.length > 1 && normalize(legacyText) === normalize(word)) {
    return makeSegmented(
      word,
      occurrenceId,
      legacy.map((part) => ({
        sourceText: part.text.replace(/\u0640/g, ""),
        displayText: part.displayText,
        label: part.label,
        meaning: part.meaning,
        kind: part.kind,
      })),
    );
  }

  return makeAtomic(word, occurrenceId, lesson.meaning);
}

function customData(surahNumber: number, ayahNumber: number, position: number) {
  const surah = surahs.find((item) => item.number === surahNumber);
  const ayah = surah?.ayahs.find((item) => item.number === ayahNumber);
  const word = ayah?.words.find((item) => item.position === position);
  const lesson = word ? getWordLesson(word) : undefined;
  return { word, lesson };
}

const raw = await fs.readFile(rawPath, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);
const bySurah = new Map<number, { ayah: number; arabic: string }[]>();
for (const line of lines) {
  const [surahValue, ayahValue, ...arabicParts] = line.split("|");
  const surah = Number(surahValue);
  const ayah = Number(ayahValue);
  const arabic = arabicParts.join("|").trim();
  if (!surah || !ayah || !arabic) continue;
  const rows = bySurah.get(surah) ?? [];
  rows.push({ ayah, arabic });
  bySurah.set(surah, rows);
}

if (bySurah.size !== 114)
  throw new Error(`Expected 114 source sūrahs, got ${bySurah.size}`);
const basmala = (bySurah.get(1)?.[0]?.arabic ?? "")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 4);
const stripBasmalah = (number: number, ayahNumber: number, arabic: string) => {
  if (number === 1 || number === 9 || ayahNumber !== 1 || basmala.length !== 4)
    return arabic;
  const words = arabic.split(/\s+/).filter(Boolean);
  const same = words
    .slice(0, 4)
    .every((word, index) => normalize(word) === normalize(basmala[index]));
  return same ? words.slice(4).join(" ") : arabic;
};
const removeStandaloneMarks = (arabic: string) =>
  arabic
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word))
    .join(" ");

for (const meta of surahMeta) {
  const sourceAyahs = bySurah.get(meta.number) ?? [];
  const custom = meta.number >= 112;
  const teachingEntries: Record<string, unknown> = {};
  const ayahs = sourceAyahs.map(({ ayah: ayahNumber, arabic: rawArabic }) => {
    const arabic = removeStandaloneMarks(
      stripBasmalah(meta.number, ayahNumber, rawArabic),
    );
    const fixtureAyah = surahs
      .find((item) => item.number === meta.number)
      ?.ayahs.find((item) => item.number === ayahNumber);
    const sourceWords =
      fixtureAyah && meta.number >= 109
        ? fixtureAyah.words.map((word) => word.arabic)
        : arabic.split(/\s+/).filter(Boolean);
    const words: PackageWord[] = sourceWords.map((wordText, index) => {
      const position = index + 1;
      const occurrenceId = `word:${meta.number}:${ayahNumber}:${position}`;
      const fixture = custom
        ? customData(meta.number, ayahNumber, position)
        : { word: undefined, lesson: undefined };
      if (fixture.lesson && fixture.word) {
        teachingEntries[fixture.lesson.id] = fixture.lesson;
      }
      return {
        id: occurrenceId,
        position,
        arabic: wordText,
        transliteration: fixture.word?.transliteration,
        gloss: fixture.word?.gloss,
        teachingId: fixture.lesson?.id,
        occurrenceRole: fixture.word?.occurrenceRole,
        sourceReferences: [
          {
            provider: "tanzil",
            recordKey: `${meta.number}:${ayahNumber}`,
            version: "1.1",
            attribution: "Tanzil Project",
          },
        ],
        breakdown:
          fixture.lesson && fixture.word
            ? resolveBreakdown(wordText, occurrenceId, fixture.lesson)
            : undefined,
      };
    });
    const translation = fixtureAyah?.translation || undefined;
    const naturalMeaning = fixtureAyah?.naturalMeaning || undefined;
    return {
      id: `ayah:${meta.number}:${ayahNumber}`,
      number: ayahNumber,
      arabic,
      sourceRawArabic: rawArabic,
      translation,
      naturalMeaning,
      words,
    };
  });

  const packageId = `surah:${meta.number}`;
  const packageJson = {
    schemaVersion: "2.0.0",
    packageId,
    surah: {
      ...meta,
      description: custom
        ? "Reviewed Word Tree teaching layer."
        : "Canonical source layer; custom teaching is not yet authored.",
    },
    contentVersion: "tanzil-1.1",
    status: custom ? "custom-complete" : "source-only",
    sourceReferences: [
      {
        provider: "tanzil",
        recordKey: `surah:${meta.number}`,
        version: "1.1",
        attribution: "Tanzil Project",
      },
    ],
    ayahs,
    teachingEntries,
    volumeReferences: meta.number >= 109 ? ["volume:final-six-surahs"] : [],
  };
  const directory = path.join(
    packagesRoot,
    `${String(meta.number).padStart(3, "0")}-${fixedSlugs[meta.number] ?? slug(meta.name)}`,
  );
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(
      {
        schemaVersion: packageJson.schemaVersion,
        packageId,
        surah: meta.number,
        contentVersion: packageJson.contentVersion,
        status: packageJson.status,
        source: "tanzil",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(directory, "surah.json"),
    JSON.stringify(packageJson, null, 2) + "\n",
    "utf8",
  );
}

const volumes = path.join(root, "content-import", "volumes");
await fs.mkdir(volumes, { recursive: true });
await fs.writeFile(
  path.join(volumes, "final-six-surahs.json"),
  JSON.stringify(
    {
      schemaVersion: "1.0.0",
      id: "volume:final-six-surahs",
      title: "The Final Six Sūrahs",
      surahNumbers: [109, 110, 111, 112, 113, 114],
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(
  `Generated ${surahMeta.length} full-Qur’an source packages from Tanzil and merged custom teaching for 112–114.`,
);
