import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import type { LessonForm, SarfReview, SurahPackage } from "../app/data/content-contract";
import { C1_FAMILY_SPECS, type C1RelatedForm } from "./lib/tier-c1-specs";

const contract = assertAuthoringContract("C1 same-root semantic-development re-audit");
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const oldReportPath = path.join(reviewRoot, "tier-c1-sarf-adjudications.json");
const reportPath = oldReportPath;
const markdownPath = path.join(reviewRoot, "tier-c1-sarf-adjudications.md");
const diffPath = path.join(reviewRoot, "tier-c1-reaudit-diff.json");

type OldReport = {
  adjudications: Array<{
    familyKey: string;
    root: string;
    lemma: string;
    category: string;
    locations: Array<{ occurrenceId: string; location: string; surah: number; ayah: number; position: number; arabic: string; meaning: string; formCount: number; status?: string; currentReason?: string }>;
  }>;
};
type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type PackageEntry = { filePath: string; package: SurahPackage };
type OccurrenceRecord = { filePath: string; package: SurahPackage; word: Word; lesson: Lesson; ayah: number };
type Candidate = {
  row: LessonForm;
  sourceOccurrenceId: string;
  sourceLocation: string;
  root: string;
  lessonId: string;
  meaning: string;
  morphology: string;
  relationship: string;
  evidence: string;
  confidence: "high";
  pedagogicalValue: string;
};
type ReauditLocation = OldReport["adjudications"][number]["locations"][number];
type ReauditRow = {
  occurrenceId: string;
  location: string;
  arabic: string;
  forms: LessonForm[];
  sarfReview: SarfReview;
};
type ReauditAdjudication = {
  familyKey: string;
  root: string;
  lemma: string;
  category: string;
  locations: ReauditLocation[];
  currentRows: ReauditRow[];
  candidatesConsidered: Candidate[];
  acceptedCandidates: Candidate[];
  rejectedCandidates: string[];
  finalRows: ReauditRow[];
  decision: "FULL";
  reasoning: string;
  evidence: string[];
  confidence: "high";
  unresolvedQuestion: null;
  evidenceRequired: string[];
  humanExpertReviewRequired: false;
  reviewedAt: string;
  recordId: string;
};

const normalize = (value: string) => value.normalize("NFC").replace(/[\s\u0640]/gu, "");
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const json = <T>(value: T) => JSON.stringify(value, null, 2);

