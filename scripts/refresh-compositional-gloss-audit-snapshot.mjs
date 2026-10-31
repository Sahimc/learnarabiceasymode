import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip, createGzip } from "node:zlib";
import { finished } from "node:stream/promises";

const root = process.cwd();
const dir = path.join(root, "artifacts/compositional-gloss-audit-2026-10");
const manifestPath = path.join(dir, "coverage-manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const priorLedger = path.join(dir, manifest.artifacts.fullMachineReadableLedger);
const priorTable = path.join(dir, manifest.artifacts.searchableTable);
const decisionLines = (await fs.readFile(path.join(dir, "review-decisions.jsonl"), "utf8"))
  .split(/\r?\n/u).filter(Boolean);
const decisions = new Map(decisionLines.map((line) => {
  const decision = JSON.parse(line);
  return [decision.occurrenceId, decision];
}));
if (decisions.size !== decisionLines.length) throw new Error("Duplicate occurrence IDs in review-decisions.jsonl.");

const suffix = new Date().toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14) + `-refresh-${process.pid}`;
const ledgerName = `coverage-ledger.${suffix}.jsonl.gz`;
const tableName = `coverage-ledger.${suffix}.csv`;
const compressedTableName = `coverage-ledger.${suffix}.csv.gz`;
const ledgerPath = path.join(dir, ledgerName);
const ledgerTemp = ledgerPath + ".tmp";
const tablePath = path.join(dir, tableName);
const tableTemp = tablePath + ".tmp";
const compressedTablePath = path.join(dir, compressedTableName);
const compressedTableTemp = compressedTablePath + ".tmp";

