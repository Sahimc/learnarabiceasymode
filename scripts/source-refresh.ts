import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const providerIndex = args.indexOf("--provider");
const provider = providerIndex >= 0 ? args[providerIndex + 1] : undefined;

if (!provider) {
  console.log(
    "Usage: npm run sources:refresh -- --provider tanzil|quran-foundation|qac|quranmorph",
  );
  process.exit(1);
}

if (provider === "tanzil") {
  const url =
    "https://tanzil.net/pub/download/index.php?agree=true&quranType=uthmani&outType=txt-2&marks=true&sajdah=true&tatweel=true";
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Tanzil download failed: ${response.status} ${response.statusText}`,
    );
  const text = await response.text();
  const output = path.join(
    process.cwd(),
    "content-import",
    "sources",
    "tanzil",
    "quran-uthmani.txt",
  );
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, text, "utf8");
  console.log(`Downloaded Tanzil Uthmani text to ${output}`);
  console.log(
    "Verify the downloaded version and licence metadata before redistributing a changed source artifact.",
  );
  process.exit(0);
}

if (provider === "quran-foundation") {
  if (
    !process.env.QURAN_FOUNDATION_CLIENT_ID ||
    !process.env.QURAN_FOUNDATION_CLIENT_SECRET
  ) {
    console.error(
      "Quran.Foundation refresh requires QURAN_FOUNDATION_CLIENT_ID and QURAN_FOUNDATION_CLIENT_SECRET.",
    );
    process.exit(1);
  }
  console.error(
    "Quran.Foundation credentials are present, but no refresh was run automatically. Add the controlled endpoint-specific adapter before importing provider data.",
  );
  process.exit(1);
}

if (provider === "qac" || provider === "quranmorph") {
  console.error(
    `${provider} refresh is not configured because no licensed raw source artifact is present. The provider boundary remains separate from authored teaching content.`,
  );
  process.exit(1);
}

console.error(`Unknown source provider: ${provider}`);
process.exit(1);
