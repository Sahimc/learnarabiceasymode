import { discoverPackagePaths, readPackage } from "./lib/packages";
import { assertAuthoringContract } from "./lib/authoring-contract";

assertAuthoringContract("content validation");

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
const normalizeArabic = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC")
    .replace(/[\u0640\s]/g, "");
const basmala = ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"].map(
  normalizeArabic,
);
for (const file of selected) {
  const result = await readPackage(file);
  if (result.package) {
    totalWords += result.package.ayahs.reduce(
      (sum, ayah) => sum + ayah.words.length,
      0,
    );
    customWords += result.package.ayahs.reduce(
      (sum, ayah) => sum + ayah.words.filter((word) => word.teachingId).length,
      0,
    );
    if (![1, 9].includes(result.package.surah.number)) {
      const firstAyah = result.package.ayahs.find((ayah) => ayah.number === 1);
      const visibleWords = (firstAyah?.arabic ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .map(normalizeArabic);
      if (
        visibleWords.length === basmala.length &&
        visibleWords.every((word, index) => word === basmala[index])
      ) {
        totalErrors += 1;
        console.error(
          `${file}\n  - visible āyah 1 incorrectly contains the basmalah; keep it only in sourceRawArabic`,
        );
      }
    }
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
