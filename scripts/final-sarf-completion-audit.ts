import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { discoverPackagePaths, readPackage } from "./lib/packages";
import { pool } from "./lib/db";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";

const contract = assertAuthoringContract("final Ṣarf completion audit");

type JsonObject = Record<string, unknown>;
type ProviderRow = {
  occurrence_id: string;
  part_of_speech: string | null;
  features: unknown;
};

type OccurrenceRecord = {
  occurrenceId: string;
  teachingId: string;
  packageId: string;
  surah: number;
  ayah: number;
  position: number;
  arabic: string;
  meaning: string;
  root: string;
  lessonType: string;
  category: string;
  status: "full" | "confirmed-limited" | "blocked" | "unknown";
  formCount: number;
  familyScope?: string;
  limitedReason?: string;
  providerRoot?: string;
  providerLemma?: string;
  providerPartOfSpeech?: string;
};

type FamilyRecord = {
  familyKey: string;
  root: string;
  lemma: string;
  category: string;
  occurrences: OccurrenceRecord[];
  statusSet: string[];
  publicationStatus: "full" | "confirmed-limited" | "blocked" | "unknown";
};

function parseFeatures(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null) return value as JsonObject;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/gu, "");
}

function base(value: string) {
  return normalize(value).replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "");
}

function comparableBase(value: string) {
  return base(value).replace(/[\u0622\u0623\u0625\u0671]/gu, "ا");
}

function rootKey(value: string) {
  return value.replace(/\s+/gu, "").trim();
}

function classify(lesson: JsonObject) {
  const root = rootKey(text(lesson.root));
  const type = text(lesson.type).toLowerCase();
  const grammar = text(lesson.grammar).toLowerCase();
  const components = Array.isArray(lesson.components)
    ? lesson.components.map((item) => JSON.stringify(item)).join(" ").toLowerCase()
    : "";
  const all = `${type} ${grammar} ${components}`;
  if (!root) {
    if (/preposition/.test(all)) return "preposition";
    if (/pronoun/.test(all)) return "pronoun";
    if (/relative/.test(all)) return "relative word";
    if (/demonstrative/.test(all)) return "demonstrative";
    if (/conjunction|connector/.test(all)) return "connector/conjunction";
    if (/vocative/.test(all)) return "vocative";
    if (/article/.test(all)) return "article";
    if (/adverb/.test(all)) return "adverb";
    if (/particle/.test(all)) return "particle";
    return "rootless grammatical/other";
  }
  if (/proper\s*(?:name|noun)/.test(all)) return "proper noun";
  if (/verb/.test(type)) return "verb";
  if (/participle/.test(type)) return "participle";
  if (/adjective/.test(type)) return "adjective";
  if (/noun/.test(type)) return "noun";
  return "lexical other";
}

function classifyWithProvider(occurrence: OccurrenceRecord) {
  if (!occurrence.root) return occurrence.category;
  if (occurrence.category === "proper noun") return "proper noun";
  const providerPos = (occurrence.providerPartOfSpeech || "").toLowerCase();
  if (/verb/.test(providerPos)) return "verb";
  if (/participle/.test(providerPos)) return "participle";
  if (/adjective/.test(providerPos)) return "adjective";
  if (/noun/.test(providerPos)) return "noun";
  return occurrence.category;
}

function statusOf(lesson: JsonObject): OccurrenceRecord["status"] {
  const review = (lesson.sarfReview ?? {}) as JsonObject;
  if (review.status === "full" || review.auditDecision === "upgraded-to-full") return "full";
  if (review.auditDecision === "blocked-for-genuine-ambiguity") return "blocked";
  if (review.auditDecision === "confirmed-limited") return "confirmed-limited";
  return "unknown";
}

function publicationStatus(statuses: Set<string>): FamilyRecord["publicationStatus"] {
  if (statuses.has("unknown")) return "unknown";
  if (statuses.has("blocked")) return "blocked";
  if (statuses.has("confirmed-limited")) return "confirmed-limited";
  return "full";
}

