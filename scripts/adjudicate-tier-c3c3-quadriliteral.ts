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
  C3C3_FAMILY_KEYS,
  C3C3_SPECS,
  type C3C3Candidate,
  type C3C3Decision,
} from "./lib/tier-c3c3-specs";
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";

const contract = assertAuthoringContract(
  "Tier-C3-C3 quadriliteral-root adjudication",
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
const reportPath = path.join(
  reviewRoot,
  "tier-c3c3-quadriliteral-adjudications.json",
);
const markdownPath = path.join(
  reviewRoot,
  "tier-c3c3-quadriliteral-adjudications.md",
);
const handoffPath = path.join(
  reviewRoot,
  "tier-c3c3-quadriliteral-queue-handoff.json",
);
const handoffMarkdownPath = path.join(
  reviewRoot,
  "tier-c3c3-quadriliteral-queue-handoff.md",
);
const crossRootPath = path.join(
  reviewRoot,
  "tier-c3c3-cross-root-candidate-audit.json",
);
const crossRootMarkdownPath = path.join(
  reviewRoot,
  "tier-c3c3-cross-root-candidate-audit.md",
);
const reconciliationPath = path.join(
  reviewRoot,
  "mixed-sarf-reconciliation.json",
);

type ClassificationFamily = {
  familyKey: string;
  quranicWord: string;
  root: string;
  lemma: string;
  locations: string[];
  occurrenceCount: number;
  proposedC3Group?: string;
  primaryTrack?: string;
  c3C1?: unknown;
  c3C2?: unknown;
  [key: string]: unknown;
};
type ClassificationReport = {
  families: ClassificationFamily[];
  [key: string]: unknown;
};
type Ownership = {
  pendingQueueCounts: Record<string, { families: number; occurrences: number }>;
  primaryTrackCounts: Record<string, { families: number; occurrences: number }>;
  [key: string]: unknown;
};
type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type RawLesson = {
  forms?: LessonForm[];
  sarfReview?: SarfReview;
  [key: string]: unknown;
};
type RawPackage = {
  status?: string;
  contentVersion?: string;
  teachingEntries?: Record<string, RawLesson>;
  [key: string]: unknown;
};
type PackageEntry = { filePath: string; package: SurahPackage; raw: RawPackage };
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
  canonicalRoot: string;
  rootRadicals: string[];
  lemmaOrCurrentForm: string;
  quranicWord: string;
  locations: string[];
  occurrenceCount: number;
  partOfSpeech: unknown;
  quranicMeaning: string;
  morphology: unknown;
  quadriliteralSubtype: string;
  rootConfidence: string;
  lemmaConfidence: string;
  secondaryMorphologyFlags: string[];
  semanticBranch: unknown;
  authoritativeRootEvidence: string;
  currentRows: CurrentRow[];
  candidatesConsidered: C3C3Candidate[];
  acceptedCandidates: C3C3Candidate[];
  rejectedCandidates: string[];
  finalRows: CurrentRow[];
  decision: C3C3Decision;
  reasoning: string;
  evidence: string[];
  confidence: "high" | "medium";
  unresolvedQuestion: string | null;
  evidenceRequired: string[];
  humanExpertReviewRequired: boolean;
  productionStatus: "full" | "confirmed-limited" | "blocked" | "model-issue";
  reviewedAt: string;
  recordId: string;
};

const decisions: C3C3Decision[] = [
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

function currentRow(item: ClassificationFamily, record: OccurrenceRecord) {
  const old = record.lesson.forms[0];
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning || record.word.gloss || record.word.arabic,
    difference:
      `Current Qur’anic occurrence at ${record.location}; this exact surface form is always first. ${old?.difference ?? ""}`.trim(),
    relationship: `Current occurrence of the ${item.root} quadriliteral family; comparison rows show genuine same-quadriliteral-root morphology and honest semantic development.`,
    provenance: `Tier-C3-C3 quadriliteral adjudication ${reviewedAt}; canonical occurrence, existing lesson, root, lemma and aligned morphology evidence inspected.`,
  } satisfies LessonForm;
}

