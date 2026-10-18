import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appendAuditRecords, readAuditRecords } from "./lib/review-ledger";
import { assertAuthoringContract } from "./lib/authoring-contract";

const occurrenceId = "word:7:85:2";
let lesson: unknown;
type Package = {
  ayahs?: Array<{ words?: Array<{ id?: string; teachingId?: string }> }>;
  teachingEntries?: Record<string, unknown>;
};
for (const directory of fs.readdirSync("content-import/surahs")) {
  const filePath = path.join("content-import/surahs", directory, "surah.json");
  if (!fs.existsSync(filePath)) continue;
  const pkg = JSON.parse(fs.readFileSync(filePath, "utf8")) as Package;
  for (const ayah of pkg.ayahs ?? []) for (const word of ayah.words ?? []) {
    if (word.id === occurrenceId && word.teachingId) lesson = pkg.teachingEntries?.[word.teachingId];
  }
}
if (!lesson) throw new Error(`Missing ${occurrenceId}`);
const contract = assertAuthoringContract("record final family scope correction");
const recordId = "mixed-sarf-occurrence-scope-corrected-word-7-85-2";
if (!new Set(readAuditRecords().map((record) => record.recordId)).has(recordId)) {
  appendAuditRecords([{
    recordId,
    eventType: "mixed-sarf-occurrence-scope-corrected",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    scope: { type: "quranic-word-occurrence", occurrenceId, familyKey: "lexical|مدن|مدينة|noun/pronoun", familyScope: "proper-name-madyan" },
    status: "passed-limited",
    reviewedAt: new Date().toISOString(),
    checks: ["proper-name-sense-rechecked", "madyan-separated-from-al-madinah", "current-form-retained-first", "model-collision-recorded"],
    evidence: ["source:word:7:85:2", "docs/content-authoring/common-problems.json", "artifacts/content-review/mixed-sarf-reconciliation.json"],
    beforeFamilyScope: "common-city",
    afterFamilyScope: "proper-name-madyan",
    contentHash: crypto.createHash("sha256").update(JSON.stringify(lesson)).digest("hex"),
  }]);
}
console.log(JSON.stringify({ recordId, status: "recorded" }));
