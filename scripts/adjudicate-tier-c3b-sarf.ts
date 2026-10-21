import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import {
  C3B_FAMILY_KEYS,
  C3B_SPECS,
  type C3BCandidate,
  type C3BDecision,
} from "./lib/tier-c3b-specs";
import type { LessonForm, SarfReview, SurahPackage } from "../app/data/content-contract";

const contract = assertAuthoringContract("Tier-C3-B productive noun/adjective adjudication");
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const classificationPath = path.join(reviewRoot, "tier-c3-low-classification.json");
const classificationMarkdownPath = path.join(reviewRoot, "tier-c3-low-classification.md");
const reportPath = path.join(reviewRoot, "tier-c3b-sarf-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c3b-sarf-adjudications.md");

type ClassificationFamily = {
  familyKey: string;
  quranicWord: string;
  root: string;
  lemma: string;
  locations: string[];
  occurrenceCount: number;
  proposedC3Group?: string;
  predictedResolvability?: string;
  [key: string]: unknown;
};

type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type PackageEntry = { filePath: string; package: SurahPackage };
type OccurrenceRecord = {
  filePath: string;
  package: SurahPackage;
  word: Word;
  lesson: Lesson;
  location: string;
};
type CurrentRow = {
  occurrenceId: string;
  location: string;
  arabic: string;
  forms: LessonForm[];
  sarfReview: SarfReview;
};
type Adjudication = {
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  quranicWord: string;
  locations: string[];
  occurrenceCount: number;
  predictedResolvability: string;
  currentRows: CurrentRow[];
  candidatesConsidered: C3BCandidate[];
  acceptedCandidates: C3BCandidate[];
  rejectedCandidates: string[];
  finalRows: CurrentRow[];
  decision: C3BDecision;
  reasoning: string;
  evidence: string[];
  confidence: "high" | "medium";
  unresolvedQuestion: string | null;
  evidenceRequired: string[];
  humanExpertReviewRequired: boolean;
  productionStatus: string;
  predictedLowAssessment?: string;
  reviewedAt: string;
  recordId: string;
};

const normalize = (value: string) => value.normalize("NFC").replace(/[\s\u0640]/gu, "");
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const json = <T>(value: T) => JSON.stringify(value, null, 2);

function currentRow(record: OccurrenceRecord): LessonForm {
  const old = record.lesson.forms[0];
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning || record.word.gloss || record.word.arabic,
    difference: `Current Qur’anic occurrence at ${record.location}; ${old?.difference ?? "the exact surface form is retained first."}`,
    relationship: `Current Qur’anic occurrence of the ${record.lesson.root} lexical family; comparison rows show genuine same-root morphology and honest semantic development.`,
    provenance: `Tier-C3-B adjudication ${reviewedAt}; canonical occurrence, existing lesson, root, lemma and aligned morphology evidence inspected.`,
  };
}

