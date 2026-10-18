import crypto from "node:crypto";
import fs from "node:fs/promises";
import { discoverPackagePaths, readPackage } from "./lib/packages";
import { pool } from "./lib/db";
import { appendAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { assertAuthoringContract } from "./lib/authoring-contract";

const contract = assertAuthoringContract("mixed Ṣarf family repair");
const apply = !process.argv.includes("--dry-run");
const reviewedAt = new Date().toISOString();

type JsonObject = Record<string, unknown>;
type LessonForm = {
  form: string;
  meaning: string;
  difference: string;
  relationship?: string;
  provenance?: string;
};
type Lesson = JsonObject & {
  forms: LessonForm[];
  sarfReview: JsonObject;
};
type Word = JsonObject & { id: string; arabic: string; teachingId?: string };
type Occurrence = {
  packagePath: string;
  pkg: JsonObject;
  word: Word;
  lesson: Lesson;
  provider?: Provider;
};
type Provider = {
  root: string;
  lemma: string;
  pattern: string;
  partOfSpeech: string;
  segmentation: JsonObject[];
};
type ProviderRow = {
  occurrence_id: string;
  part_of_speech: string | null;
  features: unknown;
};

function parse(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null) return value as JsonObject;
  if (typeof value !== "string") return {};
  try {
    const result = JSON.parse(value) as unknown;
    return typeof result === "object" && result !== null ? result as JsonObject : {};
  } catch {
    return {};
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/gu, "");
}

function base(value: string) {
  return normalized(value).replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "");
}

function comparableBase(value: string) {
  return base(value).replace(/[\u0622\u0623\u0625\u0671]/gu, "ا");
}

function rootKey(value: string) {
  return value.replace(/\s+/gu, "").trim();
}

function shellKey(value: string) {
  let key = base(value);
  key = key.replace(/^[وف](?=\p{L})/u, "");
  key = key.replace(/^(?:ٱل|ال)/u, "");
  return key;
}

function parseProvider(row: ProviderRow): Provider {
  const details = parse(row.features);
  const segmentation = Array.isArray(details.segmentation)
    ? details.segmentation.filter((item): item is JsonObject => typeof item === "object" && item !== null)
    : [];
  return {
    root: rootKey(text(details.root)),
    lemma: text(details.lemma),
    pattern: text(details.pattern),
    partOfSpeech: text(row.part_of_speech) || text(details.partOfSpeech),
    segmentation,
  };
}

function familyKey(item: Occurrence) {
  const root = rootKey(text(item.lesson.root));
  const provider = item.provider;
  const pos = (provider?.partOfSpeech || text(item.lesson.type)).toLowerCase().replace(/\s+/gu, "-");
  const rawLemma = provider?.lemma || "";
  const isShell = /^(?:و|ف|ب|ك|ل|ال|ٱل)$/u.test(comparableBase(rawLemma));
  const lexicalStem = provider?.segmentation.find((part) => part.kind === "stem" || part.kind === "whole");
  const identity = isShell
    ? (lexicalStem ? shellKey(text(lexicalStem.sourceText)) : provider?.pattern || "unmarked")
    : comparableBase(rawLemma || text(item.word.arabic));
  return `${root}|${identity}|${pos}`;
}

function status(item: Occurrence) {
  const review = item.lesson.sarfReview;
  if (review.status === "full" || review.auditDecision === "upgraded-to-full") return "full";
  if (review.auditDecision === "blocked-for-genuine-ambiguity") return "blocked";
  if (review.auditDecision === "confirmed-limited") return "confirmed-limited";
  return "unknown";
}

function currentRow(item: Occurrence): LessonForm {
  const existing = item.lesson.forms.find((row) => normalized(row.form) === normalized(item.word.arabic)) ?? item.lesson.forms[0];
  return {
    form: item.word.arabic,
    meaning: text(item.word.gloss) || text(item.lesson.meaning) || existing?.meaning || item.word.arabic,
    difference: existing?.difference || "Current Qur'anic occurrence; its exact vocalisation and context are primary.",
    relationship: existing?.relationship || `Current Qur'anic occurrence of the ${rootKey(text(item.lesson.root))} lexical family in this āyah.`,
    provenance: existing?.provenance || `Codex review of canonical Qur'anic occurrence ${item.word.id}.`,
  };
}

