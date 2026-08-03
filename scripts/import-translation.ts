import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadLocalEnv } from "./lib/env";
import { pool, withTransaction } from "./lib/db";

loadLocalEnv();

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceDirectory = path.join(
  repoRoot,
  "content-import",
  "sources",
  "translations",
);
const sourcePath = path.join(sourceDirectory, "en.sahih.txt");
const sourceUrl = "https://tanzil.net/trans/en.sahih?type=txt-2";
const sourceProviderId = "provider:tanzil:translation:en.sahih";
const translationVersion = "tanzil-en.sahih";
const translationProvider = "Tanzil translation repository";
const translationAuthor = "Saheeh International";
const translationLicense =
  "Tanzil non-commercial terms; translator or publisher permission required for other use";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseLine(line: string, index: number) {
  const cleaned = line.replace(/^\uFEFF/, "").trimEnd();
  const match = cleaned.match(/^(\d+)\|(\d+)\|(.*)$/);
  if (!match) throw new Error(`Invalid translation line ${index + 1}`);
  return {
    surah: Number(match[1]),
    ayah: Number(match[2]),
    text: match[3].trim(),
  };
}

async function readSource() {
  await fs.mkdir(sourceDirectory, { recursive: true });
  if (hasFlag("--refresh") || !(await fileExists(sourcePath))) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Translation download failed: HTTP ${response.status}`);
    }
    await fs.writeFile(sourcePath, await response.text(), "utf8");
    console.log(`Downloaded ${sourceUrl}`);
  }
  const raw = await fs.readFile(sourcePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
  const entries = lines.map(parseLine);
  if (entries.length !== 6236) {
    throw new Error(
      `Expected 6236 translation lines, received ${entries.length}`,
    );
  }
  return { raw, entries };
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const { raw, entries } = await readSource();
const checksum = createHash("sha256").update(raw, "utf8").digest("hex");

const result = await withTransaction(async (client) => {
  await client.query(
    `insert into source_providers
      (id, name, version, attribution, license, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())
     on conflict (id) do update set
       name = excluded.name,
       version = excluded.version,
       attribution = excluded.attribution,
       license = excluded.license,
       updated_at = now()`,
    [
      sourceProviderId,
      `${translationProvider} — ${translationAuthor}`,
      translationVersion,
      "Saheeh International via Tanzil; https://tanzil.net/trans/",
      translationLicense,
    ],
  );

  await client.query(
    `insert into source_records
      (id, provider_id, record_type, record_key, raw, checksum, imported_at)
     values ($1, $2, 'translation', $3, $4::jsonb, $5, now())
     on conflict (id) do update set
       raw = excluded.raw,
       checksum = excluded.checksum,
       imported_at = now()`,
    [
      "source-record:tanzil:translation:en.sahih",
      sourceProviderId,
      "translation:en.sahih",
      JSON.stringify({
        sourceUrl,
        translator: translationAuthor,
        language: "en",
        lineCount: entries.length,
        terms: translationLicense,
      }),
      checksum,
    ],
  );

  const ayahResult = await client.query<{
    id: string;
    surah: number;
    ayah: number;
  }>(
    `select a.id, s.number as surah, a.number as ayah
     from ayahs a
     join surahs s on s.id = a.surah_id
     order by s.number, a.number`,
  );
  const ayahIds = new Map(
    ayahResult.rows.map((row) => [`${row.surah}:${row.ayah}`, row.id]),
  );
  for (const entry of entries) {
    if (!ayahIds.has(`${entry.surah}:${entry.ayah}`)) {
      throw new Error(`Missing database āyah ${entry.surah}:${entry.ayah}`);
    }
  }

  await client.query(
    `delete from translations
     where provider = $1 and version = $2`,
    [translationProvider, translationVersion],
  );

  for (const entry of entries) {
    const ayahId = ayahIds.get(`${entry.surah}:${entry.ayah}`)!;
    await client.query(
      `insert into translations
        (id, scope_type, scope_id, language, text, author, provider, license, version, created_at, updated_at)
       values ($1, 'ayah', $2, 'en', $3, $4, $5, $6, $7, now(), now())`,
      [
        `translation:${ayahId}:en.sahih`,
        ayahId,
        entry.text,
        translationAuthor,
        translationProvider,
        translationLicense,
        translationVersion,
      ],
    );
  }

  return { lines: entries.length, checksum };
});

console.log(
  `Imported ${result.lines} English translation records (${translationAuthor}); checksum ${result.checksum}`,
);
await pool.end();