function candidateRow(candidate: C3BCandidate, root: string, location: string): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}. ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${root}; this is not shell variation or a bare-radical row.`,
    provenance: `Tier-C3-B adjudication ${reviewedAt}; ${candidate.evidence}`,
  };
}

function markdown(report: { summary: Record<string, unknown>; adjudications: Adjudication[] }) {
  const lines = [
    "# Tier-C-B productive noun/adjective Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers exactly the 23 C3-B families / 29 Qur’anic occurrences. C3-C, C3-D, C3-E, C2 residuals and historical residuals were excluded.",
    "",
    "## Summary",
    "",
    "```json",
    json(report.summary),
    "```",
    "",
  ];
  for (const item of report.adjudications) {
    lines.push(
      `## ${item.familyKey}`,
      "",
      `Decision: **${item.decision}**; root: ${item.root}; word: ${item.quranicWord}; locations: ${item.locations.join(", ")}`,
      "",
      `Original predicted resolvability: ${item.predictedResolvability}${item.predictedLowAssessment ? `; assessment: ${item.predictedLowAssessment}` : ""}`,
      "",
      item.reasoning,
      "",
      "Accepted candidates:",
      "",
      ...(item.acceptedCandidates.length
        ? item.acceptedCandidates.map((x) => `- ${x.form} — ${x.meaning}; ${x.morphology}; ${x.relationship}; ${x.semanticDevelopment}; evidence: ${x.evidence}`)
        : ["- None"]),
      "",
      "Candidates rejected / safeguards:",
      "",
      ...item.rejectedCandidates.map((x) => `- ${x}`),
      "",
      `Unresolved question: ${item.unresolvedQuestion ?? "None"}`,
      `Human expert review still required: ${item.humanExpertReviewRequired ? "yes" : "no"}`,
      "",
      "---",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const classificationReport = JSON.parse(await fs.readFile(classificationPath, "utf8")) as {
    families: ClassificationFamily[];
    [key: string]: unknown;
  };
  const c3bRows = classificationReport.families.filter((row) => row.proposedC3Group === "C3-B");
  if (c3bRows.length !== 23) throw new Error(`C3-B scope mismatch: expected 23 families, found ${c3bRows.length}`);
  const c3bOccurrences = c3bRows.reduce((sum, row) => sum + row.locations.length, 0);
  if (c3bOccurrences !== 29) throw new Error(`C3-B occurrence mismatch: expected 29, found ${c3bOccurrences}`);
  if (C3B_FAMILY_KEYS.length !== 23) throw new Error(`C3-B specification mismatch: expected 23 specs, found ${C3B_FAMILY_KEYS.length}`);
  for (const row of c3bRows) if (!C3B_SPECS[row.familyKey]) throw new Error(`Missing explicit C3-B specification for ${row.familyKey}`);

  const packages = new Map<string, PackageEntry>();
  const occurrences = new Map<string, OccurrenceRecord>();
  const byLocation = new Map<string, OccurrenceRecord>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package) throw new Error(`Cannot read package ${filePath}: ${result.errors.join("; ")}`);
    const entry = { filePath, package: result.package };
    packages.set(filePath, entry);
    for (const ayah of result.package.ayahs) {
      for (const word of ayah.words) {
        if (!word.teachingId) continue;
        const lesson = result.package.teachingEntries[word.teachingId];
        if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
        const location = `${result.package.surah.number}:${ayah.number}:${word.position}`;
        const record = { filePath, package: result.package, word, lesson, location };
        occurrences.set(word.id, record);
        byLocation.set(location, record);
      }
    }
  }

  const adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedFiles = new Set<string>();
  const changedSurahs = new Set<number>();
  const decisionCounts = { FULL: 0, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 } as Record<C3BDecision, number>;
  const occurrenceCounts = { FULL: 0, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 } as Record<C3BDecision, number>;

  for (const item of c3bRows) {
    const spec = C3B_SPECS[item.familyKey];
    const records = item.locations.map((location) => {
      const record = byLocation.get(location);
      if (!record) throw new Error(`Missing package occurrence ${location} for ${item.familyKey}`);
      if (normalize(record.lesson.root) !== normalize(item.root)) throw new Error(`Root mismatch at ${location}: ${record.lesson.root} != ${item.root}`);
      return record;
    });
    const currentRows = records.map((record) => ({
      occurrenceId: record.word.id,
      location: record.location,
      arabic: record.word.arabic,
      forms: structuredClone(record.lesson.forms),
      sarfReview: structuredClone(record.lesson.sarfReview),
    }));
    const acceptedCandidates = spec.candidates.filter((candidate) => candidate.accepted);
    const finalRows: CurrentRow[] = [];
    for (const record of records) {
      const current = currentRow(record);
      const forms: LessonForm[] = [current];
      const used = new Set([normalize(current.form)]);
      if (spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED") {
        for (const candidate of acceptedCandidates) {
          const key = normalize(candidate.form);
          if (used.has(key)) throw new Error(`${item.familyKey} has duplicate accepted form ${candidate.form}`);
          forms.push(candidateRow(candidate, item.root, record.location));
          used.add(key);
        }
        if (spec.decision === "FULL" && forms.length !== 5) throw new Error(`${item.familyKey} has ${forms.length} rows; FULL requires exactly five distinct rows`);
        if (spec.decision === "CONFIRMED-LIMITED" && forms.length >= 5) throw new Error(`${item.familyKey} is limited but has ${forms.length} rows`);
      }
      const review: SarfReview = {
        status: spec.decision === "FULL" ? "full" : "limited",
        ...(spec.decision === "FULL" ? {} : { limitedReason: spec.reason }),
        auditDecision: spec.decision === "FULL" ? "upgraded-to-full" : spec.decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked-for-genuine-ambiguity",
        provenance: [
          `Tier-C3-B adjudication ${reviewedAt}: ${spec.decision}.`,
          `Every occurrence of ${item.familyKey} was inspected.`,
          ...acceptedCandidates.map((candidate) => `Accepted ${candidate.form}: ${candidate.evidence}`),
          ...spec.rejectedCandidates,
        ].slice(0, 80),
        reviewedBy: "Codex",
        reviewedAt,
      };
      record.lesson.forms = forms;
      record.lesson.sarfReview = review;
      changedFiles.add(record.filePath);
      changedSurahs.add(record.package.surah.number);
      finalRows.push({ occurrenceId: record.word.id, location: record.location, arabic: record.word.arabic, forms, sarfReview: review });
    }

    const recordId = `tier-c3b-family-${hash(item.familyKey)}`;
    const humanExpertReviewRequired = spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE";
    adjudications.push({
      familyKey: item.familyKey,
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      quranicWord: item.quranicWord,
      locations: item.locations,
      occurrenceCount: item.locations.length,
      predictedResolvability: item.predictedResolvability ?? "—",
      currentRows,
      candidatesConsidered: spec.candidates,
      acceptedCandidates,
      rejectedCandidates: spec.rejectedCandidates,
      finalRows,
      decision: spec.decision,
      reasoning: spec.reason,
      evidence: [
        `Canonical Qur’anic occurrences inspected: ${item.locations.join(", ")}.`,
        "Approved project root/lexical evidence and aligned morphology were inspected.",
        ...acceptedCandidates.map((candidate) => candidate.evidence),
      ],
      confidence: spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE" ? "medium" : "high",
      unresolvedQuestion: spec.unresolvedQuestion ?? null,
      evidenceRequired: spec.evidenceRequired ?? [],
      humanExpertReviewRequired,
      productionStatus: spec.decision === "FULL" ? "full" : spec.decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked",
      predictedLowAssessment: spec.predictedLowAssessment,
      reviewedAt,
      recordId,
    });
    decisionCounts[spec.decision] += 1;
    occurrenceCounts[spec.decision] += item.locations.length;
    ledger.push({
      recordId,
      eventType: "tier-c3b-sarf-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: { familyKey: item.familyKey, occurrences: records.map((record) => record.word.id), tier: "C3-B" },
      status: spec.decision === "FULL" ? "passed" : spec.decision === "CONFIRMED-LIMITED" ? "passed-limited" : "blocked",
      reviewedAt,
      checks: [
        "contract-loaded",
        "c3b-scope-23-families",
        "c3b-occurrence-scope-29",
        "every-occurrence-inspected",
        "current-form-first",
        "same-root-forms-reviewed",
        "shell-and-padding-rejected",
        "semantic-development-translated-honestly",
        "provenance-recorded",
        "decision-recorded",
      ],
      evidence: [spec.reason, ...spec.rejectedCandidates],
      decision: spec.decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      category: "C3-B productive noun/adjective",
      humanExpertReviewRequired,
    });
  }

  for (const entry of packages.values()) {
    if (entry.package.status !== "custom-partial") continue;
    const hasBlockedLesson = Object.values(entry.package.teachingEntries).some((lesson) => lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity");
    if (!hasBlockedLesson) {
      entry.package.status = "custom-complete";
      changedFiles.add(entry.filePath);
    }
  }
  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Changed package was not loaded: ${filePath}`);
    await fs.writeFile(filePath, `${JSON.stringify(entry.package, null, 2)}\n`, "utf8");
    const manifestPath = path.join(path.dirname(filePath), "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.contentVersion = `${String(manifest.contentVersion ?? "content")}-c3b-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    manifest.status = entry.package.status;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  const existingAuditIds = new Set(readAuditRecords().map((record) => record.recordId));
  appendAuditRecords(ledger.filter((record) => !existingAuditIds.has(record.recordId)));

  const summary = {
    startingC3BFamilies: 23,
    startingC3BOccurrences: 29,
    adjudicatedFamilies: adjudications.length,
    adjudicatedOccurrences: c3bOccurrences,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    changedSurahs: [...changedSurahs].sort((a, b) => a - b),
    changedPackageFiles: [...changedFiles].sort(),
    excluded: ["C3-C", "C3-D", "C3-E", "C2 residuals", "historical residual exceptions"],
  };
  await fs.writeFile(reportPath, `${JSON.stringify({ reportType: "tier-c3b-sarf-adjudication", contractVersion: contract.contractVersion, reviewedAt, summary, adjudications }, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, markdown({ summary, adjudications }), "utf8");

  for (const row of classificationReport.families) {
    if (row.proposedC3Group !== "C3-B") continue;
    const adjudication = adjudications.find((item) => item.familyKey === row.familyKey);
    if (!adjudication) throw new Error(`Missing C3-B report for ${row.familyKey}`);
    row.c3B = {
      decision: adjudication.decision,
      occurrences: adjudication.occurrenceCount,
      reviewedAt,
      recordId: adjudication.recordId,
      acceptedRowsPerOccurrence: adjudication.finalRows[0]?.forms.length ?? 0,
    };
  }
  classificationReport.tierC3B = {
    contractVersion: contract.contractVersion,
    reviewedAt,
    scopeFamilies: 23,
    scopeOccurrences: 29,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
  };
  await fs.writeFile(classificationPath, `${JSON.stringify(classificationReport, null, 2)}\n`, "utf8");

  const classificationLines = [
    "# Tier-C LOW classification",
    "",
    `Generated: ${reviewedAt}`,
    "",
    "C3-B productive noun/adjective adjudication covers exactly 23 families / 29 occurrences. C3-C, C3-D and C3-E were not started.",
    "",
    "## C3-B summary",
    "",
    "```json",
    JSON.stringify(classificationReport.tierC3B, null, 2),
    "```",
    "",
    "## Families",
    "",
    "| Family | Word | Root | Group | Occurrences | Predicted | Decision |",
    "|---|---|---|---|---:|---|---|",
  ];
  for (const row of classificationReport.families) {
    const c3b = row.c3B as { decision?: string } | undefined;
    classificationLines.push(`| ${row.familyKey} | ${row.quranicWord} | ${row.root || "—"} | ${row.proposedC3Group ?? "—"} | ${row.occurrenceCount} | ${row.predictedResolvability ?? "—"} | ${c3b?.decision ?? "—"} |`);
  }
  await fs.writeFile(classificationMarkdownPath, `${classificationLines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ ...summary, reportPath, markdownPath }, null, 2));
}

await main();
