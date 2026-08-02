import crypto from "node:crypto";
import { readPackage, discoverPackagePaths } from "./lib/packages";
import { pool, withTransaction } from "./lib/db";
import type { SurahPackage, WordBreakdown } from "../app/data/content-contract";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const surahArgIndex = args.indexOf("--surah");
const surahFilter =
  surahArgIndex >= 0 ? Number(args[surahArgIndex + 1]) : undefined;

function checksum(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

async function insertMany(
  client: QueryClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict = "",
) {
  if (!rows.length) return;
  const chunkSize = 250;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values: unknown[] = [];
    const placeholders = chunk
      .map(
        (row) =>
          `(${row
            .map((value) => {
              values.push(value);
              return `$${values.length}`;
            })
            .join(",")})`,
      )
      .join(",");
    await client.query(
      `insert into ${table} (${columns.join(",")}) values ${placeholders} ${conflict}`,
      values,
    );
  }
}

function packageWords(pkg: SurahPackage) {
  return pkg.ayahs.flatMap((ayah) =>
    ayah.words.map((word) => ({ ...word, ayahId: ayah.id })),
  );
}

async function currentChecksum(packageId: string) {
  const result = await pool.query<{ checksum: string; variant_count: string }>(
    `select cp.checksum, count(qtv.id)::text as variant_count
     from content_packages cp
     left join surahs s on s.number = split_part(cp.id, ':', 2)::int
     left join ayahs a on a.surah_id = s.id
     left join quran_text_variants qtv on qtv.ayah_id = a.id
     where cp.id=$1
     group by cp.checksum`,
    [packageId],
  );
  return result.rows[0]?.variant_count === "0"
    ? undefined
    : result.rows[0]?.checksum;
}

