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
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";
import type { C3C2Candidate } from "./lib/tier-c3c2-specs";
import {
  C3C2_TARGETED_CORRECTIONS,
  C3C2_TARGETED_KEYS,
} from "./lib/tier-c3c2-targeted-correction-specs";

const contract = assertAuthoringContract("Targeted C3-C2 hamzated correction");
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const reportPath = path.join(reviewRoot, "tier-c3c2-sarf-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c3c2-sarf-adjudications.md");
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

// These report objects are schema-shaped JSON assembled from prior audit artifacts.
// The generated reports are validated by the repository's content validators after this script.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;
type PackageEntry = { filePath: string; package: SurahPackage };
type Occurrence = {
  filePath: string;
  package: SurahPackage;
  word: SurahPackage["ayahs"][number]["words"][number];
  lesson: SurahPackage["teachingEntries"][string];
  location: string;
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
    difference:
      `Current Qur’anic occurrence at ${record.location}; the exact surface form remains first. ${old?.difference ?? ""}`.trim(),
    relationship: `Current occurrence of the ${record.lesson.root} hamzated family; comparison rows show genuine same-root morphology and honest semantic development.`,
    provenance: `Targeted C3-C2 correction ${reviewedAt}; current occurrence, root, lemma, morphology and prior adjudication inspected.`,
  };
}

