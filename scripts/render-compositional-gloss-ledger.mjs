import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip, createGzip } from "node:zlib";
import { finished } from "node:stream/promises";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts/compositional-gloss-audit-2026-10");
const uncompressedSourcePath = path.join(artifactRoot, "coverage-ledger.jsonl");
const compressedSourcePath = path.join(artifactRoot, "coverage-ledger-source.jsonl.gz");
const completeSurah = Number(process.argv.find((value) => value.startsWith("--surah-complete="))?.split("=")[1]);
if (!Number.isInteger(completeSurah) || completeSurah < 1 || completeSurah > 114) {
  throw new Error("Full-ledger rendering is only for a completed sūrah. Usage: node scripts/render-compositional-gloss-ledger.mjs --surah-complete=N");
}
// Prefer the latest full rebuild when present. The compressed source may be an
// older snapshot retained for provenance and must not shadow the fresh ledger.
const sourcePath = await fs.access(uncompressedSourcePath).then(() => uncompressedSourcePath).catch(() => compressedSourcePath);
const gzipPath = path.join(artifactRoot, "coverage-ledger.rendered.jsonl.gz");
const csvPath = path.join(artifactRoot, "coverage-ledger.searchable.csv");
const csvGzipPath = path.join(artifactRoot, "coverage-ledger.searchable.csv.gz");
const manifestPath = path.join(artifactRoot, "coverage-manifest.json");
const decisionsPath = path.join(artifactRoot, "review-decisions.jsonl");
const runSuffix = `.tmp-${process.pid}-${Date.now()}`;
const gzipTemp = gzipPath + runSuffix;
const csvTemp = csvPath + runSuffix;
const csvGzipTemp = csvGzipPath + runSuffix;

const decisionMap = new Map();
try {
  const decisionText = await fs.readFile(decisionsPath, "utf8");
  for (const line of decisionText.split(/\r?\n/u).filter(Boolean)) {
    const decision = JSON.parse(line);
    decisionMap.set(decision.occurrenceId, decision);
  }
} catch { /* no completed manual decisions yet */ }

const statuses = new Set([
  "CORRECT",
  "GLOSS-DUPLICATION",
  "PRONOUN-ROLE-ERROR",
  "PREFIX-LEAKAGE",
  "WHOLE-WORD-GLOSS-LEAKAGE",
  "SEMANTIC-OVERLAP-VALID",
  "NEEDS-REVIEW",
  "SEMANTIC-OVERLAP",
  "FALSE-SEGMENTATION",
  "MORPHOLOGY-GLOSS-MISMATCH",
  "PRONOUN-GLOSS-OMISSION",
  "GLOSS-ALLOCATION-ERROR",
  "COMPONENT-GLOSS-MISMATCH",
  "PREPOSITION-GLOSS-MISMATCH",
  "PREFIX-GLOSS-MISMATCH",
  "NOT-APPLICABLE",
]);
function isAuditState(state) {
  if (statuses.has(state)) return true;
  const prefix = "MULTIPLE-ISSUES (";
  if (typeof state !== "string" || !state.startsWith(prefix) || !state.endsWith(")")) return false;
  const issues = state.slice(prefix.length, -1).split("; ");
  return issues.length > 1 && new Set(issues).size === issues.length && issues.every((issue) => statuses.has(issue));
}
function csv(value) {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}
function compactMorphology(row) {
  const qac = row.morphology?.qac;
  if (!qac) return null;
  return {
    provider: qac.provider,
    recordKey: qac.recordKey,
    version: qac.version,
    sourceText: qac.sourceText,
    lemma: qac.lemma,
    root: qac.root,
    partOfSpeech: qac.partOfSpeech,
    pattern: qac.pattern,
    features: qac.features,
    formation: qac.formation,
  };
}
const columns = [
  "surah", "surah_name", "ayah", "word_position", "occurrence_id",
  "canonical_source_token_position", "canonical_source_token_text", "canonical_alignment",
  "canonical_word", "whole_word_gloss", "canonical_ayah_text", "whole_ayah_translation",
  "breakdown_mode", "displayed_segments_json", "package_breakdown_matches_runtime",
  "lemma", "root", "part_of_speech", "pattern", "morphology_evidence_json",
  "lesson_type", "lesson_meaning", "lesson_root", "root_picture", "construction",
  "grammar", "sentence_role", "recognition_clue", "source_references_json",
  "package_path", "package_version", "package_sha256", "database_package_sha256",
  "runtime_word_row_present", "audit_state", "change_needed", "audit_comment",
];

