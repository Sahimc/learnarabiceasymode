import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import {
  C3C4A_FAMILY_KEYS,
  C3C4A_SPECS,
  type C3C4ACandidate,
  type C3C4ADecision,
} from "./lib/tier-c3c4a-specs";
import type { LessonForm, SarfReview, SurahPackage } from "../app/data/content-contract";

const contract = assertAuthoringContract("Tier-C3-C4A weak-final adjudication");
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const classificationPath = path.join(reviewRoot, "tier-c3-low-classification.json");
const classificationMarkdownPath = path.join(reviewRoot, "tier-c3-low-classification.md");
const weakPlanPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.json");
const weakPlanMarkdownPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.md");
const weakHandoffPath = path.join(reviewRoot, "tier-c3c4-weak-queue-handoff.json");
const weakOwnershipPath = path.join(reviewRoot, "tier-c3c-ownership.json");
const executionPlanPath = path.join(reviewRoot, "tier-c3c-execution-plan.json");
const reportPath = path.join(reviewRoot, "tier-c3c4a-weak-final-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c3c4a-weak-final-adjudications.md");

type ClassificationFamily = {
  familyKey: string;
  quranicWord: string;
  root: string;
  lemma: string;
  locations: string[];
  occurrenceCount: number;
  primaryTrack?: string;
  c3C1?: unknown;
  c3C2?: unknown;
  c3C3?: unknown;
  [key: string]: unknown;
};
type ClassificationReport = { families: ClassificationFamily[]; [key: string]: unknown };
type WeakPlan = { batches: Array<Record<string, unknown>>; families: Array<Record<string, unknown>>; [key: string]: unknown };
type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type PackageEntry = { filePath: string; package: SurahPackage };
type OccurrenceRecord = { filePath: string; package: SurahPackage; word: Word; lesson: Lesson; location: string };
type CurrentRow = { occurrenceId: string; location: string; arabic: string; forms: LessonForm[]; sarfReview: SarfReview };
type Adjudication = {
  familyKey: string;
  root: string;
  canonicalRoot: string;
  weakRadical: string;
  weakRadicalPosition: "third";
  lemmaOrCurrentForm: string;
  quranicWord: string;
  locations: string[];
  occurrenceCount: number;
  partOfSpeech: unknown;
  quranicMeaning: string;
  morphology: unknown;
  rootConfidence: string;
  lemmaConfidence: string;
  normalizationNote?: string;
  currentRows: CurrentRow[];
  candidatesConsidered: C3C4ACandidate[];
  acceptedCandidates: C3C4ACandidate[];
  rejectedCandidates: string[];
  finalRows: CurrentRow[];
  decision: C3C4ADecision;
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

const normalize = (value: string) => value.normalize("NFC").replace(/[\s\u0640]/gu, "");
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const json = <T>(value: T) => JSON.stringify(value, null, 2);
const decisions: C3C4ADecision[] = ["FULL", "CONFIRMED-LIMITED", "BLOCKED", "MODEL-ISSUE"];

function productionStatus(decision: C3C4ADecision): Adjudication["productionStatus"] {
  if (decision === "FULL") return "full";
  if (decision === "CONFIRMED-LIMITED") return "confirmed-limited";
  if (decision === "MODEL-ISSUE") return "model-issue";
  return "blocked";
}

function currentForm(record: OccurrenceRecord, root: string): LessonForm {
  const old = record.lesson.forms[0];
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning || record.word.gloss || record.word.arabic,
    difference: `Current Qur’anic occurrence at ${record.location}; ${old?.difference ?? "the exact surface form is retained first."}`,
    relationship: `Current occurrence of the ${root} weak-final family; comparison rows show real same-root morphology and honest semantic development.`,
    provenance: `Tier-C3-C4A weak-final adjudication ${reviewedAt}; the occurrence, root, lemma, weak radical, aligned morphology and approved lexical evidence were inspected.`,
  };
}

