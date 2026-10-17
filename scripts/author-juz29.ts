import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./lib/db";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { rootMeaningFor } from "./lib/root-meanings";
import { reviewSarfFamily, type SarfCandidate } from "./lib/sarf-authoring";

assertAuthoringContract("Juz authoring");

const SURAH_NUMBERS = (
  process.env.AUTHOR_SURAH_NUMBERS ?? "67,68,69,70,71,72,73,74,75,76,77"
)
  .split(",")
  .map(Number)
  .filter((number) => Number.isInteger(number) && number > 0);
const BATCH_LABEL = process.env.AUTHOR_BATCH_LABEL ?? "Juz 29";
const AUTHOR_AYAH_RANGES = process.env.AUTHOR_AYAH_RANGES ?? "";
const root = process.cwd();
const packagesRoot = path.join(root, "content-import", "surahs");
const translationPath = path.join(
  root,
  "content-import",
  "sources",
  "translations",
  "en.sahih.txt",
);

type PackageWord = {
  id: string;
  position: number;
  arabic: string;
  sourceReferences?: unknown[];
  [key: string]: unknown;
};

type SourcePackage = {
  packageId: string;
  surah: {
    number: number;
    name: string;
    arabicName: string;
    transliteration: string;
    englishLabel: string;
    description?: string;
  };
  contentVersion: string;
  status: string;
  sourceReferences: unknown[];
  ayahs: Array<{
    id: string;
    number: number;
    arabic: string;
    sourceRawArabic?: string;
    translation?: string;
    naturalMeaning?: string;
    words: PackageWord[];
  }>;
  teachingEntries?: Record<string, unknown>;
  [key: string]: unknown;
};

type ApiWord = {
  position: number;
  text_uthmani?: string;
  translation?: { text?: string };
  transliteration?: { text?: string | null };
  char_type_name?: string;
};

type MorphologyRecord = {
  id: string;
  provider: string;
  recordKey: string;
  version: string;
  sourceText: string;
  lemma?: string;
  root?: string;
  pattern?: string;
  partOfSpeech?: string;
  features: Array<{ key: string; label: string; value: string }>;
  segmentation?: Array<{
    sourceText: string;
    displayText: string;
    label: string;
    meaning: string;
    kind: string;
  }>;
};

type SarfEvidence = {
  form: string;
  meaning: string;
  root: string;
  occurrenceId: string;
  provider: string;
  version: string;
  features: Array<{ key: string; label: string; value: string }>;
  pattern?: string;
  partOfSpeech?: string;
};

type AuthoredPart = {
  sourceText: string;
  displayText: string;
  label: string;
  meaning: string;
  kind: string;
  rootStatus: "lexical" | "rootless";
  root?: string;
  rootExplanation?: string;
};

type AyahRange = { start: number; end: number };

function parseAyahRanges(value: string) {
  const ranges = new Map<number, AyahRange[]>();
  for (const item of value.split(";").filter(Boolean)) {
    const [surahText, rangeText] = item.split(":");
    const [startText, endText] = (rangeText ?? "").split("-");
    const surah = Number(surahText);
    const start = Number(startText);
    const end = Number(endText ?? startText);
    if (
      !Number.isInteger(surah) ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start
    )
      throw new Error(`Invalid AUTHOR_AYAH_RANGES item: ${item}`);
    ranges.set(surah, [...(ranges.get(surah) ?? []), { start, end }]);
  }
  return ranges;
}

const authorAyahRanges = parseAyahRanges(AUTHOR_AYAH_RANGES);

function shouldAuthorAyah(surah: number, ayah: number) {
  const ranges = authorAyahRanges.get(surah);
  return (
    !ranges || ranges.some((range) => ayah >= range.start && ayah <= range.end)
  );
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function canonical(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s\u200C\u200D]/gu, "")
    .replace(/[ۖۗۘۙۚۛۜ۩]/gu, "")
    .replace(/ٱ/gu, "ا")
    .replace(/ى/gu, "ا");
}