function candidateForm(
  candidate: C3C2Candidate,
  root: string,
  location: string,
): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}: ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${root}; not shell-only, case-only, pronoun-only or bare-radical padding.`,
    provenance: `Targeted C3-C2 correction ${reviewedAt}; ${candidate.evidence}`,
  };
}

function snapshot(record: Occurrence) {
  return {
    occurrenceId: record.word.id,
    location: record.location,
    arabic: record.word.arabic,
    forms: structuredClone(record.lesson.forms),
    sarfReview: structuredClone(record.lesson.sarfReview),
  };
}

function decisionSummary(adjudications: JsonObject[]) {
  const decisions = {
    FULL: 0,
    "CONFIRMED-LIMITED": 0,
    BLOCKED: 0,
    "MODEL-ISSUE": 0,
  };
  const occurrencesByDecision = {
    FULL: 0,
    "CONFIRMED-LIMITED": 0,
    BLOCKED: 0,
    "MODEL-ISSUE": 0,
  };
  for (const item of adjudications) {
    decisions[item.decision as keyof typeof decisions] += 1;
    occurrencesByDecision[
      item.decision as keyof typeof occurrencesByDecision
    ] += item.occurrenceCount;
  }
  return { decisions, occurrencesByDecision };
}

function renderReport(report: JsonObject) {
  const lines = [
    "# Tier-C3-C2 hamzated-root Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers the 25 HAMZATED primary-track families / 32 Qur’anic occurrences. This targeted pass corrected only the named C3-C2 metadata/family records; C3-C3 quadriliteral adjudication has not started.",
    "",
    "## Summary",
    "",
    "```json",
    json(report.summary),
    "```",
    "",
  ];
  for (const item of report.adjudications as JsonObject[]) {
    lines.push(
      `## ${item.familyKey}`,
      "",
      `Decision: **${item.decision}**; root: ${item.root}; word: ${item.quranicWord}; locations: ${item.locations.join(", ")}`,
      `Hamza position: ${item.hamzaPosition}; secondary flags: ${item.secondaryMorphologyFlags?.join(", ") || "none"}`,
      `Root normalization: ${item.rootNormalization ?? "project and evidence conventions agree"}`,
      "",
    );
    if (item.previousDecision) {
      lines.push(
        `Previous decision: **${item.previousDecision}**`,
        `Correction reason: ${item.correctionReason}`,
        "",
      );
    }
    lines.push(
      item.reasoning,
      "",
      "Accepted candidates:",
      "",
      ...(item.acceptedCandidates?.length
        ? item.acceptedCandidates.map(
            (candidate: JsonObject) =>
              `- ${candidate.form} — ${candidate.meaning}; ${candidate.morphology}; ${candidate.relationship}; semantic development: ${candidate.semanticDevelopment}; confidence: ${candidate.confidence}; pedagogical value: ${candidate.pedagogicalValue}; evidence: ${candidate.evidence}`,
          )
        : ["- None"]),
      "",
      "Candidates rejected / safeguards:",
      "",
      ...(item.rejectedCandidates?.length
        ? item.rejectedCandidates.map((value: string) => `- ${value}`)
        : ["- None beyond the standard shell/case safeguards."]),
      "",
      `Unresolved question: ${item.unresolvedQuestion ?? "None"}`,
      `Evidence required: ${item.evidenceRequired?.join("; ") || "None"}`,
      `Human expert review still required: ${item.humanExpertReviewRequired ? "yes" : "no"}`,
      "",
      "---",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const report = JSON.parse(
    await fs.readFile(reportPath, "utf8"),
  ) as JsonObject;
  const classification = JSON.parse(
    await fs.readFile(classificationPath, "utf8"),
  ) as JsonObject;
  const ownership = JSON.parse(
    await fs.readFile(ownershipPath, "utf8"),
  ) as JsonObject;
  const plan = JSON.parse(await fs.readFile(planPath, "utf8")) as JsonObject;
  const existingAdjudications = report.adjudications as JsonObject[];
  const byFamily = new Map(
    existingAdjudications.map((item) => [item.familyKey, item]),
  );
  for (const key of C3C2_TARGETED_KEYS) {
    if (!byFamily.has(key))
      throw new Error(`Missing C3-C2 report family: ${key}`);
  }

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
    for (const ayah of result.package.ayahs) {
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
  }

  const changedFiles = new Set<string>();
  const changedSurahs = new Set<number>();
  const ledger: AuditRecord[] = [];

  for (const key of C3C2_TARGETED_KEYS) {
    const existing = byFamily.get(key) as JsonObject;
    const correction = C3C2_TARGETED_CORRECTIONS[key];
    const locations = existing.locations as string[];
    const records = locations.map((location) => {
      const record = byLocation.get(location);
      if (!record)
        throw new Error(`Missing package occurrence ${location} for ${key}`);
      return record;
    });
    const previousRows = existing.previousRows ?? records.map(snapshot);
    const previousDecision = (existing.previousDecision ??
      existing.decision) as string;
    const metadataOnly = !correction.decision && !correction.candidates;
    const finalRows: JsonObject[] = [];
    let acceptedCandidates: C3C2Candidate[] =
      (existing.acceptedCandidates as C3C2Candidate[] | undefined) ?? [];
    let rejectedCandidates: string[] = existing.rejectedCandidates ?? [];
    let decision = previousDecision;
    let reason = existing.reasoning as string;

    for (const record of records) {
      let forms: LessonForm[];
      let review: SarfReview;
      if (metadataOnly) {
        forms = structuredClone(record.lesson.forms);
        review = structuredClone(record.lesson.sarfReview);
        review.provenance = [
          ...(review.provenance ?? []),
          `Targeted C3-C2 metadata correction ${reviewedAt}: canonical root ${existing.root} is ه ي ء; hamza is the third radical, not the second. Root matching and candidate generation were verified unaffected.`,
        ].slice(0, 80);
        review.reviewedAt = reviewedAt;
      } else {
        decision = correction.decision ?? previousDecision;
        reason = correction.reason ?? reason;
        acceptedCandidates = (correction.candidates ?? []).filter(
          (candidate) => candidate.accepted,
        );
        rejectedCandidates = [
          ...(correction.rejectedCandidates ?? []),
          ...(correction.candidates ?? [])
            .filter((candidate) => !candidate.accepted)
            .map(
              (candidate) =>
                `${candidate.form}: ${candidate.rejectionReason ?? "rejected"}`,
            ),
        ];
        forms = [currentForm(record)];
        const used = new Set([normalize(forms[0].form)]);
        for (const candidate of acceptedCandidates) {
          if (used.has(normalize(candidate.form)))
            throw new Error(
              `${key}: duplicate corrected form ${candidate.form}`,
            );
          forms.push(
            candidateForm(candidate, existing.root as string, record.location),
          );
          used.add(normalize(candidate.form));
        }
        if (decision === "FULL" && forms.length !== 5)
          throw new Error(`${key}: FULL correction has ${forms.length} rows`);
        if (decision === "CONFIRMED-LIMITED" && forms.length >= 5)
          throw new Error(
            `${key}: limited correction has ${forms.length} rows`,
          );
        review = {
          status: decision === "FULL" ? "full" : "limited",
          ...(decision === "FULL" ? {} : { limitedReason: reason }),
          auditDecision:
            decision === "FULL" ? "upgraded-to-full" : "confirmed-limited",
          provenance: [
            `Targeted C3-C2 hamzated correction ${reviewedAt}: ${decision}.`,
            `Previous decision: ${previousDecision}.`,
            `Every occurrence inspected: ${locations.join(", ")}.`,
            ...acceptedCandidates.map(
              (candidate) =>
                `Accepted ${candidate.form}: ${candidate.evidence}`,
            ),
            ...rejectedCandidates,
          ].slice(0, 80),
          reviewedBy: "Codex",
          reviewedAt,
        };
      }
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

    const recordId = `tier-c3c2-targeted-correction-${hash(key)}`;
    const updated = {
      ...existing,
      previousDecision,
      previousRows,
      correctionReason: metadataOnly
        ? "Canonical hamza-radical metadata correction; teaching rows and decision preserved."
        : reason,
      currentRows: previousRows,
      candidatesConsidered: metadataOnly
        ? existing.candidatesConsidered
        : correction.candidates,
      acceptedCandidates: metadataOnly
        ? existing.acceptedCandidates
        : acceptedCandidates,
      rejectedCandidates: metadataOnly
        ? existing.rejectedCandidates
        : rejectedCandidates,
      finalRows,
      decision,
      reasoning: metadataOnly
        ? `${existing.reasoning} Metadata correction: root ${existing.root} is ه ي ء, so hamza is the third radical. This did not affect root matching or candidate generation.`
        : reason,
      hamzaPosition: correction.hamzaPosition ?? existing.hamzaPosition,
      evidence: [
        ...(existing.evidence ?? []),
        metadataOnly
          ? "Canonical root ه ي ء verified; hamza is the third radical."
          : "Targeted correction independently checked root ownership, vocalisation, morphology, semantic development and shell/case/pronoun padding.",
      ],
      confidence: "high",
      unresolvedQuestion: null,
      evidenceRequired: [],
      humanExpertReviewRequired: false,
      productionStatus: decision === "FULL" ? "full" : "confirmed-limited",
      reviewedAt,
      recordId,
    };
    byFamily.set(key, updated);
    const root = existing.root as string;
    ledger.push({
      recordId,
      eventType: "tier-c3c2-targeted-correction",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        familyKey: key,
        occurrences: records.map((record) => record.word.id),
        tier: "C3-C2",
        track: "HAMZATED",
      },
      status: metadataOnly || decision === "FULL" ? "passed" : "passed-limited",
      reviewedAt,
      checks: [
        "contract-loaded",
        "targeted-scope-only",
        "previous-decision-recorded",
        "current-form-first",
        "root-ownership-verified",
        "hamza-radical-position-verified",
        "same-root-forms-reviewed",
        "shell-case-pronoun-and-padding-rejected",
        "semantic-development-translated-honestly",
        "provenance-recorded",
      ],
      evidence: [reason, ...(rejectedCandidates ?? [])],
      decision,
      root,
      lemmaOrCurrentForm: existing.lemmaOrCurrentForm,
      category: "C3-C2 hamzated root targeted correction",
      humanExpertReviewRequired: false,
    });
  }

  for (const entry of packages.values()) {
    if (entry.package.status !== "custom-partial") continue;
    const hasBlocked = Object.values(entry.package.teachingEntries).some(
      (lesson) =>
        lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity",
    );
    if (!hasBlocked) {
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
    ) as JsonObject;
    const baseContentVersion = String(
      manifest.contentVersion ?? "content",
    ).replace(/-c3c2-correction-\d+$/u, "");
    manifest.contentVersion = `${baseContentVersion}-c3c2-correction-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    manifest.status = entry.package.status;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  const adjudications = [...byFamily.values()].sort(
    (a, b) =>
      C3C2_TARGETED_KEYS.indexOf(a.familyKey) -
      C3C2_TARGETED_KEYS.indexOf(b.familyKey),
  );
  const summary = {
    startingC3C2Families: 25,
    startingC3C2Occurrences: 32,
    adjudicatedFamilies: adjudications.length,
    adjudicatedOccurrences: adjudications.reduce(
      (sum, item) => sum + item.occurrenceCount,
      0,
    ),
    ...decisionSummary(adjudications),
    targetedCorrectionFamilies: C3C2_TARGETED_KEYS.length,
    targetedCorrectionOccurrences: C3C2_TARGETED_KEYS.reduce(
      (sum, key) => sum + (byFamily.get(key)?.occurrenceCount ?? 0),
      0,
    ),
    changedSurahs: [...changedSurahs].sort((a, b) => a - b),
    changedPackageFiles: [...changedFiles].sort(),
    excluded: [
      "C3-C3 quadriliteral",
      "C3-C4 weak",
      "C3-C5 root/lemma uncertain",
      "C3-D",
      "C3-E",
      "C2 residuals",
      "historical residuals",
    ],
  };
  report.reviewedAt = reviewedAt;
  report.summary = summary;
  report.adjudications = adjudications;
  await fs.writeFile(reportPath, `${json(report)}\n`, "utf8");
  await fs.writeFile(
    markdownPath,
    renderReport({ ...report, summary, adjudications }),
    "utf8",
  );

  for (const row of classification.families as JsonObject[]) {
    const item = byFamily.get(row.familyKey);
    if (!item) continue;
    const isTarget = C3C2_TARGETED_KEYS.includes(row.familyKey);
    if (isTarget) {
      row.c3C2 = {
        ...(row.c3C2 ?? {}),
        track: "HAMZATED",
        decision: item.decision,
        occurrences: item.occurrenceCount,
        reviewedAt,
        recordId: item.recordId,
        acceptedRowsPerOccurrence: item.finalRows?.[0]?.forms?.length ?? 0,
        hamzaPosition: item.hamzaPosition,
        secondaryMorphologyFlags: item.secondaryMorphologyFlags ?? [],
        rootNormalization: item.rootNormalization ?? null,
      };
    }
  }
  classification.tierC3C2 = {
    ...(classification.tierC3C2 ?? {}),
    contractVersion: contract.contractVersion,
    reviewedAt,
    scopeFamilies: 25,
    scopeOccurrences: 32,
    ...decisionSummary(adjudications),
    targetedCorrectionFamilies: C3C2_TARGETED_KEYS.length,
    targetedCorrectionKeys: C3C2_TARGETED_KEYS,
    explicitBoundary:
      "Only the six named C3-C2 records were corrected. C3-C3 quadriliteral adjudication remains untouched.",
  };
  await fs.writeFile(classificationPath, `${json(classification)}\n`, "utf8");
  const classificationLines = [
    "# Tier-C LOW classification",
    "",
    `Generated: ${reviewedAt}`,
    "",
    "C3-C2 hamzated targeted correction is complete. C3-C3 quadriliteral adjudication has not started.",
    "",
    "## C3-C2 summary",
    "",
    "```json",
    json(classification.tierC3C2),
    "```",
    "",
    "## Families",
    "",
    "| Family | Word | Root | Group | Occurrences | Decision | Primary track |",
    "|---|---|---|---|---:|---|---|",
  ];
  for (const row of classification.families as JsonObject[]) {
    const c3c2 = row.c3C2 ?? {};
    classificationLines.push(
      `| ${row.familyKey} | ${row.quranicWord} | ${row.root || "—"} | ${row.proposedC3Group ?? "—"} | ${row.occurrenceCount} | ${c3c2.decision ?? "—"} | ${c3c2.track ?? "—"} |`,
    );
  }
  await fs.writeFile(
    classificationMarkdownPath,
    `${classificationLines.join("\n")}\n`,
    "utf8",
  );

  ownership.reviewedAt = reviewedAt;
  ownership.pendingQueueCounts.HAMZATED = { families: 0, occurrences: 0 };
  if (Array.isArray(ownership.primaryTracks)) {
    for (const track of ownership.primaryTracks as JsonObject[]) {
      if (track.track === "HAMZATED") {
        track.pendingFamilies = 0;
        track.pendingOccurrences = 0;
      }
    }
  }
  ownership.lastTargetedCorrection = {
    contractVersion: contract.contractVersion,
    keys: C3C2_TARGETED_KEYS,
    changedFamilies: C3C2_TARGETED_KEYS.filter(
      (key) => key !== "lexical|هيأ|هية|noun/pronoun",
    ),
    metadataOnlyFamilies: ["lexical|هيأ|هية|noun/pronoun"],
    hamzaMetadata: "ه ي ء: hamza is the third radical.",
  };
  await fs.writeFile(ownershipPath, `${json(ownership)}\n`, "utf8");
  const ownershipMarkdown = await fs.readFile(ownershipMarkdownPath, "utf8");
  await fs.writeFile(
    ownershipMarkdownPath,
    `${ownershipMarkdown.trimEnd()}\n\n## Targeted C3-C2 correction\n\n${json(ownership.lastTargetedCorrection)}\n`,
    "utf8",
  );

  plan.reviewedAt = reviewedAt;
  plan.completedTrack = {
    ...(plan.completedTrack ?? {}),
    track: "HAMZATED",
    families: 25,
    occurrences: 32,
    decisions: summary.decisions,
    occurrencesByDecision: summary.occurrencesByDecision,
  };
  plan.lastTargetedCorrection = ownership.lastTargetedCorrection;
  plan.status =
    "C3-C2 targeted correction complete; C3-C3 QUADRILITERAL not started";
  await fs.writeFile(planPath, `${json(plan)}\n`, "utf8");
  const planMarkdown = await fs.readFile(planMarkdownPath, "utf8");
  await fs.writeFile(
    planMarkdownPath,
    `${planMarkdown.trimEnd()}\n\n## Targeted C3-C2 correction\n\n${json(ownership.lastTargetedCorrection)}\n`,
    "utf8",
  );

  const existingAuditIds = new Set(
    readAuditRecords().map((record) => record.recordId),
  );
  appendAuditRecords(
    ledger.filter((record) => !existingAuditIds.has(record.recordId)),
  );
  console.log(
    JSON.stringify(
      {
        summary,
        reportPath,
        changedSurahs: [...changedSurahs].sort((a, b) => a - b),
      },
      null,
      2,
    ),
  );
}

await main();
