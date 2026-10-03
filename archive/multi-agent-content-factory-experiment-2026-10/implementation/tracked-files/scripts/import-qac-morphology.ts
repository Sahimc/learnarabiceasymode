import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./lib/env";
import { pool, withTransaction } from "./lib/db";
import type {
  MorphologyFeature,
  MorphologyFormationPart,
} from "../app/data/morphology";

loadLocalEnv();

const SOURCE_URL =
  process.env.QAC_MORPHOLOGY_URL ??
  "https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt";
const SOURCE_VERSION = process.env.QAC_MORPHOLOGY_VERSION ?? "0.4-derived";
const PROVIDER = "quranic-arabic-corpus";

type RawSegment = {
  key: string;
  text: string;
  pos: string;
  tags: string[];
};

type Occurrence = {
  id: string;
  surah: number;
  ayah: number;
  position: number;
  arabic: string;
  gloss: string;
  status: string;
};

type SurfacePart = {
  sourceText: string;
  displayText: string;
  label: string;
  meaning: string;
  kind:
    | "whole"
    | "prefix"
    | "stem"
    | "suffix"
    | "article"
    | "preposition"
    | "connector"
    | "subject-marker"
    | "object-pronoun"
    | "possessive-pronoun"
    | "ending"
    | "other";
};

type Analysis = {
  recordKey: string;
  sourceText: string;
  lemma?: string;
  root?: string;
  pattern?: string;
  partOfSpeech?: string;
  features: MorphologyFeature[];
  formation?: MorphologyFormationPart[];
  segmentation: SurfacePart[];
};

const markPattern = /[\u064B-\u065F\u0670]/u;

function baseCharacters(value: string) {
  return [...value.normalize("NFC")].filter(
    (character) => !markPattern.test(character),
  );
}

function clusters(value: string) {
  const result: string[] = [];
  // Preserve the canonical source's original combining-mark order. NFC is
  // used only for comparisons; it must not rewrite stored Qur'anic source.
  for (const character of value) {
    if (markPattern.test(character) && result.length) {
      result[result.length - 1] += character;
    } else {
      result.push(character);
    }
  }
  return result;
}

function splitCanonical(canonical: string, rawParts: string[]) {
  const canonicalClusters = clusters(canonical);
  const parts: string[] = [];
  let offset = 0;
  for (const rawPart of rawParts) {
    const length = baseCharacters(rawPart).length;
    const part = canonicalClusters.slice(offset, offset + length).join("");
    if (baseCharacters(part).join("") !== baseCharacters(rawPart).join(""))
      return undefined;
    parts.push(part);
    offset += length;
  }
  return offset === canonicalClusters.length ? parts : undefined;
}

function tagValue(tags: string[], prefix: string) {
  return tags
    .find((tag) => tag.startsWith(`${prefix}:`))
    ?.slice(prefix.length + 1);
}

function spacedRoot(root: string | undefined) {
  return root ? [...root].join(" ") : undefined;
}

function partOfSpeech(pos: string) {
  if (pos === "V") return "verb";
  if (pos === "N") return "noun/pronoun";
  if (pos === "P") return "particle/preposition";
  return pos || undefined;
}

function featureForTag(tag: string): MorphologyFeature | undefined {
  const labels: Record<string, [string, string]> = {
    IMPF: ["tense", "imperfect verb"],
    IMPV: ["mood", "imperative"],
    PERF: ["tense", "perfect verb"],
    PASS: ["voice", "passive"],
    NOM: ["case", "nominative"],
    ACC: ["case", "accusative"],
    GEN: ["case", "genitive"],
    IND: ["mood", "indicative"],
    JUS: ["mood", "jussive"],
    M: ["gender", "masculine"],
    F: ["gender", "feminine"],
    MS: ["number", "masculine singular"],
    MP: ["number", "masculine plural"],
    FP: ["number", "feminine plural"],
    "1S": ["person", "first-person singular"],
    "1P": ["person", "first-person plural"],
    "2MS": ["person", "second-person masculine singular"],
    "3MS": ["person", "third-person masculine singular"],
    INDEF: ["state", "indefinite"],
    ADJ: ["partOfSpeech", "adjective"],
    REL: ["partOfSpeech", "relative pronoun"],
    PN: ["partOfSpeech", "proper name"],
  };
  const result = labels[tag];
  return result
    ? { key: result[0], label: result[0], value: result[1] }
    : undefined;
}