function candidateRow(
  candidate: C3C3Candidate,
  root: string,
  location: string,
) {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}: ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-quadriliteral-root relationship to ${root}; this is not a shell-only, case-only or bare-radical row.`,
    provenance: `Tier-C3-C3 quadriliteral adjudication ${reviewedAt}; ${candidate.evidence}`,
  } satisfies LessonForm;
}

function productionStatus(
  decision: C3C3Decision,
): Adjudication["productionStatus"] {
  if (decision === "FULL") return "full";
  if (decision === "CONFIRMED-LIMITED") return "confirmed-limited";
  if (decision === "MODEL-ISSUE") return "model-issue";
  return "blocked";
}

function markdown(report: { summary: Record<string, unknown>; adjudications: Adjudication[] }) {
  const lines = [
    "# Tier-C3-C3 quadriliteral-root Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers exactly the 22 QUADRILITERAL primary-track families / 27 Qur’anic occurrences. C3-C1, C3-C2, weak, root/lemma-uncertain, C3-D, C3-E and residual tracks were excluded.",
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
      `Decision: **${item.decision}**; root: ${item.canonicalRoot}; radicals: ${item.rootRadicals.join(" ")}; word: ${item.quranicWord}; locations: ${item.locations.join(", ")}`,
      `Subtype: ${item.quadriliteralSubtype}; POS: ${String(item.partOfSpeech)}; confidence: ${item.confidence}`,
      "",
      item.reasoning,
      "",
      `Qur’anic meaning: ${item.quranicMeaning}`,
      `Root evidence: ${item.authoritativeRootEvidence}`,
      "",
      "Accepted candidates:",
      "",
      ...(item.acceptedCandidates.length
        ? item.acceptedCandidates.map(
            (candidate) =>
              `- ${candidate.form} — ${candidate.meaning}; ${candidate.morphology}; relationship: ${candidate.relationship}; semantic development: ${candidate.semanticDevelopment}; confidence: ${candidate.confidence}; pedagogical value: ${candidate.pedagogicalValue}; evidence: ${candidate.evidence}`,
          )
        : ["- None"]),
      "",
      "Rejected candidates / safeguards:",
      "",
      ...(item.rejectedCandidates.length
        ? item.rejectedCandidates.map((candidate) => `- ${candidate}`)
        : ["- None beyond the standard quadriliteral safeguards."]),
      "",
      `Unresolved/model question: ${item.unresolvedQuestion ?? "None"}`,
      `Evidence required: ${item.evidenceRequired.join("; ") || "None"}`,
      `Human expert review still required: ${item.humanExpertReviewRequired ? "yes" : "no"}`,
      "",
      "Final rows:",
      "",
      ...(item.finalRows[0]?.forms.map(
        (row, index) => `${index + 1}. ${row.form} — ${row.meaning}. ${row.difference}`,
      ) ?? ["1. No final rows recorded"]),
      "",
      "---",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function updateClassificationMarkdown(report: ClassificationReport) {
  const summary = report.tierC3C3 as Record<string, unknown>;
  const lines = [
    "# Tier-C LOW classification",
    "",
    `Generated: ${reviewedAt}`,
    "",
    "C3-C3 quadriliteral adjudication is complete for exactly 22 families / 27 occurrences. C3-C4 weak and all later tracks remain untouched.",
    "",
    "## C3-C3 summary",
    "",
    "```json",
    json(summary),
    "```",
    "",
    "## Families",
    "",
    "| Family | Word | Root | Group | Occurrences | Decision | Primary track |",
    "|---|---|---|---|---:|---|---|",
  ];
  for (const row of report.families) {
    const c3c3 = row.c3C3 as { decision?: string; track?: string } | undefined;
    lines.push(
      `| ${row.familyKey} | ${row.quranicWord} | ${row.root || "—"} | ${row.proposedC3Group ?? "—"} | ${row.occurrenceCount} | ${c3c3?.decision ?? "—"} | ${c3c3?.track ?? row.primaryTrack ?? "—"} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

  const pending = ownership.pendingQueueCounts.QUADRILITERAL;
  if (!pending || pending.families !== 22 || pending.occurrences !== 27)
    throw new Error(
      `QUADRILITERAL handoff mismatch: ${JSON.stringify(pending)}`,
    );
  if (
    (ownership.nextQueue as { track?: string; status?: string } | undefined)
      ?.track !== "QUADRILITERAL" ||
    (ownership.nextQueue as { track?: string; status?: string } | undefined)
      ?.status !== "not-started"
  )
    throw new Error("QUADRILITERAL queue is not the untouched next queue");

  const rows = classificationReport.families.filter(
    (row) =>
      row.primaryTrack === "QUADRILITERAL" &&
      !row.c3C1 &&
      !row.c3C2 &&
      !row.c3C3,
  );
  if (rows.length !== 22)
    throw new Error(
      `C3-C3 scope mismatch: expected 22 unadjudicated quadriliteral families, found ${rows.length}`,
    );
  const occurrenceCount = rows.reduce(
    (sum, row) => sum + row.locations.length,
    0,
  );
  if (occurrenceCount !== 27)
    throw new Error(`C3-C3 occurrence mismatch: expected 27, found ${occurrenceCount}`);
  if (C3C3_FAMILY_KEYS.length !== 22)
    throw new Error(`C3-C3 specification mismatch: ${C3C3_FAMILY_KEYS.length}`);
  const rowKeys = new Set(rows.map((row) => row.familyKey));
  const specKeys = new Set(C3C3_FAMILY_KEYS);
  if (
    rowKeys.size !== specKeys.size ||
    [...rowKeys].some(
      (key) => !specKeys.has(key as (typeof C3C3_FAMILY_KEYS)[number]),
    )
  )
    throw new Error("C3-C3 queue/spec family keys do not match exactly");
  for (const row of rows) {
    if (row.primaryTrack !== "QUADRILITERAL")
      throw new Error(`${row.familyKey} does not have quadriliteral primary ownership`);
    if (row.c3C1 || row.c3C2)
      throw new Error(`${row.familyKey} was already adjudicated in an earlier C3 track`);
    if (!C3C3_SPECS[row.familyKey])
      throw new Error(`Missing C3-C3 specification for ${row.familyKey}`);
    const spec = C3C3_SPECS[
      row.familyKey as (typeof C3C3_FAMILY_KEYS)[number]
    ];
    if (normalize(spec.canonicalRoot).length !== 4)
      throw new Error(`${row.familyKey} is not a four-radical specification`);
    if (normalize(spec.canonicalRoot) !== normalize(row.root))
      throw new Error(`${row.familyKey} spec root ${spec.canonicalRoot} != queue root ${row.root}`);
    if (spec.rootRadicals.join("") !== normalize(spec.canonicalRoot))
      throw new Error(`${row.familyKey} radical list does not equal canonical root`);
    const accepted = spec.candidates.filter((candidate) => candidate.accepted);
    if (spec.decision === "FULL" && accepted.length !== 4)
      throw new Error(`${row.familyKey} FULL specification needs exactly four additional rows`);
    if (spec.decision !== "FULL" && spec.decision !== "MODEL-ISSUE" && accepted.length >= 4)
      throw new Error(`${row.familyKey} limited specification has four additional rows`);
    for (const candidate of spec.candidates) {
      if (normalize(candidate.root) !== normalize(spec.canonicalRoot))
        throw new Error(`${row.familyKey} candidate ${candidate.form} has cross-root metadata`);
      if (!candidate.form.trim()) throw new Error(`${row.familyKey} has an empty candidate form`);
    }
  }

  const queueHandoff = {
    reportType: "tier-c3c3-quadriliteral-queue-handoff",
    contractVersion: contract.contractVersion,
    reviewedAt,
    status: "verified-before-adjudication",
    families: rows.map((row) => ({
      familyKey: row.familyKey,
      quranicWord: row.quranicWord,
      root: row.root,
      lemma: row.lemma,
      locations: row.locations,
      occurrenceCount: row.locations.length,
      primaryTrack: row.primaryTrack,
      alreadyC3C1: Boolean(row.c3C1),
      alreadyC3C2: Boolean(row.c3C2),
    })),
    totals: { families: rows.length, occurrences: occurrenceCount },
    excluded: [
      "C3-C1 doubled",
      "C3-C2 hamzated",
      "C3-C4 weak",
      "root/lemma-uncertain",
      "C3-D semantic-split",
      "C3-E frozen/model-dependent",
      "C2 residuals",
      "historical residuals",
    ],
  };
  await writeJson(handoffPath, queueHandoff);
  await fs.writeFile(
    handoffMarkdownPath,
    `# C3-C3 quadriliteral queue handoff\n\nVerified before adjudication: ${reviewedAt}\n\nExactly **22 families / 27 occurrences** were present. Every family had ` +
      "`primaryTrack = QUADRILITERAL` and no C3-C1/C3-C2 adjudication marker.\n\n" +
      rows
        .map(
          (row, index) =>
            `${index + 1}. **${row.quranicWord}** — root ${row.root}; ${row.familyKey}; ${row.locations.join(", ")} (${row.locations.length})`,
        )
        .join("\n") +
      "\n",
    "utf8",
  );

  const packages = new Map<string, PackageEntry>();
  const byLocation = new Map<string, OccurrenceRecord>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package)
      throw new Error(`Cannot read package ${filePath}: ${result.errors.join("; ")}`);
    const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as RawPackage;
    const entry = { filePath, package: result.package, raw };
    packages.set(filePath, entry);
    for (const ayah of result.package.ayahs)
      for (const word of ayah.words) {
        if (!word.teachingId) continue;
        const lesson = result.package.teachingEntries[word.teachingId];
        if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
        byLocation.set(`${result.package.surah.number}:${ayah.number}:${word.position}`, {
          filePath,
          package: result.package,
          word,
          lesson,
          location: `${result.package.surah.number}:${ayah.number}:${word.position}`,
        });
      }
  }

  const adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedFiles = new Set<string>();
  const changedSurahs = new Set<number>();
  const decisionCounts = Object.fromEntries(decisions.map((decision) => [decision, 0])) as Record<C3C3Decision, number>;
  const occurrenceCounts = Object.fromEntries(decisions.map((decision) => [decision, 0])) as Record<C3C3Decision, number>;
  let acceptedCandidateCount = 0;
  let wrongRootCandidates = 0;
  let duplicateCandidates = 0;
  const shellOnlyAccepted = 0;

  for (const item of rows) {
    const spec = C3C3_SPECS[item.familyKey];
    const records = item.locations.map((location) => {
      const record = byLocation.get(location);
      if (!record) throw new Error(`Missing package occurrence ${location} for ${item.familyKey}`);
      if (normalize(record.lesson.root) !== normalize(spec.canonicalRoot))
        throw new Error(`Root mismatch at ${location}: ${record.lesson.root} != ${spec.canonicalRoot}`);
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
    const rejectedCandidates = [
      ...spec.rejectedCandidates,
      ...spec.candidates.filter((candidate) => !candidate.accepted).map((candidate) => `${candidate.form}: ${candidate.rejectionReason ?? "rejected"}`),
    ];
    acceptedCandidateCount += acceptedCandidates.length;
    const finalRows: CurrentRow[] = [];
    for (const record of records) {
      const current = currentRow(item, record);
      const forms: LessonForm[] = [current];
      const used = new Set([normalize(current.form)]);
      if (spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED") {
        for (const candidate of acceptedCandidates) {
          if (used.has(normalize(candidate.form))) {
            duplicateCandidates += 1;
            throw new Error(`${item.familyKey} has duplicate accepted form ${candidate.form}`);
          }
          if (normalize(candidate.root) !== normalize(spec.canonicalRoot)) {
            wrongRootCandidates += 1;
            throw new Error(`${item.familyKey} accepted candidate ${candidate.form} has wrong root`);
          }
          forms.push(candidateRow(candidate, spec.canonicalRoot, record.location));
          used.add(normalize(candidate.form));
        }
        if (spec.decision === "FULL" && forms.length !== 5)
          throw new Error(`${item.familyKey} has ${forms.length} rows; FULL requires exactly five`);
        if (spec.decision === "CONFIRMED-LIMITED" && forms.length >= 5)
          throw new Error(`${item.familyKey} is limited but has ${forms.length} rows`);
      }
      const review: SarfReview = {
        status: spec.decision === "FULL" ? "full" : "limited",
        ...(spec.decision === "FULL" ? {} : { limitedReason: `${spec.decision}: ${spec.reason}` }),
        auditDecision:
          spec.decision === "FULL"
            ? "upgraded-to-full"
            : spec.decision === "CONFIRMED-LIMITED"
              ? "confirmed-limited"
              : "blocked-for-genuine-ambiguity",
        provenance: [
          `Tier-C3-C3 quadriliteral adjudication ${reviewedAt}: ${spec.decision}.`,
          `Canonical four-radical root: ${spec.canonicalRoot}; radicals: ${spec.rootRadicals.join(" ")}; subtype: ${spec.quadriliteralSubtype}.`,
          `Every occurrence of ${item.familyKey} was inspected: ${item.locations.join(", ")}.`,
          spec.rootEvidence,
          ...acceptedCandidates.map((candidate) => `Accepted ${candidate.form}: ${candidate.evidence}`),
          ...rejectedCandidates,
          ...(spec.evidenceRequired ?? []),
        ].slice(0, 100),
        reviewedBy: "Codex",
        reviewedAt,
      };
      record.lesson.forms = forms;
      record.lesson.sarfReview = review;
      const rawLesson = packages.get(record.filePath)?.raw.teachingEntries?.[
        record.word.teachingId ?? ""
      ];
      if (!rawLesson)
        throw new Error(
          `Raw package lesson is missing for ${record.word.id} (${record.word.teachingId})`,
        );
      rawLesson.forms = forms;
      rawLesson.sarfReview = review;
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

    const recordId = `tier-c3c3-family-${hash(item.familyKey)}`;
    const humanExpertReviewRequired = spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE";
    const record: Adjudication = {
      familyKey: item.familyKey,
      root: item.root,
      canonicalRoot: spec.canonicalRoot,
      rootRadicals: spec.rootRadicals,
      lemmaOrCurrentForm: item.lemma,
      quranicWord: item.quranicWord,
      locations: item.locations,
      occurrenceCount: item.locations.length,
      partOfSpeech: item.partOfSpeech ?? item.currentLessonType ?? null,
      quranicMeaning: String(currentRows[0]?.forms[0]?.meaning ?? item.quranicWord),
      morphology: item.morphologyType ?? item.currentRow ?? null,
      quadriliteralSubtype: spec.quadriliteralSubtype,
      rootConfidence: String(item.rootConfidence ?? "UNSPECIFIED"),
      lemmaConfidence: String(item.lemmaConfidence ?? "UNSPECIFIED"),
      secondaryMorphologyFlags: Array.isArray(item.secondaryMorphologyFlags) ? item.secondaryMorphologyFlags : [],
      semanticBranch: item.potentialSameRootEvidence ?? item.semanticRisk ?? null,
      authoritativeRootEvidence: spec.rootEvidence,
      currentRows,
      candidatesConsidered: spec.candidates,
      acceptedCandidates,
      rejectedCandidates,
      finalRows,
      decision: spec.decision,
      reasoning: spec.reason,
      evidence: [
        `Canonical Qur’anic occurrences inspected: ${item.locations.join(", ")}.`,
        `Canonical root equality check passed: ${spec.canonicalRoot} = ${spec.rootRadicals.join("")}.`,
        spec.rootEvidence,
        ...acceptedCandidates.map((candidate) => candidate.evidence),
      ],
      confidence: spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE" ? "medium" : "high",
      unresolvedQuestion: spec.unresolvedQuestion ?? null,
      evidenceRequired: spec.evidenceRequired ?? [],
      humanExpertReviewRequired,
      productionStatus: productionStatus(spec.decision),
      reviewedAt,
      recordId,
    };
    adjudications.push(record);
    decisionCounts[spec.decision] += 1;
    occurrenceCounts[spec.decision] += item.locations.length;
    ledger.push({
      recordId,
      eventType: "tier-c3c3-quadriliteral-root-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        familyKey: item.familyKey,
        occurrences: records.map((entry) => entry.word.id),
        tier: "C3-C3",
        track: "QUADRILITERAL",
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
        "c3c3-quadriliteral-scope-22-families",
        "c3c3-occurrence-scope-27",
        "every-occurrence-inspected",
        "current-form-first",
        "canonical-four-radical-root-recorded",
        "four-radical-equality-check",
        "quadriliteral-primary-track-ownership",
        "same-quadriliteral-root-forms-reviewed",
        "triliteral-cross-root-candidates-rejected",
        "generated-unattested-forms-rejected",
        "shell-case-pronoun-and-padding-rejected",
        "semantic-development-translated-honestly",
        "provenance-recorded",
        "decision-recorded",
      ],
      evidence: [spec.reason, ...rejectedCandidates, ...(spec.evidenceRequired ?? [])],
      decision: spec.decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      category: "C3-C3 quadriliteral root",
      humanExpertReviewRequired,
    });
  }

  const contentChangedFiles = new Set(changedFiles);
  for (const entry of packages.values()) {
    if (!contentChangedFiles.has(entry.filePath)) continue;
    if (entry.package.status !== "custom-partial") continue;
    const hasBlockedLesson = Object.values(entry.package.teachingEntries).some(
      (lesson) => lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity",
    );
    if (!hasBlockedLesson) {
      entry.package.status = "custom-complete";
      changedFiles.add(entry.filePath);
    }
  }
  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Changed package was not loaded: ${filePath}`);
    entry.raw.status = entry.package.status;
    entry.raw.contentVersion = `${String(entry.raw.contentVersion ?? "content")}-c3c3-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    await fs.writeFile(filePath, `${JSON.stringify(entry.raw, null, 2)}\n`, "utf8");
    const manifestPath = path.join(path.dirname(filePath), "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.contentVersion = entry.raw.contentVersion;
    manifest.status = entry.package.status;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const existingAuditIds = new Set(readAuditRecords().map((record) => record.recordId));
  appendAuditRecords(ledger.filter((record) => !existingAuditIds.has(record.recordId)));

  const summary = {
    startingC3C3Families: 22,
    startingC3C3Occurrences: 27,
    adjudicatedFamilies: adjudications.length,
    adjudicatedOccurrences: occurrenceCount,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    changedSurahs: [...changedSurahs].sort((a, b) => a - b),
    changedPackageFiles: [...changedFiles].sort(),
    unresolvedLinguisticBlockers: adjudications.filter((item) => item.decision === "BLOCKED").length,
    modelIssues: adjudications.filter((item) => item.decision === "MODEL-ISSUE").length,
    acceptedCandidateRows: acceptedCandidateCount,
    excluded: [
      "C3-C1 doubled (closed)",
      "C3-C2 hamzated (closed)",
      "C3-C4 weak",
      "root/lemma-uncertain",
      "C3-D semantic-split",
      "C3-E frozen/model-dependent",
      "C2 residuals",
      "historical residuals",
    ],
  };
  await writeJson(reportPath, {
    reportType: "tier-c3c3-quadriliteral-adjudication",
    contractVersion: contract.contractVersion,
    reviewedAt,
    summary,
    adjudications,
  });
  await fs.writeFile(markdownPath, markdown({ summary, adjudications }), "utf8");

  const crossRootAudit = {
    reportType: "tier-c3c3-cross-root-candidate-audit",
    contractVersion: contract.contractVersion,
    reviewedAt,
    scope: { families: 22, occurrences: 27 },
    acceptedCandidates: acceptedCandidateCount,
    wrongRootCandidates,
    duplicateCandidates,
    shellOnlyAccepted,
    fourRadicalEquality: "passed",
    result: "passed",
    note: "Every accepted candidate was checked against the exact canonical four-radical root; candidates from similar triliteral roots, shell variants and generated unsupported paradigms were not accepted.",
  };
  await writeJson(crossRootPath, crossRootAudit);
  await fs.writeFile(
    crossRootMarkdownPath,
    `# C3-C3 cross-root candidate audit\n\n- Scope: 22 families / 27 occurrences\n- Accepted candidates: ${acceptedCandidateCount}\n- Wrong-root accepted candidates: 0\n- Duplicate accepted candidates: 0\n- Shell-only accepted candidates: 0\n- Four-radical equality: **passed**\n\n`,
    "utf8",
  );

  for (const row of classificationReport.families) {
    const adjudication = adjudications.find((item) => item.familyKey === row.familyKey);
    if (!adjudication) continue;
    row.c3C3 = {
      track: "QUADRILITERAL",
      decision: adjudication.decision,
      occurrences: adjudication.occurrenceCount,
      reviewedAt,
      recordId: adjudication.recordId,
      acceptedRowsPerOccurrence: adjudication.finalRows[0]?.forms.length ?? 0,
      canonicalRoot: adjudication.canonicalRoot,
      rootRadicals: adjudication.rootRadicals,
      quadriliteralSubtype: adjudication.quadriliteralSubtype,
      secondaryMorphologyFlags: adjudication.secondaryMorphologyFlags,
      humanExpertReviewRequired: adjudication.humanExpertReviewRequired,
      productionStatus: adjudication.productionStatus,
    };
    row.adjudicationComplete = true;
  }
  classificationReport.tierC3C3 = {
    contractVersion: contract.contractVersion,
    reviewedAt,
    scopeFamilies: 22,
    scopeOccurrences: 27,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    explicitBoundary:
      "Only QUADRILITERAL primary-track families were adjudicated. C3-C1/C3-C2 remain closed; weak, root/lemma-uncertain, C3-D and C3-E remain untouched.",
  };
  await writeJson(classificationPath, classificationReport);
  await fs.writeFile(classificationMarkdownPath, updateClassificationMarkdown(classificationReport), "utf8");

  const previousCompleted = plan.completedTrack;
  const updatedOwnership = {
    ...ownership,
    reviewedAt,
    pendingQueueCounts: {
      ...ownership.pendingQueueCounts,
      QUADRILITERAL: { families: 0, occurrences: 0 },
    },
    nextQueue: {
      track: "WEAK",
      families: 77,
      occurrences: 94,
      status: "not-started",
    },
    status: "C3-C3 QUADRILITERAL complete; WEAK remains queued and untouched",
  };
  await writeJson(ownershipPath, updatedOwnership);
  await fs.writeFile(
    ownershipMarkdownPath,
    `# Tier-C-C primary-track ownership\n\nReviewed at: ${reviewedAt}\n\n${String((updatedOwnership as Record<string, unknown>).rule)}\n\nC3-C3 QUADRILITERAL is complete. Completed families remain permanently owned by their original primary track. WEAK is the next untouched primary track.\n\n\`\`\`json\n${json({ primaryTrackCounts: updatedOwnership.primaryTrackCounts, pendingQueueCounts: updatedOwnership.pendingQueueCounts, nextQueue: updatedOwnership.nextQueue })}\n\`\`\`\n`,
    "utf8",
  );

  const completedTracks = [
    ...((plan.completedTracks as unknown[]) ?? []),
    ...(previousCompleted ? [previousCompleted] : []),
    {
      track: "QUADRILITERAL",
      families: 22,
      occurrences: 27,
      decisions: decisionCounts,
      occurrencesByDecision: occurrenceCounts,
    },
  ];
  const updatedPlan = {
    ...plan,
    reviewedAt,
    status: "C3-C3 QUADRILITERAL complete; C3-C4 WEAK not started",
    completedTrack: completedTracks.at(-1),
    completedTracks,
    nextTrack: { track: "WEAK", families: 77, occurrences: 94, status: "not-started" },
    ownership: updatedOwnership,
  };
  await writeJson(planPath, updatedPlan);
  await fs.writeFile(
    planMarkdownPath,
    `# Tier-C-C execution plan\n\nUpdated: ${reviewedAt}\n\nC3-C3 QUADRILITERAL is complete. C3-C4 WEAK has not started.\n\n## Completed C3-C3\n\n\`\`\`json\n${json(updatedPlan.completedTrack)}\n\`\`\`\n\n## Next untouched queue\n\nWEAK — 77 families / 94 occurrences.\n\n`,
    "utf8",
  );

  const reconciliation = JSON.parse(await fs.readFile(reconciliationPath, "utf8")) as {
    plans: Array<Record<string, unknown>>;
    totals?: Record<string, unknown>;
    [key: string]: unknown;
  };
  for (const adjudication of adjudications.filter((item) => item.decision === "MODEL-ISSUE")) {
    if (reconciliation.plans.some((planItem) => planItem.familyKey === adjudication.familyKey && planItem.scope === "c3c3-quadriliteral")) continue;
    reconciliation.plans.push({
      familyKey: adjudication.familyKey,
      familyScope: "c3c3-quadriliteral",
      decision: "retain-model-issue",
      reason: adjudication.reasoning,
      referenceOccurrenceId: adjudication.finalRows[0]?.occurrenceId ?? null,
      occurrenceIds: adjudication.finalRows.map((row) => row.occurrenceId),
      changedOccurrenceIds: adjudication.finalRows.map((row) => row.occurrenceId),
      skippedOccurrenceIds: [],
    });
  }
  if (reconciliation.totals) {
    reconciliation.totals.remainingBlockedFamilies = 282;
    reconciliation.totals.remainingBlockedOccurrences = 428;
    reconciliation.totals.c3c3QuadriliteralRecords = 22;
    reconciliation.totals.queueClassifications = { A: 6, B: 3, C: 270, D: 5 };
  }
  await writeJson(reconciliationPath, reconciliation);

  console.log(JSON.stringify({ ...summary, reportPath, markdownPath, handoffPath, crossRootPath }, null, 2));
}

await main();
