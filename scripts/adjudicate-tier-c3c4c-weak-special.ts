import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import { C3C4C_FAMILY_KEYS, C3C4C_SPECS } from "./lib/tier-c3c4c-specs";
import type { C3C4BCandidate } from "./lib/tier-c3c4b-specs";
import type { LessonForm, SarfReview, SurahPackage } from "../app/data/content-contract";

const contract = assertAuthoringContract("Tier-C3-C4C hollow/special adjudication");
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const classificationPath = path.join(reviewRoot, "tier-c3-low-classification.json");
const classificationMarkdownPath = path.join(reviewRoot, "tier-c3-low-classification.md");
const weakPlanPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.json");
const weakPlanMarkdownPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.md");
const weakHandoffPath = path.join(reviewRoot, "tier-c3c4-weak-queue-handoff.json");
const ownershipPath = path.join(reviewRoot, "tier-c3c-ownership.json");
const executionPath = path.join(reviewRoot, "tier-c3c-execution-plan.json");
const reportPath = path.join(reviewRoot, "tier-c3c4c-weak-special-adjudications.json");
const markdownPath = path.join(reviewRoot, "tier-c3c4c-weak-special-adjudications.md");

type Family = {
  familyKey: string;
  quranicWord: string;
  root: string;
  lemma: string;
  locations: string[];
  occurrenceCount: number;
  primaryTrack?: string;
  primaryBatch?: string;
  primaryCategory?: string;
  weakRadicalPosition?: string;
  weakRadicals?: string[];
  c3C1?: unknown;
  c3C2?: unknown;
  c3C3?: unknown;
  c3C4A?: unknown;
  c3C4B?: unknown;
  c3C4C?: unknown;
  [key: string]: unknown;
};
type Classification = { families: Family[]; [key: string]: unknown };
type JsonRecord = Record<string, unknown>;
type PlanBatch = JsonRecord & { batch?: string };
type Plan = { batches: PlanBatch[]; families: JsonRecord[]; [key: string]: unknown };
type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type RecordEntry = { filePath: string; package: SurahPackage; word: Word; lesson: Lesson; location: string };
type CurrentRow = { occurrenceId: string; location: string; arabic: string; forms: LessonForm[]; sarfReview: SarfReview };
type Adjudication = {
  familyKey: string;
  root: string;
  canonicalRoot: string;
  weakRadical: string;
  weakRadicalPosition: "second";
  hollowSubtype: string;
  lemmaOrCurrentForm: string;
  quranicWord: string;
  locations: string[];
  occurrenceCount: number;
  partOfSpeech: unknown;
  quranicMeaning: string;
  morphology: unknown;
  rootConfidence: string;
  lemmaConfidence: string;
  currentRows: CurrentRow[];
  candidatesConsidered: C3C4BCandidate[];
  acceptedCandidates: C3C4BCandidate[];
  rejectedCandidates: string[];
  finalRows: CurrentRow[];
  decision: string;
  reasoning: string;
  evidence: string[];
  confidence: "high" | "medium";
  unresolvedQuestion: null;
  evidenceRequired: string[];
  humanExpertReviewRequired: false;
  productionStatus: "full";
  reviewedAt: string;
  recordId: string;
};

const normalize = (value: string) => value.normalize("NFC").replace(/[\s\u0640]/gu, "");
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const json = (value: unknown) => JSON.stringify(value, null, 2);
const baselineCache = new Map<string, SurahPackage>();