function componentKind(tags: string[], pos: string): SurfacePart["kind"] {
  if (tags.includes("DET")) return "article";
  if (tags.includes("CONJ")) return "connector";
  if (tags.includes("PREF")) return "preposition";
  if (tags.includes("PRON")) return "possessive-pronoun";
  if (tags.includes("SUFF")) return "suffix";
  return pos === "P" ? "other" : "stem";
}

function lexicalGloss(gloss: string) {
  const value = gloss.trim();
  return (
    value
      .replace(
        /^(?:and|so|then|the|a|an|from among|from|with my|with|by|in|for|to|like|as|will)\s+/i,
        "",
      )
      .trim() || value
  );
}

function inferredArticleParts(
  occurrence: Occurrence,
  segments: RawSegment[],
): string[] | undefined {
  if (!segments.some((segment) => segment.tags.includes("DET")))
    return undefined;
  const canonicalClusters = clusters(occurrence.arabic);
  if (canonicalClusters.length < 3 || canonicalClusters[1].includes("\u0651"))
    return undefined;
  const prefix = canonicalClusters.slice(0, 2).join("");
  const prefixBase = baseCharacters(prefix).join("");
  if (prefixBase !== "ٱل" && prefixBase !== "ال") return undefined;
  return [prefix, canonicalClusters.slice(2).join("")];
}

function componentCopy(
  segment: RawSegment,
  occurrence: Occurrence,
  tags: string[],
  isWhole: boolean,
): Pick<SurfacePart, "label" | "meaning"> {
  if (tags.includes("DET"))
    return { label: "the", meaning: "a definite article prefix" };
  if (tags.includes("CONJ")) return { label: "and", meaning: "a connector" };
  if (segment.text === "بِ")
    return { label: "with / by / in", meaning: "an attached preposition" };
  if (segment.text === "لِ" || segment.text === "لَّ")
    return { label: "for / to", meaning: "an attached preposition" };
  if (segment.text === "مِن" || segment.text === "مِنَ")
    return { label: "from", meaning: "a preposition" };
  if (tags.includes("PRON") || tags.includes("SUFF"))
    return { label: "pronoun", meaning: "an attached pronoun" };
  if (isWhole)
    return {
      label: "single morpheme",
      meaning: occurrence.gloss || "the complete word",
    };
  const meaning = lexicalGloss(occurrence.gloss);
  return {
    label: meaning || "lexical stem",
    meaning: meaning || "lexical stem",
  };
}

const overrideFile = path.join(
  process.cwd(),
  "content-import",
  "sources",
  "qac",
  "morphology-overrides.json",
);
const overrides = JSON.parse(await readFile(overrideFile, "utf8")) as {
  surfaceByOccurrence: Record<string, string[]>;
  surfaceByArabic: Record<string, string[]>;
  formationByOccurrence: Record<string, MorphologyFormationPart[]>;
};
const surfaceOverrides = overrides.surfaceByOccurrence;
const surfaceOverridesByArabic = overrides.surfaceByArabic;
const formationOverrides = overrides.formationByOccurrence;

function parseSource(raw: string) {
  const grouped = new Map<string, RawSegment[]>();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [location, text, pos, tagText] = line.split("\t");
    if (!location || !text || !pos) continue;
    const key = location.split(":").slice(0, 3).join(":");
    const list = grouped.get(key) ?? [];
    list.push({
      key,
      text,
      pos,
      tags: (tagText ?? "").split("|").filter(Boolean),
    });
    grouped.set(key, list);
  }
  return grouped;
}

