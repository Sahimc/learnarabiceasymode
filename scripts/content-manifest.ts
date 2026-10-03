import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";

const packages = [];
for (const filePath of await discoverPackagePaths()) {
  const result = await readPackage(filePath);
  if (!result.package || result.errors.length)
    throw new Error(`${filePath}\n${result.errors.join("\n")}`);
  packages.push({ filePath, raw: result.raw, package: result.package });
}

packages.sort((a, b) => a.package.surah.number - b.package.surah.number);

const surahs = packages.map(({ package: pkg }) => {
  const words = pkg.ayahs.flatMap((ayah) => ayah.words);
  return {
    number: pkg.surah.number,
    packageId: pkg.packageId,
    contentVersion: pkg.contentVersion,
    status: pkg.status,
    ayahs: pkg.ayahs.length,
    occurrences: words.length,
    customOccurrences: words.filter((word) => word.teachingId).length,
    explicitBreakdowns: words.filter((word) => word.breakdown).length,
  };
});

const rawFingerprint = crypto
  .createHash("sha256")
  .update(packages.map((item) => item.raw).join("\n"))
  .digest("hex");
const occurrenceCount = surahs.reduce((sum, row) => sum + row.occurrences, 0);
const customOccurrenceCount = surahs.reduce(
  (sum, row) => sum + row.customOccurrences,
  0,
);
const manifest = {
  schemaVersion: "1.0.0",
  manifestType: "current-production-content",
  generatedFrom: "content-import/surahs",
  contentFingerprint: rawFingerprint,
  packageCount: packages.length,
  sourceLayer: {
    surahs: packages.length,
    ayahs: surahs.reduce((sum, row) => sum + row.ayahs, 0),
    visibleOccurrences: occurrenceCount,
  },
  teachingLayer: {
    sourceOnlySurahs: surahs.filter((row) => row.status === "source-only")
      .length,
    partialSurahs: surahs.filter((row) => row.status === "custom-partial")
      .length,
    completeSurahs: surahs.filter((row) => row.status === "custom-complete")
      .length,
    customOccurrences: customOccurrenceCount,
    explicitBreakdowns: surahs.reduce(
      (sum, row) => sum + row.explicitBreakdowns,
      0,
    ),
  },
  surahs,
};

const output = path.join(
  repoRoot,
  "content-authoring",
  "production-knowledge",
  "current-manifest.json",
);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${output}`);
console.log(JSON.stringify(manifest.teachingLayer, null, 2));
