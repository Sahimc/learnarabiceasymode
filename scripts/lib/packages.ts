import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SurahPackageSchema,
  validateRootPicture,
  validateResolvedBreakdown,
  validateSarfForms,
  validateVocativeWording,
  type SurahPackage,
} from "../../app/data/content-contract";
import { rootMeaningFor } from "./root-meanings";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const packagesRoot = path.join(repoRoot, "content-import", "surahs");

export async function discoverPackagePaths() {
  const entries = await fs.readdir(packagesRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesRoot, entry.name, "surah.json"))
    .sort();
  const existing: string[] = [];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      existing.push(candidate);
    } catch {
      /* stale empty generated folder */
    }
  }
  return existing;
}

export async function readPackage(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = SurahPackageSchema.safeParse(parsed);
  const errors = result.success
    ? []
    : result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
  if (result.success) errors.push(...semanticErrors(result.data));
  return {
    filePath,
    raw,
    package: result.success && errors.length === 0 ? result.data : undefined,
    errors,
  };
}

export function semanticErrors(pkg: SurahPackage) {
  const errors: string[] = [];
  const allowedStatuses = ["source-only", "custom-partial", "custom-complete"];
  if (!allowedStatuses.includes(pkg.status))
    errors.push(
      `status should be one of ${allowedStatuses.join(", ")} for sūrah ${pkg.surah.number}`,
    );
  const seenAyahs = new Set<number>();
  for (const ayah of pkg.ayahs) {
    if (seenAyahs.has(ayah.number))
      errors.push(`duplicate āyah ${ayah.number}`);
    seenAyahs.add(ayah.number);
    const seenPositions = new Set<number>();
    for (const word of ayah.words) {
      if (seenPositions.has(word.position))
        errors.push(`${word.id}: duplicate word position`);
      seenPositions.add(word.position);
      if (word.position !== [...seenPositions].sort((a, b) => a - b).length)
        errors.push(`${word.id}: word positions must be contiguous`);
      const hasCustomTeaching = Boolean(
        word.teachingId || word.breakdown || word.breakdownOverride,
      );
      if (
        pkg.status === "custom-complete" ||
        (pkg.status === "custom-partial" && hasCustomTeaching)
      ) {
        const resolvedBreakdown = word.breakdownOverride ?? word.breakdown;
        if (!word.teachingId)
          errors.push(`${word.id}: custom teaching word is missing teachingId`);
        if (!resolvedBreakdown)
          errors.push(
            `${word.id}: custom teaching word is missing explicit WordBreakdown`,
          );
        if (word.teachingId && !pkg.teachingEntries[word.teachingId])
          errors.push(`${word.id}: missing teaching entry ${word.teachingId}`);
        if (resolvedBreakdown)
          errors.push(
            ...validateResolvedBreakdown(word.arabic, resolvedBreakdown).map(
              (item) => `${word.id}: ${item}`,
            ),
          );
        const lesson = word.teachingId
          ? pkg.teachingEntries[word.teachingId]
          : undefined;
        if (lesson)
          errors.push(
            ...validateVocativeWording(word, lesson).map(
              (item) => `${word.id}: ${item}`,
            ),
          );
        if (lesson && resolvedBreakdown) {
          errors.push(
            ...validateSarfForms(lesson.forms, {
              status: lesson.sarfReview.status,
              currentForm: word.arabic,
              root: lesson.root,
            }).map((message) => `${word.id}: ${message}`),
          );
          const lexicalComponents = lesson.components.filter(
            (component) => component.rootStatus === "lexical",
          );
          const rootlessComponents = lesson.components.filter(
            (component) => component.rootStatus === "rootless",
          );
          if (lesson.components.some((component) => !component.rootStatus))
            errors.push(
              `${word.id}: every lesson component must declare lexical or rootless status`,
            );
          if (
            lexicalComponents.some((component) =>
              isRootlessPartKind(component.kind ?? ""),
            )
          )
            errors.push(
              `${word.id}: grammatical lesson components cannot be marked as lexical-root components`,
            );
          if (lexicalComponents.some((component) => !component.root))
            errors.push(
              `${word.id}: lexical lesson components must record their root`,
            );
          if (
            lexicalComponents.length > 0 &&
            (!lesson.root.trim() ||
              !lexicalComponents.some(
                (component) =>
                  normalizeRoot(component.root) === normalizeRoot(lesson.root),
              ))
          )
            errors.push(
              `${word.id}: lexical lesson component root must agree with the lesson root`,
            );
          if (
            rootlessComponents.some(
              (component) =>
                !/^No lexical root \([^()]+\)$/u.test(
                  component.rootExplanation ?? "",
                ),
            )
          )
            errors.push(
              `${word.id}: rootless lesson components must explain their category as 'No lexical root (category)'`,
            );
          if (
            lesson.components.length > 0 &&
            lesson.root.trim() &&
            !lexicalComponents.length
          )
            errors.push(
              `${word.id}: a lesson with a lexical root must identify its lexical component`,
            );
          const lexicalParts = resolvedBreakdown.parts.filter(
            (part) => part.rootStatus === "lexical",
          );
          const rootlessParts = resolvedBreakdown.parts.filter(
            (part) => part.rootStatus === "rootless",
          );
          if (resolvedBreakdown.parts.some((part) => !part.rootStatus))
            errors.push(
              `${word.id}: every custom breakdown part must declare lexical or rootless status`,
            );
          if (
            lexicalParts.length > 0 &&
            (!lesson.root.trim() ||
              !lexicalParts.some(
                (part) =>
                  normalizeRoot(part.root) === normalizeRoot(lesson.root),
              ))
          )
            errors.push(
              `${word.id}: lexical breakdown root must agree with the lesson root`,
            );
          if (!lexicalParts.length && lesson.root.trim())
            errors.push(
              `${word.id}: a lesson with a lexical root must identify its lexical breakdown part`,
            );
          if (rootlessParts.some((part) => !part.rootExplanation))
            errors.push(
              `${word.id}: rootless breakdown parts must explain their grammatical category`,
            );
          if (lexicalParts.some((part) => isRootlessPartKind(part.kind)))
            errors.push(
              `${word.id}: grammatical breakdown parts cannot be marked as lexical-root parts`,
            );
        }
        if (
          resolvedBreakdown?.parts.some((part) =>
            ["whole word", "main word", "lexical meaning"].includes(
              part.label.trim().toLowerCase(),
            ),
          )
        )
          errors.push(
            `${word.id}: custom WordBreakdown contains a placeholder label`,
          );
      } else if (word.teachingId || word.breakdown || word.breakdownOverride) {
        errors.push(
          `${word.id}: source-only package contains custom teaching data`,
        );
      }
    }
  }
  if (pkg.status === "custom-complete" || pkg.status === "custom-partial") {
    for (const [id, lesson] of Object.entries(pkg.teachingEntries)) {
      if (id !== lesson.id)
        errors.push(`teaching entry key ${id} does not match lesson id`);
      if (
        pkg.status === "custom-complete" &&
        lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity"
      )
        errors.push(
          `${id}: a family blocked for genuine ambiguity cannot be in a custom-complete package`,
        );
      errors.push(
        ...validateRootPicture(lesson.root, lesson.rootPicture).map(
          (message) => `${id}: ${message}`,
        ),
      );
      if (lesson.root.trim()) {
        try {
          const expectedRootPicture = rootMeaningFor(lesson.root);
          if (lesson.rootPicture.trim() !== expectedRootPicture.trim())
            errors.push(
              `${id}: rootPicture must exactly match the reviewed root meaning for ${lesson.root}`,
            );
        } catch (error) {
          errors.push(`${id}: ${(error as Error).message}`);
        }
      }
      errors.push(
        ...validateSarfForms(lesson.forms, lesson.sarfReview).map(
          (message) => `${id}: ${message}`,
        ),
      );
    }
  }
  return errors;
}

function normalizeRoot(root: string | undefined) {
  return (root ?? "").replace(/\s+/gu, "").trim();
}

function isRootlessPartKind(kind: string) {
  return new Set([
    "suffix",
    "article",
    "preposition",
    "connector",
    "subject-marker",
    "object-pronoun",
    "possessive-pronoun",
    "ending",
  ]).has(kind);
}
