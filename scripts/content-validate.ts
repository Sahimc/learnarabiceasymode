import { discoverPackagePaths, readPackage } from "./lib/packages";

const args = process.argv.slice(2);
const surahArgIndex = args.indexOf("--surah");
const surahFilter =
  surahArgIndex >= 0 ? Number(args[surahArgIndex + 1]) : undefined;
const paths = await discoverPackagePaths();
const selected = surahFilter
  ? paths.filter(
      (file) =>
        file.includes(`/${String(surahFilter).padStart(3, "0")}-`) ||
        file.includes(`\\${String(surahFilter).padStart(3, "0")}-`),
    )
  : paths;
let totalErrors = 0;
let totalWords = 0;
let customWords = 0;
for (const file of selected) {
  const result = await readPackage(file);
  if (result.package) {
    totalWords += result.package.ayahs.reduce(
      (sum, ayah) => sum + ayah.words.length,
      0,
    );
    if (result.package.status === "custom-complete")
      customWords += result.package.ayahs.reduce(
        (sum, ayah) =>
          sum + ayah.words.filter((word) => word.teachingId).length,
        0,
      );
  }
  if (result.errors.length) {
    totalErrors += result.errors.length;
    console.error(
      `${file}\n${result.errors.map((error) => `  - ${error}`).join("\n")}`,
    );
  } else {
    console.log(`OK ${file}`);
  }
}
console.log(
  `Validated ${selected.length} package(s), ${totalWords} visible word occurrences, ${customWords} custom occurrences.`,
);
if (totalErrors) process.exitCode = 1;
