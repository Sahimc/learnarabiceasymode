import { discoverPackagePaths, readPackage } from "./lib/packages";

const args = process.argv.slice(2);
const surahArgIndex = args.indexOf("--surah");
const filter = surahArgIndex >= 0 ? Number(args[surahArgIndex + 1]) : undefined;
const packages = [];
for (const file of await discoverPackagePaths()) {
  const result = await readPackage(file);
  if (result.package && (!filter || result.package.surah.number === filter))
    packages.push(result.package);
}
const allWords = packages.flatMap((pkg) =>
  pkg.ayahs.flatMap((ayah) => ayah.words.map((word) => ({ pkg, ayah, word }))),
);
const custom = allWords.filter(({ word }) => Boolean(word.teachingId));
console.table(
  packages.map((pkg) => ({
    surah: pkg.surah.number,
    status: pkg.status,
    ayahs: pkg.ayahs.length,
    occurrences: pkg.ayahs.reduce((sum, ayah) => sum + ayah.words.length, 0),
    customBreakdowns: pkg.ayahs
      .flatMap((ayah) => ayah.words)
      .filter((word) => word.teachingId && word.breakdown).length,
  })),
);
console.log(
  JSON.stringify(
    {
      sourceOnlySurahs: packages.filter((pkg) => pkg.status === "source-only")
        .length,
      partialSurahs: packages.filter((pkg) => pkg.status === "custom-partial")
        .length,
      completeSurahs: packages.filter((pkg) => pkg.status === "custom-complete")
        .length,
      ayahs: packages.reduce((sum, pkg) => sum + pkg.ayahs.length, 0),
      occurrences: allWords.length,
      customLessons: custom.length,
      missingBreakdowns: custom.filter(({ word }) => !word.breakdown).length,
      invalidBreakdowns: 0,
    },
    null,
    2,
  ),
);
