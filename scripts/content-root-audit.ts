import { pool } from "./lib/db";
import { discoverPackagePaths, readPackage } from "./lib/packages";
import {
  validateRootPicture,
  type SurahPackage,
  validateSarfForms,
} from "../app/data/content-contract";
import { rootMeaningFor } from "./lib/root-meanings";
import { assertAuthoringContract } from "./lib/authoring-contract";

assertAuthoringContract("root and Ṣarf audit");

const PROVIDER = "quranic-arabic-corpus";

type ProviderRow = {
  id: string;
  surah: number;
  ayah: number;
  position: number;
  arabic: string;
  providerRoot: string | null;
  providerSegmentation: { kind?: string }[] | null;
};

function normalizeRoot(root: string | null | undefined) {
  return (root ?? "").replace(/\s+/gu, "").trim();
}

function packageWords(pkg: SurahPackage) {
  return pkg.ayahs.flatMap((ayah) =>
    ayah.words.map((word) => ({ ...word, ayahNumber: ayah.number })),
  );
}

function isRootlessKind(kind: string | undefined) {
  return new Set([
    "suffix",
    "article",
    "preposition",
    "connector",
    "subject-marker",
    "object-pronoun",
    "possessive-pronoun",
    "ending",
  ]).has(kind ?? "");
}

function isReviewedRootOverride(
  lesson: SurahPackage["teachingEntries"][string],
  providerRoot: string,
) {
  const review = lesson.rootReview;
  return Boolean(
    review &&
      review.status === "reviewed-override" &&
      normalizeRoot(review.providerRoot) === providerRoot &&
      normalizeRoot(review.reviewedRoot) === normalizeRoot(lesson.root) &&
      review.rationale.trim() &&
      review.provenance.length,
  );
}

const packages: SurahPackage[] = [];
for (const file of await discoverPackagePaths()) {
  const result = await readPackage(file);
  if (result.package?.status.startsWith("custom-"))
    packages.push(result.package);
}

const surahNumbers = packages.map((pkg) => pkg.surah.number);
const providerResult = await pool.query<ProviderRow>(
  `select wo.id, s.number as surah, a.number as ayah, wo.position, wo.arabic,
          nullif(mr.features->>'root', '') as "providerRoot",
          mr.segmentation as "providerSegmentation"
   from word_occurrences wo
   join surahs s on s.id=wo.surah_id
   join ayahs a on a.id=wo.ayah_id
   left join morphology_records mr
     on mr.occurrence_id=wo.id and mr.provider=$1
   where s.number = any($2::int[])
   order by s.number, a.number, wo.position`,
  [PROVIDER, surahNumbers],
);

const providerById = new Map(providerResult.rows.map((row) => [row.id, row]));
const issues: string[] = [];
const warnings: string[] = [];
let checked = 0;
let fullFamilies = 0;
let limitedFamilies = 0;
const sarfDecisions = {
  "confirmed-limited": 0,
  "upgraded-to-full": 0,
  "blocked-for-genuine-ambiguity": 0,
  missing: 0,
};

for (const pkg of packages) {
  for (const lesson of Object.values(pkg.teachingEntries)) {
    if (lesson.sarfReview.status === "full") fullFamilies += 1;
    else limitedFamilies += 1;
    const decision = lesson.sarfReview.auditDecision;
    if (decision) sarfDecisions[decision] += 1;
    else if (lesson.sarfReview.status === "limited") sarfDecisions.missing += 1;
    if (
      lesson.sarfReview.status === "limited" &&
      (!decision || decision === "upgraded-to-full")
    )
      issues.push(
        `${pkg.surah.number}/${lesson.id}: limited Ṣarf family is missing a current audit decision`,
      );
    if (
      lesson.sarfReview.status === "full" &&
      (decision === "confirmed-limited" ||
        decision === "blocked-for-genuine-ambiguity")
    )
      issues.push(
        `${pkg.surah.number}/${lesson.id}: full Ṣarf family carries a limited/blocked audit decision`,
      );
    if (
      pkg.status === "custom-complete" &&
      decision === "blocked-for-genuine-ambiguity"
    )
      issues.push(
        `${pkg.surah.number}/${lesson.id}: blocked Ṣarf family is published in custom-complete content`,
      );
    for (const message of validateRootPicture(lesson.root, lesson.rootPicture))
      issues.push(`${pkg.surah.number}/${lesson.id}: ${message}`);
    if (lesson.root.trim()) {
      try {
        const expectedRootPicture = rootMeaningFor(lesson.root);
        if (lesson.rootPicture.trim() !== expectedRootPicture.trim())
          issues.push(
            `${pkg.surah.number}/${lesson.id}: rootPicture is not the reviewed meaning for ${lesson.root}`,
          );
      } catch (error) {
        issues.push(
          `${pkg.surah.number}/${lesson.id}: ${(error as Error).message}`,
        );
      }
    }
    for (const message of validateSarfForms(lesson.forms, lesson.sarfReview))
      issues.push(`${pkg.surah.number}/${lesson.id}: ${message}`);
  }
}