async function insertPackage(
  pkg: SurahPackage,
  raw: string,
  digest: string,
  importId: string,
) {
  return withTransaction(async (client) => {
    const surahId = `surah:${pkg.surah.number}`;
    const packageId = pkg.packageId;
    const oldWords = await client.query<{ id: string }>(
      "select id from word_occurrences where surah_id=$1",
      [surahId],
    );
    const oldAyahs = await client.query<{ id: string }>(
      "select id from ayahs where surah_id=$1",
      [surahId],
    );
    const oldBreakdowns = await client.query<{ id: string }>(
      "select id from word_breakdowns where package_id=$1",
      [packageId],
    );
    const oldTeachings = await client.query<{ id: string }>(
      "select id from teaching_word_entries where package_id=$1",
      [packageId],
    );
    const oldTeachingIds = oldTeachings.rows.map((row) => row.id);
    const sharedTeachingRows = oldTeachingIds.length
      ? await client.query<{ id: string }>(
          "select distinct shared_teaching_id as id from word_occurrences where shared_teaching_id = any($1::text[]) and surah_id <> $2 and shared_teaching_id is not null",
          [oldTeachingIds, surahId],
        )
      : { rows: [] };
    const sharedTeachingIds = new Set(
      sharedTeachingRows.rows.map((row) => row.id),
    );
    const removableTeachingIds = oldTeachingIds.filter(
      (id) => !sharedTeachingIds.has(id),
    );

    if (oldBreakdowns.rows.length)
      await client.query(
        "delete from word_breakdown_parts where breakdown_id = any($1::text[])",
        [oldBreakdowns.rows.map((row) => row.id)],
      );
    await client.query("delete from word_breakdowns where package_id=$1", [
      packageId,
    ]);
    if (removableTeachingIds.length) {
      await client.query(
        "delete from root_picture_terms where id = any($1::text[])",
        [removableTeachingIds.map((id) => `root-picture:${id}`)],
      );
      await client.query(
        "delete from recognition_clues where teaching_entry_id = any($1::text[])",
        [removableTeachingIds],
      );
      await client.query(
        "delete from form_family_entries where family_id = any($1::text[])",
        [removableTeachingIds.map((id) => `family:${id}`)],
      );
      await client.query(
        "delete from form_families where id = any($1::text[])",
        [removableTeachingIds.map((id) => `family:${id}`)],
      );
    }
    await client.query(
      "delete from ayah_teaching_entries where ayah_id = any($1::text[])",
      [oldAyahs.rows.map((row) => row.id)],
    );
    await client.query(
      "delete from quran_text_variants where ayah_id = any($1::text[])",
      [oldAyahs.rows.map((row) => row.id)],
    );
    await client.query("delete from drills where package_id=$1", [packageId]);
    await client.query(
      "delete from translations where scope_id = any($1::text[])",
      [oldAyahs.rows.map((row) => row.id)],
    );
    await client.query(
      "delete from transliterations where scope_id = any($1::text[])",
      [oldWords.rows.map((row) => row.id)],
    );
    await client.query("delete from word_occurrences where surah_id=$1", [
      surahId,
    ]);
    await client.query("delete from ayahs where surah_id=$1", [surahId]);
    await client.query("delete from surahs where id=$1", [surahId]);
    if (removableTeachingIds.length)
      await client.query(
        "delete from teaching_word_entries where id = any($1::text[])",
        [removableTeachingIds],
      );
    await client.query(
      "delete from content_import_items where import_id in (select id from content_imports where package_id=$1)",
      [packageId],
    );

    await client.query(
      `insert into content_packages (id,schema_version,content_version,status,source_path,checksum,manifest,created_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,now(),now())
       on conflict (id) do update set schema_version=excluded.schema_version, content_version=excluded.content_version, status=excluded.status, source_path=excluded.source_path, checksum=excluded.checksum, manifest=excluded.manifest, updated_at=now()`,
      [
        packageId,
        pkg.schemaVersion,
        pkg.contentVersion,
        pkg.status,
        `content-import/surahs/${pkg.surah.number}`,
        digest,
        JSON.stringify({
          packageId,
          surah: pkg.surah,
          sourceReferences: pkg.sourceReferences,
        }),
      ],
    );
    await client.query(
      `insert into source_providers (id,name,version,attribution,license,created_at,updated_at) values ('provider:tanzil','Tanzil','1.1','Tanzil Project','CC BY 3.0',now(),now())
       on conflict (id) do update set version=excluded.version, attribution=excluded.attribution, license=excluded.license, updated_at=now()`,
    );
    await client.query(
      `insert into source_records (id,provider_id,record_type,record_key,raw,checksum,imported_at) values ($1,'provider:tanzil','surah',$2,$3,$4,now())
       on conflict (id) do update set raw=excluded.raw, checksum=excluded.checksum, imported_at=now()`,
      [
        `source-record:tanzil:${pkg.surah.number}`,
        `surah:${pkg.surah.number}`,
        JSON.stringify({
          sourceReferences: pkg.sourceReferences,
          contentVersion: pkg.contentVersion,
        }),
        digest,
      ],
    );
    await client.query(
      `insert into surahs (id,number,name,arabic_name,transliteration,english_label,ayah_count,status,description,source_provider_id,created_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'provider:tanzil',now(),now())`,
      [
        surahId,
        pkg.surah.number,
        pkg.surah.name,
        pkg.surah.arabicName,
        pkg.surah.transliteration,
        pkg.surah.englishLabel,
        pkg.ayahs.length,
        pkg.status,
        pkg.surah.description ?? "",
      ],
    );

    await insertMany(
      client,
      "ayahs",
      [
        "id",
        "surah_id",
        "number",
        "arabic",
        "translation",
        "natural_meaning",
        "status",
        "source_provider_id",
        "created_at",
        "updated_at",
      ],
      pkg.ayahs.map((ayah) => [
        ayah.id,
        surahId,
        ayah.number,
        ayah.arabic,
        ayah.translation ?? null,
        ayah.naturalMeaning ?? null,
        pkg.status,
        "provider:tanzil",
        new Date(),
        new Date(),
      ]),
    );
    await insertMany(
      client,
      "quran_text_variants",
      [
        "id",
        "ayah_id",
        "provider_id",
        "text",
        "version",
        "attribution",
        "checksum",
        "created_at",
        "updated_at",
      ],
      pkg.ayahs.map((ayah) => [
        `quran-text:tanzil:${ayah.id}`,
        ayah.id,
        "provider:tanzil",
        ayah.sourceRawArabic ?? ayah.arabic,
        pkg.contentVersion,
        "Tanzil Project",
        checksum(ayah.sourceRawArabic ?? ayah.arabic),
        new Date(),
        new Date(),
      ]),
    );
    const words = packageWords(pkg);
    const roots = new Map<string, string>();
    for (const lesson of Object.values(pkg.teachingEntries))
      if (lesson.root.trim()) roots.set(`root:${lesson.root}`, lesson.root);
    await insertMany(
      client,
      "roots",
      [
        "id",
        "text",
        "transliteration",
        "source_evidence",
        "created_at",
        "updated_at",
      ],
      [...roots].map(([id, text]) => [
        id,
        text,
        null,
        JSON.stringify({ source: "project-authored lesson" }),
        new Date(),
        new Date(),
      ]),
      "on conflict (id) do update set text=excluded.text, source_evidence=excluded.source_evidence, updated_at=now()",
    );
    await insertMany(
      client,
      "teaching_word_entries",
      [
        "id",
        "package_id",
        "meaning",
        "type",
        "root",
        "root_picture",
        "construction",
        "components",
        "grammar",
        "sentence_role",
        "recognition_clue",
        "forms",
        "takeaway",
        "created_at",
        "updated_at",
      ],
      Object.values(pkg.teachingEntries).map((lesson) => [
        lesson.id,
        packageId,
        lesson.meaning,
        lesson.type,
        lesson.root,
        lesson.rootPicture,
        lesson.construction,
        JSON.stringify(lesson.components),
        lesson.grammar,
        lesson.sentenceRole,
        lesson.recognitionClue,
        JSON.stringify(lesson.forms),
        lesson.takeaway,
        new Date(),
        new Date(),
      ]),
      "on conflict (id) do update set package_id=excluded.package_id, meaning=excluded.meaning, type=excluded.type, root=excluded.root, root_picture=excluded.root_picture, construction=excluded.construction, components=excluded.components, grammar=excluded.grammar, sentence_role=excluded.sentence_role, recognition_clue=excluded.recognition_clue, forms=excluded.forms, takeaway=excluded.takeaway, updated_at=now()",
    );
    await insertMany(
      client,
      "recognition_clues",
      ["id", "teaching_entry_id", "text", "created_at", "updated_at"],
      Object.values(pkg.teachingEntries).map((lesson) => [
        `recognition:${lesson.id}`,
        lesson.id,
        lesson.recognitionClue,
        new Date(),
        new Date(),
      ]),
      "on conflict (id) do update set text=excluded.text, updated_at=now()",
    );
    await insertMany(
      client,
      "form_families",
      ["id", "package_id", "name", "created_at", "updated_at"],
      Object.values(pkg.teachingEntries).map((lesson) => [
        `family:${lesson.id}`,
        packageId,
        lesson.id,
        new Date(),
        new Date(),
      ]),
      "on conflict (id) do update set package_id=excluded.package_id, name=excluded.name, updated_at=now()",
    );
    await insertMany(
      client,
      "form_family_entries",
      [
        "id",
        "family_id",
        "form",
        "meaning",
        "difference",
        "created_at",
        "updated_at",
      ],
      Object.values(pkg.teachingEntries).flatMap((lesson) =>
        lesson.forms.map((form, index) => [
          `family:${lesson.id}:${index + 1}`,
          `family:${lesson.id}`,
          form.form,
          form.meaning,
          form.difference,
          new Date(),
          new Date(),
        ]),
      ),
      "on conflict (id) do update set form=excluded.form, meaning=excluded.meaning, difference=excluded.difference, updated_at=now()",
    );
    await insertMany(
      client,
      "root_picture_terms",
      ["id", "root_id", "text", "source", "created_at", "updated_at"],
      Object.values(pkg.teachingEntries)
        .filter((lesson) => lesson.root.trim())
        .map((lesson) => [
          `root-picture:${lesson.id}`,
          `root:${lesson.root}`,
          lesson.rootPicture,
          "project-authored",
          new Date(),
          new Date(),
        ]),
      "on conflict (id) do update set root_id=excluded.root_id, text=excluded.text, source=excluded.source, updated_at=now()",
    );

    await insertMany(
      client,
      "word_occurrences",
      [
        "id",
        "surah_id",
        "ayah_id",
        "position",
        "arabic",
        "transliteration",
        "gloss",
        "status",
        "shared_teaching_id",
        "occurrence_role",
        "root_id",
        "lemma_id",
        "source_refs",
        "created_at",
        "updated_at",
      ],
      words.map((word) => {
        const lesson = word.teachingId
          ? pkg.teachingEntries[word.teachingId]
          : undefined;
        return [
          word.id,
          surahId,
          word.ayahId,
          word.position,
          word.arabic,
          word.transliteration ?? null,
          word.gloss ?? null,
          pkg.status,
          word.teachingId ?? null,
          word.occurrenceRole ?? null,
          lesson?.root.trim() ? `root:${lesson.root}` : null,
          null,
          JSON.stringify(word.sourceReferences),
          new Date(),
          new Date(),
        ];
      }),
    );
    await insertMany(
      client,
      "translations",
      [
        "id",
        "scope_type",
        "scope_id",
        "language",
        "text",
        "author",
        "provider",
        "license",
        "version",
        "created_at",
        "updated_at",
      ],
      pkg.ayahs
        .filter((ayah) => ayah.translation)
        .map((ayah) => [
          `translation:${ayah.id}:project-authored`,
          "ayah",
          ayah.id,
          "en",
          ayah.translation,
          "Project-authored starter translation",
          "project",
          "project-authored",
          pkg.contentVersion,
          new Date(),
          new Date(),
        ]),
    );

    const breakdownRows: unknown[][] = [];
    const partRows: unknown[][] = [];
    for (const word of words) {
      const breakdown = (word.breakdownOverride ?? word.breakdown) as
        | WordBreakdown
        | undefined;
      if (!breakdown) continue;
      breakdownRows.push([
        breakdown.id,
        packageId,
        breakdown.mode,
        breakdown.sourceText,
        null,
        word.id,
        new Date(),
        new Date(),
      ]);
      for (const part of breakdown.parts)
        partRows.push([
          `${breakdown.id}:${part.id}`,
          breakdown.id,
          part.id,
          part.order,
          part.sourceText,
          part.displayText,
          part.label,
          part.meaning,
          part.kind,
        ]);
    }
    await insertMany(
      client,
      "word_breakdowns",
      [
        "id",
        "package_id",
        "mode",
        "source_text",
        "teaching_entry_id",
        "word_occurrence_id",
        "created_at",
        "updated_at",
      ],
      breakdownRows,
    );
    await insertMany(
      client,
      "word_breakdown_parts",
      [
        "id",
        "breakdown_id",
        "stable_part_id",
        "part_order",
        "source_text",
        "display_text",
        "label",
        "meaning",
        "kind",
      ],
      partRows,
    );
    await insertMany(
      client,
      "ayah_teaching_entries",
      ["id", "ayah_id", "summary", "sentence_map", "created_at", "updated_at"],
      pkg.ayahs
        .filter((ayah) => ayah.naturalMeaning)
        .map((ayah) => [
          `ayah-teaching:${ayah.id}`,
          ayah.id,
          ayah.naturalMeaning,
          JSON.stringify([]),
          new Date(),
          new Date(),
        ]),
    );
    if (pkg.surah.number >= 109)
      await client.query(
        "insert into volumes (id,title,status,created_at,updated_at) values ('volume:final-six-surahs','The Final Six Sūrahs','ready',now(),now()) on conflict (id) do update set title=excluded.title, updated_at=now()",
      );
    if (pkg.surah.number >= 109)
      await client.query(
        'insert into volume_surahs (volume_id,surah_id,"order") values (\'volume:final-six-surahs\',$1,$2) on conflict (volume_id,surah_id) do update set "order"=excluded."order"',
        [surahId, pkg.surah.number - 108],
      );
    await client.query(
      "insert into content_import_items (id,import_id,entity_type,entity_id,action,detail) values ($1,$2,'package',$3,'upsert',$4)",
      [
        `${importId}:package`,
        importId,
        packageId,
        JSON.stringify({ words: words.length, status: pkg.status }),
      ],
    );
    return {
      words: words.length,
      ayahs: pkg.ayahs.length,
      custom: words.filter((word) => word.teachingId).length,
      breakdowns: breakdownRows.length,
    };
  });
}