function familyIdentity(item: OccurrenceRecord) {
  const lemma = item.providerLemma ? comparableBase(item.providerLemma) : comparableBase(item.arabic);
  const pos = (item.providerPartOfSpeech || item.category).toLowerCase().replace(/\s+/gu, "-");
  const scope = item.familyScope ? `|scope=${item.familyScope}` : "";
  if (item.root) return `lexical|${item.root}|${lemma}|${pos}${scope}`;
  return `rootless|${item.category}|${lemma}${scope}`;
}

const packagePaths = await discoverPackagePaths();
const occurrences: OccurrenceRecord[] = [];
const providerOccurrenceIds: string[] = [];

for (const packagePath of packagePaths) {
  const result = await readPackage(packagePath);
  if (!result.package) continue;
  const pkg = result.package as JsonObject;
  const surah = (pkg.surah ?? {}) as JsonObject;
  const teachingEntries = (pkg.teachingEntries ?? {}) as JsonObject;
  const ayahs = Array.isArray(pkg.ayahs) ? pkg.ayahs : [];
  for (const ayahValue of ayahs) {
    const ayah = ayahValue as JsonObject;
    const words = Array.isArray(ayah.words) ? ayah.words : [];
    for (const wordValue of words) {
      const word = wordValue as JsonObject;
      const teachingId = text(word.teachingId);
      const lesson = teachingId ? (teachingEntries[teachingId] as JsonObject | undefined) : undefined;
      if (!lesson) continue;
      const review = (lesson.sarfReview ?? {}) as JsonObject;
      const forms = Array.isArray(lesson.forms) ? lesson.forms : [];
      const occurrenceId = text(word.id);
      const item: OccurrenceRecord = {
        occurrenceId,
        teachingId,
        packageId: text(pkg.packageId),
        surah: Number(surah.number),
        ayah: Number(ayah.number),
        position: Number(word.position),
        arabic: text(word.arabic),
        meaning: text(word.gloss) || text(lesson.meaning),
        root: rootKey(text(lesson.root)),
        lessonType: text(lesson.type),
        category: classify(lesson),
        status: statusOf(lesson),
        formCount: forms.length,
        familyScope: text(review.familyScope) || undefined,
        limitedReason: text(review.limitedReason) || undefined,
      };
      occurrences.push(item);
      providerOccurrenceIds.push(occurrenceId);
    }
  }
}

const providerResult = await pool.query<ProviderRow>(
  `select distinct on (occurrence_id)
      occurrence_id, part_of_speech, features
   from morphology_records
   where provider='quranic-arabic-corpus'
     and occurrence_id = any($1::text[])
   order by occurrence_id, id`,
  [providerOccurrenceIds],
);
const providerByOccurrence = new Map(providerResult.rows.map((row) => {
  const features = parseFeatures(row.features);
  const segmentation = Array.isArray(features.segmentation)
    ? features.segmentation.filter((item): item is JsonObject => typeof item === "object" && item !== null)
    : [];
  const lexicalPart = segmentation.find((item) => item.kind === "stem" || item.kind === "whole");
  const rawLemma = text(features.lemma);
  const cliticLemma = /^(?:و|ف|ب|ك|ل|ال|ٱل)$/u.test(comparableBase(rawLemma));
  return [row.occurrence_id, {
    root: text(features.root),
    // The provider's top-level lemma can be a clitic such as ب or و when the
    // visible word contains a preposition/conjunction. Use the actual lemma
    // when it is lexical; fall back to the aligned lexical stem only for
    // clitic-labelled records.
    lemma: cliticLemma ? text(lexicalPart?.sourceText) || rawLemma : rawLemma,
    partOfSpeech: text(row.part_of_speech) || text(features.partOfSpeech),
  }];
}));

for (const occurrence of occurrences) {
  const provider = providerByOccurrence.get(occurrence.occurrenceId);
  occurrence.providerRoot = provider?.root || undefined;
  occurrence.providerLemma = provider?.lemma || undefined;
  occurrence.providerPartOfSpeech = provider?.partOfSpeech || undefined;
  occurrence.category = classifyWithProvider(occurrence);
}