const statuses = new Set([
  "CORRECT", "GLOSS-DUPLICATION", "PRONOUN-ROLE-ERROR", "PREFIX-LEAKAGE",
  "WHOLE-WORD-GLOSS-LEAKAGE", "SEMANTIC-OVERLAP-VALID", "NEEDS-REVIEW",
]);
const ids = new Set();
const applied = new Set();
const counts = {};
let total = 0;
let segmented = 0;
let notApplicable = 0;
let pending = 0;
let stale = 0;
const jsonInput = createReadStream(priorLedger).pipe(createGunzip());
const jsonReader = readline.createInterface({ input: jsonInput, crlfDelay: Infinity });
const gzip = createGzip({ level: 1 });
const gzipOutput = createWriteStream(ledgerTemp);
gzip.pipe(gzipOutput);
for await (const line of jsonReader) {
  if (!line) continue;
  const row = JSON.parse(line);
  if (!row.occurrenceId || ids.has(row.occurrenceId)) throw new Error(`Duplicate/missing occurrence ID: ${row.occurrenceId}`);
  ids.add(row.occurrenceId);
  const relevant = row.relevantDisplayedLayers?.length > 0;
  if (!relevant) {
    notApplicable += 1;
    if (row.auditState !== "NOT-APPLICABLE" || row.changeNeeded !== "No") throw new Error(`Invalid N/A row: ${row.occurrenceId}`);
  } else {
    segmented += 1;
    const decision = decisions.get(row.occurrenceId);
    if (decision) {
      if (!statuses.has(decision.auditState) || !["Yes", "No"].includes(decision.changeNeeded) || !decision.comment) {
        throw new Error(`Incomplete decision: ${row.occurrenceId}`);
      }
      if (decision.snapshotHash !== row.currentSnapshotHash) throw new Error(`Stale decision: ${row.occurrenceId}`);
      row.auditState = decision.auditState;
      row.changeNeeded = decision.changeNeeded;
      row.comment = decision.comment;
      row.decisionEvidence = decision.evidence ?? [];
      row.reviewedBy = decision.reviewedBy ?? "Codex";
      row.reviewedAt = decision.reviewedAt;
      applied.add(row.occurrenceId);
    }
    if (row.auditState === "PENDING") pending += 1;
    if (row.auditState === "STALE-DECISION") stale += 1;
  }
  counts[row.auditState] = (counts[row.auditState] ?? 0) + 1;
  const rendered = `${JSON.stringify(row)}\n`;
  if (!gzip.write(rendered)) await new Promise((resolve) => gzip.once("drain", resolve));
  total += 1;
}
gzip.end();
await finished(gzipOutput);
if (applied.size !== decisions.size) throw new Error(`Applied ${applied.size} of ${decisions.size} decisions.`);
if (total !== manifest.coverage.packageWordOccurrences || total !== segmented + notApplicable) {
  throw new Error(`Coverage does not reconcile: ${total} =? ${segmented} + ${notApplicable}`);
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(field); field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Unclosed quote in CSV row.");
  fields.push(field);
  return fields;
}
const quoteCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const tableReader = readline.createInterface({ input: createReadStream(priorTable), crlfDelay: Infinity });
const tableOutput = createWriteStream(tableTemp, { encoding: "utf8" });
let header = null;
let occurrenceIndex = -1;
let stateIndex = -1;
let changeIndex = -1;
let commentIndex = -1;
let updatedCsvRows = 0;
for await (const line of tableReader) {
  if (!header) {
    header = parseCsvLine(line);
    occurrenceIndex = header.indexOf("occurrence_id");
    stateIndex = header.indexOf("audit_state");
    changeIndex = header.indexOf("change_needed");
    commentIndex = header.indexOf("audit_comment");
    if ([occurrenceIndex, stateIndex, changeIndex, commentIndex].some((index) => index < 0)) throw new Error("Audit columns missing from CSV table.");
    tableOutput.write(`${header.map(quoteCsv).join(",")}\r\n`);
    continue;
  }
  const fields = parseCsvLine(line);
  const decision = decisions.get(fields[occurrenceIndex]);
  if (decision) {
    fields[stateIndex] = decision.auditState;
    fields[changeIndex] = decision.changeNeeded;
    fields[commentIndex] = decision.comment;
    updatedCsvRows += 1;
  }
  const outputLine = `${fields.map(quoteCsv).join(",")}\r\n`;
  if (!tableOutput.write(outputLine)) await new Promise((resolve) => tableOutput.once("drain", resolve));
}
tableOutput.end();
await finished(tableOutput);
if (updatedCsvRows !== decisions.size) throw new Error(`Updated ${updatedCsvRows} of ${decisions.size} CSV decision rows.`);
const compressedOutput = createWriteStream(compressedTableTemp);
createReadStream(tableTemp).pipe(createGzip({ level: 1 })).pipe(compressedOutput);
await finished(compressedOutput);
async function publish(temp, destination) {
  try {
    await fs.rename(temp, destination);
  } catch (error) {
    if (!["EBUSY", "EPERM", "EACCES", "EEXIST"].includes(error.code)) throw error;
    await fs.copyFile(temp, destination);
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}
await publish(ledgerTemp, ledgerPath);
await publish(tableTemp, tablePath);
await publish(compressedTableTemp, compressedTablePath);
manifest.coverage.occurrenceRows = total;
manifest.coverage.relevantSegmentedOccurrences = segmented;
manifest.coverage.notApplicableOccurrences = notApplicable;
manifest.coverage.pendingRelevantOccurrences = pending;
manifest.coverage.staleDecisions = stale;
manifest.coverage.manuallyReviewedSegmentedOccurrences = segmented - pending - stale;
manifest.coverage.manualDecisionRecordsApplied = applied.size;
manifest.coverage.classificationCounts = counts;
manifest.coverage.occurrenceLedgerReconciles = true;
manifest.artifacts = {
  ...manifest.artifacts,
  fullMachineReadableLedger: ledgerName,
  searchableTable: tableName,
  compressedSearchableTable: compressedTableName,
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  rows: total, segmented, notApplicable, pending, stale,
  decisions: applied.size, classificationCounts: counts,
  artifacts: { ledgerName, tableName, compressedTableName },
}, null, 2));
