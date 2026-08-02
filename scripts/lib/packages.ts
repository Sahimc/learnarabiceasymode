import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SurahPackageSchema,
  validateResolvedBreakdown,
  type SurahPackage,
} from "../../app/data/content-contract";

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
  const expectedStatus =
    pkg.surah.number >= 112 && pkg.surah.number <= 114
      ? "custom-complete"
      : "source-only";
  if (pkg.status !== expectedStatus)
    errors.push(
      `status should be ${expectedStatus} for sūrah ${pkg.surah.number}`,
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
      if (pkg.status === "custom-complete") {
        const resolvedBreakdown = word.breakdownOverride ?? word.breakdown;
        if (!word.teachingId)
          errors.push(`${word.id}: custom-complete word is missing teachingId`);
        if (!resolvedBreakdown)
          errors.push(
            `${word.id}: custom-complete word is missing explicit WordBreakdown`,
          );
        if (word.teachingId && !pkg.teachingEntries[word.teachingId])
          errors.push(`${word.id}: missing teaching entry ${word.teachingId}`);
        if (resolvedBreakdown)
          errors.push(
            ...validateResolvedBreakdown(word.arabic, resolvedBreakdown).map(
              (item) => `${word.id}: ${item}`,
            ),
          );
      } else if (word.teachingId || word.breakdown || word.breakdownOverride) {
        errors.push(
          `${word.id}: source-only package contains custom teaching data`,
        );
      }
    }
  }
  if (pkg.status === "custom-complete") {
    for (const [id, lesson] of Object.entries(pkg.teachingEntries))
      if (id !== lesson.id)
        errors.push(`teaching entry key ${id} does not match lesson id`);
  }
  return errors;
}