function rootText(value: string | undefined) {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function baseSource(value: string) {
  return canonical(value);
}

function rootlessKind(kind: string) {
  return new Set([
    "article",
    "preposition",
    "connector",
    "subject-marker",
    "object-pronoun",
    "possessive-pronoun",
    "suffix",
    "ending",
  ]).has(kind);
}

function categoryForKind(kind: string) {
  if (kind === "article") return "definite article";
  if (kind === "preposition") return "preposition";
  if (kind === "connector") return "connector";
  if (
    [
      "subject-marker",
      "object-pronoun",
      "possessive-pronoun",
      "suffix",
    ].includes(kind)
  )
    return "pronoun";
  if (kind === "ending") return "ending";
  return "grammatical word";
}

function sourceAwareKind(part: { sourceText: string; kind: string }) {
  const base = baseSource(part.sourceText);
  const providerGrammarKind = ["prefix", "preposition", "other"].includes(
    part.kind,
  );
  if (!providerGrammarKind) return part.kind;
  if (base === "و" || base === "ف") return "connector";
  if (base === "ب" || base === "ل" || base === "ك") return "preposition";
  return part.kind;
}

function sourceAwareLabel(
  part: { sourceText: string; label: string; kind: string },
  kind: string,
) {
  const label = part.label.trim();
  const isPlaceholder = [
    "lexical stem",
    "main word",
    "single morpheme",
  ].includes(label.toLowerCase());
  if (!isPlaceholder) return label;

  const base = baseSource(part.sourceText);
  if (kind === "connector") return base === "ف" ? "so / then" : "and";
  if (kind === "preposition") {
    if (base === "ل") return "for / to";
    if (base === "ك") return "like / as";
    return "with / by / in";
  }
  return categoryForKind(kind);
}

function sourceParts(
  word: PackageWord,
  morphology: MorphologyRecord | undefined,
) {
  const providerParts = morphology?.segmentation ?? [];
  const composed = providerParts.map((part) => part.sourceText).join("");
  if (
    providerParts.length > 1 &&
    canonical(composed) === canonical(word.arabic)
  )
    return providerParts;

  return [
    {
      sourceText: word.arabic,
      displayText: word.arabic,
      label: "single morpheme",
      meaning: "the complete word",
      kind: "whole",
    },
  ];
}

function meaningLabel(
  part: {
    label: string;
    kind: string;
    sourceText: string;
  },
  gloss: string,
  hasMultipleParts: boolean,
) {
  if (!hasMultipleParts) return gloss;
  const kind = sourceAwareKind(part);
  if (rootlessKind(kind) || kind === "whole")
    return sourceAwareLabel(part, kind);
  if (["single morpheme", "lexical stem", "main word"].includes(part.label))
    return gloss;
  return part.label;
}

function makeParts(
  word: PackageWord,
  gloss: string,
  morphology: MorphologyRecord | undefined,
): AuthoredPart[] {
  const root = rootText(morphology?.root);
  const parts = sourceParts(word, morphology);
  const hasMultipleParts = parts.length > 1;
  return parts.map((part) => {
    const kind = sourceAwareKind(part);
    const isRootless = root ? rootlessKind(kind) : true;
    const rootStatus = isRootless ? "rootless" : "lexical";
    return {
      sourceText: part.sourceText,
      displayText: part.displayText || part.sourceText,
      label: meaningLabel(part, gloss, hasMultipleParts),
      meaning: isRootless
        ? `a grammatical ${categoryForKind(kind)} component`
        : hasMultipleParts
          ? "the lexical stem carrying the main meaning"
          : "the complete lexical word",
      kind,
      rootStatus,
      ...(isRootless
        ? {
            rootExplanation: `No lexical root (${categoryForKind(kind)})`,
          }
        : { root }),
    };
  });
}

function approvedVocativeGloss(arabic: string, gloss: string) {
  const base = canonical(arabic);
  if (base === "يا") return "Oh";
  if (base !== "يأيها") return gloss;
  const withOh = gloss.replace(/^O\b/iu, "Oh");
  return /^Oh you\b/iu.test(withOh)
    ? withOh
    : withOh.replace(/^Oh\b/iu, "Oh you");
}

function isReviewedRootlessWord(arabic: string) {
  return canonical(arabic) === canonical("حَيْثُ");
}

function buildForms(
  word: PackageWord,
  gloss: string,
  root: string,
  morphology: MorphologyRecord | undefined,
  category: string,
  evidence: SarfEvidence[],
) {
  const currentFeatures = (morphology?.features ?? [])
    .map((feature) => `${feature.label}: ${feature.value}`)
    .join("; ");
  const currentDifference = currentFeatures
    ? `Current Qur'anic occurrence; ${currentFeatures}.`
    : "Current Qur'anic occurrence in this āyah; its exact vocalisation and context are primary.";
  const currentBase = word.arabic
    .normalize("NFC")
    .replace(/[\u0640\s\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "");
  const candidates: SarfCandidate[] = evidence
    .filter((item) => item.form !== word.arabic && item.meaning.trim())
    .map((item) => {
      const candidateBase = item.form
        .normalize("NFC")
        .replace(/[\u0640\s\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "");
      const details = [
        item.pattern ? `pattern: ${item.pattern}` : "",
        item.partOfSpeech ? `part of speech: ${item.partOfSpeech}` : "",
        ...item.features.map((feature) => `${feature.label}: ${feature.value}`),
      ].filter(Boolean);
      const score =
        40 +
        (candidateBase === currentBase ? 0 : 25) +
        (details.length ? 25 : 0);
      return {
        form: item.form,
        meaning: item.meaning,
        difference: details.length
          ? `A related Qur'anic form in the same root family; compare the current form with this ${details.join("; ")}.`
          : `A distinct Qur'anic form in the same root family; its surface pattern changes the form-specific meaning to “${item.meaning}”.`,
        relationship: `Related to the ${root} root/lexeme as a real Qur'anic form. Canonical evidence: ${item.occurrenceId}.`,
        provenance: `Codex-reviewed from canonical Qur'anic evidence and aligned ${item.provider} morphology ${item.version}.`,
        score,
      };
    });
  const reviewed = reviewSarfFamily({
    currentForm: word.arabic,
    currentMeaning: gloss,
    currentDifference,
    root,
    type: `${category} ${morphology?.partOfSpeech ?? ""} ${(morphology?.features ?? []).map((feature) => feature.value).join(" ")}`,
    candidates,
    provenance: [
      `Canonical Qur'anic occurrence ${word.id}.`,
      morphology
        ? `Aligned ${morphology.provider} morphology ${morphology.version} (${morphology.recordKey}).`
        : "No aligned provider morphology was available; the occurrence was reviewed directly.",
    ],
    reviewedAt: new Date().toISOString(),
  });
  return reviewed;
}

function wordType(morphology: MorphologyRecord | undefined, root: string) {
  const pos = morphology?.partOfSpeech?.toLowerCase() ?? "";
  if (pos === "verb") return "Verb";
  if (pos.includes("noun")) return "Noun / adjective";
  if (root) return "Lexical word";
  return "Fixed grammatical word";
}

function grammarText(
  morphology: MorphologyRecord | undefined,
  category: string,
) {
  const details = [
    morphology?.partOfSpeech,
    morphology?.pattern,
    ...(morphology?.features ?? []).map(
      (feature) => `${feature.label}: ${feature.value}`,
    ),
  ].filter(Boolean);
  return details.length
    ? `${details.join("; ")}. Read this ${category} with the surrounding words.`
    : `This ${category} is read with the surrounding words.`;
}

function lessonFor(
  surah: number,
  ayah: number,
  word: PackageWord,
  apiWord: ApiWord,
  morphology: MorphologyRecord | undefined,
  sarfEvidenceByRoot: Map<string, SarfEvidence[]>,
) {
  const rawGloss = (apiWord.translation?.text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  const gloss = approvedVocativeGloss(word.arabic, rawGloss);
  if (!gloss)
    throw new Error(
      `${surah}:${ayah}:${word.position} has no word translation`,
    );
  const teachingMorphology: MorphologyRecord | undefined =
    isReviewedRootlessWord(word.arabic) && morphology
      ? { ...morphology, root: undefined }
      : morphology;
  const root = rootText(teachingMorphology?.root);
  const parts = makeParts(word, gloss, teachingMorphology);
  const rootlessPart = parts.find((part) => part.rootStatus === "rootless");
  const category = rootlessPart
    ? categoryForKind(rootlessPart.kind)
    : "lexical word";
  const type = wordType(teachingMorphology, root);
  const lessonId = `lesson:${surah}:${ayah}:${word.position}`;
  return {
    lessonId,
    lesson: {
      id: lessonId,
      meaning: gloss,
      type,
      root,
      rootPicture: root
        ? rootMeaningFor(root)
        : `No lexical root (${category}) — ${gloss} is supplied by this ${category}.`,
      construction: parts.map((part) => part.sourceText).join(" + "),
      components: parts.map((part) => ({
        text: part.sourceText,
        displayText: part.displayText,
        label: part.label,
        meaning: part.meaning,
        kind: part.kind,
        rootStatus: part.rootStatus,
        ...(part.rootStatus === "lexical"
          ? { root: part.root }
          : { rootExplanation: part.rootExplanation }),
      })),
      grammar: grammarText(teachingMorphology, category),
      sentenceRole: `Contributes “${gloss}” to the certified translation of āyah ${ayah}.`,
      recognitionClue: root
        ? `Recognise the ${root} root family in “${gloss}”; attached grammatical parts remain visible.`
        : `Recognise this ${category} by its stable grammatical role; it has no lexical root.`,
      ...(() => {
        const reviewed = buildForms(
          word,
          gloss,
          root,
          teachingMorphology,
          category,
          sarfEvidenceByRoot.get(root.replace(/\s+/gu, "")) ?? [],
        );
        return { forms: reviewed.forms, sarfReview: reviewed.review };
      })(),
      takeaway: root
        ? `The root ${root} remains connected to “${gloss}” while the form shows its grammatical role.`
        : `This ${category} has no lexical root; its form supplies “${gloss}” in the āyah.`,
      breakdown: {
        id: `breakdown:${word.id}`,
        mode: parts.length > 1 ? "segmented" : "atomic",
        sourceText: word.arabic,
        parts: parts.map((part, index) => ({
          id: `breakdown:${word.id}:part:${index + 1}`,
          order: index + 1,
          sourceText: part.sourceText,
          displayText: part.displayText,
          label: part.label,
          meaning: part.meaning,
          kind: part.kind,
          rootStatus: part.rootStatus,
          ...(part.rootStatus === "lexical"
            ? { root: part.root }
            : { rootExplanation: part.rootExplanation }),
        })),
      },
    },
    gloss,
    transliteration: apiWord.transliteration?.text ?? "",
  };
}

async function apiWordsForSurah(number: number) {
  const response = await fetch(
    `https://api.quran.com/api/v4/verses/by_chapter/${number}?words=true&word_fields=text_uthmani,translation,transliteration&translations=20&per_page=300`,
  );
  if (!response.ok)
    throw new Error(`Quran Foundation API ${number}: ${response.status}`);
  const data = (await response.json()) as {
    verses?: Array<{ verse_number: number; words: ApiWord[] }>;
  };
  return new Map(
    (data.verses ?? []).map((verse) => [
      verse.verse_number,
      verse.words.filter((word) => word.char_type_name === "word"),
    ]),
  );
}

// Quran Foundation occasionally groups two canonical visible words into one
// translated API unit (for example بَعْدَ مَا). Never copy that phrase gloss
// onto both words. These are reviewed splits for the known grouped units; any
// new grouped unit fails closed until it receives the same treatment.
const API_WORD_SPLIT_GLOSSES: Record<string, string[]> = {
  "2:181:3": ["after", "what"],
  "8:6:4": ["after", "what"],
  "13:37:8": ["after", "what"],
  "37:130:3": [
    "the first part of the proper name Ilyāsīn",
    "the second part of the proper name Ilyāsīn",
  ],
};

function alignApiWords(
  surah: number,
  ayah: SourcePackage["ayahs"][number],
  apiWords: ApiWord[],
) {
  const aligned: ApiWord[] = [];
  let sourceIndex = 0;
  for (const apiWord of apiWords) {
    const start = sourceIndex;
    let joined = "";
    while (sourceIndex < ayah.words.length) {
      joined += ayah.words[sourceIndex].arabic;
      sourceIndex += 1;
      if (canonical(joined) === canonical(apiWord.text_uthmani ?? "")) break;
    }
    if (
      sourceIndex > ayah.words.length ||
      canonical(joined) !== canonical(apiWord.text_uthmani ?? "")
    ) {
      throw new Error(
        `${surah}:${ayah.number} API Arabic does not align at source position ${ayah.words[start]?.position ?? "unknown"}: ${apiWord.text_uthmani}`,
      );
    }

    const sourceWords = ayah.words.slice(start, sourceIndex);
    if (sourceWords.length === 1) {
      aligned.push({ ...apiWord, text_uthmani: sourceWords[0].arabic });
      continue;
    }

    const key = `${surah}:${ayah.number}:${sourceWords[0].position}`;
    const glosses = API_WORD_SPLIT_GLOSSES[key];
    if (!glosses || glosses.length !== sourceWords.length) {
      throw new Error(
        `${surah}:${ayah.number} grouped API word requires a reviewed gloss split at source position ${sourceWords[0].position}: ${apiWord.text_uthmani}`,
      );
    }
    for (const [index, sourceWord] of sourceWords.entries()) {
      aligned.push({
        ...apiWord,
        text_uthmani: sourceWord.arabic,
        translation: {
          ...(apiWord.translation ?? {}),
          text: glosses[index],
        },
      });
    }
  }
  if (sourceIndex !== ayah.words.length) {
    throw new Error(
      `${surah}:${ayah.number} API word alignment ended at ${sourceIndex}/${ayah.words.length} canonical words`,
    );
  }
  return aligned;
}

const translationLines = (await fs.readFile(translationPath, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean);
const certifiedTranslations = new Map<string, string>();
for (const line of translationLines) {
  const [surah, ayah, ...text] = line.split("|");
  if (surah && ayah && text.length)
    certifiedTranslations.set(`${surah}:${ayah}`, text.join("|"));
}

const morphologyResult = await pool.query<{
  id: string;
  occurrence_id: string;
  provider: string;
  record_key: string | null;
  version: string | null;
  part_of_speech: string | null;
  features: unknown;
  segmentation: unknown;
}>(
  `select mr.id, mr.occurrence_id, mr.provider, mr.features, mr.segmentation,
          mr.part_of_speech, mr.features->>'recordKey' as record_key,
          mr.features->>'version' as version
   from morphology_records mr
   join word_occurrences wo on wo.id = mr.occurrence_id
   join surahs s on s.id = wo.surah_id
   where mr.provider = 'quranic-arabic-corpus'
     and s.number = any($1::int[])`,
  [SURAH_NUMBERS],
);
const morphologyByOccurrence = new Map<string, MorphologyRecord>();
for (const row of morphologyResult.rows) {
  const details = parseJson<{
    recordKey?: string;
    version?: string;
    sourceText?: string;
    lemma?: string;
    root?: string;
    pattern?: string;
    features?: MorphologyRecord["features"];
  }>(row.features, {});
  morphologyByOccurrence.set(row.occurrence_id, {
    id: row.id,
    provider: row.provider,
    recordKey: row.record_key ?? details.recordKey ?? row.occurrence_id,
    version: row.version ?? details.version ?? "unknown",
    sourceText: details.sourceText ?? "",
    lemma: details.lemma,
    root: details.root,
    pattern: details.pattern,
    partOfSpeech: row.part_of_speech ?? undefined,
    features: details.features ?? [],
    segmentation: parseJson<MorphologyRecord["segmentation"]>(
      row.segmentation,
      undefined,
    ),
  });
}

const sarfEvidenceResult = await pool.query<{
  id: string;
  arabic: string;
  gloss: string | null;
  features: unknown;
  part_of_speech: string | null;
}>(
  `select wo.id, wo.arabic, wo.gloss, mr.features, mr.part_of_speech
   from word_occurrences wo
   join morphology_records mr on mr.occurrence_id = wo.id
   where mr.provider = 'quranic-arabic-corpus'
     and wo.gloss is not null
     and nullif(mr.features->>'root', '') is not null`,
);
const sarfEvidenceByRoot = new Map<string, SarfEvidence[]>();
for (const row of sarfEvidenceResult.rows) {
  const details = parseJson<{
    root?: string;
    pattern?: string;
    version?: string;
    recordKey?: string;
    features?: MorphologyRecord["features"];
  }>(row.features, {});
  const rootKey = (details.root ?? "").replace(/\s+/gu, "");
  if (!rootKey || !row.gloss?.trim()) continue;
  const evidence: SarfEvidence = {
    form: row.arabic,
    meaning: row.gloss.trim(),
    root: details.root ?? "",
    occurrenceId: row.id,
    provider: "quranic-arabic-corpus",
    version: details.version ?? "unknown",
    features: details.features ?? [],
    pattern: details.pattern,
    partOfSpeech: row.part_of_speech ?? undefined,
  };
  const existing = sarfEvidenceByRoot.get(rootKey) ?? [];
  if (!existing.some((item) => item.form === evidence.form))
    sarfEvidenceByRoot.set(rootKey, [...existing, evidence]);
}

let authoredWords = 0;
let authoredLessons = 0;
for (const number of SURAH_NUMBERS) {
  const folder = (await fs.readdir(packagesRoot)).find((entry) =>
    entry.startsWith(`${String(number).padStart(3, "0")}-`),
  );
  if (!folder) throw new Error(`No package directory for sūrah ${number}`);
  const packagePath = path.join(packagesRoot, folder, "surah.json");
  const packageJson = JSON.parse(
    await fs.readFile(packagePath, "utf8"),
  ) as SourcePackage;
  const apiByAyah = await apiWordsForSurah(number);
  const teachingEntries: Record<string, unknown> = {};

  for (const ayah of packageJson.ayahs) {
    const certified = certifiedTranslations.get(`${number}:${ayah.number}`);
    if (!certified)
      throw new Error(`Missing certified translation ${number}:${ayah.number}`);
    ayah.translation = certified;
    delete ayah.naturalMeaning;
    if (!shouldAuthorAyah(number, ayah.number)) continue;
    const apiWords = alignApiWords(
      number,
      ayah,
      apiByAyah.get(ayah.number) ?? [],
    );
    if (apiWords.length !== ayah.words.length)
      throw new Error(
        `${number}:${ayah.number} API word count ${apiWords.length} != source ${ayah.words.length}`,
      );
    for (const [index, word] of ayah.words.entries()) {
      const apiWord = apiWords[index];
      if (canonical(apiWord.text_uthmani ?? "") !== canonical(word.arabic))
        throw new Error(
          `${word.id} API Arabic does not align: ${apiWord.text_uthmani} != ${word.arabic}`,
        );
      const authored = lessonFor(
        number,
        ayah.number,
        word,
        apiWord,
        morphologyByOccurrence.get(word.id),
        sarfEvidenceByRoot,
      );
      word.gloss = authored.gloss;
      word.transliteration = authored.transliteration;
      word.teachingId = authored.lessonId;
      word.breakdown = authored.lesson.breakdown;
      word.occurrenceRole = `Contributes “${authored.gloss}” to the certified translation of āyah ${ayah.number}.`;
      word.sourceReferences = [
        ...(word.sourceReferences ?? []).filter(
          (reference) =>
            typeof reference !== "object" ||
            reference === null ||
            (reference as { provider?: string }).provider !==
              "quran-foundation",
        ),
        {
          provider: "quran-foundation",
          recordKey: `${number}:${ayah.number}:${word.position}`,
          version: "content-api-v4",
          attribution: "Quran Foundation Content API",
        },
      ];
      delete word.morphology;
      teachingEntries[authored.lessonId] = authored.lesson;
      authoredWords += 1;
      authoredLessons += 1;
    }
  }

  const hasUnscopedAyahs = packageJson.ayahs.some(
    (ayah) => !shouldAuthorAyah(number, ayah.number),
  );
  packageJson.status = hasUnscopedAyahs ? "custom-partial" : "custom-complete";
  packageJson.contentVersion = `tanzil-1.1+teaching-${number}-v1`;
  packageJson.surah.description = `Reviewed Word Tree teaching layer for ${BATCH_LABEL}.`;
  packageJson.sourceReferences = [
    {
      provider: "tanzil",
      recordKey: `surah:${number}`,
      version: "1.1",
      attribution: "Tanzil Project",
    },
    {
      provider: "quranic-arabic-corpus",
      recordKey: `surah:${number}`,
      version: "0.4",
      attribution: "Quranic Arabic Corpus",
    },
    {
      provider: "quran-foundation",
      recordKey: `surah:${number}:words`,
      version: "content-api-v4",
      attribution: "Quran Foundation Content API",
    },
  ];
  packageJson.teachingEntries = teachingEntries;
  await fs.writeFile(
    packagePath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
  const manifestPath = path.join(packagesRoot, folder, "manifest.json");
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8"),
  ) as Record<string, unknown>;
  manifest.contentVersion = packageJson.contentVersion;
  manifest.status = packageJson.status;
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Authored sūrah ${number}: ${ayahCount(packageJson)} āyāt, ${wordCount(packageJson)} words`,
  );
}

function ayahCount(pkg: SourcePackage) {
  return pkg.ayahs.length;
}

function wordCount(pkg: SourcePackage) {
  return pkg.ayahs.reduce((total, ayah) => total + ayah.words.length, 0);
}

console.log(
  `Authored ${BATCH_LABEL}: ${authoredLessons} teaching entries across ${authoredWords} word occurrences.`,
);
await pool.end();