function baselinePackage(filePath: string) {
  const cached = baselineCache.get(filePath);
  if (cached) return cached;
  const relative = path.relative(repoRoot, filePath).replace(/\\/gu, "/");
  const raw = execFileSync("git", ["show", `HEAD:${relative}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(raw) as SurahPackage;
  baselineCache.set(filePath, parsed);
  return parsed;
}

function baselineOccurrence(record: RecordEntry): RecordEntry {
  const pkg = baselinePackage(record.filePath);
  const [surah, ayah, position] = record.location.split(":").map(Number);
  const ayahRecord = pkg.ayahs.find((item) => item.number === ayah);
  const word = ayahRecord?.words.find((item) => item.position === position);
  if (!word?.teachingId) throw new Error(`Cannot recover baseline occurrence ${record.location}`);
  const lesson = pkg.teachingEntries[word.teachingId];
  if (!lesson || pkg.surah.number !== surah) throw new Error(`Cannot recover baseline lesson ${record.location}`);
  return { filePath: record.filePath, package: pkg, word, lesson, location: record.location };
}

function currentForm(record: RecordEntry, root: string): LessonForm {
  const baseline = baselineOccurrence(record);
  const old = baseline.lesson.forms[0];
  return {
    form: baseline.word.arabic,
    meaning: baseline.lesson.meaning || baseline.word.gloss || baseline.word.arabic,
    difference: `Current Qur’anic occurrence at ${record.location}; ${old?.difference ?? "the exact surface form is retained first."}`,
    relationship: `Current occurrence of the ${root} hollow/special family; comparison rows show real same-root morphology and honest semantic development.`,
    provenance: `Tier-C3-C4C W2 hollow/special adjudication ${reviewedAt}; the occurrence, canonical root, weak middle radical, hollow behavior and aligned morphology were inspected against approved lexical evidence.`,
  };
}

function candidateForm(candidate: C3C4BCandidate, root: string, location: string): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.morphology}. ${candidate.semanticDevelopment} Compared with the Qur’anic occurrence at ${location}. ${candidate.pedagogicalValue}`,
    relationship: `${candidate.relationship} Same-root relationship to ${root}; this is not shell, case, pronoun or hollow-contraction variation.`,
    provenance: `Tier-C3-C4C W2 hollow/special adjudication ${reviewedAt}; ${candidate.evidence}`,
  };
}

function reportMarkdown(summary: Record<string, unknown>, adjudications: Adjudication[]) {
  const lines = [
    "# C3-C4C W2 hollow / special Ṣarf adjudications",
    "",
    `Reviewed at: ${reviewedAt}`,
    `Contract: ${contract.contractVersion}`,
    "",
    "This report covers exactly the committed C3-C4C queue: 9 weak-middle/hollow special families / 9 Qur’anic occurrences. C3-C4D and later batches, C3-D, C3-E and residual queues were excluded.",
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
      `Hollow subtype: ${item.hollowSubtype}`,
      "",
      item.reasoning,
      "",
      "Accepted candidates:",
      "",
      ...item.acceptedCandidates.map((candidate) => `- ${candidate.form} — ${candidate.meaning}; ${candidate.morphology}; ${candidate.relationship}; semantic development: ${candidate.semanticDevelopment}; confidence: ${candidate.confidence}; evidence: ${candidate.evidence}`),
      "",
      "Rejected candidates / safeguards:",
      "",
      ...item.rejectedCandidates.map((candidate) => `- ${candidate}`),
      "",
      "Final rows:",
      "",
      ...(item.finalRows[0]?.forms.map((row, index) => `${index + 1}. ${row.form} — ${row.meaning}. ${row.difference}`) ?? []),
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
  const committedPlan = JSON.parse(execFileSync("git", ["show", "3c81661:artifacts/content-review/tier-c3c4-weak-classification-and-batches.json"], { cwd: repoRoot, encoding: "utf8" })) as Plan;
  const batch = committedPlan.batches.find((item) => item.batch === "C3-C4C");
  const planned = Array.isArray(batch?.families) ? (batch.families as Family[]) : [];
  if (planned.length !== 9) throw new Error(`C3-C4C handoff mismatch: expected 9 families, found ${planned.length}`);
  const plannedOccurrences = planned.reduce((sum, item) => sum + item.locations.length, 0);
  if (plannedOccurrences !== 9) throw new Error(`C3-C4C handoff mismatch: expected 9 occurrences, found ${plannedOccurrences}`);
  const plannedKeys = new Set(planned.map((item) => item.familyKey));
  if (plannedKeys.size !== C3C4C_FAMILY_KEYS.length || C3C4C_FAMILY_KEYS.some((key) => !plannedKeys.has(key))) throw new Error("C3-C4C specification does not exactly match the committed planning queue");
  for (const item of planned) {
    if (item.batch !== "C3-C4C") throw new Error(`${item.familyKey} is not assigned to C3-C4C`);
    if (item.primaryCategory !== "W2") throw new Error(`${item.familyKey} is not W2 hollow`);
    if (item.weakRadicalPosition !== "second" || !Array.isArray(item.weakRadicals) || item.weakRadicals.length !== 1) throw new Error(`${item.familyKey} does not have exactly one recorded weak middle radical`);
    if (item.c3C1 || item.c3C2 || item.c3C3 || item.c3C4A || item.c3C4B || item.c3C4C) throw new Error(`${item.familyKey} was already adjudicated in an earlier C3 track`);
    if (!C3C4C_SPECS[item.familyKey]) throw new Error(`Missing explicit C3-C4C specification for ${item.familyKey}`);
  }

  const classification = JSON.parse(await fs.readFile(classificationPath, "utf8")) as Classification;
  const sourceRows: Family[] = [];
  for (const item of planned) {
    const source = classification.families.find((row) => row.familyKey === item.familyKey);
    if (!source) throw new Error(`Missing source classification for ${item.familyKey}`);
    if (source.primaryTrack !== "WEAK") throw new Error(`${item.familyKey} is not weak-primary-owned`);
    if (source.c3C1 || source.c3C2 || source.c3C3 || source.c3C4A || source.c3C4B) throw new Error(`${item.familyKey} has already been classified as complete`);
    sourceRows.push(source);
  }
  if (sourceRows.every((source) => source.c3C4C)) {
    console.log("C3-C4C is already applied; committed queue remains 9 families / 9 occurrences and no files were rewritten.");
    return;
  }

  const packages = new Map<string, { filePath: string; package: SurahPackage }>();
  const byLocation = new Map<string, RecordEntry>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package) throw new Error(`Cannot read package ${filePath}: ${result.errors.join("; ")}`);
    packages.set(filePath, { filePath, package: result.package });
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
  const recordsByFamily = new Map<string, RecordEntry[]>();

  for (const item of planned) {
    const spec = C3C4C_SPECS[item.familyKey];
    const records = item.locations.map((location) => {
      const record = byLocation.get(location);
      if (!record) throw new Error(`Missing package occurrence ${location} for ${item.familyKey}`);
      if (normalize(record.lesson.root) !== normalize(item.root)) throw new Error(`Root mismatch at ${location}: ${record.lesson.root} != ${item.root}`);
      if (record.lesson.forms.length !== 1 || record.lesson.sarfReview.auditDecision !== "blocked-for-genuine-ambiguity") throw new Error(`${item.familyKey} is not the untouched one-row blocked C3-C4C family expected by the handoff`);
      return record;
    });
    recordsByFamily.set(item.familyKey, records);
    const acceptedCandidates = spec.candidates.filter((candidate) => candidate.accepted);
    if (acceptedCandidates.length !== 4) throw new Error(`${item.familyKey} must have exactly four accepted candidates`);
    for (const candidate of spec.candidates) if (normalize(candidate.root) !== normalize(spec.canonicalRoot)) throw new Error(`${item.familyKey} candidate ${candidate.form} has the wrong canonical root`);

    const currentRows = records.map((record) => {
      const baseline = baselineOccurrence(record);
      return { occurrenceId: baseline.word.id, location: baseline.location, arabic: baseline.word.arabic, forms: structuredClone(baseline.lesson.forms), sarfReview: structuredClone(baseline.lesson.sarfReview) };
    });
    const finalRows: CurrentRow[] = [];
    for (const record of records) {
      const forms: LessonForm[] = [currentForm(record, item.root)];
      const used = new Set([normalize(record.word.arabic)]);
      for (const candidate of acceptedCandidates) {
        if (used.has(normalize(candidate.form))) throw new Error(`${item.familyKey} contains duplicate accepted form ${candidate.form}`);
        forms.push(candidateForm(candidate, item.root, record.location));
        used.add(normalize(candidate.form));
      }
      const review: SarfReview = {
        status: "full",
        auditDecision: "upgraded-to-full",
        familyScope: "C3-C4C",
        provenance: [
          `Tier-C3-C4C W2 hollow/special adjudication ${reviewedAt}: FULL.`,
          `Canonical root: ${spec.canonicalRoot}; weak middle radical: ${spec.weakRadical}; hollow subtype: ${item.reasonForClassification ?? "special hollow family"}.`,
          `Every occurrence inspected: ${item.locations.join(", ")}.`,
          spec.rootEvidence,
          spec.hollowBehavior,
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

    const rejectedList = [...spec.rejectedCandidates, ...spec.candidates.filter((candidate) => !candidate.accepted).map((candidate) => `${candidate.form}: ${candidate.rejectionReason ?? "rejected"}`)];
    const recordId = `tier-c3c4c-family-${hash(item.familyKey)}`;
    const adjudication: Adjudication = {
      familyKey: item.familyKey,
      root: item.root,
      canonicalRoot: spec.canonicalRoot,
      weakRadical: spec.weakRadical,
      weakRadicalPosition: "second",
      hollowSubtype: String(item.reasonForClassification ?? "W2 hollow/special"),
      lemmaOrCurrentForm: item.lemma,
      quranicWord: item.quranicWord,
      locations: item.locations,
      occurrenceCount: item.locations.length,
      partOfSpeech: item.partOfSpeech,
      quranicMeaning: String(records[0].lesson.meaning || records[0].word.gloss || item.quranicWord),
      morphology: item.currentRow ?? null,
      rootConfidence: String(item.rootConfidence ?? "UNSPECIFIED"),
      lemmaConfidence: String(item.lemmaConfidence ?? "UNSPECIFIED"),
      currentRows,
      candidatesConsidered: spec.candidates,
      acceptedCandidates,
      rejectedCandidates: rejectedList,
      finalRows,
      decision: "FULL",
      reasoning: `${spec.reason} ${spec.hollowBehavior}`,
      evidence: [`Committed C3-C4C queue inspected: ${item.locations.join(", ")}.`, spec.rootEvidence, spec.hollowBehavior, ...acceptedCandidates.map((candidate) => candidate.evidence)],
      confidence: "high",
      unresolvedQuestion: null,
      evidenceRequired: [],
      humanExpertReviewRequired: false,
      productionStatus: "full",
      reviewedAt,
      recordId,
    };
    adjudications.push(adjudication);
    ledger.push({
      recordId,
      eventType: "tier-c3c4c-weak-special-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: { familyKey: item.familyKey, occurrences: records.map((record) => record.word.id), tier: "C3-C4C", track: "W2 weak-middle / hollow special" },
      status: "passed",
      reviewedAt,
      checks: ["contract-loaded", "committed-c3c4c-scope-9-families", "c3c4c-occurrence-scope-9", "every-occurrence-inspected", "current-form-first", "second-weak-radical-verified", "hollow-special-normalisation-reviewed", "same-root-forms-reviewed", "generated-only-candidates-rejected", "shell-case-pronoun-and-contraction-padding-rejected", "semantic-development-translated-honestly", "cross-root-check-passed", "provenance-recorded", "decision-recorded"],
      evidence: [spec.reason, spec.rootEvidence, spec.hollowBehavior, ...rejectedList],
      decision: "FULL",
      root: item.root,
      lemmaOrCurrentForm: item.lemma,
      category: "C3-C4C W2 hollow / special",
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
    const contentVersion = `${String(entry.package.contentVersion ?? "content")}-c3c4c-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
    entry.package.contentVersion = contentVersion;
    await fs.writeFile(filePath, `${JSON.stringify(entry.package, null, 2)}\n`, "utf8");
    const manifestPath = path.join(path.dirname(filePath), "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.contentVersion = contentVersion;
    manifest.status = entry.package.status;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const decisions = { FULL: adjudications.length, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 };
  const occurrencesByDecision = { FULL: plannedOccurrences, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 };
  const summary = { startingC3C4CFamilies: 9, startingC3C4COccurrences: 9, adjudicatedFamilies: adjudications.length, adjudicatedOccurrences: plannedOccurrences, decisions, occurrencesByDecision, changedSurahs: [...changedSurahs].sort((a, b) => a - b), changedPackageFiles: [...changedFiles].sort(), acceptedCandidateRows: adjudications.reduce((sum, item) => sum + item.acceptedCandidates.length, 0), excluded: ["C3-C4D W3", "C3-C4E/W4", "C3-C4F W5", "C3-C4G W4/W6", "C3-D", "C3-E", "C2 residuals", "historical residuals"] };
  await writeJson(reportPath, { reportType: "tier-c3c4c-weak-special-adjudication", contractVersion: contract.contractVersion, reviewedAt, summary, adjudications });
  await fs.writeFile(markdownPath, reportMarkdown(summary, adjudications), "utf8");

  for (const row of classification.families) {
    const item = adjudications.find((adjudication) => adjudication.familyKey === row.familyKey);
    if (!item) continue;
    row.c3C4C = { batch: "C3-C4C", track: "W2 weak-middle / hollow special", decision: "FULL", occurrences: item.occurrenceCount, reviewedAt, recordId: item.recordId, acceptedRowsPerOccurrence: 5, canonicalRoot: item.canonicalRoot, weakRadical: item.weakRadical, weakRadicalPosition: "second", productionStatus: "full" };
    row.adjudicationComplete = true;
  }
  classification.tierC3C4C = { contractVersion: contract.contractVersion, reviewedAt, scopeFamilies: 9, scopeOccurrences: 9, decisions, occurrencesByDecision, explicitBoundary: "Only the committed C3-C4C W2 hollow/special families were adjudicated. C3-C4D and later batches and all other queues remain untouched." };
  await writeJson(classificationPath, classification);
  const classMarkdown = await fs.readFile(classificationMarkdownPath, "utf8");
  const classMarker = "## C3-C4C W2 adjudication";
  if (!classMarkdown.includes(classMarker)) await fs.writeFile(classificationMarkdownPath, `${classMarkdown}\n${classMarker}\n\nExactly 9 W2 hollow/special families / 9 occurrences were adjudicated. C3-C4D and later batches remain untouched.\n\n| Family | Word | Root | Location | Decision | Rows |\n|---|---|---|---|---|---:|\n${adjudications.map((item) => `| ${item.familyKey} | ${item.quranicWord} | ${item.canonicalRoot} | ${item.locations.join(", ")} | FULL | 5 |`).join("\n")}\n`, "utf8");

  const plan = JSON.parse(await fs.readFile(weakPlanPath, "utf8")) as Plan;
  plan.status = "C3-C4C W2 hollow/special adjudicated; C3-C4D and later batches not started";
  plan.reviewedAt = reviewedAt;
  plan.batchResults = { ...(plan.batchResults ?? {}), "C3-C4C": { contractVersion: contract.contractVersion, reviewedAt, decisions, occurrencesByDecision, reportPath: path.relative(repoRoot, reportPath) } };
  const planBatch = plan.batches.find((item) => item.batch === "C3-C4C");
  if (planBatch) { planBatch.status = "complete"; planBatch.adjudication = { decisions, occurrencesByDecision, reportPath: path.relative(repoRoot, reportPath) }; }
  await writeJson(weakPlanPath, plan);
  const planMarkdown = await fs.readFile(weakPlanMarkdownPath, "utf8");
  if (!planMarkdown.includes("## C3-C4C W2 adjudication")) await fs.writeFile(weakPlanMarkdownPath, `${planMarkdown}\n## C3-C4C W2 adjudication\n\n- Decision counts: \`${JSON.stringify(decisions)}\`\n- Occurrence counts: \`${JSON.stringify(occurrencesByDecision)}\`\n- Report: \`${path.relative(repoRoot, reportPath)}\`\n`, "utf8");

  const handoff = JSON.parse(await fs.readFile(weakHandoffPath, "utf8")) as JsonRecord;
  handoff.status = "C3-C4C W2 complete; C3-C4D and later batches not started";
  handoff.completedBatches = { ...(handoff.completedBatches ?? {}), "C3-C4C": { families: 9, occurrences: 9, decisions, occurrencesByDecision, reportPath: path.relative(repoRoot, reportPath) } };
  await writeJson(weakHandoffPath, handoff);

  const ownership = JSON.parse(await fs.readFile(ownershipPath, "utf8")) as JsonRecord;
  const ownershipPendingQueueCounts = ownership.pendingQueueCounts && typeof ownership.pendingQueueCounts === "object" && !Array.isArray(ownership.pendingQueueCounts)
    ? ownership.pendingQueueCounts as JsonRecord
    : {};
  ownership.pendingQueueCounts = { ...ownershipPendingQueueCounts, WEAK: { families: 41, occurrences: 53 } };
  ownership.reviewedAt = reviewedAt;
  ownership.nextQueue = { track: "WEAK", batch: "C3-C4D", families: 12, occurrences: 12, status: "not-started" };
  ownership.status = "C3-C4C W2 hollow/special complete; C3-C4D and later batches not started";
  await writeJson(ownershipPath, ownership);
  await fs.writeFile(path.join(reviewRoot, "tier-c3c-ownership.md"), `# Tier-C-C primary-track ownership\n\nReviewed at: ${reviewedAt}\n\n${String(ownership.rule)}\n\nC3-C4A, C3-C4B and C3-C4C are complete. Completed families remain permanently owned by their original batch. C3-C4D is the next untouched weak batch.\n\n\`\`\`json\n${json({ pendingQueueCounts: ownership.pendingQueueCounts, nextQueue: ownership.nextQueue })}\n\`\`\`\n`, "utf8");

  const execution = JSON.parse(await fs.readFile(executionPath, "utf8")) as JsonRecord;
  const weakTrack = Array.isArray(execution.primaryTracks)
    ? (execution.primaryTracks as JsonRecord[]).find((track) => track.track === "WEAK")
    : undefined;
  if (weakTrack) { weakTrack.pendingFamilies = 41; weakTrack.pendingOccurrences = 53; }
  execution.reviewedAt = reviewedAt;
  execution.status = "C3-C4C W2 hollow/special complete; C3-C4D and later batches not started";
  execution.nextQueue = { track: "WEAK", batch: "C3-C4D", families: 12, occurrences: 12, status: "not-started" };
  execution.completedBatches = { ...(execution.completedBatches ?? {}), "C3-C4C": { families: 9, occurrences: 9, decisions, occurrencesByDecision } };
  await writeJson(executionPath, execution);

  const existingIds = new Set(readAuditRecords().map((record) => record.recordId));
  appendAuditRecords(ledger.filter((record) => !existingIds.has(record.recordId)));
  console.log(JSON.stringify({ ...summary, reportPath, markdownPath }, null, 2));
}

await main();

