import { discoverPackagePaths, readPackage } from "./lib/packages";

const rows = [];
for (const file of await discoverPackagePaths()) {
  const result = await readPackage(file);
  if (!result.package) continue;
  rows.push({
    number: result.package.surah.number,
    status: result.package.status,
    ayahs: result.package.ayahs.length,
    words: result.package.ayahs.reduce(
      (sum, ayah) => sum + ayah.words.length,
      0,
    ),
    errors: result.errors.length,
  });
}
console.table(rows);