const paths = await discoverPackagePaths();
const selectedPaths = surahFilter
  ? paths.filter(
      (file) =>
        file.includes(`\\${String(surahFilter).padStart(3, "0")}-`) ||
        file.includes(`/${String(surahFilter).padStart(3, "0")}-`),
    )
  : paths;
let total = { words: 0, ayahs: 0, custom: 0, breakdowns: 0 };
for (const filePath of selectedPaths) {
  const read = await readPackage(filePath);
  if (!read.package || read.errors.length)
    throw new Error(`${filePath}\n${read.errors.join("\n")}`);
  const digest = checksum(read.raw);
  const existing = await currentChecksum(read.package.packageId);
  if (existing === digest) {
    console.log(`NOOP ${read.package.packageId} (${digest.slice(0, 12)})`);
    continue;
  }
  const importId = `import:${read.package.packageId}:${Date.now()}`;
  await pool.query(
    "insert into content_imports (id,package_id,dry_run,status,started_at) values ($1,$2,$3,$4,now())",
    [importId, read.package.packageId, dryRun, dryRun ? "dry-run" : "running"],
  );
  try {
    if (dryRun) {
      console.log(
        `DRY-RUN ${read.package.packageId}: incoming ${digest.slice(0, 12)}; current ${existing?.slice(0, 12) ?? "none"}`,
      );
      await pool.query(
        "update content_imports set status='dry-run', result=$2, finished_at=now() where id=$1",
        [
          importId,
          JSON.stringify({
            packageId: read.package.packageId,
            checksum: digest,
          }),
        ],
      );
    } else {
      const result = await insertPackage(
        read.package,
        read.raw,
        digest,
        importId,
      );
      total = {
        words: total.words + result.words,
        ayahs: total.ayahs + result.ayahs,
        custom: total.custom + result.custom,
        breakdowns: total.breakdowns + result.breakdowns,
      };
      await pool.query(
        "update content_imports set status='succeeded', result=$2, finished_at=now() where id=$1",
        [importId, JSON.stringify(result)],
      );
      console.log(
        `IMPORTED ${read.package.packageId}: ${result.ayahs} āyāt, ${result.words} words, ${result.breakdowns} breakdowns`,
      );
    }
  } catch (error) {
    await pool.query(
      "update content_imports set status='failed', error_summary=$2, finished_at=now() where id=$1",
      [importId, error instanceof Error ? error.message : String(error)],
    );
    throw error;
  }
}
if (!dryRun) console.log(`Imported totals: ${JSON.stringify(total)}`);
await pool.end();
