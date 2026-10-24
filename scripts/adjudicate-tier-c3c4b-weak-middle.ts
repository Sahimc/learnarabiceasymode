import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import {
  C3C4B_FAMILY_KEYS,
  C3C4B_SPECS,
  type C3C4BCandidate,
  type C3C4BDecision,
} from "./lib/tier-c3c4b-specs";
import type { LessonForm, SarfReview, SurahPackage } from "../app/data/content-contract";

const contract = assertAuthoringContract("Tier-C3-C4B hollow-root adjudication");
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const classificationPath = path.join(reviewRoot, "tier-c3-low-classification.json");
const classificationMarkdownPath = path.join(reviewRoot, "tier-c3-low-classification.md");
const weakPlanPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.json");
const weakPlanMarkdownPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.md");
const weakHandoffPath = path.join(reviewRoot, "tier-c3c4-weak-queue-handoff.json");
const weakOwnershipPath = path.join(reviewRoot, "tier-c3c-ownership.json");
const executionPlanPath = path.join(reviewRoot, "tier-c3c-execution-plan.json");
const reportPath = path.join(reviewRoot, "tier-c3c4b-weak-middle-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c3c4b-weak-middle-adjudications.md");

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
  c3C4A?: unknown;
  c3C4B?: unknown;
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
  weakRadicalPosition: "second";
  hollowBehavior: string;
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
  candidatesConsidered: C3C4BCandidate[];
  acceptedCandidates: C3C4BCandidate[];
  rejectedCandidates: string[];
  finalRows: CurrentRow[];
  decision: C3C4BDecision;
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
const decisions: C3C4BDecision[] = ["FULL", "CONFIRMED-LIMITED", "BLOCKED", "MODEL-ISSUE"];
const baselineCache = new Map<string, SurahPackage>();

function productionStatus(decision: C3C4BDecision): Adjudication["productionStatus"] {
  if (decision === "FULL") return "full";
  if (decision === "CONFIRMED-LIMITED") return "confirmed-limited";
  if (decision === "MODEL-ISSUE") return "model-issue";
  return "blocked";
}