const sourceStream = createReadStream(sourcePath);
const input = sourcePath.endsWith(".gz")
  ? sourceStream.pipe(createGunzip())
  : sourceStream;
const reader = readline.createInterface({ input, crlfDelay: Infinity });
const gzip = createGzip({ level: 1 });
const csvGzip = createGzip({ level: 1 });
const gzipOutput = createWriteStream(gzipTemp);
const csvOutput = createWriteStream(csvTemp, { encoding: "utf8" });
const csvGzipOutput = createWriteStream(csvGzipTemp);
gzip.pipe(gzipOutput);
csvGzip.pipe(csvGzipOutput);
const csvHeader = `${columns.map(csv).join(",")}\r\n`;
csvOutput.write(csvHeader);
csvGzip.write(csvHeader);
const ids = new Set();
const classificationCounts = {};
let total = 0;
let segmentedRelevant = 0;
let pending = 0;
let stale = 0;
let notApplicable = 0;
let completeSurahRows = 0;
let completeSurahPending = 0;
let completeSurahStale = 0;
for await (const line of reader) {
  if (!line) continue;
  const row = JSON.parse(line);
  if (ids.has(row.occurrenceId)) throw new Error(`Duplicate ledger occurrence: ${row.occurrenceId}`);
  ids.add(row.occurrenceId);
  const relevant = row.relevantDisplayedLayers?.length > 0;
  const decision = decisionMap.get(row.occurrenceId);
  if (!relevant) {
    if (decision) {
      if (decision.auditState !== "NOT-APPLICABLE" || decision.changeNeeded !== "No" || !decision.comment) {
        throw new Error(`Invalid no-segmentation decision for ${row.occurrenceId}`);
      }
      if (decision.snapshotHash !== row.currentSnapshotHash) {
        row.auditState = "STALE-DECISION";
        row.changeNeeded = "Pending";
        row.comment = `STALE-DECISION: reviewed snapshot ${decision.snapshotHash} differs from current ${row.currentSnapshotHash}; re-review required.`;
        stale += 1;
      } else {
        row.auditState = decision.auditState;
        row.changeNeeded = decision.changeNeeded;
        row.comment = decision.comment;
        row.decisionEvidence = decision.evidence ?? [];
        row.reviewedBy = decision.reviewedBy ?? "Codex";
      }
    } else {
      row.auditState = "NOT-APPLICABLE";
      row.changeNeeded = "No";
      row.comment = `NO-RELEVANT-SEGMENTATION: ${row.currentWholeWord.surface} (“${row.currentWholeWord.englishGloss}”) is displayed as one intact word in ${row.occurrenceId}; no multi-part split is presented for compositional review.`;
    }
    notApplicable += 1;
  } else {
    segmentedRelevant += 1;
    if (decision) {
      if (!isAuditState(decision.auditState) || !["Yes", "No"].includes(decision.changeNeeded) || !decision.comment) {
        throw new Error(`Incomplete/invalid decision for ${row.occurrenceId}`);
      }
      if (decision.snapshotHash !== row.currentSnapshotHash) {
        row.auditState = "STALE-DECISION";
        row.changeNeeded = "Pending";
        row.comment = `STALE-DECISION: reviewed snapshot ${decision.snapshotHash} differs from current ${row.currentSnapshotHash}; re-review required.`;
        stale += 1;
      } else {
        row.auditState = decision.auditState;
        row.changeNeeded = decision.changeNeeded;
        row.comment = decision.comment;
        row.decisionEvidence = decision.evidence ?? [];
        row.reviewedBy = decision.reviewedBy ?? "Codex";
        row.reviewedAt = decision.reviewedAt;
      }
    } else {
      row.auditState = "PENDING";
      row.changeNeeded = "Pending";
      pending += 1;
    }
  }
  classificationCounts[row.auditState] = (classificationCounts[row.auditState] ?? 0) + 1;
  if (row.surah === completeSurah) {
    completeSurahRows += 1;
    if (row.relevantDisplayedLayers?.length && row.auditState === "PENDING") completeSurahPending += 1;
    if (row.auditState === "STALE-DECISION") completeSurahStale += 1;
  }
  const qac = compactMorphology(row);
  const parts = row.currentDisplayedBreakdown?.parts ?? [];
  const cells = [
    row.surah, row.surahName, row.ayah, row.wordPosition, row.occurrenceId,
    row.canonicalSourcePosition?.canonicalSourceTokenPosition,
    row.canonicalSourcePosition?.canonicalSourceTokenText,
    row.canonicalSourcePosition?.mapping,
    row.currentWholeWord?.surface, row.currentWholeWord?.englishGloss,
    row.canonicalAyahText, row.runtimeCertifiedTranslation ?? row.packageAyahTranslation,
    row.currentDisplayedBreakdown?.mode,
    parts.map((part) => ({
      order: part.order, sourceText: part.sourceText, displayText: part.displayText,
      gloss: part.label, meaning: part.meaning, kind: part.kind,
      rootStatus: part.rootStatus, root: part.root, rootExplanation: part.rootExplanation,
    })),
    row.packageBreakdownIsSameAsRuntime,
    qac?.lemma, qac?.root, qac?.partOfSpeech, qac?.pattern,
    qac,
    row.currentRuntimeLesson?.type, row.currentRuntimeLesson?.meaning,
    row.currentRuntimeLesson?.root, row.currentRuntimeLesson?.rootPicture,
    row.currentRuntimeLesson?.construction, row.currentRuntimeLesson?.grammar,
    row.currentRuntimeLesson?.sentenceRole, row.currentRuntimeLesson?.recognitionClue,
    row.provenance?.sourceReferences,
    row.provenance?.packagePath, row.provenance?.packageVersion,
    row.provenance?.packageChecksumSha256, row.provenance?.databasePackageChecksum,
    row.provenance?.runtimeWordRowPresent, row.auditState, row.changeNeeded, row.comment,
  ];
  const ledgerLine = `${JSON.stringify(row)}\n`;
  if (!gzip.write(ledgerLine)) await new Promise((resolve) => gzip.once("drain", resolve));
  const csvLine = `${cells.map(csv).join(",")}\r\n`;
  if (!csvOutput.write(csvLine)) await new Promise((resolve) => csvOutput.once("drain", resolve));
  if (!csvGzip.write(csvLine)) await new Promise((resolve) => csvGzip.once("drain", resolve));
  total += 1;
}
gzip.end();
csvGzip.end();
csvOutput.end();
await Promise.all([finished(gzipOutput), finished(csvGzipOutput), finished(csvOutput)]);
if (!completeSurahRows || completeSurahPending || completeSurahStale) {
  throw new Error(`Sūrah ${completeSurah} is not ready for rendering: rows=${completeSurahRows}, pending=${completeSurahPending}, stale=${completeSurahStale}.`);
}
async function publish(tempPath, finalPath) {
  try {
    await fs.rename(tempPath, finalPath);
  } catch (error) {
    if (!['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
    await fs.copyFile(tempPath, finalPath);
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}
await publish(gzipTemp, gzipPath);
await publish(csvTemp, csvPath);
await publish(csvGzipTemp, csvGzipPath);

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
manifest.coverage.occurrenceRows = total;
manifest.coverage.relevantSegmentedOccurrences = segmentedRelevant;
manifest.coverage.notApplicableOccurrences = notApplicable;
manifest.coverage.pendingRelevantOccurrences = pending;
manifest.coverage.staleDecisions = stale;
manifest.coverage.classificationCounts = classificationCounts;
manifest.coverage.occurrenceLedgerReconciles = total === 77434 && total === segmentedRelevant + notApplicable;
manifest.artifacts = {
  fullMachineReadableLedger: path.basename(gzipPath),
  searchableTable: path.basename(csvPath),
  compressedSearchableTable: path.basename(csvGzipPath),
  reviewDecisionLog: "review-decisions.jsonl",
  canonicalAlignment: "canonical-alignment.json",
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const [gzipInfo, csvInfo, csvGzipInfo] = await Promise.all([fs.stat(gzipPath), fs.stat(csvPath), fs.stat(csvGzipPath)]);
console.log(JSON.stringify({
  rows: total,
  reconciledSurah: completeSurah,
  segmentedRelevant,
  notApplicable,
  pending,
  stale,
  classificationCounts,
  ledgerUncompressedBytes: (await fs.stat(sourcePath)).size,
  ledgerGzipBytes: gzipInfo.size,
  csvBytes: csvInfo.size,
  csvGzipBytes: csvGzipInfo.size,
  ledgerReconciles: manifest.coverage.occurrenceLedgerReconciles,
}, null, 2));