const familyMap = new Map<string, FamilyRecord>();
for (const occurrence of occurrences) {
  const familyKey = familyIdentity(occurrence);
  const family = familyMap.get(familyKey) ?? {
    familyKey,
    root: occurrence.root,
    lemma: occurrence.providerLemma || occurrence.arabic,
    category: occurrence.category,
    occurrences: [],
    statusSet: [],
    publicationStatus: "unknown",
  };
  family.occurrences.push(occurrence);
  familyMap.set(familyKey, family);
}

for (const family of familyMap.values()) {
  family.statusSet = [...new Set(family.occurrences.map((item) => item.status))].sort();
  family.publicationStatus = publicationStatus(new Set(family.statusSet));
}

const familyCounts = Object.fromEntries(
  ["full", "confirmed-limited", "blocked", "unknown"].map((status) => [
    status,
    [...familyMap.values()].filter((family) => family.publicationStatus === status).length,
  ]),
);
const occurrenceCounts = Object.fromEntries(
  ["full", "confirmed-limited", "blocked", "unknown"].map((status) => [
    status,
    occurrences.filter((item) => item.status === status).length,
  ]),
);
const mixedFamilies = [...familyMap.values()].filter((family) => family.statusSet.length > 1);
const blockedFamilies = [...familyMap.values()].filter((family) => family.publicationStatus === "blocked");

const reviewRecords = blockedFamilies.map((family) => {
  const analyses = [...new Map(
    family.occurrences.map((item) => [
      `${item.providerRoot || ""}|${item.providerLemma || ""}|${item.providerPartOfSpeech || ""}`,
      {
        root: item.providerRoot || null,
        lemma: item.providerLemma || null,
        partOfSpeech: item.providerPartOfSpeech || null,
        forms: [...new Set(family.occurrences.map((occurrence) => occurrence.arabic))],
      },
    ]),
  ).values()];
  return {
    recordType: "blocked-sarf-family-review",
    contractVersion: contract.contractVersion,
    familyKey: family.familyKey,
    root: family.root || null,
    lemmaOrCurrentForm: family.lemma,
    familyScope: family.occurrences[0]?.familyScope || null,
    category: family.category,
    quranicOccurrences: family.occurrences.map((item) => ({
      occurrenceId: item.occurrenceId,
      surah: item.surah,
      ayah: item.ayah,
      position: item.position,
      arabic: item.arabic,
      meaning: item.meaning,
      formCount: item.formCount,
      status: item.status,
      currentReason: item.limitedReason || null,
    })),
    currentAnalysis: {
      statusSet: family.statusSet,
      publicationStatus: family.publicationStatus,
      providerAnalyses: analyses,
      note: "This family was not silently accepted as limited. At least one occurrence remains explicitly blocked after the current evidence-led review pass.",
    },
    competingPossibleAnalyses: [
      "The aligned provider lemma/root/POS may identify a productive lexical family that supports additional reviewed forms.",
      "The occurrence may be a restricted lexical item or an occurrence-specific noun/verb whose useful contrasts are not represented in the current project evidence.",
      "Some apparent alternatives may be only article, conjunction, pronoun or case shells and therefore must not count as Ṣarf forms.",
    ],
    whyAutomaticResolutionIsUnsafe: "The current evidence does not establish four additional learner-useful forms with reliable form-specific meanings and relationships without risking fabricated, wrong-root, duplicate, shell-only or pedagogically misleading rows.",
    evidenceRequiredToResolve: [
      "An approved Arabic/Qur'anic lexicon entry for the reviewed root and lemma.",
      "Canonical Qur'anic evidence or an authoritative morphology reference for each proposed related form.",
      "Expert Arabic/Qur'anic morphology adjudication where provider, lexicon or occurrence analyses conflict.",
      "A provenance-backed decision identifying whether the family should be full or specifically limited.",
    ],
    reviewedAt: new Date().toISOString(),
  };
});