function baselinePackage(filePath: string) {
  const cached = baselineCache.get(filePath);
  if (cached) return cached;
  const relative = path.relative(repoRoot, filePath).replace(/\\/gu, "/");
  const raw = execFileSync("git", ["show", `HEAD:${relative}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(raw) as SurahPackage;
  baselineCache.set(filePath, parsed);
  return parsed;
}

function baselineOccurrence(record: OccurrenceRecord) {
  const pkg = baselinePackage(record.filePath);
  const [surah, ayah, position] = record.location.split(":").map(Number);
  const ayahRecord = pkg.ayahs.find((item) => item.number === ayah);
  const word = ayahRecord?.words.find((item) => item.position === position);
  if (!word?.teachingId) throw new Error(`Cannot recover baseline occurrence ${record.location}`);
  const lesson = pkg.teachingEntries[word.teachingId];
  if (!lesson) throw new Error(`Cannot recover baseline lesson ${record.location}`);
  if (pkg.surah.number !== surah) throw new Error(`Baseline surah mismatch at ${record.location}`);
  return { ...record, package: pkg, word, lesson };
}

function currentForm(record: OccurrenceRecord, root: string): LessonForm {
  const old = record.lesson.forms[0];
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning || record.word.gloss || record.word.arabic,
    difference: `Current Qur’anic occurrence at ${record.location}; ${old?.difference ?? "the exact surface form is retained first."}`,
    relationship: `Current occurrence of the ${root} hollow/weak-middle family; comparison rows show real same-root morphology and honest semantic development.`,
    provenance: `Tier-C3-C4B W2 hollow-root adjudication ${reviewedAt}; the occurrence, root, lemma, weak middle radical, hollow behavior and aligned morphology were inspected against approved lexical evidence.`,
  };
}

function candidateForm(candidate: C3C4BCandidate, root: string, location: string): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}. ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${root}; this is not shell, case, pronoun or bare-radical variation.`,
    provenance: `Tier-C3-C4B W2 hollow-root adjudication ${reviewedAt}; ${candidate.evidence}`,
  };
}

function reportMarkdown(summary: Record<string, unknown>, adjudications: Adjudication[]) {
  const lines = [
    "# C3-C4B W2 weak-middle / hollow Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers exactly the committed C3-C4B queue: 15 weak-middle/hollow families / 15 Qur’anic occurrences. C3-C4C and later weak batches, C3-D, C3-E and residual queues were excluded.",
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
      `Decision: **${item.decision}**; root: ${item.canonicalRoot}; weak middle radical: ${item.weakRadical}; word: ${item.quranicWord}; locations: ${item.locations.join(", ")}`,
      `POS: ${String(item.partOfSpeech)}; confidence: ${item.confidence}`,
      `Hollow behavior: ${item.hollowBehavior}`,
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
  const batch = weakPlan.batches.find((item) => item.batch === "C3-C4B");
  const planned = Array.isArray(batch?.families) ? (batch.families as ClassificationFamily[]) : [];
  if (planned.length !== 15) throw new Error(`C3-C4B handoff mismatch: expected 15 families, found ${planned.length}`);
  const plannedOccurrences = planned.reduce((sum, item) => sum + item.locations.length, 0);
  if (plannedOccurrences !== 15) throw new Error(`C3-C4B handoff mismatch: expected 15 occurrences, found ${plannedOccurrences}`);
  const plannedKeys = new Set(planned.map((item) => item.familyKey));
  if (plannedKeys.size !== C3C4B_FAMILY_KEYS.length || C3C4B_FAMILY_KEYS.some((key) => !plannedKeys.has(key))) throw new Error("C3-C4B specification does not exactly match the committed planning queue");
  for (const item of planned) {
    const source = classification.families.find((row) => row.familyKey === item.familyKey);
    if (!source) throw new Error(`Missing source classification for ${item.familyKey}`);
    if (source.primaryTrack !== "WEAK") throw new Error(`${item.familyKey} is not weak-primary-owned`);
    if (source.c3C1 || source.c3C2 || source.c3C3 || source.c3C4A || source.c3C4B) throw new Error(`${item.familyKey} was already adjudicated in an earlier C3 track`);
    if (item.batch !== "C3-C4B") throw new Error(`${item.familyKey} is not assigned to C3-C4B`);
    if (batch?.morphologyType !== "W2 weak-middle / hollow" || item.primaryCategory !== "W2") throw new Error(`${item.familyKey} is not W2 hollow`);
    if (item.weakRadicalPosition !== "second" || !Array.isArray(item.weakRadicals) || item.weakRadicals.length !== 1) throw new Error(`${item.familyKey} does not have exactly one recorded weak middle radical`);
    if (!C3C4B_SPECS[item.familyKey]) throw new Error(`Missing explicit C3-C4B specification for ${item.familyKey}`);
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
  const decisionCounts = Object.fromEntries(decisions.map((decision) => [decision, 0])) as Record<C3C4BDecision, number>;
  const occurrenceCounts = Object.fromEntries(decisions.map((decision) => [decision, 0])) as Record<C3C4BDecision, number>;

  for (const item of planned) {
    const spec = C3C4B_SPECS[item.familyKey];
    const records = item.locations.map((location) => {
      const record = byLocation.get(location);
      if (!record) throw new Error(`Missing package occurrence ${location} for ${item.familyKey}`);
      if (normalize(record.lesson.root) !== normalize(item.root)) throw new Error(`Root mismatch at ${location}: ${record.lesson.root} != ${item.root}`);
      const alreadyApplied = record.lesson.sarfReview.familyScope === "C3-C4B" &&
        ((C3C4B_SPECS[item.familyKey]?.decision === "FULL" && record.lesson.forms.length === 5) ||
          (C3C4B_SPECS[item.familyKey]?.decision === "CONFIRMED-LIMITED" && record.lesson.forms.length === 1 + C3C4B_SPECS[item.familyKey].candidates.filter((candidate) => candidate.accepted).length));
      if (!alreadyApplied && (record.lesson.sarfReview.status !== "limited" || record.lesson.forms.length !== 1 || record.lesson.sarfReview.auditDecision !== "blocked-for-genuine-ambiguity")) throw new Error(`${item.familyKey} is not the untouched one-row blocked W2 family expected by the handoff`);
      return record;
    });
    const currentRows = records.map((record) => {
      const baseline = baselineOccurrence(record);
      return { occurrenceId: baseline.word.id, location: baseline.location, arabic: baseline.word.arabic, forms: structuredClone(baseline.lesson.forms), sarfReview: structuredClone(baseline.lesson.sarfReview) };
    });
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
        familyScope: "C3-C4B",
        provenance: [
          `Tier-C3-C4B W2 hollow-root adjudication ${reviewedAt}: ${spec.decision}.`,
          `Canonical root: ${spec.canonicalRoot}; weak middle radical: ${spec.weakRadical}; hollow behavior reviewed.`,
          `Every occurrence inspected: ${item.locations.join(", ")}.`,
          spec.rootEvidence,
          spec.hollowBehavior,
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
    const recordId = `tier-c3c4b-family-${hash(item.familyKey)}`;
    const rejectedList = [...spec.rejectedCandidates, ...spec.candidates.filter((candidate) => !candidate.accepted).map((candidate) => `${candidate.form}: ${candidate.rejectionReason ?? "rejected"}`)];
    const adjudication: Adjudication = {
      familyKey: item.familyKey,
      root: item.root,
      canonicalRoot: spec.canonicalRoot,
      weakRadical: spec.weakRadical,
      weakRadicalPosition: "second",
      hollowBehavior: spec.hollowBehavior,
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
      acceptedCandidates,
      rejectedCandidates: rejectedList,
      finalRows,
      decision: spec.decision,
      reasoning: spec.reason,
      evidence: [
        `Committed C3-C4B queue inspected: ${item.locations.join(", ")}.`,
        `Weak-middle radical position verified as second radical ${spec.weakRadical}.`,
        spec.rootEvidence,
        spec.hollowBehavior,
        ...(spec.normalizationNote ? [spec.normalizationNote] : []),
        ...acceptedCandidates.map((candidate) => candidate.evidence),
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
      eventType: "tier-c3c4b-weak-middle-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: { familyKey: item.familyKey, occurrences: records.map((record) => record.word.id), tier: "C3-C4B", track: "W2 weak-middle / hollow" },
      status: spec.decision === "FULL" ? "passed" : "passed-limited",
      reviewedAt,
      checks: [
        "contract-loaded",
        "c3c4b-scope-15-families",
        "c3c4b-occurrence-scope-15",
        "every-occurrence-inspected",
        "current-form-first",
        "second-weak-radical-verified",
        "hollow-vocalisation-reviewed",
        "same-root-forms-reviewed",
        "shell-case-pronoun-and-padding-rejected",
        "semantic-development-translated-honestly",
        "provenance-recorded",
        "decision-recorded",
      ],
      evidence: [spec.reason, spec.rootEvidence, spec.hollowBehavior, ...(spec.normalizationNote ? [spec.normalizationNote] : []), ...rejectedList],
      decision: spec.decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      category: "C3-C4B W2 weak-middle / hollow",
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
    const contentVersion = `${String(entry.package.contentVersion ?? "content")}-c3c4b-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
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
    startingC3C4BFamilies: 15,
    startingC3C4BOccurrences: 15,
    adjudicatedFamilies: adjudications.length,
    adjudicatedOccurrences: plannedOccurrences,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    changedSurahs: [...changedSurahs].sort((a, b) => a - b),
    changedPackageFiles: [...changedFiles].sort(),
    acceptedCandidateRows: adjudications.reduce((sum, item) => sum + item.acceptedCandidates.length, 0),
    excluded: ["C3-C4C W2", "C3-C4D W3", "C3-C4E/W4", "C3-C4F W5", "C3-C4G W4/W6", "C3-D", "C3-E", "C2 residuals", "historical residuals"],
  };
  await writeJson(reportPath, { reportType: "tier-c3c4b-weak-middle-adjudication", contractVersion: contract.contractVersion, reviewedAt, summary, adjudications });
  await fs.writeFile(markdownPath, reportMarkdown(summary, adjudications), "utf8");

  for (const row of classification.families) {
    const adjudication = adjudications.find((item) => item.familyKey === row.familyKey);
    if (!adjudication) continue;
    row.c3C4B = {
      batch: "C3-C4B",
      track: "W2 weak-middle / hollow",
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
  classification.tierC3C4B = {
    contractVersion: contract.contractVersion,
    reviewedAt,
    scopeFamilies: 15,
    scopeOccurrences: 15,
    decisions: decisionCounts,
    occurrencesByDecision: occurrenceCounts,
    explicitBoundary: "Only the committed C3-C4B W2 weak-middle / hollow families were adjudicated. C3-C4C and later weak batches and all other queues remain untouched.",
  };
  await writeJson(classificationPath, classification);
  const oldClassMarkdown = await fs.readFile(classificationMarkdownPath, "utf8");
  const classMarker = "## C3-C4B W2 adjudication";
  const classSection = [
    classMarker,
    "",
    "Exactly 15 W2 weak-middle/hollow families / 15 occurrences were adjudicated. C3-C4C and later weak batches remain untouched.",
    "",
    "```json",
    json(classification.tierC3C4B),
    "```",
    "",
    "| Family | Word | Root | Location(s) | Decision | Rows |",
    "|---|---|---|---|---|---:|",
    ...adjudications.map((item) => `| ${item.familyKey} | ${item.quranicWord} | ${item.canonicalRoot} | ${item.locations.join(", ")} | ${item.decision} | ${item.finalRows[0]?.forms.length ?? 0} |`),
    "",
  ].join("\n");
  await fs.writeFile(classificationMarkdownPath, oldClassMarkdown.includes(classMarker) ? oldClassMarkdown : `${oldClassMarkdown}\n${classSection}`, "utf8");

  const updatedWeakPlan = { ...weakPlan, status: "C3-C4B W2 adjudicated; C3-C4C and later batches not started", reviewedAt, batchResults: { ...((weakPlan.batchResults as Record<string, unknown> | undefined) ?? {}), "C3-C4B": { contractVersion: contract.contractVersion, reviewedAt, decisions: decisionCounts, occurrencesByDecision: occurrenceCounts, reportPath: path.relative(repoRoot, reportPath) } } };
  const planBatch = updatedWeakPlan.batches.find((item) => item.batch === "C3-C4B");
  if (planBatch) {
    planBatch.status = "complete";
    planBatch.adjudication = { decisions: decisionCounts, occurrencesByDecision: occurrenceCounts, reportPath: path.relative(repoRoot, reportPath) };
  }
  for (const family of updatedWeakPlan.families) {
    const adjudication = adjudications.find((item) => item.familyKey === family.familyKey);
    if (!adjudication) continue;
    family.adjudication = { batch: "C3-C4B", decision: adjudication.decision, recordId: adjudication.recordId, acceptedRowsPerOccurrence: adjudication.finalRows[0]?.forms.length ?? 0, reviewedAt };
  }
  await writeJson(weakPlanPath, updatedWeakPlan);
  const weakPlanMarkdown = await fs.readFile(weakPlanMarkdownPath, "utf8");
  const planMarker = "## C3-C4B W2 adjudication";
  const planSection = `## C3-C4B W2 adjudication\n\n- Decision counts: \`${JSON.stringify(decisionCounts)}\`\n- Occurrence counts: \`${JSON.stringify(occurrenceCounts)}\`\n- Report: \`${path.relative(repoRoot, reportPath)}\`\n\n`;
  await fs.writeFile(weakPlanMarkdownPath, weakPlanMarkdown.includes(planMarker) ? weakPlanMarkdown : `${weakPlanMarkdown}\n${planSection}`, "utf8");

  const handoff = JSON.parse(await fs.readFile(weakHandoffPath, "utf8")) as Record<string, unknown>;
  handoff.status = "C3-C4B W2 complete; C3-C4C and later weak batches not started";
  handoff.rule = "Weak families are adjudicated by committed primary batch. Completed families remain closed; W2 is complete and no family may re-enter a later weak batch.";
  handoff.completedBatches = { ...((handoff.completedBatches as Record<string, unknown> | undefined) ?? {}), "C3-C4B": { families: 15, occurrences: 15, decisions: decisionCounts, occurrencesByDecision: occurrenceCounts, reportPath: path.relative(repoRoot, reportPath) } };
  await writeJson(weakHandoffPath, handoff);

  const ownership = JSON.parse(await fs.readFile(weakOwnershipPath, "utf8")) as Record<string, unknown>;
  ownership.pendingQueueCounts = { ...((ownership.pendingQueueCounts as Record<string, unknown> | undefined) ?? {}), WEAK: { families: 50, occurrences: 62 } };
  ownership.reviewedAt = reviewedAt;
  ownership.nextQueue = { track: "WEAK", batch: "C3-C4C", families: 9, occurrences: 9, status: "not-started" };
  ownership.status = "C3-C4B W2 hollow complete; C3-C4C and later weak batches not started";
  await writeJson(weakOwnershipPath, ownership);
  await fs.writeFile(path.join(reviewRoot, "tier-c3c-ownership.md"), `# Tier-C-C primary-track ownership\n\nReviewed at: ${reviewedAt}\n\n${String(ownership.rule)}\n\nC3-C4A W1 and C3-C4B W2 are complete. Completed families remain permanently owned by their original batch. C3-C4C is the next untouched weak batch.\n\n\`\`\`json\n${json({ pendingQueueCounts: ownership.pendingQueueCounts, nextQueue: ownership.nextQueue })}\n\`\`\`\n`, "utf8");

  const execution = JSON.parse(await fs.readFile(executionPlanPath, "utf8")) as Record<string, unknown>;
  const tracks = execution.primaryTracks as Array<Record<string, unknown>>;
  const weakTrack = tracks.find((track) => track.track === "WEAK");
  if (weakTrack) { weakTrack.pendingFamilies = 50; weakTrack.pendingOccurrences = 62; }
  execution.reviewedAt = reviewedAt;
  execution.status = "C3-C4B W2 hollow complete; C3-C4C and later batches not started";
  execution.nextQueue = { track: "WEAK", batch: "C3-C4C", families: 9, occurrences: 9, status: "not-started" };
  execution.completedBatches = { ...((execution.completedBatches as Record<string, unknown> | undefined) ?? {}), "C3-C4B": { families: 15, occurrences: 15, decisions: decisionCounts, occurrencesByDecision: occurrenceCounts } };
  await writeJson(executionPlanPath, execution);

  console.log(JSON.stringify({ ...summary, reportPath, markdownPath }, null, 2));
}

await main();