for (const pkg of packages) {
  for (const word of packageWords(pkg)) {
    if (!word.teachingId) continue;
    checked += 1;
    const lesson = pkg.teachingEntries[word.teachingId];
    const provider = providerById.get(word.id);
    if (!provider) {
      warnings.push(
        `${word.id}: provider morphology record is missing or quarantined`,
      );
      continue;
    }
    const expected = normalizeRoot(provider.providerRoot);
    const actual = normalizeRoot(lesson.root);
    const breakdown = word.breakdownOverride ?? word.breakdown;
    const explicitlyRootless = Boolean(
      breakdown?.parts.length &&
        breakdown.parts.every((part) => part.rootStatus === "rootless"),
    );
    for (const message of validateSarfForms(lesson.forms, {
      status: lesson.sarfReview.status,
      currentForm: word.arabic,
      root: lesson.root,
    }))
      issues.push(`${word.id}: ${message}`);
    if (expected && !actual && !explicitlyRootless) {
      issues.push(
        `${word.id} ${word.arabic}: provider root ${provider.providerRoot} is hidden by an empty teaching root`,
      );
    } else if (
      expected &&
      actual &&
      actual !== expected &&
      !isReviewedRootOverride(lesson, expected)
    ) {
      issues.push(
        `${word.id} ${word.arabic}: teaching root ${lesson.root || "(empty)"} does not match provider root ${provider.providerRoot}`,
      );
    } else if (!expected && actual) {
      warnings.push(
        `${word.id} ${word.arabic}: teaching root ${lesson.root} has no provider-root evidence`,
      );
    }
    const providerParts = provider.providerSegmentation ?? [];
    const hasRootlessProviderPart = providerParts.some((part) =>
      isRootlessKind(part.kind),
    );
    const hasRootlessTeachingPart = breakdown?.parts.some(
      (part) => part.rootStatus === "rootless",
    );
    if (
      actual &&
      providerParts.length > 1 &&
      hasRootlessProviderPart &&
      !hasRootlessTeachingPart
    ) {
      issues.push(
        `${word.id} ${word.arabic}: provider morphology contains a rootless grammatical part, but the teaching breakdown does not explain it separately`,
      );
    }
    const invalidLexicalPart = breakdown?.parts.find(
      (part) => part.rootStatus === "lexical" && isRootlessKind(part.kind),
    );
    if (invalidLexicalPart) {
      issues.push(
        `${word.id} ${word.arabic}: grammatical part ${invalidLexicalPart.sourceText} is marked as the lexical-root part`,
      );
    }
  }
}

console.log(
  `Audited ${checked} custom word occurrences across ${packages.length} authored sūrahs against ${PROVIDER}.`,
);
console.log(
  `Ṣarf decisions: full=${fullFamilies}, limited=${limitedFamilies}, confirmed-limited=${sarfDecisions["confirmed-limited"]}, upgraded-to-full=${sarfDecisions["upgraded-to-full"]}, blocked=${sarfDecisions["blocked-for-genuine-ambiguity"]}, missing=${sarfDecisions.missing}.`,
);
if (issues.length) {
  console.error(issues.map((issue) => `- ${issue}`).join("\n"));
  process.exitCode = 1;
}
if (warnings.length) {
  console.warn(`Provider-root review warnings (${warnings.length}):`);
  console.warn(warnings.map((warning) => `- ${warning}`).join("\n"));
}
if (!issues.length)
  console.log("Provider-root agreement: OK for aligned provider evidence.");
if (!issues.length)
  console.log("Root-picture meaning audit: OK for all custom lessons.");
if (!issues.length)
  console.log("Ṣarf form-family audit: OK for all custom lessons.");

await pool.end();
