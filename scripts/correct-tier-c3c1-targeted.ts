import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { assertAuthoringContract } from "./lib/authoring-contract";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import { C3C1_SPECS, type C3C1Candidate } from "./lib/tier-c3c1-specs";
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";

const contract = assertAuthoringContract(
  "Targeted C3-C1 correction and ownership normalization",
);
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const reportPath = path.join(reviewRoot, "tier-c3c1-sarf-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c3c1-sarf-adjudications.md");
const classificationPath = path.join(
  reviewRoot,
  "tier-c3-low-classification.json",
);
const executionPlanPath = path.join(reviewRoot, "tier-c3c-execution-plan.json");
const executionPlanMarkdownPath = path.join(
  reviewRoot,
  "tier-c3c-execution-plan.md",
);
const ownershipPath = path.join(reviewRoot, "tier-c3c-ownership.json");
const ownershipMarkdownPath = path.join(reviewRoot, "tier-c3c-ownership.md");

const TARGETS = new Set([
  "lexical|أزز|از|noun/pronoun",
  "lexical|ذبب|ذباب|noun/pronoun",
  "lexical|زجج|زجاجة|noun/pronoun",
  "lexical|أدد|اد|noun/pronoun",
  "lexical|طلل|طل|noun/pronoun",
  "lexical|قطط|قط|noun/pronoun",
  "lexical|هدد|هد|noun/pronoun",
]);

const PROPAGATIONS = [
  { sourceFamilyKey: "lexical|ذبب|ذباب|noun/pronoun", locations: ["22:73:21"] },
  {
    sourceFamilyKey: "lexical|زجج|زجاجة|noun/pronoun",
    locations: ["24:35:13"],
  },
] as const;

type JsonRecord = Record<string, unknown>;
type ClassificationRow = JsonRecord & {
  familyKey: string;
  root: string;
  quranicWord: string;
  locations: string[];
  occurrenceCount: number;
  proposedC3Group?: string;
  morphologicalFlags?: string[];
  rootConfidence?: string;
  lemmaConfidence?: string;
  c3C1?: { track?: string; decision?: string; [key: string]: unknown };
};
type PackageEntry = { filePath: string; package: SurahPackage };
type Occurrence = {
  filePath: string;
  package: SurahPackage;
  word: SurahPackage["ayahs"][number]["words"][number];
  lesson: SurahPackage["teachingEntries"][string];
  location: string;
};
type Adjudication = JsonRecord & {
  familyKey: string;
  decision: string;
  locations: string[];
  occurrenceCount: number;
  finalRows: JsonRecord[];
  currentRows: JsonRecord[];
  acceptedCandidates: C3C1Candidate[];
  [key: string]: unknown;
};

const normalize = (value: string) =>
  value.normalize("NFC").replace(/[\s\u0640]/gu, "");
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const json = (value: unknown) => JSON.stringify(value, null, 2);

function currentForm(record: Occurrence): LessonForm {
  const old = record.lesson.forms[0];
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning || record.word.gloss || record.word.arabic,
    difference: `Current Qur’anic occurrence at ${record.location}; ${old?.difference ?? "the exact surface form is retained first."}`,
    relationship: `Current Qur’anic occurrence of the ${record.lesson.root} family; comparison rows show genuine same-root morphology and honest semantic development.`,
    provenance: `Targeted C3-C1 correction ${reviewedAt}; canonical occurrence, current lesson, root, lemma and aligned morphology evidence inspected.`,
  };
}