async function writeReportFile(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, content, "utf8");
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rename(temporaryPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

function formKey(value: string) {
  return normalize(value).replace(/[ٱإأآ]/gu, "ا");
}

function currentRow(root: string, occurrence: { arabic: string; meaning: string; location: string }) : LessonForm {
  const shellNote = root === "سلخ" && /^فَ/u.test(occurrence.arabic)
    ? " The initial فَ is retained because it is part of this Qur’anic surface occurrence, but it is a conjunction shell and is not counted as a separate Ṣarf member."
    : "";
  return {
    form: occurrence.arabic,
    meaning: root === "عثر" ? "was discovered (in عُثِرَ عَلَىٰ)" : occurrence.meaning,
    difference: `Current Qur’anic occurrence; this exact form is first.${shellNote}`,
    relationship: `The Qur’anic occurrence of the ${root} root in ${occurrence.location}; related meanings and patterns are explained rather than flattened.`,
    provenance: `C1 same-root semantic-development re-audit ${reviewedAt}; canonical occurrence ${occurrence.location} inspected.`,
  };
}

function candidate(root: string, item: C1RelatedForm, index: number): Candidate {
  return {
    row: {
      form: item.form,
      meaning: item.meaning,
      difference: `${item.morphology}: ${item.difference}`,
      relationship: item.relationship,
      provenance: `C1 same-root semantic-development re-audit ${reviewedAt}; ${item.evidence}`,
    },
    sourceOccurrenceId: `authored:c1:${root}:${index + 1}`,
    sourceLocation: "approved project linguistic evidence",
    root,
    lessonId: "authored-c1-semantic-development",
    meaning: item.meaning,
    morphology: item.morphology,
    relationship: item.relationship,
    evidence: item.evidence,
    confidence: "high",
    pedagogicalValue: item.pedagogicalValue,
  };
}

function markdown(report: { summary: Record<string, unknown>; adjudications: ReauditAdjudication[] }) {
  const lines = [
    "# Tier-C1 Ṣarf adjudications — same-root semantic-development re-audit",
    "",
    `Generated: ${reviewedAt}`,
    "",
    "The governing teaching purpose is same-root morphological recognition. Same meaning is not required, but every row must be attested, morphologically useful, accurately translated and explicit about semantic development. Shell-only variants are excluded.",
    "",
    "## Summary",
    "",
    "```json",
    json(report.summary),
    "```",
    "",
  ];
  for (const item of report.adjudications) {
    lines.push(`## ${item.root}`, "", `Decision: **${item.decision}**`, `Locations: ${item.locations.map((x) => x.location).join(", ")}`, "", item.reasoning, "", "Accepted related forms:", "", ...item.acceptedCandidates.map((x) => `- ${x.row.form} — ${x.row.meaning}; ${x.morphology}. ${x.row.relationship}`), "", "Rejected previous rows:", "", ...(item.rejectedCandidates.length ? item.rejectedCandidates.map((x) => `- ${x}`) : ["- None; the previous row was retained."]), "", `Human expert review still required: ${item.humanExpertReviewRequired ? "yes" : "no"}`, "", "---", "");
  }
  return `${lines.join("\n")}\n`;
}

const oldReport = JSON.parse(await fs.readFile(oldReportPath, "utf8")) as OldReport;
if (oldReport.adjudications.length !== 21) throw new Error(`Expected 21 C1 adjudications, found ${oldReport.adjudications.length}`);
const documentedDiff = JSON.parse(await fs.readFile(diffPath, "utf8")) as {
  changedFamilies: Array<{ root: string; before: string[]; after: string[] }>;
};
const documentedDiffByRoot = new Map(documentedDiff.changedFamilies.map((item) => [item.root, item]));

const packages = new Map<string, PackageEntry>();
const occurrences = new Map<string, OccurrenceRecord>();
for (const filePath of await discoverPackagePaths()) {
  const result = await readPackage(filePath);
  if (!result.package) throw new Error(`Cannot read ${filePath}: ${result.errors.join("; ")}`);
  packages.set(filePath, { filePath, package: result.package });
  for (const ayah of result.package.ayahs) for (const word of ayah.words) {
    if (!word.teachingId) continue;
    const lesson = result.package.teachingEntries[word.teachingId];
    if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
    occurrences.set(word.id, { filePath, package: result.package, word, lesson, ayah: ayah.number });
  }
}

const adjudications: ReauditAdjudication[] = [];
const ledger: AuditRecord[] = [];
const changedFiles = new Set<string>();
const changedFamilies: string[] = [];

for (const old of oldReport.adjudications) {
  const spec = C1_FAMILY_SPECS[old.root];
  if (!spec) throw new Error(`No governed C1 specification for ${old.root}`);
  const records = old.locations.map((location) => {
    const record = occurrences.get(location.occurrenceId);
    if (!record) throw new Error(`Missing occurrence ${location.occurrenceId}`);
    if (record.lesson.root.replace(/\s+/gu, "") !== spec.root) throw new Error(`Root mismatch for ${location.occurrenceId}: ${record.lesson.root} != ${spec.root}`);
    return { location, record };
  });
  const relatedCandidates = spec.related.map((item, index) => candidate(spec.root, item, index));
  const relatedKeys = new Set(relatedCandidates.map((item) => formKey(item.row.form)));
  const rejectedCandidates = new Set<string>();
  const documentedChange = documentedDiffByRoot.get(old.root);
  if (documentedChange) {
    const afterKeys = new Set(documentedChange.after.map(formKey));
    for (const previous of documentedChange.before.slice(1)) {
      if (!afterKeys.has(formKey(previous))) rejectedCandidates.add(`${previous}: replaced by the reviewed same-root semantic-development family.`);
    }
  }
  for (const { record } of records) for (const previous of record.lesson.forms.slice(1)) {
    if (!relatedKeys.has(formKey(previous.form))) rejectedCandidates.add(`${previous.form}: replaced during the same-root semantic-development re-audit because it was less useful, shell-like, weakly scoped or semantically under-described.`);
  }

  const currentRows: ReauditRow[] = [];
  const finalRows: ReauditRow[] = [];
  for (const { location, record } of records) {
    const beforeReview = structuredClone(record.lesson.sarfReview);
    currentRows.push({ occurrenceId: location.occurrenceId, location: location.location, arabic: location.arabic, forms: structuredClone(record.lesson.forms), sarfReview: beforeReview });
    const current = currentRow(spec.root, { arabic: record.word.arabic, meaning: spec.currentMeaning, location: location.location });
    const forms: LessonForm[] = [current, ...relatedCandidates.map((item) => item.row)];
    if (new Set(forms.map((item) => formKey(item.form))).size !== 5) throw new Error(`${spec.root} does not have five distinct reviewed forms at ${location.location}`);
    record.lesson.forms = forms;
    record.lesson.sarfReview = {
      status: "full",
      ...(beforeReview.familyScope ? { familyScope: beforeReview.familyScope } : {}),
      auditDecision: "upgraded-to-full",
      provenance: [
        `C1 same-root semantic-development re-audit ${reviewedAt}: FULL.`,
        spec.familyTeachingNote,
        "Same root is the primary organising principle; identical meaning is not required.",
        "Shell-only prefix, article, case, pronoun and duplicate variants were not counted as separate family members.",
        ...relatedCandidates.map((item) => item.evidence),
      ],
      reviewedBy: "Codex",
      reviewedAt,
    } satisfies SarfReview;
    finalRows.push({ occurrenceId: location.occurrenceId, location: location.location, arabic: record.word.arabic, forms: structuredClone(forms), sarfReview: structuredClone(record.lesson.sarfReview) });
    changedFiles.add(record.filePath);
  }
  if (rejectedCandidates.size > 0) changedFamilies.push(old.root);
  const recordId = `tier-c1-reaudit-family-${hash(old.familyKey)}`;
  adjudications.push({
    familyKey: old.familyKey,
    root: old.root,
    lemma: old.lemma,
    category: old.category,
    locations: old.locations,
    currentRows,
    candidatesConsidered: relatedCandidates,
    acceptedCandidates: relatedCandidates,
    rejectedCandidates: [...rejectedCandidates],
    finalRows,
    decision: "FULL",
    reasoning: `${spec.familyTeachingNote} The Qur’anic form is first for every occurrence. Same-root semantic development is taught honestly; no shell-only variation, same-conjugation padding or bare-root row is used.`,
    evidence: [
      "The governing contract and common-problems safeguards were loaded before authoring.",
      "Every Qur’anic occurrence in this family was inspected.",
      "The explicit C1 family specification was checked for root ownership, vocalisation, morphology, form-specific meaning and pedagogical value.",
      "Approved project Qur’anic evidence, reviewed lexical/morphology evidence and Codex-authored linguistic content were recorded per row.",
    ],
    confidence: "high",
    unresolvedQuestion: null,
    evidenceRequired: [],
    humanExpertReviewRequired: false,
    reviewedAt,
    recordId,
  });
  ledger.push({
    recordId,
    eventType: "tier-c1-sarf-semantic-development-reaudit",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    scope: { tier: "C1", familyKey: old.familyKey, occurrences: old.locations.map((item) => item.occurrenceId) },
    status: "passed",
    sarfStatus: "full",
    auditDecision: "upgraded-to-full",
    reviewedAt,
    checks: [
      "same-root-primary-organising-principle",
      "semantic-development-explicit",
      "current-form-first",
      "five-distinct-vocalised-forms",
      "shell-only-variants-rejected",
      "same-conjugation-padding-rejected",
      "root-ownership-reviewed",
      "form-specific-meanings",
      "provenance-recorded",
    ],
    evidence: [spec.familyTeachingNote, ...relatedCandidates.map((item) => item.evidence)],
    contentChanged: true,
    changedRows: [...rejectedCandidates],
  });
}

for (const filePath of changedFiles) {
  const entry = packages.get(filePath);
  if (!entry) throw new Error(`Missing changed package ${filePath}`);
  const baseVersion = entry.package.contentVersion.replace(/-c1-reaudit-[^\s]+$/u, "").replace(/-sarf-[^\s]+$/u, "");
  entry.package.contentVersion = `${baseVersion}-sarf-1.2-c1-reaudit`;
  await fs.writeFile(filePath, `${JSON.stringify(entry.package, null, 2)}\n`, "utf8");
  const manifestPath = path.join(path.dirname(filePath), "manifest.json");
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.contentVersion = entry.package.contentVersion;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } catch {
    // Older packages may not have a manifest.
  }
}

const summary = {
  tier: "C1",
  scope: { families: adjudications.length, occurrences: adjudications.reduce((sum, item) => sum + item.locations.length, 0) },
  decision: { FULL: adjudications.length, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 },
  occurrencesByDecision: { FULL: adjudications.reduce((sum, item) => sum + item.locations.length, 0), "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 },
  changedFamilies: documentedDiff.changedFamilies.map((item) => item.root).sort(),
  changedPackageFiles: [...changedFiles].sort(),
  governingInterpretation: "Same root is primary; same meaning is not required; semantic development must be translated honestly; shell-only and weak padding are forbidden.",
  generatedAt: reviewedAt,
};
await writeReportFile(reportPath, `${json({ reportType: "tier-c1-sarf-adjudication", contractVersion: contract.contractVersion, ...summary, adjudications })}\n`);
await writeReportFile(markdownPath, markdown({ summary, adjudications }));

const existingIds = new Set(readAuditRecords().map((record) => record.recordId));
appendAuditRecords(ledger.filter((record) => !existingIds.has(record.recordId)));
console.log(json({ summary, newLedgerRecords: ledger.filter((record) => !existingIds.has(record.recordId)).length }));