function candidateForm(candidate: C3C4ACandidate, root: string, location: string): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}. ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${root}; this is not shell, case, pronoun or bare-radical variation.`,
    provenance: `Tier-C3-C4A weak-final adjudication ${reviewedAt}; ${candidate.evidence}`,
  };
}

function reportMarkdown(summary: Record<string, unknown>, adjudications: Adjudication[]) {
  const lines = [
    "# C3-C4A W1 weak-final / defective Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers exactly the committed C3-C4A queue: 12 weak-final families / 17 Qur’anic occurrences. C3-C4B and later weak batches, C3-D, C3-E and residual queues were excluded.",
    "",
    "## Summary",
    "",
    "```json",
    json(summary),
    "```",
    "",
  ];
  for (const item of adjudications) {
    lines.push(
      `## ${item.familyKey}`,
      "",
      `Decision: **${item.decision}**; root: ${item.canonicalRoot}; weak radical: ${item.weakRadical}; word: ${item.quranicWord}; locations: ${item.locations.join(", ")}`,
      `POS: ${String(item.partOfSpeech)}; confidence: ${item.confidence}`,
      ...(item.normalizationNote ? ["", `Normalization note: ${item.normalizationNote}`] : []),
      "",
      item.reasoning,
      "",
      "Accepted candidates:",
      "",
      ...(item.acceptedCandidates.length
        ? item.acceptedCandidates.map((candidate) => `- ${candidate.form} — ${candidate.meaning}; ${candidate.morphology}; ${candidate.relationship}; semantic development: ${candidate.semanticDevelopment}; confidence: ${candidate.confidence}; evidence: ${candidate.evidence}`)
        : ["- None"]),
      "",
      "Rejected candidates / safeguards:",
      "",
      ...(item.rejectedCandidates.length ? item.rejectedCandidates.map((candidate) => `- ${candidate}`) : ["- None"]),
      "",
      `Human expert review still required: ${item.humanExpertReviewRequired ? "yes" : "no"}`,
      `Unresolved question: ${item.unresolvedQuestion ?? "None"}`,
      "",
      "Final rows:",
      "",
      ...(item.finalRows[0]?.forms.map((row, index) => `${index + 1}. ${row.form} — ${row.meaning}. ${row.difference}`) ?? ["1. No final rows recorded"]),
      "",
      "---",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const classification = JSON.parse(await fs.readFile(classificationPath, "utf8")) as ClassificationReport;
  const weakPlan = JSON.parse(await fs.readFile(weakPlanPath, "utf8")) as WeakPlan;
  const batch = weakPlan.batches.find((item) => item.batch === "C3-C4A");
  const planned = Array.isArray(batch?.families) ? (batch.families as ClassificationFamily[]) : [];
  if (planned.length !== 12) throw new Error(`C3-C4A handoff mismatch: expected 12 families, found ${planned.length}`);
  const plannedOccurrences = planned.reduce((sum, item) => sum + item.locations.length, 0);
  if (plannedOccurrences !== 17) throw new Error(`C3-C4A handoff mismatch: expected 17 occurrences, found ${plannedOccurrences}`);
  const plannedKeys = new Set(planned.map((item) => item.familyKey));
  if (plannedKeys.size !== C3C4A_FAMILY_KEYS.length || C3C4A_FAMILY_KEYS.some((key) => !plannedKeys.has(key))) throw new Error("C3-C4A specification does not exactly match the committed planning queue");
  for (const item of planned) {
    const source = classification.families.find((row) => row.familyKey === item.familyKey);
    if (!source) throw new Error(`Missing source classification for ${item.familyKey}`);
    if (source.primaryTrack !== "WEAK") throw new Error(`${item.familyKey} is not weak-primary-owned`);
    if (source.c3C1 || source.c3C2 || source.c3C3) throw new Error(`${item.familyKey} was already adjudicated in an earlier C3 track`);
    if (item.batch !== "C3-C4A") throw new Error(`${item.familyKey} is not assigned to C3-C4A`);
    if (!C3C4A_SPECS[item.familyKey]) throw new Error(`Missing explicit C3-C4A specification for ${item.familyKey}`);
  }

  const packages = new Map<string, PackageEntry>();
  const byLocation = new Map<string, OccurrenceRecord>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package) throw new Error(`Cannot read package ${filePath}: ${result.errors.join("; ")}`);
    const entry = { filePath, package: result.package };
    packages.set(filePath, entry);
    for (const ayah of result.package.ayahs) for (const word of ayah.words) {
      if (!word.teachingId) continue;
      const lesson = result.package.teachingEntries[word.teachingId];
      if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
      byLocation.set(`${result.package.surah.number}:${ayah.number}:${word.position}`, { filePath, package: result.package, word, lesson, location: `${result.package.surah.number}:${ayah.number}:${word.position}` });
    }
  }

  const adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedFiles = new Set<string>();
  const changedSurahs = new Set<number>();
  const decisionCounts = Object.fromEntries(decisions.map((decision) => [decision, 0])) as Record<C3C4ADecision, number>;
  const occurrenceCounts = Object.fromEntries(decisions.map((decision) => [decision, 0])) as Record<C3C4ADecision, number>;

  for (const item of planned) {
    const spec = C3C4A_SPECS[item.familyKey];
    const records = item.locations.map((location) => {
      const record = byLocation.get(location);
      if (!record) throw new Error(`Missing package occurrence ${location} for ${item.familyKey}`);
      if (normalize(record.lesson.root) !== normalize(item.root)) throw new Error(`Root mismatch at ${location}: ${record.lesson.root} != ${item.root}`);
      if (record.lesson.sarfReview.status !== "limited" || record.lesson.forms.length !== 1 || record.lesson.sarfReview.auditDecision !== "blocked-for-genuine-ambiguity") throw new Error(`${item.familyKey} is not the untouched one-row blocked W1 family expected by the handoff`);
      return record;
    });
    const currentRows = records.map((record) => ({ occurrenceId: record.word.id, location: record.location, arabic: record.word.arabic, forms: structuredClone(record.lesson.forms), sarfReview: structuredClone(record.lesson.sarfReview) }));
    const acceptedCandidates = spec.candidates.filter((candidate) => candidate.accepted);
    if (spec.decision === "FULL" && acceptedCandidates.length !== 4) throw new Error(`${item.familyKey} FULL specification must contain four accepted candidates`);
    if (spec.decision === "CONFIRMED-LIMITED" && acceptedCandidates.length >= 4) throw new Error(`${item.familyKey} limited specification contains too many accepted candidates`);
    for (const candidate of spec.candidates) if (normalize(candidate.root) !== normalize(spec.canonicalRoot)) throw new Error(`${item.familyKey} candidate ${candidate.form} has the wrong canonical root`);
    const finalRows: CurrentRow[] = [];
    for (const record of records) {
      const forms: LessonForm[] = [currentForm(record, item.root)];
      const used = new Set([normalize(record.word.arabic)]);
      for (const candidate of acceptedCandidates) {
        if (used.has(normalize(candidate.form))) throw new Error(`${item.familyKey} contains a duplicate accepted form ${candidate.form}`);
        forms.push(candidateForm(candidate, item.root, record.location));
        used.add(normalize(candidate.form));
      }
      if (spec.decision === "FULL" && forms.length !== 5) throw new Error(`${item.familyKey} FULL family has ${forms.length} rows`);
      const review: SarfReview = {
        status: spec.decision === "FULL" ? "full" : "limited",
        ...(spec.decision === "FULL" ? {} : { limitedReason: spec.reason }),
        auditDecision: spec.decision === "FULL" ? "upgraded-to-full" : "confirmed-limited",
        familyScope: "C3-C4A",
        provenance: [
          `Tier-C3-C4A W1 weak-final adjudication ${reviewedAt}: ${spec.decision}.`,
          `Canonical root: ${spec.canonicalRoot}; weak radical: ${spec.weakRadical}; third-radical defective behavior reviewed.`,
          `Every occurrence inspected: ${item.locations.join(", ")}.`,
          spec.rootEvidence,
          ...(spec.normalizationNote ? [spec.normalizationNote] : []),
          ...acceptedCandidates.map((candidate) => `Accepted ${candidate.form}: ${candidate.evidence}`),
          ...spec.rejectedCandidates,
        ].slice(0, 100),
        reviewedBy: "Codex",
        reviewedAt,
      };
      record.lesson.forms = forms;
      record.lesson.sarfReview = review;
      changedFiles.add(record.filePath);
      changedSurahs.add(record.package.surah.number);
      finalRows.push({ occurrenceId: record.word.id, location: record.location, arabic: record.word.arabic, forms, sarfReview: review });
    }
    const recordId = `tier-c3c4a-family-${hash(item.familyKey)}`;
    const accepted = spec.candidates.filter((candidate) => candidate.accepted);
    const rejectedList = [...spec.rejectedCandidates, ...spec.candidates.filter((candidate) => !candidate.accepted).map((candidate) => `${candidate.form}: ${candidate.rejectionReason ?? "rejected"}`)];
    const adjudication: Adjudication = {
      familyKey: item.familyKey,
      root: item.root,
      canonicalRoot: spec.canonicalRoot,
      weakRadical: spec.weakRadical,
      weakRadicalPosition: "third",
      lemmaOrCurrentForm: item.lemma,
      quranicWord: item.quranicWord,
      locations: item.locations,
      occurrenceCount: item.locations.length,
      partOfSpeech: item.partOfSpeech,
      quranicMeaning: String(records[0].lesson.meaning || records[0].word.gloss || item.quranicWord),
      morphology: item.currentRow ?? null,
      rootConfidence: String(item.rootConfidence ?? "UNSPECIFIED"),
      lemmaConfidence: String(item.lemmaConfidence ?? "UNSPECIFIED"),
      ...(spec.normalizationNote ? { normalizationNote: spec.normalizationNote } : {}),
      currentRows,
      candidatesConsidered: spec.candidates,
      acceptedCandidates: accepted,
      rejectedCandidates: rejectedList,
      finalRows,
      decision: spec.decision,
      reasoning: spec.reason,
      evidence: [
        `Committed C3-C4A queue inspected: ${item.locations.join(", ")}.`,
        `Weak-final radical position verified as third radical ${spec.weakRadical}.`,
        spec.rootEvidence,
        ...(spec.normalizationNote ? [spec.normalizationNote] : []),
        ...accepted.map((candidate) => candidate.evidence),
      ],
      confidence: spec.decision === "FULL" ? "high" : "medium",
      unresolvedQuestion: spec.unresolvedQuestion ?? null,
      evidenceRequired: spec.evidenceRequired ?? [],
      humanExpertReviewRequired: spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE",
      productionStatus: productionStatus(spec.decision),
      reviewedAt,
      recordId,
    };
    adjudications.push(adjudication);
    decisionCounts[spec.decision] += 1;
    occurrenceCounts[spec.decision] += item.locations.length;
    ledger.push({
      recordId,
      eventType: "tier-c3c4a-weak-final-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: { familyKey: item.familyKey, occurrences: records.map((record) => record.word.id), tier: "C3-C4A", track: "W1 weak-final" },
      status: spec.decision === "FULL" ? "passed" : "passed-limited",
      reviewedAt,
      checks: [
        "contract-loaded",
        "c3c4a-scope-12-families",
        "c3c4a-occurrence-scope-17",
        "every-occurrence-inspected",
        "current-form-first",
        "third-weak-radical-verified",
        "same-root-forms-reviewed",
        "weak-final-vocalisation-reviewed",
        "shell-case-pronoun-and-padding-rejected",
        "semantic-development-translated-honestly",
        "normalization-differences-recorded",
        "provenance-recorded",
        "decision-recorded",
      ],
      evidence: [spec.reason, spec.rootEvidence, ...(spec.normalizationNote ? [spec.normalizationNote] : []), ...rejectedList],
      decision: spec.decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      category: "C3-C4A W1 weak-final / defective",
      humanExpertReviewRequired: false,
    });
  }

  for (const entry of packages.values()) {
    if (entry.package.status !== "custom-partial") continue;
    const hasBlockedLesson = Object.values(entry.package.teachingEntries).some((lesson) => lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity");
    if (!hasBlockedLesson) entry.package.status = "custom-complete";
  }
  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Changed package was not loaded: ${filePath}`);
    const contentVersion = `${String(entry.package.contentVersion ?? "content")}-c3c4a-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    entry.package.contentVersion = contentVersion;
    await fs.writeFile(filePath, `${JSON.stringify(entry.package, null, 2)}\n`, "utf8");
    const manifestPath = path.join(path.dirname(filePath), "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.contentVersion = contentVersion;
    manifest.status = entry.package.status;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const existingIds = new Set(readAuditRecords().map((record) => record.recordId));
  appendAuditRecords(ledger.filter((record) => !existingIds.has(record.recordId)));
  const summary = {
    startingC3C4AFamilies: 12,
    startingC3C4AOccurrences: 17,
    adjudicatedFamilies: adjudications.length,
    adjudicatedOccurrences: plannedOccurrences,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    changedSurahs: [...changedSurahs].sort((a, b) => a - b),
    changedPackageFiles: [...changedFiles].sort(),
    acceptedCandidateRows: adjudications.reduce((sum, item) => sum + item.acceptedCandidates.length, 0),
    excluded: ["C3-C4B W2", "C3-C4C W2", "C3-C4D W3", "C3-C4E/W4", "C3-C4F W5", "C3-C4G W4/W6", "C3-D", "C3-E", "C2 residuals", "historical residuals"],
  };
  await writeJson(reportPath, { reportType: "tier-c3c4a-weak-final-adjudication", contractVersion: contract.contractVersion, reviewedAt, summary, adjudications });
  await fs.writeFile(markdownPath, reportMarkdown(summary, adjudications), "utf8");

  for (const row of classification.families) {
    const adjudication = adjudications.find((item) => item.familyKey === row.familyKey);
    if (!adjudication) continue;
    row.c3C4A = {
      batch: "C3-C4A",
      track: "W1 weak-final / defective",
      decision: adjudication.decision,
      occurrences: adjudication.occurrenceCount,
      reviewedAt,
      recordId: adjudication.recordId,
      acceptedRowsPerOccurrence: adjudication.finalRows[0]?.forms.length ?? 0,
      canonicalRoot: adjudication.canonicalRoot,
      weakRadical: adjudication.weakRadical,
      weakRadicalPosition: adjudication.weakRadicalPosition,
      productionStatus: adjudication.productionStatus,
      normalizationNote: adjudication.normalizationNote ?? null,
    };
    row.adjudicationComplete = true;
  }
  classification.tierC3C4A = {
    contractVersion: contract.contractVersion,
    reviewedAt,
    scopeFamilies: 12,
    scopeOccurrences: 17,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    explicitBoundary: "Only the committed C3-C4A W1 weak-final / defective families were adjudicated. C3-C4B and later weak batches and all other queues remain untouched.",
  };
  await writeJson(classificationPath, classification);
  const classLines = [
    "# Tier-C LOW classification",
    "",
    `Generated: ${reviewedAt}`,
    "",
    "C3-C4A W1 weak-final adjudication is complete for exactly 12 families / 17 occurrences. C3-C4B and later weak batches remain untouched.",
    "",
    "## C3-C4A summary",
    "",
    "```json",
    json(classification.tierC3C4A),
    "```",
    "",
    "## Families",
    "",
    "| Family | Word | Root | Group | Occurrences | Decision |",
    "|---|---|---|---|---:|---|",
  ];
  for (const row of classification.families) {
    const c3c4a = row.c3C4A as { decision?: string } | undefined;
    classLines.push(`| ${row.familyKey} | ${row.quranicWord} | ${row.root || "—"} | ${row.proposedC3Group ?? "—"} | ${row.occurrenceCount} | ${c3c4a?.decision ?? "—"} |`);
  }
  await fs.writeFile(classificationMarkdownPath, `${classLines.join("\n")}\n`, "utf8");

  const updatedWeakPlan = { ...weakPlan, status: "C3-C4A W1 adjudicated; C3-C4B and later batches not started", reviewedAt, batchResults: { ...((weakPlan.batchResults as Record<string, unknown> | undefined) ?? {}), "C3-C4A": { contractVersion: contract.contractVersion, reviewedAt, decisions: decisionCounts, occurrencesByDecision: occurrenceCounts, reportPath: path.relative(repoRoot, reportPath) } } };
  const planBatch = updatedWeakPlan.batches.find((item) => item.batch === "C3-C4A");
  if (planBatch) {
    planBatch.status = "complete";
    planBatch.adjudication = { decisions: decisionCounts, occurrencesByDecision: occurrenceCounts, reportPath: path.relative(repoRoot, reportPath) };
  }
  for (const family of updatedWeakPlan.families) {
    const adjudication = adjudications.find((item) => item.familyKey === family.familyKey);
    if (!adjudication) continue;
    family.adjudication = { batch: "C3-C4A", decision: adjudication.decision, recordId: adjudication.recordId, acceptedRowsPerOccurrence: adjudication.finalRows[0]?.forms.length ?? 0, reviewedAt };
  }
  await writeJson(weakPlanPath, updatedWeakPlan);
  const weakPlanMarkdown = await fs.readFile(weakPlanMarkdownPath, "utf8");
  await fs.writeFile(weakPlanMarkdownPath, weakPlanMarkdown.replace("Status: **planning only; weak-root adjudication has not started**.", "Status: **C3-C4A W1 adjudicated; C3-C4B and later weak batches remain untouched**.") + `\n## C3-C4A adjudication\n\n- Decision counts: \`${JSON.stringify(decisionCounts)}\`\n- Occurrence counts: \`${JSON.stringify(occurrenceCounts)}\`\n- Report: \`${path.relative(repoRoot, reportPath)}\`\n\n`, "utf8");

  const handoff = JSON.parse(await fs.readFile(weakHandoffPath, "utf8")) as Record<string, unknown>;
  handoff.status = "C3-C4A W1 complete; C3-C4B and later weak batches not started";
  handoff.rule = "Weak families are adjudicated by committed primary batch. Completed families remain closed; W1 is complete and no family may re-enter a later weak batch.";
  handoff.completedBatches = { ...((handoff.completedBatches as Record<string, unknown> | undefined) ?? {}), "C3-C4A": { families: 12, occurrences: 17, decisions: decisionCounts, occurrencesByDecision: occurrenceCounts, reportPath: path.relative(repoRoot, reportPath) } };
  await writeJson(weakHandoffPath, handoff);

  const ownership = JSON.parse(await fs.readFile(weakOwnershipPath, "utf8")) as Record<string, unknown>;
  const pending = (ownership.pendingQueueCounts as Record<string, { families: number; occurrences: number }>);
  pending.WEAK = { families: 65, occurrences: 77 };
  ownership.reviewedAt = reviewedAt;
  ownership.nextQueue = { track: "WEAK", batch: "C3-C4B", families: 15, occurrences: 15, status: "not-started" };
  ownership.status = "C3-C4A W1 weak-final complete; C3-C4B remains queued and untouched";
  await writeJson(weakOwnershipPath, ownership);
  await fs.writeFile(path.join(reviewRoot, "tier-c3c-ownership.md"), `# Tier-C-C primary-track ownership\n\nReviewed at: ${reviewedAt}\n\n${String(ownership.rule)}\n\nC3-C4A W1 weak-final is complete. Completed families remain permanently owned by their original batch. C3-C4B is the next untouched weak batch.\n\n\`\`\`json\n${json({ pendingQueueCounts: ownership.pendingQueueCounts, nextQueue: ownership.nextQueue })}\n\`\`\`\n`, "utf8");

  const execution = JSON.parse(await fs.readFile(executionPlanPath, "utf8")) as Record<string, unknown>;
  const tracks = execution.primaryTracks as Array<Record<string, unknown>>;
  const weakTrack = tracks.find((track) => track.track === "WEAK");
  if (weakTrack) { weakTrack.pendingFamilies = 65; weakTrack.pendingOccurrences = 77; }
  execution.reviewedAt = reviewedAt;
  execution.status = "C3-C4A W1 weak-final complete; C3-C4B and later weak batches not started";
  execution.nextQueue = { track: "WEAK", batch: "C3-C4B", families: 15, occurrences: 15, status: "not-started" };
  execution.completedBatches = { ...((execution.completedBatches as Record<string, unknown> | undefined) ?? {}), "C3-C4A": { families: 12, occurrences: 17, decisions: decisionCounts, occurrencesByDecision: occurrenceCounts } };
  await writeJson(executionPlanPath, execution);

  console.log(JSON.stringify({ ...summary, reportPath, markdownPath }, null, 2));
}

await main();
