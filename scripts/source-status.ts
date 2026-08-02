import { stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const tanzilPath = path.join(
  root,
  "content-import",
  "sources",
  "tanzil",
  "quran-uthmani.txt",
);

try {
  const info = await stat(tanzilPath);
  console.log(`Tanzil Uthmani text: available (${info.size} bytes)`);
  console.log(`Tanzil version: ${process.env.TANZIL_TEXT_VERSION ?? "1.1"}`);
} catch {
  console.log("Tanzil Uthmani text: missing");
}

const qfReady = Boolean(
  process.env.QURAN_FOUNDATION_CLIENT_ID &&
    process.env.QURAN_FOUNDATION_CLIENT_SECRET,
);
console.log(
  `Quran.Foundation adapter: ${qfReady ? "credentials available" : "optional credentials unavailable; local packages remain active"}`,
);
console.log(
  "Quranic Arabic Corpus adapter: controlled import boundary defined; source artifact not configured in this checkout",
);
console.log(
  "QuranMorph adapter: controlled import boundary defined; source artifact not configured in this checkout",
);
