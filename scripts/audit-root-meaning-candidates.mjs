import fs from "node:fs";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract.mjs";

assertAuthoringContract("root-meaning audit");

const rootDir = path.resolve("content-import/surahs");
const externalRootGlossPath = process.env.ROOT_GLOSS_SOURCE;
const externalRootGlosses = externalRootGlossPath
  ? JSON.parse(fs.readFileSync(externalRootGlossPath, "utf8"))
  : {};
const packages = [];
for (const directory of fs.readdirSync(rootDir).sort()) {
  const file = path.join(rootDir, directory, "surah.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  packages.push(pkg);
}

const normalizeRoot = (root) =>
  String(root ?? "")
    .replace(/\s+/gu, "")
    .trim();
const candidates = new Map();
const targetRoots = new Set();
const targetOccurrences = new Map();
const targetBadOccurrences = new Map();

for (const pkg of packages) {
  const inTarget = pkg.surah.number >= 58 && pkg.surah.number <= 90;
  for (const lesson of Object.values(pkg.teachingEntries ?? {})) {
    const root = normalizeRoot(lesson.root);
    if (!root) continue;
    if (inTarget) {
      targetRoots.add(root);
      targetOccurrences.set(root, (targetOccurrences.get(root) ?? 0) + 1);
      if (String(lesson.rootPicture).startsWith("word-family meaning:"))
        targetBadOccurrences.set(
          root,
          (targetBadOccurrences.get(root) ?? 0) + 1,
        );
    }
    const picture = String(lesson.rootPicture ?? "").trim();
    if (!picture || picture.startsWith("word-family meaning:")) continue;
    const values = candidates.get(root) ?? new Map();
    values.set(picture, (values.get(picture) ?? 0) + 1);
    candidates.set(root, values);
  }
}

const unresolved = [...targetRoots]
  .filter((root) => !candidates.has(root))
  .sort();
const unresolvedWithoutExternalSource = unresolved.filter(
  (root) => !externalRootGlosses[root],
);
const conflicting = [...targetRoots]
  .map((root) => [root, [...(candidates.get(root)?.keys() ?? [])]])
  .filter(([, values]) => values.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0]));

console.log(
  JSON.stringify(
    {
      targetPackages: packages
        .filter((pkg) => pkg.surah.number >= 58 && pkg.surah.number <= 90)
        .map((pkg) => pkg.surah.number),
      targetRoots: targetRoots.size,
      targetOccurrences: [...targetOccurrences.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
      targetBadOccurrences: [...targetBadOccurrences.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
      rootsWithReviewedCandidate: [...targetRoots].filter((root) =>
        candidates.has(root),
      ).length,
      unresolvedRoots: unresolved,
      unresolvedCount: unresolved.length,
      unresolvedWithoutExternalSource,
      unresolvedWithoutExternalSourceCount:
        unresolvedWithoutExternalSource.length,
      conflictingCount: conflicting.length,
      conflicting: conflicting.slice(0, 40),
    },
    null,
    2,
  ),
);