function makeAnalysis(
  key: string,
  occurrence: Occurrence,
  segments: RawSegment[],
): Analysis {
  const allTags = [...new Set(segments.flatMap((segment) => segment.tags))];
  const firstLexical =
    segments.find(
      (segment) =>
        !["PREF", "SUFF", "CONJ", "DET", "PRON"].some((tag) =>
          segment.tags.includes(tag),
        ),
    ) ?? segments[0];
  const lemma = tagValue(allTags, "LEM");
  const root = tagValue(allTags, "ROOT");
  const verbForm = tagValue(allTags, "VF");
  const features = allTags
    .map(featureForTag)
    .filter(Boolean) as MorphologyFeature[];
  if (verbForm)
    features.push({
      key: "verbForm",
      label: "verb form",
      value: `Form ${verbForm}`,
    });
  const rawParts =
    surfaceOverrides[key] ??
    surfaceOverridesByArabic[occurrence.arabic] ??
    inferredArticleParts(occurrence, segments) ??
    segments.map((segment) => segment.text);
  const canonicalParts = splitCanonical(occurrence.arabic, rawParts);
  if (
    occurrence.status === "custom-complete" &&
    rawParts.length > 1 &&
    !canonicalParts
  ) {
    throw new Error(
      `Cannot reconstruct custom occurrence ${key} from source morphology segments`,
    );
  }
  const useAtomic = !canonicalParts || rawParts.length < 2;
  const effectiveParts = useAtomic ? [occurrence.arabic] : canonicalParts;
  const surfaceParts = effectiveParts.map((sourceText, index) => {
    const sourceSegment = segments[Math.min(index, segments.length - 1)];
    const tags = sourceSegment?.tags ?? [];
    const componentTags =
      !useAtomic && segments.length === 1 && index > 0
        ? tags.filter((tag) => tag !== "DET" && tag !== "PREF")
        : tags;
    const copy = componentCopy(
      sourceSegment ?? { key, text: sourceText, pos: "", tags: [] },
      occurrence,
      componentTags,
      useAtomic,
    );
    const displayText = sourceText === "ٱل" ? "ٱلْ" : sourceText;
    return {
      sourceText,
      displayText,
      ...copy,
      kind: useAtomic
        ? "whole"
        : componentKind(componentTags, sourceSegment?.pos ?? ""),
    } as SurfacePart;
  });
  if (key === "113:1:2" || key === "114:1:2") {
    surfaceParts[0] = {
      ...surfaceParts[0],
      displayText: "أَـ",
      label: "I",
      meaning: "the person doing the action",
      kind: "prefix",
    };
    surfaceParts[1] = {
      ...surfaceParts[1],
      label: "seek refuge",
      meaning: "the main verb stem",
      kind: "stem",
    };
  }
  if (
    occurrence.status === "custom-complete" &&
    surfaceParts.some((part) => part.label.toLowerCase() === "main word")
  ) {
    throw new Error(`Placeholder morphology label remained for ${key}`);
  }
  return {
    recordKey: key,
    sourceText: occurrence.arabic,
    lemma,
    root: spacedRoot(root),
    pattern: verbForm ? `Form ${verbForm}` : undefined,
    partOfSpeech: partOfSpeech(firstLexical?.pos ?? ""),
    features,
    formation: formationOverrides[key],
    segmentation: surfaceParts,
  };
}

async function insertMany(
  client: { query: (sql: string, values: unknown[]) => Promise<unknown> },
  table: string,
  columns: string[],
  rows: unknown[][],
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
      `insert into ${table} (${columns.join(",")}) values ${placeholders}`,
      values,
    );
  }
}

const rawResponse = await fetch(SOURCE_URL);
if (!rawResponse.ok)
  throw new Error(`QAC morphology download failed: ${rawResponse.status}`);
const sourceText = await rawResponse.text();
const grouped = parseSource(sourceText);
const occurrenceResult = await pool.query<Occurrence>(
  `select wo.id, s.number as surah, a.number as ayah, wo.position, wo.arabic, coalesce(wo.gloss, '') as gloss, wo.status
   from word_occurrences wo join ayahs a on a.id=wo.ayah_id join surahs s on s.id=wo.surah_id
   order by s.number, a.number, wo.position`,
);
const occurrences = occurrenceResult.rows;
const analyses = occurrences.flatMap((occurrence) => {
  const key = `${occurrence.surah}:${occurrence.ayah}:${occurrence.position}`;
  const segments = grouped.get(key);
  return segments
    ? [{ occurrence, key, analysis: makeAnalysis(key, occurrence, segments) }]
    : [];
});
// Provider morphology is evidence only. Authored WordBreakdowns are owned by
// content packages and must not be replaced during a provider refresh.
const custom: typeof analyses = [];

