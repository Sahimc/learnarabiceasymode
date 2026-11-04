import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts/compositional-gloss-audit-2026-10");
const completeSurah = Number(process.argv.find((value) => value.startsWith("--surah-complete="))?.split("=")[1]);
if (!Number.isInteger(completeSurah) || completeSurah < 1 || completeSurah > 114) {
  throw new Error("Full-ledger reconciliation is allowed only at a completed-sūrah boundary. Usage: node scripts/verify-compositional-gloss-ledger.mjs --surah-complete=N");
}
const manifestPath = path.join(artifactRoot, "coverage-manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const decisionText = await fs.readFile(path.join(artifactRoot, "review-decisions.jsonl"), "utf8").catch(() => "");
const decisions = new Map(decisionText.split(/\r?\n/u).filter(Boolean).map((line) => {
  const decision = JSON.parse(line);
  return [decision.occurrenceId, decision];
}));
const outputs = {
  fullMachineReadableLedger: manifest.artifacts.fullMachineReadableLedger,
  searchableTable: manifest.artifacts.searchableTable,
  compressedSearchableTable: manifest.artifacts.compressedSearchableTable,
};
const rowPath = path.join(artifactRoot, outputs.fullMachineReadableLedger);
const tablePath = path.join(artifactRoot, outputs.searchableTable);
const compressedTablePath = path.join(artifactRoot, outputs.compressedSearchableTable);
const ids = new Set();
const states = {};
const appliedDecisionIds = new Set();
let rows = 0;
let segmented = 0;
let notApplicable = 0;
let stale = 0;
const rowReader = readline.createInterface({
  input: createReadStream(rowPath).pipe(createGunzip()),
  crlfDelay: Infinity,
});
for await (const line of rowReader) {
  if (!line) continue;
  const row = JSON.parse(line);
  if (!row.occurrenceId || ids.has(row.occurrenceId)) throw new Error(`Missing/duplicate occurrence ID at row ${rows + 1}: ${row.occurrenceId}`);
  ids.add(row.occurrenceId);
  const relevant = row.relevantDisplayedLayers?.length > 0;
  if (relevant) {
    segmented += 1;
    if (row.auditState === "PENDING" && row.changeNeeded === "Pending") {
      // Expected before occurrence-level adjudication has started.
    } else if (row.auditState === "STALE-DECISION" && row.changeNeeded === "Pending" && row.comment?.startsWith("STALE-DECISION:")) {
      stale += 1;
    } else if (!row.auditState || !["Yes", "No"].includes(row.changeNeeded) || !row.comment) {
      throw new Error(`Relevant row lacks complete audit state: ${row.occurrenceId}`);
    }
  } else {
    notApplicable += 1;
    if (row.auditState === "STALE-DECISION" && row.changeNeeded === "Pending" && row.comment?.startsWith("STALE-DECISION:")) {
      stale += 1;
    } else if (row.auditState !== "NOT-APPLICABLE" || row.changeNeeded !== "No" || !row.comment?.includes("NO-RELEVANT-SEGMENTATION")) {
      throw new Error(`Invalid no-segmentation state: ${row.occurrenceId}`);
    }
  }
  states[row.auditState] = (states[row.auditState] ?? 0) + 1;
  const decision = decisions.get(row.occurrenceId);
  if (decision) {
    if (row.auditState === "STALE-DECISION") {
      if (decision.snapshotHash === row.currentSnapshotHash || row.changeNeeded !== "Pending" || !row.comment?.startsWith("STALE-DECISION:")) {
        throw new Error(`Incorrectly classified stale decision: ${row.occurrenceId}`);
      }
      appliedDecisionIds.add(row.occurrenceId);
    } else if (decision.snapshotHash !== row.currentSnapshotHash || decision.auditState !== row.auditState || decision.changeNeeded !== row.changeNeeded || decision.comment !== row.comment) {
      throw new Error(`Decision overlay does not match the reviewed snapshot: ${row.occurrenceId}`);
    } else {
      appliedDecisionIds.add(row.occurrenceId);
    }
  }
  rows += 1;
}
if (appliedDecisionIds.size !== decisions.size) throw new Error(`Only ${appliedDecisionIds.size} of ${decisions.size} decisions matched a ledger occurrence.`);
async function measureTable(input, compressed) {
  const stream = compressed ? createReadStream(input).pipe(createGunzip()) : createReadStream(input);
  const hash = createHash("sha256");
  let crlf = 0;
  let previousByte = -1;
  for await (const chunk of stream) {
    hash.update(chunk);
    for (const byte of chunk) {
      if (previousByte === 13 && byte === 10) crlf += 1;
      previousByte = byte;
    }
  }
  return { crlf, sha256: hash.digest("hex") };
}
const [plainTable, compressedTable] = await Promise.all([
  measureTable(tablePath, false), measureTable(compressedTablePath, true),
]);
const csvLines = plainTable.crlf;
if (plainTable.sha256 !== compressedTable.sha256) throw new Error("Compressed table does not decompress byte-for-byte to the searchable CSV.");
const expected = manifest.coverage.packageWordOccurrences;
if (rows !== expected || segmented + notApplicable !== rows || csvLines !== rows + 1 || stale !== (manifest.coverage.staleDecisions ?? 0)) {
  throw new Error(`Reconciliation failed: rows=${rows}/${expected}, segmented=${segmented}, N/A=${notApplicable}, stale=${stale}/${manifest.coverage.staleDecisions ?? 0}, CSV lines=${csvLines}`);
}
manifest.coverage.occurrenceRows = rows;
manifest.coverage.relevantSegmentedOccurrences = segmented;
manifest.coverage.notApplicableOccurrences = notApplicable;
manifest.coverage.pendingRelevantOccurrences = states.PENDING ?? 0;
manifest.coverage.staleDecisions = states["STALE-DECISION"] ?? 0;
manifest.coverage.classificationCounts = states;
manifest.coverage.manuallyReviewedSegmentedOccurrences = segmented - (states.PENDING ?? 0) - (states["STALE-DECISION"] ?? 0);
manifest.coverage.manualDecisionRecordsApplied = appliedDecisionIds.size;
manifest.coverage.occurrenceLedgerReconciles = true;
manifest.artifacts = {
  ...manifest.artifacts,
  ...outputs,
  reviewDecisionLog: "review-decisions.jsonl",
};
manifest.validation = {
  occurrenceIdsUnique: ids.size === rows,
  rowCountMatchesPackageOccurrenceCount: rows === expected,
  everyOccurrenceHasAuditClassification: rows === segmented + notApplicable,
  csvDataRowsPlusHeader: csvLines === rows + 1,
  compressedTableMatchesPlainCsv: plainTable.sha256 === compressedTable.sha256,
  verifiedAt: new Date().toISOString(),
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const [rowStat, tableStat, compressedTableStat] = await Promise.all([
  fs.stat(rowPath), fs.stat(tablePath), fs.stat(compressedTablePath),
]);
console.log(JSON.stringify({
  rows, segmented, notApplicable, states, csvLines,
  bytes: { fullLedgerGzip: rowStat.size, csv: tableStat.size, csvGzip: compressedTableStat.size },
  reconciles: manifest.coverage.occurrenceLedgerReconciles,
}, null, 2));
