import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import {
  C3C2_FAMILY_KEYS,
  C3C2_SPECS,
  type C3C2Candidate,
  type C3C2Decision,
} from "./lib/tier-c3c2-specs";
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";

const contract = assertAuthoringContract(
  "Tier-C3-C2 hamzated-root adjudication",
);
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const classificationPath = path.join(
  reviewRoot,
  "tier-c3-low-classification.json",
);
const classificationMarkdownPath = path.join(
  reviewRoot,
  "tier-c3-low-classification.md",
);
const ownershipPath = path.join(reviewRoot, "tier-c3c-ownership.json");
const ownershipMarkdownPath = path.join(reviewRoot, "tier-c3c-ownership.md");
const planPath = path.join(reviewRoot, "tier-c3c-execution-plan.json");
const planMarkdownPath = path.join(reviewRoot, "tier-c3c-execution-plan.md");
const reportPath = path.join(reviewRoot, "tier-c3c2-sarf-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c3c2-sarf-adjudications.md");

type ClassificationFamily = {
  familyKey: string;
  quranicWord: string;
  root: string;
  lemma: string;
  locations: string[];
  occurrenceCount: number;
  proposedC3Group?: string;
  predictedResolvability?: string;
  morphologicalFlags?: string[];
  [key: string]: unknown;
};
type ClassificationReport = {
  families: ClassificationFamily[];
  [key: string]: unknown;
};
type Ownership = {
  reportType: string;
  contractVersion: string;
  reviewedAt: string;
  scope: { families: number; occurrences: number };
  ruleVersion: string;
  rule: string;
  primaryTrackCounts: Record<string, { families: number; occurrences: number }>;
  pendingQueueCounts: Record<string, { families: number; occurrences: number }>;
  hamzatedQueue: Array<Record<string, unknown>>;
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
  hamzaPosition: string;
  secondaryMorphologyFlags: string[];
  rootNormalization: string | null;
  currentRows: CurrentRow[];
  candidatesConsidered: C3C2Candidate[];
  acceptedCandidates: C3C2Candidate[];
  rejectedCandidates: string[];
  finalRows: CurrentRow[];
  decision: C3C2Decision;
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

const decisions: C3C2Decision[] = [
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
  item: ClassificationFamily,
  record: OccurrenceRecord,
): LessonForm {
  const old = record.lesson.forms[0];
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning || record.word.gloss || record.word.arabic,
    difference:
      `Current Qur’anic occurrence at ${record.location}; this exact surface form is always first. ${old?.difference ?? ""}`.trim(),
    relationship: `Current occurrence of the ${item.root} hamzated family; comparison rows show genuine same-root morphology and honest semantic development.`,
    provenance: `Tier-C3-C2 hamzated-root adjudication ${reviewedAt}; canonical occurrence, existing lesson, root, lemma and aligned morphology evidence inspected.`,
  };
}