const report = {
  reportType: "final-sarf-completion-audit",
  contractVersion: contract.contractVersion,
  generatedAt: new Date().toISOString(),
  definition: "A distinct family is a reviewed root plus aligned provider lemma and part of speech; rootless items use category plus aligned lemma/current form. Occurrence counts remain separate.",
  totals: {
    packages: packagePaths.length,
    ayahs: new Set(occurrences.map((item) => `${item.surah}:${item.ayah}`)).size,
    wordOccurrences: occurrences.length,
    distinctSarfFamilies: familyMap.size,
    familyCounts,
    occurrenceCounts,
    mixedFamilyCount: mixedFamilies.length,
  },
  categoryBreakdown: Object.fromEntries(
    [...new Set(occurrences.map((item) => item.category))].sort().map((category) => {
      const categoryOccurrences = occurrences.filter((item) => item.category === category);
      const categoryFamilies = [...familyMap.values()].filter((family) => family.category === category);
      return [category, {
        families: categoryFamilies.length,
        occurrences: categoryOccurrences.length,
        familyCounts: Object.fromEntries(["full", "confirmed-limited", "blocked", "unknown"].map((status) => [
          status,
          categoryFamilies.filter((family) => family.publicationStatus === status).length,
        ])),
        occurrenceCounts: Object.fromEntries(["full", "confirmed-limited", "blocked", "unknown"].map((status) => [
          status,
          categoryOccurrences.filter((item) => item.status === status).length,
        ])),
      }];
    }),
  ),
  discrepancyExplanation: {
    blocked1503: "The earlier 1,503 figure counts blocked word occurrences/lesson records, not deduplicated root-lemma-POS families.",
    confirmedLimited31058: "The earlier 31,058 figure counts confirmed-limited word occurrences/lesson records, not deduplicated families.",
    mixedFamilies: "If a family contains both full and blocked occurrences, publicationStatus is blocked until every occurrence-level analysis is resolved; the report retains the underlying status set instead of hiding the mixture.",
  },
  mixedFamilies: mixedFamilies.map((family) => ({
    familyKey: family.familyKey,
    root: family.root || null,
    lemma: family.lemma,
    statusSet: family.statusSet,
    occurrenceIds: family.occurrences.map((item) => item.occurrenceId),
  })),
  blockedFamilyReviewRecords: reviewRecords,
};

const outputPath = path.resolve("artifacts/content-review/final-sarf-completion-audit.json");
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const existingAuditIds = new Set(readAuditRecords().map((record) => record.recordId));
const blockedAuditRecords: AuditRecord[] = reviewRecords.map((review) => {
  const digest = createHash("sha256").update(review.familyKey).digest("hex").slice(0, 24);
  return {
    recordId: `final-sarf-blocked-family-${digest}`,
    eventType: "blocked-sarf-family-review",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    scope: {
      type: "sarf-family",
      familyKey: review.familyKey,
      root: review.root,
      lemmaOrCurrentForm: review.lemmaOrCurrentForm,
      category: review.category,
      occurrenceIds: review.quranicOccurrences.map((occurrence) => occurrence.occurrenceId),
    },
    status: "blocked",
    reviewedAt: review.reviewedAt,
    checks: [
      "distinct-family-counted-separately-from-occurrences",
      "current-analysis-recorded",
      "competing-analyses-recorded",
      "automatic-resolution-rejected-when-evidence-is-insufficient",
      "durable-blocker-record-created",
    ],
    evidence: [
      outputPath,
      "docs/content-authoring/quranic-word-tree-contract.json",
      "docs/content-authoring/common-problems.json",
    ],
    blockedFamilyReview: review,
  };
}).filter((record) => !existingAuditIds.has(record.recordId));
if (blockedAuditRecords.length) appendAuditRecords(blockedAuditRecords);
console.log(JSON.stringify({
  outputPath,
  ...report.totals,
  blockedReviewRecords: reviewRecords.length,
  blockedAuditRecordsAdded: blockedAuditRecords.length,
}, null, 2));
await pool.end();