function candidateRow(
  candidate: C3C1Candidate,
  root: string,
  location: string,
): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}. Compared with the Qur’anic occurrence at ${location}. ${candidate.semanticDevelopment} ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${root}; this is not shell variation or a bare-radical row.`,
    provenance: `Targeted C3-C1 correction ${reviewedAt}; ${candidate.evidence}`,
  };
}

function formSnapshot(rows: JsonRecord[]) {
  return rows.map((row) => ({
    location: row.location,
    forms: (row.forms as LessonForm[]).map((form) => ({
      form: form.form,
      meaning: form.meaning,
    })),
    sarfReview: row.sarfReview,
  }));
}

function buildAdjudication(
  existing: Adjudication,
  record: Occurrence,
  spec: (typeof C3C1_SPECS)[string],
  recordId: string,
): Adjudication {
  const acceptedCandidates = spec.candidates.filter(
    (candidate) => candidate.accepted,
  );
  const forms: LessonForm[] = [currentForm(record)];
  const used = new Set([normalize(forms[0].form)]);
  for (const candidate of acceptedCandidates) {
    if (used.has(normalize(candidate.form)))
      throw new Error(
        `${existing.familyKey}: duplicate corrected form ${candidate.form}`,
      );
    forms.push(
      candidateRow(candidate, existing.root as string, existing.locations[0]),
    );
    used.add(normalize(candidate.form));
  }
  if (spec.decision === "FULL" && forms.length !== 5)
    throw new Error(
      `${existing.familyKey}: FULL correction has ${forms.length} rows`,
    );
  record.lesson.forms = forms;
  const review: SarfReview = {
    status: spec.decision === "FULL" ? "full" : "limited",
    ...(spec.decision === "FULL" ? {} : { limitedReason: spec.reason }),
    auditDecision:
      spec.decision === "FULL" ? "upgraded-to-full" : "confirmed-limited",
    provenance: [
      `Targeted C3-C1 correction ${reviewedAt}: ${spec.decision}.`,
      `The family was re-adjudicated because the previous decision or row required correction.`,
      ...acceptedCandidates.map(
        (candidate) => `Accepted ${candidate.form}: ${candidate.evidence}`,
      ),
      ...spec.rejectedCandidates,
    ].slice(0, 80),
    reviewedBy: "Codex",
    reviewedAt,
  };
  record.lesson.sarfReview = review;
  const finalRow = {
    occurrenceId: record.word.id,
    location: record.location,
    arabic: record.word.arabic,
    forms,
    sarfReview: review,
  };
  const currentRows = (existing.currentRows as JsonRecord[]).map((row) => row);
  return {
    ...existing,
    candidatesConsidered: spec.candidates,
    acceptedCandidates,
    rejectedCandidates: [
      ...spec.rejectedCandidates,
      ...spec.candidates
        .filter((candidate) => !candidate.accepted)
        .map(
          (candidate) =>
            `${candidate.form}: ${candidate.rejectionReason ?? "rejected"}`,
        ),
    ],
    finalRows: [finalRow],
    decision: spec.decision,
    reasoning: spec.reason,
    evidence: [
      `Canonical Qur’anic occurrence inspected: ${record.location}.`,
      "Root ownership, vocalisation, morphology, semantic development and shell/case/pronoun padding were independently checked.",
      ...acceptedCandidates.map((candidate) => candidate.evidence),
    ],
    confidence: "high",
    unresolvedQuestion: spec.unresolvedQuestion ?? null,
    evidenceRequired: spec.evidenceRequired ?? [],
    humanExpertReviewRequired: false,
    productionStatus: spec.decision === "FULL" ? "full" : "confirmed-limited",
    reviewedAt,
    recordId,
    currentRows,
  };
}

function applyPropagatedFamily(
  record: Occurrence,
  source: Adjudication,
  spec: (typeof C3C1_SPECS)[string],
) {
  const forms: LessonForm[] = [currentForm(record)];
  for (const candidate of spec.candidates.filter(
    (candidate) => candidate.accepted,
  ))
    forms.push(candidateRow(candidate, source.root as string, record.location));
  const review: SarfReview = {
    status: "full",
    auditDecision: "upgraded-to-full",
    provenance: [
      `Targeted C3-C1 correction ${reviewedAt}: FULL propagated from ${source.familyKey}.`,
      "The lexical family was split only by a grammatical shell variant; the approved same-root family is shared while the current Qur’anic surface form remains first.",
      ...spec.candidates
        .filter((candidate) => candidate.accepted)
        .map(
          (candidate) => `Accepted ${candidate.form}: ${candidate.evidence}`,
        ),
      ...spec.rejectedCandidates,
    ].slice(0, 80),
    reviewedBy: "Codex",
    reviewedAt,
  };
  record.lesson.forms = forms;
  record.lesson.sarfReview = review;
}

function renderMarkdown(report: {
  summary: JsonRecord;
  adjudications: Adjudication[];
}) {
  const lines = [
    "# Tier-C3-C1 doubled-root Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers the planning artifact’s DOUBLED track: 20 families / 30 occurrences. The two mixed hamzated+doubled families أثث and ألل remain owned by HAMZATED. The seven named families were re-adjudicated in the targeted correction pass.",
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
      `Original predicted resolvability: ${item.predictedResolvability}`,
      "",
      String(item.reasoning),
      "",
      "Accepted candidates:",
      "",
      ...(item.acceptedCandidates.length
        ? item.acceptedCandidates.map(
            (candidate) =>
              `- ${candidate.form} — ${candidate.meaning}; ${candidate.morphology}; ${candidate.relationship}; ${candidate.semanticDevelopment}; evidence: ${candidate.evidence}`,
          )
        : ["- None"]),
      "",
      "Candidates rejected / safeguards:",
      "",
      ...((item.rejectedCandidates as string[]) ?? []).map(
        (candidate) => `- ${candidate}`,
      ),
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

function rawFlagName(flag: string) {
  return (
    (
      {
        "doubled-root": "doubled",
        "hamzated-root": "hamzated",
        "weak-root": "weak",
        quadriliteral: "quadriliteral",
        "special/irregular": "special/irregular",
      } as Record<string, string>
    )[flag] ?? flag
  );
}

function primaryTrack(row: ClassificationRow) {
  if (row.c3C1?.track === "DOUBLED")
    return { track: "DOUBLED", basis: "completed-adjudication-lock" };
  if (row.rootConfidence !== "HIGH" || row.lemmaConfidence !== "HIGH")
    return {
      track: "ROOT/LEMMA-UNCERTAIN",
      basis: "root-or-lemma-confidence-not-high",
    };
  const flags = new Set(row.morphologicalFlags ?? []);
  if (flags.has("quadriliteral"))
    return { track: "QUADRILITERAL", basis: "deterministic-flag-precedence" };
  if (flags.has("hamzated-root"))
    return { track: "HAMZATED", basis: "deterministic-flag-precedence" };
  if (flags.has("weak-root"))
    return { track: "WEAK", basis: "deterministic-flag-precedence" };
  if (flags.has("doubled-root"))
    return { track: "DOUBLED", basis: "deterministic-flag-precedence" };
  return {
    track: "ROOT/LEMMA-UNCERTAIN",
    basis: "no-safe-specialist-track-signal",
  };
}

function ownershipFor(row: ClassificationRow) {
  const primary = primaryTrack(row);
  const secondaryMorphologyFlags = (row.morphologicalFlags ?? [])
    .map(rawFlagName)
    .filter((flag) => flag !== primary.track.toLowerCase());
  return {
    primaryTrack: primary.track,
    secondaryMorphologyFlags,
    ownershipBasis: primary.basis,
    adjudicationComplete: Boolean(row.c3C1),
  };
}

function counts(
  rows: ClassificationRow[],
  filter: (row: ClassificationRow) => boolean,
) {
  const selected = rows.filter(filter);
  return {
    families: selected.length,
    occurrences: selected.reduce((sum, row) => sum + row.occurrenceCount, 0),
  };
}

async function main() {
  const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
    summary: JsonRecord;
    adjudications: Adjudication[];
    [key: string]: unknown;
  };
  const classification = JSON.parse(
    await fs.readFile(classificationPath, "utf8"),
  ) as { families: ClassificationRow[]; [key: string]: unknown };
  const selected = report.adjudications.filter((item) =>
    TARGETS.has(item.familyKey),
  );
  if (selected.length !== 7)
    throw new Error(
      `Expected 7 targeted adjudications, found ${selected.length}`,
    );

  const packages = new Map<string, PackageEntry>();
  const byLocation = new Map<string, Occurrence>();
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
        if (!lesson) throw new Error(`Missing lesson for ${word.id}`);
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

  const changedFiles = new Set<string>();
  const correctionRecords: AuditRecord[] = [];
  const propagatedOccurrences: Array<{
    sourceFamilyKey: string;
    location: string;
    decision: string;
  }> = [];
  for (const existing of selected) {
    const spec = C3C1_SPECS[existing.familyKey];
    if (!spec)
      throw new Error(`Missing specification for ${existing.familyKey}`);
    const location = existing.locations[0];
    const occurrence = byLocation.get(location);
    if (!occurrence) throw new Error(`Missing package occurrence ${location}`);
    if (
      normalize(occurrence.lesson.root) !== normalize(existing.root as string)
    )
      throw new Error(`Root mismatch for ${existing.familyKey} at ${location}`);
    const before = {
      decision: existing.decision,
      rows: formSnapshot(existing.finalRows),
    };
    const recordId = `tier-c3c1-correction-${hash(`${existing.familyKey}|${reviewedAt}`)}`;
    const updated = buildAdjudication(existing, occurrence, spec, recordId);
    const index = report.adjudications.findIndex(
      (item) => item.familyKey === existing.familyKey,
    );
    report.adjudications[index] = updated;
    changedFiles.add(occurrence.filePath);
    correctionRecords.push({
      recordId,
      eventType: "tier-c3c1-targeted-correction",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        familyKey: existing.familyKey,
        occurrences: existing.locations.map((item) => `word:${item}`),
        tier: "C3-C1",
        track: "DOUBLED",
      },
      status: "passed",
      reviewedAt,
      checks: [
        "contract-loaded",
        "targeted-seven-family-scope",
        "current-form-first",
        "root-ownership-checked",
        "vocalisation-checked",
        "semantic-development-translated-honestly",
        "wrong-root-search-recorded",
        "provenance-recorded",
      ],
      evidence: [spec.reason, ...spec.rejectedCandidates],
      decision: spec.decision,
      root: existing.root,
      lemmaOrCurrentForm: existing.lemmaOrCurrentForm,
      category: "C3-C1 targeted correction",
      before,
      after: {
        decision: updated.decision,
        rows: formSnapshot(updated.finalRows),
      },
      humanExpertReviewRequired: false,
    });
  }

  for (const propagation of PROPAGATIONS) {
    const source = selected.find(
      (item) => item.familyKey === propagation.sourceFamilyKey,
    );
    if (!source)
      throw new Error(
        `Missing propagation source ${propagation.sourceFamilyKey}`,
      );
    const spec = C3C1_SPECS[propagation.sourceFamilyKey];
    if (!spec || spec.decision !== "FULL")
      throw new Error(
        `Propagation source must be FULL: ${propagation.sourceFamilyKey}`,
      );
    for (const location of propagation.locations) {
      const occurrence = byLocation.get(location);
      if (!occurrence)
        throw new Error(`Missing propagated occurrence ${location}`);
      if (
        normalize(occurrence.lesson.root) !== normalize(source.root as string)
      )
        throw new Error(
          `Propagated root mismatch for ${propagation.sourceFamilyKey} at ${location}`,
        );
      const before = {
        location,
        decision:
          occurrence.lesson.sarfReview?.auditDecision ??
          occurrence.lesson.sarfReview?.status ??
          "unknown",
        forms: occurrence.lesson.forms.map((form) => ({
          form: form.form,
          meaning: form.meaning,
        })),
      };
      applyPropagatedFamily(occurrence, source, spec);
      const recordId = `tier-c3c1-propagation-${hash(`${propagation.sourceFamilyKey}|${location}|${reviewedAt}`)}`;
      correctionRecords.push({
        recordId,
        eventType: "tier-c3c1-targeted-correction-propagated",
        contractId: contract.contractId,
        contractVersion: contract.contractVersion,
        scope: {
          familyKey: propagation.sourceFamilyKey,
          occurrence: `word:${location}`,
          tier: "C3-C1",
          track: "DOUBLED",
        },
        status: "passed",
        reviewedAt,
        checks: [
          "same-lexical-family-confirmed",
          "shell-variant-preserved-as-current-form",
          "approved-rows-propagated",
          "provenance-recorded",
        ],
        evidence: [
          "The only difference from the source family is a grammatical definite-article shell; the lexical root and lemma are the same.",
        ],
        decision: "FULL",
        root: source.root,
        lemmaOrCurrentForm: source.lemmaOrCurrentForm,
        category: "C3-C1 targeted correction propagation",
        before,
        after: {
          location,
          decision: "FULL",
          forms: occurrence.lesson.forms.map((form) => ({
            form: form.form,
            meaning: form.meaning,
          })),
        },
        humanExpertReviewRequired: false,
      });
      propagatedOccurrences.push({
        sourceFamilyKey: propagation.sourceFamilyKey,
        location,
        decision: "FULL",
      });
      changedFiles.add(occurrence.filePath);
    }
  }

  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Missing changed package ${filePath}`);
    await fs.writeFile(
      filePath,
      `${JSON.stringify(entry.package, null, 2)}\n`,
      "utf8",
    );
    const manifestPath = path.join(path.dirname(filePath), "manifest.json");
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
    ) as JsonRecord;
    manifest.contentVersion = `${String(manifest.contentVersion ?? "content")}-c3c1corr-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  const decisions = {
    FULL: 0,
    "CONFIRMED-LIMITED": 0,
    BLOCKED: 0,
    "MODEL-ISSUE": 0,
  } as Record<string, number>;
  const occurrenceDecisions = {
    FULL: 0,
    "CONFIRMED-LIMITED": 0,
    BLOCKED: 0,
    "MODEL-ISSUE": 0,
  } as Record<string, number>;
  for (const item of report.adjudications) {
    decisions[item.decision] = (decisions[item.decision] ?? 0) + 1;
    occurrenceDecisions[item.decision] =
      (occurrenceDecisions[item.decision] ?? 0) + item.occurrenceCount;
  }
  const previousChangedSurahs = Array.isArray(report.summary.changedSurahs)
    ? (report.summary.changedSurahs as number[])
    : [];
  const targetSurahs = selected.flatMap((item) =>
    item.locations.map((location) => Number(location.split(":")[0])),
  );
  report.summary = {
    ...report.summary,
    decisions,
    occurrencesByDecision: occurrenceDecisions,
    changedSurahs: [
      ...new Set([...previousChangedSurahs, ...targetSurahs]),
    ].sort((a, b) => a - b),
    changedPackageFiles: [
      ...new Set([
        ...(Array.isArray(report.summary.changedPackageFiles)
          ? (report.summary.changedPackageFiles as string[])
          : []),
        ...changedFiles,
      ]),
    ].sort(),
    targetedCorrectionPass: {
      reviewedAt,
      families: [...TARGETS],
      statusChanges: selected.filter(
        (item) =>
          item.decision !==
          report.adjudications.find(
            (updated) => updated.familyKey === item.familyKey,
          )?.decision,
      ).length,
      rootCorrection:
        "مَهْدُومٌ removed from ه د د; مَهْدُودٌ installed; مَهْدُومٌ remains valid only under ه د م where independently attested.",
      propagatedOccurrences,
    },
  };
  report.reviewedAt = reviewedAt;
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    markdownPath,
    renderMarkdown({
      summary: report.summary,
      adjudications: report.adjudications,
    }),
    "utf8",
  );

  for (const row of classification.families) {
    const updated = report.adjudications.find(
      (item) => item.familyKey === row.familyKey,
    );
    if (!updated || !TARGETS.has(row.familyKey)) continue;
    row.c3C1 = {
      ...(row.c3C1 ?? {}),
      track: "DOUBLED",
      decision: updated.decision,
      occurrences: updated.occurrenceCount,
      reviewedAt,
      recordId: updated.recordId,
      acceptedRowsPerOccurrence: (updated.finalRows[0]?.forms as LessonForm[])
        .length,
    };
    row.c3C1Correction = {
      reviewedAt,
      previousDecision: selected.find(
        (item) => item.familyKey === row.familyKey,
      )?.decision,
      correctionReason: "Targeted re-adjudication under contract v1.3.9.",
    };
  }

  const c3cRows = classification.families.filter(
    (row) => row.proposedC3Group === "C3-C",
  );
  if (c3cRows.length !== 149)
    throw new Error(`Expected 149 C3-C families, found ${c3cRows.length}`);
  const ownershipRows = c3cRows.map((row) => ({
    ...row,
    ...ownershipFor(row),
  }));
  const trackNames = [
    "DOUBLED",
    "HAMZATED",
    "QUADRILITERAL",
    "WEAK",
    "ROOT/LEMMA-UNCERTAIN",
  ];
  const trackCounts = Object.fromEntries(
    trackNames.map((track) => [
      track,
      counts(ownershipRows, (row) => row.primaryTrack === track),
    ]),
  );
  const pendingRows = ownershipRows.filter((row) => !row.adjudicationComplete);
  const pendingCounts = Object.fromEntries(
    trackNames.map((track) => [
      track,
      counts(pendingRows, (row) => row.primaryTrack === track),
    ]),
  );
  const hamzatedQueue = pendingRows
    .filter((row) => row.primaryTrack === "HAMZATED")
    .map((row) => ({
      familyKey: row.familyKey,
      root: row.root,
      quranicWord: row.quranicWord,
      locations: row.locations,
      occurrenceCount: row.occurrenceCount,
    }));
  if (
    hamzatedQueue.length !== 25 ||
    hamzatedQueue.reduce((sum, row) => sum + row.occurrenceCount, 0) !== 32
  )
    throw new Error(
      "Normalized hamzated queue must be 25 families / 32 occurrences",
    );
  for (const row of ownershipRows) {
    const source = classification.families.find(
      (item) => item.familyKey === row.familyKey,
    );
    if (source)
      Object.assign(source, {
        primaryTrack: row.primaryTrack,
        secondaryMorphologyFlags: row.secondaryMorphologyFlags,
        ownershipBasis: row.ownershipBasis,
        adjudicationComplete: row.adjudicationComplete,
      });
  }
  classification.tierC3COwnership = {
    contractVersion: contract.contractVersion,
    reviewedAt,
    ruleVersion: "1.0.0",
    primaryTrackRule:
      "A completed adjudication owns the family permanently. Otherwise, assign the first matching track in this order: ROOT/LEMMA-UNCERTAIN, QUADRILITERAL, HAMZATED, WEAK, DOUBLED. All other morphology signals are secondary flags. A family enters exactly one future queue.",
    completedTrackWins: true,
    primaryTrackCounts: trackCounts,
    pendingQueueCounts: pendingCounts,
    nextQueue: "HAMZATED",
    hamzatedQueueCount: {
      families: hamzatedQueue.length,
      occurrences: hamzatedQueue.reduce(
        (sum, row) => sum + row.occurrenceCount,
        0,
      ),
    },
    hamzatedQueue,
  };
  classification.tierC3C1 = {
    ...(classification.tierC3C1 as JsonRecord),
    reviewedAt,
    decisions,
    occurrencesByDecision: occurrenceDecisions,
    correctionPass: {
      reviewedAt,
      families: [...TARGETS],
      noOtherFamiliesReopened: true,
    },
  };
  await fs.writeFile(
    classificationPath,
    `${JSON.stringify(classification, null, 2)}\n`,
    "utf8",
  );

  const ownershipReport = {
    reportType: "tier-c3c-track-ownership",
    contractVersion: contract.contractVersion,
    reviewedAt,
    scope: {
      families: c3cRows.length,
      occurrences: c3cRows.reduce((sum, row) => sum + row.occurrenceCount, 0),
    },
    ruleVersion: "1.0.0",
    rule: "Completed adjudication owns the family permanently. Otherwise, first matching track: ROOT/LEMMA-UNCERTAIN > QUADRILITERAL > HAMZATED > WEAK > DOUBLED. Remaining feature signals are secondary flags.",
    primaryTrackCounts: trackCounts,
    pendingQueueCounts: pendingCounts,
    hamzatedQueue,
  };
  await fs.writeFile(
    ownershipPath,
    `${JSON.stringify(ownershipReport, null, 2)}\n`,
    "utf8",
  );
  const ownershipLines = [
    "# C3-C track ownership",
    "",
    `Reviewed at: ${reviewedAt}`,
    "",
    ownershipReport.rule,
    "",
    "## Primary track totals",
    "",
    "| Track | Families | Occurrences | Pending families | Pending occurrences |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const track of trackNames)
    ownershipLines.push(
      `| ${track} | ${trackCounts[track].families} | ${trackCounts[track].occurrences} | ${pendingCounts[track].families} | ${pendingCounts[track].occurrences} |`,
    );
  ownershipLines.push(
    "",
    "## Corrected C3-C2 HAMZATED queue",
    "",
    "The queue is 25 families / 32 occurrences. Completed C3-C1 families, including mixed-feature أزز and أدد, are excluded. Mixed-feature أثث and ألل are now owned by HAMZATED.",
    "",
    "| Family | Qur’anic word | Root | Locations | Occurrences |",
    "|---|---|---|---|---:|",
  );
  for (const row of hamzatedQueue)
    ownershipLines.push(
      `| ${row.familyKey} | ${row.quranicWord} | ${row.root} | ${row.locations.join("; ")} | ${row.occurrenceCount} |`,
    );
  await fs.writeFile(
    ownershipMarkdownPath,
    `${ownershipLines.join("\n")}\n`,
    "utf8",
  );

  const plan = JSON.parse(
    await fs.readFile(executionPlanPath, "utf8"),
  ) as JsonRecord;
  plan.scope = {
    ...(plan.scope as JsonRecord),
    rowsChanged: 27 + 7 + propagatedOccurrences.length,
    propagatedOccurrences,
    completedTrack: {
      track: "DOUBLED",
      families: 20,
      occurrences: 30,
      decisions,
      occurrencesByDecision: occurrenceDecisions,
    },
  };
  plan.primaryTracks = trackNames.map((track, index) => ({
    track,
    families: trackCounts[track].families,
    occurrences: trackCounts[track].occurrences,
    pendingFamilies: pendingCounts[track].families,
    pendingOccurrences: pendingCounts[track].occurrences,
    priority: index + 1,
    method:
      track === "HAMZATED"
        ? "Verify hamza position, weak-letter behavior and vocalisation before selecting related forms; completed mixed-feature families cannot re-enter this queue."
        : "Use the normalized C3-C ownership rule and inspect only families assigned to this primary track.",
  }));
  plan.ownership = ownershipReport;
  plan.reconciliation = {
    primaryFamilyTotal: c3cRows.length,
    primaryOccurrenceTotal: c3cRows.reduce(
      (sum, row) => sum + row.occurrenceCount,
      0,
    ),
    allC3LowFamilies: 335,
    allC3LowOccurrences: 477,
    c3BCompletedFamilies: 23,
    c3BCompletedOccurrences: 29,
  };
  plan.recommendedBatchOrder = [
    "HAMZATED",
    "QUADRILITERAL",
    "WEAK",
    "ROOT/LEMMA-UNCERTAIN",
  ];
  plan.status =
    "C3-C1 DOUBLED corrected; C3-C2 HAMZATED ownership normalized but adjudication not started; remaining tracks untouched";
  await fs.writeFile(
    executionPlanPath,
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  const planLines = [
    "# Tier-C3-C execution plan",
    "",
    `Contract: ${contract.contractVersion}`,
    "",
    "C3-C1 DOUBLED has been corrected for seven named families. C3-C2 HAMZATED is now the normalized next queue but has not been adjudicated.",
    "",
    "## Ownership rule",
    "",
    ownershipReport.rule,
    "",
    "## Track totals",
    "",
    "| Track | Families | Occurrences | Pending families | Pending occurrences |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const track of trackNames)
    planLines.push(
      `| ${track} | ${trackCounts[track].families} | ${trackCounts[track].occurrences} | ${pendingCounts[track].families} | ${pendingCounts[track].occurrences} |`,
    );
  planLines.push(
    "",
    "Status: C3-C1 DOUBLED corrected; C3-C2 HAMZATED ownership normalized but not started.",
  );
  await fs.writeFile(
    executionPlanMarkdownPath,
    `${planLines.join("\n")}\n`,
    "utf8",
  );

  const existingIds = new Set(
    readAuditRecords().map((record) => record.recordId),
  );
  const ownershipRecord: AuditRecord = {
    recordId: `tier-c3c-ownership-${hash(reviewedAt)}`,
    eventType: "tier-c3c-track-ownership-normalized",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    scope: { tier: "C3-C", families: 149, occurrences: 195 },
    status: "passed",
    reviewedAt,
    checks: [
      "contract-loaded",
      "one-primary-track-per-family",
      "secondary-flags-preserved",
      "completed-families-excluded-from-future-queues",
      "hamzated-queue-reconciled-25-families-32-occurrences",
    ],
    evidence: [
      ownershipReport.rule,
      "The completed C3-C1 track owns all 20 doubled families, including mixed-feature أزز and جوو; uncompleted mixed-feature أثث and ألل are assigned to HAMZATED.",
    ],
    decision: "OWNERSHIP-NORMALIZED",
    humanExpertReviewRequired: false,
    primaryTrackCounts: trackCounts,
    pendingQueueCounts: pendingCounts,
  };
  appendAuditRecords(
    [...correctionRecords, ownershipRecord].filter(
      (record) => !existingIds.has(record.recordId),
    ),
  );

  const wrongRootRows = [] as string[];
  for (const entry of packages.values())
    for (const lesson of Object.values(entry.package.teachingEntries)) {
      if (
        normalize(lesson.root) === normalize("ه د د") &&
        lesson.forms.some(
          (form) => normalize(form.form) === normalize("مَهْدُومٌ"),
        )
      )
        wrongRootRows.push(`${entry.package.surah.number}:${lesson.id}`);
    }
  if (wrongRootRows.length)
    throw new Error(
      `Wrong-root ه د د contamination remains: ${wrongRootRows.join(", ")}`,
    );
  console.log(
    JSON.stringify(
      {
        correctedFamilies: [...TARGETS],
        reportPath,
        ownershipPath,
        hamzatedQueue: {
          families: hamzatedQueue.length,
          occurrences: hamzatedQueue.reduce(
            (sum, row) => sum + row.occurrenceCount,
            0,
          ),
        },
        decisions,
        occurrencesByDecision: occurrenceDecisions,
        changedFiles: [...changedFiles].sort(),
      },
      null,
      2,
    ),
  );
}

await main();