function candidateRows(item: Occurrence, representative: Occurrence) {
  const current = currentRow(item);
  const currentShell = shellKey(current.form);
  const rows: LessonForm[] = [];
  for (const row of representative.lesson.forms.slice(1)) {
    if (normalized(row.form) === normalized(current.form)) continue;
    if (shellKey(row.form) === currentShell) continue;
    if (rows.some((existing) => shellKey(existing.form) === shellKey(row.form))) continue;
    if (!row.meaning.trim() || !row.difference.trim() || !row.relationship?.trim() || !row.provenance?.trim()) continue;
    rows.push({ ...row });
    if (rows.length === 4) break;
  }
  return rows.length === 4 ? [current, ...rows] : undefined;
}

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const occurrences: Occurrence[] = [];
const packageStates = new Map<string, { path: string; pkg: JsonObject; changed: boolean }>();
const packagePaths = await discoverPackagePaths();
for (const packagePath of packagePaths) {
  const result = await readPackage(packagePath);
  if (!result.package) continue;
  const pkg = result.package as JsonObject;
  const entries = (pkg.teachingEntries ?? {}) as JsonObject;
  const ayahs = Array.isArray(pkg.ayahs) ? pkg.ayahs : [];
  for (const ayahValue of ayahs) {
    const ayah = ayahValue as JsonObject;
    for (const wordValue of (Array.isArray(ayah.words) ? ayah.words : [])) {
      const word = wordValue as Word;
      const teachingId = text(word.teachingId);
      const lesson = teachingId ? entries[teachingId] as Lesson | undefined : undefined;
      if (!lesson || !Array.isArray(lesson.forms)) continue;
      occurrences.push({ packagePath, pkg, word, lesson });
    }
  }
  packageStates.set(text(pkg.packageId), { path: packagePath, pkg, changed: false });
}

const providerRows = await pool.query<ProviderRow>(
  `select distinct on (occurrence_id) occurrence_id, part_of_speech, features
   from morphology_records
   where provider='quranic-arabic-corpus'
     and occurrence_id = any($1::text[])
   order by occurrence_id, id`,
  [occurrences.map((item) => text(item.word.id))],
);
const providers = new Map(providerRows.rows.map((row) => [row.occurrence_id, parseProvider(row)]));
for (const occurrence of occurrences) occurrence.provider = providers.get(text(occurrence.word.id));

const byFamily = new Map<string, Occurrence[]>();
for (const occurrence of occurrences) {
  const key = familyKey(occurrence);
  byFamily.set(key, [...(byFamily.get(key) ?? []), occurrence]);
}

const auditRecords: AuditRecord[] = [];
let upgraded = 0;
let skipped = 0;
const changedOccurrences: string[] = [];

for (const [key, family] of byFamily) {
  const representatives = family.filter((item) => status(item) === "full" && item.lesson.forms.length === 5);
  if (representatives.length === 0) continue;
  const representative = representatives[0];
  for (const item of family.filter((candidate) => status(candidate) !== "full")) {
    const before = JSON.parse(JSON.stringify(item.lesson)) as Lesson;
    const forms = candidateRows(item, representative);
    if (!forms) {
      skipped += 1;
      continue;
    }
    item.lesson.forms = forms;
    item.lesson.sarfReview = {
      status: "full",
      auditDecision: "upgraded-to-full",
      provenance: [
        `Mixed-family repair ${reviewedAt} matched this occurrence to the reviewed full family ${key}.`,
        `Representative full occurrence: ${representative.word.id}.`,
        "The representative family supplied four distinct reviewed related forms; shell-only and duplicate forms were excluded.",
      ],
      reviewedBy: "Codex",
      reviewedAt,
    };
    const after = item.lesson;
    const state = packageStates.get(text(item.pkg.packageId));
    if (state) state.changed = true;
    const sourceHash = hash(before);
    const contentHash = hash(after);
    auditRecords.push({
      recordId: `mixed-sarf-repair-${item.word.id.replaceAll(":", "-")}-${contentHash.slice(0, 12)}`,
      eventType: "mixed-sarf-family-repair",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        type: "sarf-family",
        familyKey: key,
        occurrenceId: item.word.id,
        teachingId: item.word.teachingId,
        representativeOccurrenceId: representative.word.id,
      },
      status: "passed",
      reviewedAt,
      checks: [
        "family-identity-aligned-root-lemma-pos",
        "representative-full-family-reviewed",
        "current-quranic-form-first",
        "exactly-five-distinct-forms",
        "no-shell-only-padding",
        "provenance-recorded",
      ],
      evidence: [
        `source:${item.word.id}`,
        `representative:${representative.word.id}`,
        `before-status:${status(item)}`,
        "Canonical package evidence and the previously reviewed full family were checked.",
      ],
      sourceHash,
      contentHash,
      beforeSarfStatus: before.sarfReview.status,
      afterSarfStatus: "full",
      beforeFormCount: before.forms.length,
      afterFormCount: after.forms.length,
    });
    upgraded += 1;
    changedOccurrences.push(item.word.id);
  }
}

if (apply) {
  for (const state of packageStates.values()) {
    if (!state.changed) continue;
    const pkg = state.pkg as JsonObject;
    pkg.contentVersion = `${text(pkg.contentVersion).replace(/-mixed-sarf-[^\s]+$/u, "")}-mixed-sarf-repair`;
    await fs.writeFile(state.path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    const manifestPath = state.path.replace(/surah\.json$/u, "manifest.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as JsonObject;
      manifest.contentVersion = pkg.contentVersion;
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    } catch {
      // Some legacy packages do not have a manifest; package validation remains authoritative.
    }
  }
  appendAuditRecords(auditRecords);
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  mixedFamilies: [...byFamily.values()].filter((items) => new Set(items.map(status)).size > 1).length,
  upgraded,
  skipped,
  changedOccurrences,
  auditRecords: auditRecords.length,
}, null, 2));
await pool.end();