function candidateRow(
  candidate: C3C2Candidate,
  root: string,
  location: string,
): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}: ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${root}; this is not a shell-only, case-only or bare-radical row.`,
    provenance: `Tier-C3-C2 adjudication ${reviewedAt}; ${candidate.evidence}`,
  };
}

function markdown(report: {
  summary: Record<string, unknown>;
  adjudications: Adjudication[];
}) {
  const lines = [
    "# Tier-C3-C2 hamzated-root Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers exactly the 25 HAMZATED primary-track families / 32 Qur’anic occurrences. Doubled, weak, quadriliteral, root/lemma-uncertain, C3-D, C3-E and residual tracks were excluded. Hamza-seat spelling was not treated as a separate root or row.",
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
      `Hamza position: ${item.hamzaPosition}; secondary flags: ${item.secondaryMorphologyFlags.join(", ") || "none"}`,
      `Root normalization: ${item.rootNormalization ?? "project and evidence conventions agree"}`,
      "",
      item.reasoning,
      "",
      "Accepted candidates:",
      "",
      ...(item.acceptedCandidates.length
        ? item.acceptedCandidates.map(
            (x) =>
              `- ${x.form} — ${x.meaning}; ${x.morphology}; ${x.relationship}; semantic development: ${x.semanticDevelopment}; confidence: ${x.confidence}; pedagogical value: ${x.pedagogicalValue}; evidence: ${x.evidence}`,
          )
        : ["- None"]),
      "",
      "Candidates rejected / safeguards:",
      "",
      ...(item.rejectedCandidates.length
        ? item.rejectedCandidates.map((x) => `- ${x}`)
        : ["- None beyond the standard shell/case safeguards."]),
      "",
      `Unresolved question: ${item.unresolvedQuestion ?? "None"}`,
      `Evidence required: ${item.evidenceRequired.join("; ") || "None"}`,
      `Human expert review still required: ${item.humanExpertReviewRequired ? "yes" : "no"}`,
      "",
      "---",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function updateOwnership(ownership: Ownership) {
  ownership.reviewedAt = reviewedAt;
  ownership.pendingQueueCounts.HAMZATED = { families: 0, occurrences: 0 };
  ownership.hamzatedQueue = [];
  ownership.nextQueue = {
    track: "QUADRILITERAL",
    families: 22,
    occurrences: 27,
    status: "not-started",
  };
  ownership.status =
    "C3-C2 HAMZATED complete; QUADRILITERAL remains queued and untouched";
  return ownership;
}

function updatePlan(
  plan: Record<string, unknown>,
  ownership: Ownership,
  summary: Record<string, unknown>,
) {
  plan.reviewedAt = reviewedAt;
  plan.status = "C3-C2 HAMZATED complete; C3-C3 QUADRILITERAL not started";
  plan.completedTrack = {
    track: "HAMZATED",
    families: 25,
    occurrences: 32,
    decisions: summary.decisions,
    occurrencesByDecision: summary.occurrencesByDecision,
  };
  plan.nextTrack = {
    track: "QUADRILITERAL",
    families: 22,
    occurrences: 27,
    status: "not-started",
  };
  plan.ownership = ownership;
  return plan;
}

async function main() {
  const classificationReport = JSON.parse(
    await fs.readFile(classificationPath, "utf8"),
  ) as ClassificationReport;
  const ownership = JSON.parse(
    await fs.readFile(ownershipPath, "utf8"),
  ) as Ownership;
  const plan = JSON.parse(await fs.readFile(planPath, "utf8")) as Record<
    string,
    unknown
  >;
  if (ownership.hamzatedQueue.length !== 25)
    throw new Error(
      `HAMZATED ownership scope mismatch: ${ownership.hamzatedQueue.length}`,
    );
  const rows = classificationReport.families.filter(
    (row) =>
      row.proposedC3Group === "C3-C" &&
      row.morphologicalFlags?.includes("hamzated-root") &&
      !(row.c3C1 || row.c3C2),
  );
  if (rows.length !== 25)
    throw new Error(
      `C3-C2 scope mismatch: expected 25 unadjudicated hamzated families, found ${rows.length}`,
    );
  const occurrenceCount = rows.reduce(
    (sum, row) => sum + row.locations.length,
    0,
  );
  if (occurrenceCount !== 32)
    throw new Error(
      `C3-C2 occurrence mismatch: expected 32, found ${occurrenceCount}`,
    );
  if (C3C2_FAMILY_KEYS.length !== 25)
    throw new Error(`C3-C2 specification mismatch: ${C3C2_FAMILY_KEYS.length}`);
  const rowKeys = new Set(rows.map((row) => row.familyKey));
  for (const key of C3C2_FAMILY_KEYS) {
    if (!rowKeys.has(key)) throw new Error(`C3-C2 queue/spec mismatch: ${key}`);
    if (!C3C2_SPECS[key])
      throw new Error(`Missing C3-C2 specification for ${key}`);
  }

  const packages = new Map<string, PackageEntry>();
  const byLocation = new Map<string, OccurrenceRecord>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package)
      throw new Error(
        `Cannot read package ${filePath}: ${result.errors.join("; ")}`,
      );
    const entry = { filePath, package: result.package };
    packages.set(filePath, entry);
    for (const ayah of result.package.ayahs)
      for (const word of ayah.words) {
        if (!word.teachingId) continue;
        const lesson = result.package.teachingEntries[word.teachingId];
        if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
        byLocation.set(
          `${result.package.surah.number}:${ayah.number}:${word.position}`,
          {
            filePath,
            package: result.package,
            word,
            lesson,
            location: `${result.package.surah.number}:${ayah.number}:${word.position}`,
          },
        );
      }
  }

  const adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedFiles = new Set<string>();
  const changedSurahs = new Set<number>();
  const decisionCounts = Object.fromEntries(
    decisions.map((decision) => [decision, 0]),
  ) as Record<C3C2Decision, number>;
  const occurrenceCounts = Object.fromEntries(
    decisions.map((decision) => [decision, 0]),
  ) as Record<C3C2Decision, number>;

  for (const item of rows) {
    const spec = C3C2_SPECS[item.familyKey];
    const ownershipRow = ownership.hamzatedQueue.find(
      (queueItem) => queueItem.familyKey === item.familyKey,
    );
    if (!ownershipRow)
      throw new Error(`Ownership queue does not contain ${item.familyKey}`);
    const records = item.locations.map((location) => {
      const record = byLocation.get(location);
      if (!record)
        throw new Error(
          `Missing package occurrence ${location} for ${item.familyKey}`,
        );
      if (normalize(record.lesson.root) !== normalize(item.root))
        throw new Error(
          `Root mismatch at ${location}: ${record.lesson.root} != ${item.root}`,
        );
      return record;
    });
    const currentRows = records.map((record) => ({
      occurrenceId: record.word.id,
      location: record.location,
      arabic: record.word.arabic,
      forms: structuredClone(record.lesson.forms),
      sarfReview: structuredClone(record.lesson.sarfReview),
    }));
    const acceptedCandidates = spec.candidates.filter(
      (candidate) => candidate.accepted,
    );
    const rejectedCandidates = [
      ...spec.rejectedCandidates,
      ...spec.candidates
        .filter((candidate) => !candidate.accepted)
        .map(
          (candidate) =>
            `${candidate.form}: ${candidate.rejectionReason ?? "rejected"}`,
        ),
    ];
    const finalRows: CurrentRow[] = [];
    for (const record of records) {
      const current = currentRow(item, record);
      const forms: LessonForm[] = [current];
      const used = new Set([normalize(current.form)]);
      if (spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED") {
        for (const candidate of acceptedCandidates) {
          if (used.has(normalize(candidate.form)))
            throw new Error(
              `${item.familyKey} has duplicate accepted form ${candidate.form}`,
            );
          forms.push(candidateRow(candidate, item.root, record.location));
          used.add(normalize(candidate.form));
        }
        if (spec.decision === "FULL" && forms.length !== 5)
          throw new Error(
            `${item.familyKey} has ${forms.length} rows; FULL requires exactly five distinct rows`,
          );
        if (spec.decision === "CONFIRMED-LIMITED" && forms.length >= 5)
          throw new Error(
            `${item.familyKey} is limited but has ${forms.length} rows`,
          );
      }
      const review: SarfReview = {
        status: spec.decision === "FULL" ? "full" : "limited",
        ...(spec.decision === "FULL" ? {} : { limitedReason: spec.reason }),
        auditDecision:
          spec.decision === "FULL"
            ? "upgraded-to-full"
            : spec.decision === "CONFIRMED-LIMITED"
              ? "confirmed-limited"
              : "blocked-for-genuine-ambiguity",
        provenance: [
          `Tier-C3-C2 hamzated-root adjudication ${reviewedAt}: ${spec.decision}.`,
          `Hamza position: ${spec.hamzaPosition}.`,
          `Every occurrence of ${item.familyKey} was inspected: ${item.locations.join(", ")}.`,
          ...(spec.rootNormalization ? [spec.rootNormalization] : []),
          ...acceptedCandidates.map(
            (candidate) => `Accepted ${candidate.form}: ${candidate.evidence}`,
          ),
          ...rejectedCandidates,
          ...(spec.evidenceRequired ?? []),
        ].slice(0, 80),
        reviewedBy: "Codex",
        reviewedAt,
      };
      record.lesson.forms = forms;
      record.lesson.sarfReview = review;
      changedFiles.add(record.filePath);
      changedSurahs.add(record.package.surah.number);
      finalRows.push({
        occurrenceId: record.word.id,
        location: record.location,
        arabic: record.word.arabic,
        forms,
        sarfReview: review,
      });
    }
    const recordId = `tier-c3c2-family-${hash(item.familyKey)}`;
    const humanExpertReviewRequired =
      spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE";
    adjudications.push({
      familyKey: item.familyKey,
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      quranicWord: item.quranicWord,
      locations: item.locations,
      occurrenceCount: item.locations.length,
      hamzaPosition: spec.hamzaPosition,
      secondaryMorphologyFlags:
        item.morphologicalFlags?.filter((flag) => flag !== "hamzated-root") ??
        [],
      rootNormalization: spec.rootNormalization ?? null,
      currentRows,
      candidatesConsidered: spec.candidates,
      acceptedCandidates,
      rejectedCandidates,
      finalRows,
      decision: spec.decision,
      reasoning: spec.reason,
      evidence: [
        `Canonical Qur’anic occurrences inspected: ${item.locations.join(", ")}.`,
        `Hamza belongs to the ${spec.hamzaPosition}. Hamza-seat spelling was not treated as a separate root.`,
        ...(spec.rootNormalization ? [spec.rootNormalization] : []),
        ...acceptedCandidates.map((candidate) => candidate.evidence),
      ],
      confidence:
        spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE"
          ? "medium"
          : "high",
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
    occurrenceCounts[spec.decision] += item.locations.length;
    ledger.push({
      recordId,
      eventType: "tier-c3c2-hamzated-root-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        familyKey: item.familyKey,
        occurrences: records.map((record) => record.word.id),
        tier: "C3-C2",
        track: "HAMZATED",
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
        "c3c2-hamzated-scope-25-families",
        "c3c2-occurrence-scope-32",
        "every-occurrence-inspected",
        "current-form-first",
        "hamza-position-recorded",
        "hamza-seat-not-counted-as-root-change",
        "same-root-forms-reviewed",
        "shell-case-pronoun-and-padding-rejected",
        "semantic-development-translated-honestly",
        "root-normalization-disagreements-recorded",
        "provenance-recorded",
        "decision-recorded",
      ],
      evidence: [
        spec.reason,
        ...rejectedCandidates,
        ...(spec.evidenceRequired ?? []),
      ],
      decision: spec.decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      category: "C3-C2 hamzated root",
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
    manifest.contentVersion = `${String(manifest.contentVersion ?? "content")}-c3c2-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    manifest.status = entry.package.status;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  const existingAuditIds = new Set(
    readAuditRecords().map((record) => record.recordId),
  );
  appendAuditRecords(
    ledger.filter((record) => !existingAuditIds.has(record.recordId)),
  );
  const summary = {
    startingC3C2Families: 25,
    startingC3C2Occurrences: 32,
    adjudicatedFamilies: adjudications.length,
    adjudicatedOccurrences: occurrenceCount,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    changedSurahs: [...changedSurahs].sort((a, b) => a - b),
    changedPackageFiles: [...changedFiles].sort(),
    excluded: [
      "C3-C1 doubled (closed)",
      "C3-C3 quadriliteral",
      "C3-C4 weak",
      "C3-C5 root/lemma uncertain",
      "C3-D",
      "C3-E",
      "C2 residuals",
      "historical residuals",
    ],
  };
  await fs.writeFile(
    reportPath,
    `${JSON.stringify({ reportType: "tier-c3c2-sarf-adjudication", contractVersion: contract.contractVersion, reviewedAt, summary, adjudications }, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    markdownPath,
    markdown({ summary, adjudications }),
    "utf8",
  );

  for (const row of classificationReport.families) {
    const adjudication = adjudications.find(
      (item) => item.familyKey === row.familyKey,
    );
    if (!adjudication) continue;
    row.c3C2 = {
      track: "HAMZATED",
      decision: adjudication.decision,
      occurrences: adjudication.occurrenceCount,
      reviewedAt,
      recordId: adjudication.recordId,
      acceptedRowsPerOccurrence: adjudication.finalRows[0]?.forms.length ?? 0,
      hamzaPosition: adjudication.hamzaPosition,
      secondaryMorphologyFlags: adjudication.secondaryMorphologyFlags,
      rootNormalization: adjudication.rootNormalization,
    };
  }
  classificationReport.tierC3C2 = {
    contractVersion: contract.contractVersion,
    reviewedAt,
    scopeFamilies: 25,
    scopeOccurrences: 32,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    explicitBoundary:
      "Only HAMZATED primary-track families were adjudicated. Secondary weak/doubled flags remain metadata and do not create a second queue entry.",
  };
  await fs.writeFile(
    classificationPath,
    `${JSON.stringify(classificationReport, null, 2)}\n`,
    "utf8",
  );
  const classificationLines = [
    "# Tier-C LOW classification",
    "",
    `Generated: ${reviewedAt}`,
    "",
    "C3-C2 hamzated-root adjudication covers exactly 25 families / 32 occurrences. C3-C3 and later tracks were not started.",
    "",
    "## C3-C2 summary",
    "",
    "```json",
    JSON.stringify(classificationReport.tierC3C2, null, 2),
    "```",
    "",
    "## Families",
    "",
    "| Family | Word | Root | Group | Occurrences | Decision | Primary track |",
    "|---|---|---|---|---:|---|---|",
  ];
  for (const row of classificationReport.families) {
    const c3c2 = row.c3C2 as { decision?: string; track?: string } | undefined;
    classificationLines.push(
      `| ${row.familyKey} | ${row.quranicWord} | ${row.root || "—"} | ${row.proposedC3Group ?? "—"} | ${row.occurrenceCount} | ${c3c2?.decision ?? "—"} | ${c3c2?.track ?? "—"} |`,
    );
  }
  await fs.writeFile(
    classificationMarkdownPath,
    `${classificationLines.join("\n")}\n`,
    "utf8",
  );

  const updatedOwnership = updateOwnership(ownership);
  await fs.writeFile(
    ownershipPath,
    `${JSON.stringify(updatedOwnership, null, 2)}\n`,
    "utf8",
  );
  const ownershipLines = [
    "# Tier-C-C primary-track ownership",
    "",
    `Reviewed at: ${reviewedAt}`,
    "",
    `${updatedOwnership.rule}`,
    "",
    "C3-C2 HAMZATED is complete. Secondary weak/doubled flags remain attached to the adjudication records and cannot requeue a completed family. QUADRILITERAL is the next untouched primary track.",
    "",
    "```json",
    JSON.stringify(
      {
        primaryTrackCounts: updatedOwnership.primaryTrackCounts,
        pendingQueueCounts: updatedOwnership.pendingQueueCounts,
        nextQueue: updatedOwnership.nextQueue,
      },
      null,
      2,
    ),
    "```",
    "",
  ];
  await fs.writeFile(
    ownershipMarkdownPath,
    `${ownershipLines.join("\n")}\n`,
    "utf8",
  );

  const updatedPlan = updatePlan(plan, updatedOwnership, summary);
  await fs.writeFile(
    planPath,
    `${JSON.stringify(updatedPlan, null, 2)}\n`,
    "utf8",
  );
  const planLines = [
    "# Tier-C-C execution plan",
    "",
    `Updated: ${reviewedAt}`,
    "",
    "C3-C2 HAMZATED is complete. C3-C3 QUADRILITERAL has not started.",
    "",
    "## Completed C3-C2",
    "",
    "```json",
    JSON.stringify(updatedPlan.completedTrack, null, 2),
    "```",
    "",
    "## Next untouched queue",
    "",
    "QUADRILITERAL — 22 families / 27 occurrences.",
    "",
    "No quadriliteral adjudication was performed by this script.",
    "",
  ];
  await fs.writeFile(planMarkdownPath, `${planLines.join("\n")}\n`, "utf8");
  console.log(
    JSON.stringify(
      { ...summary, reportPath, markdownPath, ownershipPath, planPath },
      null,
      2,
    ),
  );
}

await main();
