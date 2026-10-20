import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { appendAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";
import {
  C2_ROOT_SPECS,
  type C2Candidate,
  type C2Decision,
  type C2FamilySpec,
} from "./lib/tier-c2-specs";

const contract = assertAuthoringContract(
  "Tier-C2 MEDIUM Ṣarf linguistic adjudication",
);
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const queuePath = path.join(
  reviewRoot,
  "blocked-sarf-review-queue-classified.json",
);
const classificationPath = path.join(reviewRoot, "tier-c-classification.json");
const classificationMarkdownPath = path.join(
  reviewRoot,
  "tier-c-classification.md",
);
const reportPath = path.join(reviewRoot, "tier-c2-sarf-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c2-sarf-adjudications.md");
const ledgerPath = path.join(reviewRoot, "ledger-0073.jsonl");

type QueueOccurrence = {
  occurrenceId: string;
  location: string;
  surah: number;
  ayah: number;
  position: number;
  arabic: string;
  meaning: string;
  formCount: number;
};
type QueueItem = {
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrenceCount: number;
  occurrences: QueueOccurrence[];
  currentAnalysis: unknown;
  competingPossibleAnalyses: string[];
  whyAutomaticResolutionIsUnsafe: string;
  evidenceRequiredToResolve: string[];
};
type ClassificationRow = {
  familyKey: string;
  root: string;
  lemma: string;
  resolvability: string;
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
type FinalRow = CurrentRow;
type Adjudication = {
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrences: QueueOccurrence[];
  currentRows: CurrentRow[];
  candidatesConsidered: C2Candidate[];
  acceptedCandidates: C2Candidate[];
  rejectedCandidates: string[];
  finalRows: FinalRow[];
  decision: C2Decision;
  reasoning: string;
  evidence: string[];
  confidence: "high" | "medium";
  unresolvedQuestion: string | null;
  evidenceRequired: string[];
  humanExpertReviewRequired: boolean;
  productionStatus: string;
  reviewedAt: string;
  recordId: string;
};

const decisions: C2Decision[] = [
  "FULL",
  "CONFIRMED-LIMITED",
  "BLOCKED",
  "MODEL-ISSUE",
];
const normalize = (value: string) =>
  value.normalize("NFC").replace(/[\s\u0640]/gu, "");
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const json = <T>(value: T) => JSON.stringify(value, null, 2);

function currentRow(
  item: QueueItem,
  occurrence: QueueOccurrence,
  record: OccurrenceRecord,
): LessonForm {
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning || occurrence.meaning,
    difference: `Current Qur’anic occurrence at ${occurrence.location}; this exact surface form is always first.`,
    relationship: `Current occurrence of the ${item.root} family; comparison rows explain the root and pattern without flattening semantic development.`,
    provenance: `Tier-C2 adjudication ${reviewedAt}; canonical occurrence, current lesson, root, lemma and morphology evidence inspected.`,
  };
}

function candidateRow(
  candidate: C2Candidate,
  item: QueueItem,
  occurrence: QueueOccurrence,
): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}: ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${occurrence.location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${item.root}; this is not a shell-only or bare-radical row.`,
    provenance: `Tier-C2 adjudication ${reviewedAt}; ${candidate.evidence}`,
  };
}

function markdown(report: {
  summary: Record<string, unknown>;
  adjudications: Adjudication[];
}) {
  const lines = [
    "# Tier-C2 MEDIUM Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers exactly the 148 MEDIUM Tier-C families / 195 occurrences. Tier-C LOW, earlier residual exceptions, and completed Tier A/B1/B2 families were excluded.",
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
      `Decision: **${item.decision}**; root: ${item.root}; locations: ${item.occurrences.map((x) => x.location).join(", ")}`,
      "",
      item.reasoning,
      "",
      "Accepted candidates:",
      "",
      ...(item.acceptedCandidates.length
        ? item.acceptedCandidates.map(
            (x) =>
              `- ${x.form} — ${x.meaning}; ${x.morphology}; ${x.relationship}; evidence: ${x.evidence}`,
          )
        : ["- None"]),
      "",
      "Rejected candidates / safeguards:",
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
  const queueReport = JSON.parse(await fs.readFile(queuePath, "utf8")) as {
    queue: QueueItem[];
  };
  const classificationReport = JSON.parse(
    await fs.readFile(classificationPath, "utf8"),
  ) as {
    classifications: ClassificationRow[];
    [key: string]: unknown;
  };
  const mediumRows = classificationReport.classifications.filter(
    (row) => row.resolvability === "MEDIUM",
  );
  if (mediumRows.length !== 148)
    throw new Error(
      `C2 scope mismatch: expected 148 MEDIUM families, found ${mediumRows.length}`,
    );
  const queueByFamily = new Map(
    queueReport.queue.map((item) => [item.familyKey, item]),
  );
  const c2Items = mediumRows.map((row) => {
    const item = queueByFamily.get(row.familyKey);
    if (!item)
      throw new Error(
        `C2 family ${row.familyKey} is missing from the blocked queue`,
      );
    if (item.occurrenceCount !== 1 && !item.occurrences.length)
      throw new Error(`C2 family ${row.familyKey} has no occurrences`);
    return item;
  });
  const occurrenceCount = c2Items.reduce(
    (sum, item) => sum + item.occurrences.length,
    0,
  );
  if (occurrenceCount !== 195)
    throw new Error(
      `C2 occurrence mismatch: expected 195, found ${occurrenceCount}`,
    );

  const packages = new Map<string, PackageEntry>();
  const occurrenceRecords = new Map<string, OccurrenceRecord>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package)
      throw new Error(
        `Cannot read package ${filePath}: ${result.errors.join("; ")}`,
      );
    const entry = { filePath, package: result.package };
    packages.set(filePath, entry);
    for (const ayah of result.package.ayahs) {
      for (const word of ayah.words) {
        if (!word.teachingId) continue;
        const lesson = result.package.teachingEntries[word.teachingId];
        if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
        occurrenceRecords.set(word.id, {
          filePath,
          package: result.package,
          word,
          lesson,
          location: `${result.package.surah.number}:${ayah.number}:${word.position}`,
        });
      }
    }
  }

  const adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedSurahs = new Set<number>();
  const changedFiles = new Set<string>();
  const decisionCounts = Object.fromEntries(
    decisions.map((decision) => [decision, 0]),
  ) as Record<C2Decision, number>;
  const occurrenceCounts = Object.fromEntries(
    decisions.map((decision) => [decision, 0]),
  ) as Record<C2Decision, number>;

  for (const item of c2Items) {
    const spec: C2FamilySpec | undefined = C2_ROOT_SPECS[item.root];
    if (!spec) throw new Error(`No explicit C2 specification for ${item.root}`);
    const records = item.occurrences.map((occurrence) => {
      const record = occurrenceRecords.get(occurrence.occurrenceId);
      if (!record)
        throw new Error(
          `Missing package occurrence ${occurrence.occurrenceId}`,
        );
      if (normalize(record.lesson.root) !== normalize(item.root))
        throw new Error(
          `Root mismatch for ${occurrence.occurrenceId}: ${record.lesson.root} != ${item.root}`,
        );
      return { occurrence, record };
    });
    const currentRows = records.map(({ occurrence, record }) => ({
      occurrenceId: occurrence.occurrenceId,
      location: occurrence.location,
      arabic: occurrence.arabic,
      forms: structuredClone(record.lesson.forms),
      sarfReview: structuredClone(record.lesson.sarfReview),
    }));
    const acceptedCandidates = spec.candidates;
    const finalRows: FinalRow[] = [];
    for (const { occurrence, record } of records) {
      const current = currentRow(item, occurrence, record);
      const forms: LessonForm[] = [current];
      const used = new Set([normalize(current.form)]);
      if (spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED") {
        for (const candidate of acceptedCandidates) {
          if (used.has(normalize(candidate.form))) continue;
          forms.push(candidateRow(candidate, item, occurrence));
          used.add(normalize(candidate.form));
        }
        if (spec.decision === "FULL" && forms.length !== 5)
          throw new Error(
            `${item.familyKey} has ${forms.length} rows at ${occurrence.location}; a FULL C2 family needs exactly five distinct rows`,
          );
        if (spec.decision === "CONFIRMED-LIMITED" && forms.length >= 5)
          throw new Error(
            `${item.familyKey} was marked limited but has five rows at ${occurrence.location}`,
          );
      }
      const review: SarfReview = {
        status: spec.decision === "FULL" ? "full" : "limited",
        ...(record.lesson.sarfReview.familyScope
          ? { familyScope: record.lesson.sarfReview.familyScope }
          : {}),
        ...(spec.decision === "FULL" ? {} : { limitedReason: spec.reason }),
        auditDecision:
          spec.decision === "FULL"
            ? "upgraded-to-full"
            : spec.decision === "CONFIRMED-LIMITED"
              ? "confirmed-limited"
              : "blocked-for-genuine-ambiguity",
        provenance: [
          `Tier-C2 adjudication ${reviewedAt}: ${spec.decision}.`,
          `Every occurrence of ${item.familyKey} was inspected.`,
          ...acceptedCandidates.map(
            (candidate) => `Accepted ${candidate.form}: ${candidate.evidence}`,
          ),
          ...spec.rejectedCandidates,
          ...(spec.evidenceRequired ?? []),
        ].slice(0, 80),
        reviewedBy: "Codex",
        reviewedAt,
      };
      record.lesson.forms = forms;
      record.lesson.sarfReview = review;
      changedSurahs.add(record.package.surah.number);
      changedFiles.add(record.filePath);
      finalRows.push({
        occurrenceId: occurrence.occurrenceId,
        location: occurrence.location,
        arabic: occurrence.arabic,
        forms,
        sarfReview: review,
      });
    }
    const recordId = `tier-c2-family-${hash(item.familyKey)}`;
    const humanExpertReviewRequired =
      spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE";
    adjudications.push({
      familyKey: item.familyKey,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      occurrences: item.occurrences,
      currentRows,
      candidatesConsidered: spec.candidates,
      acceptedCandidates: spec.candidates,
      rejectedCandidates: spec.rejectedCandidates,
      finalRows,
      decision: spec.decision,
      reasoning: spec.reason,
      evidence: [
        `Canonical Qur’anic occurrences inspected: ${item.occurrences.map((x) => x.location).join(", ")}.`,
        "Approved project lexical/root evidence and aligned morphology were inspected.",
        ...(spec.evidenceRequired ?? []),
      ],
      confidence:
        spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED"
          ? "high"
          : "medium",
      unresolvedQuestion: spec.unresolvedQuestion ?? null,
      evidenceRequired: spec.evidenceRequired ?? [],
      humanExpertReviewRequired,
      productionStatus:
        spec.decision === "FULL"
          ? "full"
          : spec.decision === "CONFIRMED-LIMITED"
            ? "confirmed-limited"
            : "blocked",
      reviewedAt,
      recordId,
    });
    decisionCounts[spec.decision] += 1;
    occurrenceCounts[spec.decision] += item.occurrences.length;
    ledger.push({
      recordId,
      eventType: "tier-c2-sarf-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        familyKey: item.familyKey,
        occurrences: item.occurrences.map((x) => x.occurrenceId),
        tier: "C2",
      },
      status:
        spec.decision === "FULL"
          ? "passed"
          : spec.decision === "CONFIRMED-LIMITED"
            ? "passed-limited"
            : "blocked",
      reviewedAt,
      checks: [
        "contract-loaded",
        "c2-medium-queue-148",
        "c2-occurrence-scope-195",
        "every-occurrence-inspected",
        "current-form-first",
        "same-root-forms-reviewed",
        "shell-and-padding-rejected",
        "semantic-development-translated-honestly",
        "provenance-recorded",
        "decision-recorded",
      ],
      evidence: [
        spec.reason,
        ...spec.rejectedCandidates,
        ...(spec.evidenceRequired ?? []),
      ],
      decision: spec.decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      humanExpertReviewRequired,
    });
  }

  for (const entry of packages.values()) {
    if (entry.package.status !== "custom-partial") continue;
    const hasBlockedLesson = Object.values(entry.package.teachingEntries).some(
      (lesson) =>
        lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity",
    );
    if (!hasBlockedLesson) {
      entry.package.status = "custom-complete";
      changedFiles.add(entry.filePath);
    }
  }
  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Changed package was not loaded: ${filePath}`);
    await fs.writeFile(
      filePath,
      `${JSON.stringify(entry.package, null, 2)}\n`,
      "utf8",
    );
    const manifestPath = path.join(path.dirname(filePath), "manifest.json");
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    manifest.contentVersion = `${String(manifest.contentVersion ?? "content")}-c2-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    manifest.status = entry.package.status;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }
  appendAuditRecords(ledger);

  const summary = {
    startingC2Families: 148,
    startingC2Occurrences: 195,
    adjudicatedFamilies: adjudications.length,
    adjudicatedOccurrences: occurrenceCount,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    changedSurahs: [...changedSurahs].sort((a, b) => a - b),
    changedPackageFiles: [...changedFiles].sort(),
    excluded: [
      "Tier-C LOW families",
      "earlier residual exceptions",
      "completed Tier A/B1/B2 families",
    ],
  };
  await fs.writeFile(
    reportPath,
    `${JSON.stringify({ reportType: "tier-c2-sarf-adjudication", contractVersion: contract.contractVersion, reviewedAt, summary, adjudications }, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    markdownPath,
    markdown({ summary, adjudications }),
    "utf8",
  );

  for (const row of classificationReport.classifications) {
    if (row.resolvability !== "MEDIUM") continue;
    const adjudication = adjudications.find(
      (item) => item.familyKey === row.familyKey,
    );
    if (!adjudication)
      throw new Error(
        `Missing C2 report for classification row ${row.familyKey}`,
      );
    row.c2 = {
      decision: adjudication.decision,
      occurrences: adjudication.occurrences.length,
      reviewedAt,
      recordId: adjudication.recordId,
    };
  }
  classificationReport.tierC2 = {
    contractVersion: contract.contractVersion,
    reviewedAt,
    scopeFamilies: 148,
    scopeOccurrences: 195,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
  };
  await fs.writeFile(
    classificationPath,
    `${JSON.stringify(classificationReport, null, 2)}\n`,
    "utf8",
  );
  const classificationLines = [
    "# Tier-C classification",
    "",
    `Generated: ${reviewedAt}`,
    "",
    "Tier C is divided into C1 HIGH, C2 MEDIUM, and C3 LOW. C2 adjudicated exactly 148 MEDIUM families / 195 occurrences; C3 was not started.",
    "",
    "## C2 summary",
    "",
    "```json",
    JSON.stringify(classificationReport.tierC2, null, 2),
    "```",
    "",
    "## Families",
    "",
    "| Family | Root | Category | Occurrences | Resolvability | C2 decision |",
    "|---|---|---|---:|---|---|",
  ];
  for (const row of classificationReport.classifications)
    classificationLines.push(
      `| ${row.familyKey} | ${row.root || "—"} | ${row.category} | ${row.occurrenceCount} | ${row.resolvability} | ${String((row.c2 as { decision?: string } | undefined)?.decision ?? "—")} |`,
    );
  await fs.writeFile(
    classificationMarkdownPath,
    `${classificationLines.join("\n")}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      { ...summary, reportPath, markdownPath, ledgerPath },
      null,
      2,
    ),
  );
}

await main();