await withTransaction(async (client) => {
  const sourceChecksum = crypto
    .createHash("sha256")
    .update(sourceText)
    .digest("hex");
  await client.query(
    `insert into source_providers (id,name,version,attribution,license,created_at,updated_at)
     values ($1,$2,$3,$4,$5,now(),now())
     on conflict (id) do update set version=excluded.version, attribution=excluded.attribution, license=excluded.license, updated_at=now()`,
    [
      "provider:quranic-arabic-corpus",
      "Quranic Arabic Corpus",
      SOURCE_VERSION,
      "Quranic Arabic Corpus morphology and segmentation; locally imported from the configured source artifact.",
      "See source terms and attribution in content-import/sources/qac/NOTICE.md",
    ],
  );
  await client.query(
    `insert into source_records (id,provider_id,record_type,record_key,raw,checksum,imported_at)
     values ($1,$2,$3,$4,$5,$6,now())
     on conflict (id) do update set raw=excluded.raw, checksum=excluded.checksum, imported_at=now()`,
    [
      `source-record:qac:morphology:${SOURCE_VERSION}`,
      "provider:quranic-arabic-corpus",
      "morphology",
      `qac-morphology:${SOURCE_VERSION}`,
      JSON.stringify({
        sourceUrl: SOURCE_URL,
        version: SOURCE_VERSION,
        checksum: sourceChecksum,
        content: sourceText,
      }),
      sourceChecksum,
    ],
  );
  await client.query("delete from morphology_records where provider=$1", [
    PROVIDER,
  ]);
  const morphologyRows = analyses.map(({ occurrence, key, analysis }) => [
    `morphology:qac:${key}`,
    occurrence.id,
    PROVIDER,
    analysis.root ? `root:${analysis.root.replaceAll(" ", "")}` : null,
    analysis.lemma ? `lemma:${analysis.lemma}` : null,
    analysis.partOfSpeech ?? null,
    JSON.stringify({
      recordKey: key,
      version: SOURCE_VERSION,
      sourceText: analysis.sourceText,
      lemma: analysis.lemma,
      root: analysis.root,
      pattern: analysis.pattern,
      features: analysis.features,
      segmentation: analysis.segmentation,
      formation: analysis.formation,
    }),
    JSON.stringify(analysis.segmentation),
    null,
    new Date(),
    new Date(),
  ]);
  await insertMany(
    client,
    "morphology_records",
    [
      "id",
      "occurrence_id",
      "provider",
      "root_id",
      "lemma_id",
      "part_of_speech",
      "features",
      "segmentation",
      "syntax",
      "created_at",
      "updated_at",
    ],
    morphologyRows,
  );

  const customIds = custom.map(({ occurrence }) => occurrence.id);
  if (customIds.length) {
    const old = await client.query<{ id: string }>(
      "select id from word_breakdowns where word_occurrence_id = any($1::text[])",
      [customIds],
    );
    if (old.rows.length) {
      await client.query(
        "delete from word_breakdown_parts where breakdown_id = any($1::text[])",
        [old.rows.map((row) => row.id)],
      );
      await client.query(
        "delete from word_breakdowns where id = any($1::text[])",
        [old.rows.map((row) => row.id)],
      );
    }
    const breakdownRows: unknown[][] = [];
    const partRows: unknown[][] = [];
    for (const { occurrence, analysis } of custom) {
      const parts = analysis.segmentation;
      const breakdownId = `breakdown:${occurrence.id}:surface`;
      breakdownRows.push([
        breakdownId,
        `surah:${occurrence.surah}`,
        parts.length > 1 ? "segmented" : "atomic",
        occurrence.arabic,
        null,
        occurrence.id,
        new Date(),
        new Date(),
      ]);
      parts.forEach((part, index) =>
        partRows.push([
          `${breakdownId}:part:${index + 1}`,
          breakdownId,
          `part:${index + 1}`,
          index + 1,
          part.sourceText,
          part.displayText,
          part.label,
          part.meaning,
          part.kind,
        ]),
      );
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
  }
});

console.log(
  `Imported ${analyses.length} QAC morphology records; authored WordBreakdowns were left unchanged.`,
);
await pool.end();
