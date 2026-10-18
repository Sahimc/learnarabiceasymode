import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";
import { assertAuthoringContract } from "./lib/authoring-contract";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";

const contract = assertAuthoringContract("reference Ṣarf repair");
const reviewedAt = "2026-10-16T13:50:00.000Z";
const packageDirectory = path.join(
  process.cwd(),
  "content-import",
  "surahs",
  "113-al-falaq",
);
const packagePath = path.join(packageDirectory, "surah.json");
const manifestPath = path.join(packageDirectory, "manifest.json");
const pkg = JSON.parse(await fs.readFile(packagePath, "utf8")) as SurahPackage;
const lesson = pkg.teachingEntries["lesson:daybreak"];
if (!lesson) throw new Error("Missing lesson:daybreak reference lesson");
const word = pkg.ayahs
  .flatMap((ayah) => ayah.words.map((item) => ({ ayah, item })))
  .find(({ item }) => item.teachingId === lesson.id);
if (!word) throw new Error("No occurrence uses lesson:daybreak");

const before = { word: word.item, lesson: JSON.parse(JSON.stringify(lesson)) };
const provenance = [
  "Canonical Qur'anic evidence: ٱلْفَلَقِ (113:1:4) and فَالِقُ (6:96).",
  "Codex-authored and reviewed against the ف ل ق root meaning and reliable Arabic morphology.",
];
const relationship =
  "Related to the ف ل ق root as a real lexical form; the row teaches a distinct noun, verb or participial pattern.";
const form = (
  value: string,
  meaning: string,
  difference: string,
): LessonForm => ({
  form: value,
  meaning,
  difference,
  relationship,
  provenance: provenance[1],
});
lesson.forms = [
  form(
    "ٱلْفَلَقِ",
    "the daybreak",
    "Current Qur'anic definite noun in the genitive case.",
  ),
  form(
    "فَلَق",
    "daybreak / a split",
    "Uninflected noun form; the definite article and case marker are absent.",
  ),
  form(
    "فَلَقَ",
    "He split / broke open",
    "Form I perfect verb; the vocalised pattern expresses a completed action.",
  ),
  form(
    "يَفْلِقُ",
    "He splits open",
    "Form I imperfect verb; the imperfect pattern expresses ongoing or present action.",
  ),
  form(
    "فَالِقُ",
    "one who splits open",
    "Active participle; the pattern names the doer of the splitting action.",
  ),
];
lesson.sarfReview = {
  status: "full",
  provenance,
  reviewedBy: "Codex",
  reviewedAt,
} satisfies SarfReview;
pkg.contentVersion = `${pkg.contentVersion.replace(/-reference-[^\s]+$/u, "")}-reference-1`;

function hash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

const after = { word: word.item, lesson };
const sourceHash = hash(before);
const contentHash = hash(after);
const previous = readAuditRecords()
  .filter(
    (record) =>
      (record.scope as { occurrenceId?: string })?.occurrenceId ===
      word.item.id,
  )
  .at(-1);
const record: AuditRecord = {
  recordId: `sarf-reference-${word.item.id.replaceAll(":", "-")}-${contentHash.slice(0, 12)}`,
  eventType: "lesson-sarf-reference-repaired",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  scope: {
    type: "lesson",
    packageId: pkg.packageId,
    surah: pkg.surah.number,
    ayah: word.ayah.number,
    position: word.item.position,
    occurrenceId: word.item.id,
    teachingId: word.item.teachingId,
  },
  status: "passed",
  sarfStatus: "full",
  reviewedAt,
  checks: [
    "current-quranic-form-first",
    "five-form-family",
    "verb-noun-participle-contrasts",
    "form-specific-meanings-and-differences",
    "authored-linguistic-provenance",
  ],
  evidence: provenance,
  sourceHash,
  contentHash,
  contentChanged: sourceHash !== contentHash,
  supersedes: previous?.recordId,
};
const batch: AuditRecord = {
  recordId: `sarf-reference-batch-${contentHash.slice(0, 20)}`,
  eventType: "sarf-reference-family-authored",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  scope: {
    type: "reference-lesson",
    packageId: pkg.packageId,
    lesson: lesson.id,
  },
  status: "passed",
  reviewedAt,
  checks: [
    "reference-five-form-family",
    "manual-linguistic-review",
    "prior-record-superseded",
  ],
  evidence: ["content-import/surahs/113-al-falaq/surah.json", ...provenance],
  contentChanged: true,
  supersedes: previous?.recordId,
};
await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<
  string,
  unknown
>;
manifest.contentVersion = pkg.contentVersion;
await fs.writeFile(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
const existing = new Set(readAuditRecords().map((item) => item.recordId));
appendAuditRecords(
  [record, batch].filter((item) => !existing.has(item.recordId)),
);
console.log(
  JSON.stringify(
    {
      status: "applied",
      lesson: lesson.id,
      forms: lesson.forms.length,
      supersedes: previous?.recordId ?? null,
      recordId: record.recordId,
    },
    null,
    2,
  ),
);
