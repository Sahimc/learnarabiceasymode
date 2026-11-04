import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

// This exercises the complete persistence/reporting path without making any
// linguistic decisions or touching the real audit store/checkpoint.
const repo = process.cwd();
const surah = 3;
const ayah = 188;
const sourceStore = path.join(os.homedir(), ".codex", "quran-compositional-gloss-audit", "store");
const repoArtifact = path.join(repo, "artifacts/compositional-gloss-audit-2026-10");
const canonicalPath = path.join(repo, "content-import/sources/tanzil/quran-uthmani.txt");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quran-ayah-workflow-simulation-"));
const sandbox = path.join(tempRoot, "store");
const relShard = `${String(surah).padStart(3, "0")}.jsonl`;
const authoritativeFiles = [
  path.join(sourceStore, "coverage-by-surah", relShard),
  path.join(sourceStore, "decisions-by-surah", relShard),
  path.join(repoArtifact, "PHASE-1-CHECKPOINT.md"),
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function inventory(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const stat = await fs.stat(full);
        files.push({ path: path.relative(directory, full).replaceAll("\\", "/"), bytes: stat.size });
      }
    }
  }
  await walk(directory);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0), entries: files };
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function rowSplits(row) {
  const parts = row.currentDisplayedBreakdown?.parts ?? [];
  if (!parts.length) return "NO-RELEVANT-SEGMENTATION";
  const displayed = parts.map((part) => `${part.sourceText ?? part.displayText ?? ""} = ${part.meaning ?? part.label ?? ""}`).join("<br>");
  return parts.length > 1 ? displayed : `${displayed}<br>NO-RELEVANT-SEGMENTATION`;
}

function mapCanonicalTokens(rawText) {
  const excluded = new Set(["ۖ", "ۗ", "ۚ", "ۙ", "ۘ"]);
  return rawText.trim().split(/\s+/u).filter((token) => token && !excluded.has(token));
}

const began = performance.now();
const beforeInventory = await inventory(tempRoot);
const authoritativeBefore = new Map();
const authoritativeBytes = new Map();
for (const file of authoritativeFiles) {
  const bytes = await fs.readFile(file);
  authoritativeBytes.set(file, bytes);
  authoritativeBefore.set(file, { bytes: bytes.length, sha256: sha256(bytes) });
}

try {
  const coverageSource = authoritativeFiles[0];
  const decisionsSource = authoritativeFiles[1];
  const checkpointSource = authoritativeFiles[2];
  const coverageCopy = path.join(sandbox, "coverage-by-surah", relShard);
  const decisionsCopy = path.join(sandbox, "decisions-by-surah", relShard);
  const checkpointCopy = path.join(sandbox, "PHASE-1-CHECKPOINT.md");
  await fs.mkdir(path.dirname(coverageCopy), { recursive: true });
  await fs.mkdir(path.dirname(decisionsCopy), { recursive: true });
  await fs.copyFile(coverageSource, coverageCopy);
  await fs.copyFile(decisionsSource, decisionsCopy);
  await fs.copyFile(checkpointSource, checkpointCopy);

  // Retrieve via the ordinary active-sūrah lookup, pointed only at the sandbox.
  const lookup = spawnSync(process.execPath, [
    path.join(repo, "scripts/compositional-gloss-audit-store.mjs"),
    "lookup", "--surah", String(surah), "--ayah", String(ayah), "--trace",
  ], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, QURAN_AUDIT_STORE_ROOT: sandbox },
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(lookup.status, 0, lookup.stderr || `lookup exited ${lookup.status}`);
  const retrieved = JSON.parse(lookup.stdout);
  assert.equal(retrieved.rows.length, 20, "Sūrah 3:188 should contain 20 repository word occurrences");
  assert.equal(retrieved.readTrace.files.length, 2, "ordinary verse lookup should read exactly two active-sūrah shards");
  assert.ok(retrieved.readTrace.files.every((entry) => [coverageCopy, decisionsCopy].includes(path.resolve(entry.file))));

  // Verify each repository position and occurrence ID against the exact local
  // Tanzil row, then verify the displayed split and gloss data are retrievable.
  const canonicalBytes = await fs.readFile(canonicalPath);
  const canonicalLine = canonicalBytes.toString("utf8").split(/\r?\n/u)
    .find((line) => line.startsWith(`${surah}|${ayah}|`));
  assert.ok(canonicalLine, `canonical Tanzil row ${surah}|${ayah} was not found`);
  const canonicalTokens = mapCanonicalTokens(canonicalLine.split("|")[2]);
  assert.equal(canonicalTokens.length, retrieved.rows.length);
  for (let index = 0; index < retrieved.rows.length; index += 1) {
    const row = retrieved.rows[index];
    const position = index + 1;
    assert.equal(row.surah, surah);
    assert.equal(row.ayah, ayah);
    assert.equal(row.wordPosition, position);
    assert.equal(row.occurrenceId, `word:${surah}:${ayah}:${position}`);
    assert.equal(row.canonicalSourcePosition.repositoryPosition, position);
    assert.equal(row.canonicalSourcePosition.canonicalSourceTokenPosition, position);
    assert.equal(row.canonicalSourcePosition.canonicalSourceTokenText, canonicalTokens[position - 1]);
    assert.equal(row.currentWholeWord.surface, canonicalTokens[position - 1]);
    assert.ok(row.currentWholeWord.englishGloss, `whole-word gloss missing at position ${position}`);
    const parts = row.currentDisplayedBreakdown?.parts ?? [];
    if (parts.length > 1) {
      assert.ok(parts.every((part) => part.sourceText && (part.meaning || part.label)), `split/gloss missing at ${row.occurrenceId}`);
    }
  }

  // Save simulation markers to a separate append-only temporary event file. It
  // cannot be mistaken for real adjudication or overwrite copied decisions.
  const simulatedAt = new Date().toISOString();
  const simulatedDecisions = retrieved.rows.map((row) => ({
    occurrenceId: row.occurrenceId,
    auditState: "SIMULATION-ONLY",
    changeNeeded: "SIMULATION-ONLY",
    comment: "SIMULATION ONLY: persistence-path exercise; no linguistic adjudication made.",
    simulationApplicability: (row.currentDisplayedBreakdown?.parts?.length ?? 0) > 1
      ? "RELEVANT-DISPLAYED-SEGMENTATION"
      : "NOT-APPLICABLE / NO-RELEVANT-SEGMENTATION",
    simulated: true,
    simulatedAt,
  }));
  const simulatedDecisionPath = path.join(sandbox, "simulation-only", "decisions-by-surah", relShard);
  await fs.mkdir(path.dirname(simulatedDecisionPath), { recursive: true });
  await fs.writeFile(simulatedDecisionPath, `${simulatedDecisions.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

  const tablePath = path.join(sandbox, "simulation-only", `surah-${surah}-ayah-${ayah}.md`);
  const lines = [
    `# SIMULATION ONLY — Sūrah ${surah}:${ayah}`,
    "No linguistic decisions were made. Values below reproduce the current records and mark every simulated status explicitly.",
    "",
    "| Word | Occurrence ID | Canonical position | Arabic | Current whole-word gloss | Current displayed split and gloss | Existing audit state | Simulated applicability | Simulated audit state | Change needed | Simulation comment |",
    "|---:|---|---:|---|---|---|---|---|---|---|---|",
  ];
  for (let index = 0; index < retrieved.rows.length; index += 1) {
    const row = retrieved.rows[index];
    const applicability = (row.currentDisplayedBreakdown?.parts?.length ?? 0) > 1
      ? "RELEVANT-DISPLAYED-SEGMENTATION (SIMULATION ONLY)"
      : "NOT-APPLICABLE / NO-RELEVANT-SEGMENTATION (SIMULATION ONLY)";
    lines.push(`| ${index + 1} | ${row.occurrenceId} | ${row.canonicalSourcePosition.canonicalSourceTokenPosition} | ${escapeCell(row.currentWholeWord.surface)} | ${escapeCell(row.currentWholeWord.englishGloss)} | ${escapeCell(rowSplits(row))} | ${escapeCell(row.occurrenceDecision?.auditState ?? "NO-PRIOR-DECISION")} | ${applicability} | SIMULATION-ONLY | SIMULATION-ONLY | No linguistic adjudication made. |`);
  }
  await fs.writeFile(tablePath, `${lines.join("\n")}\n`, "utf8");

  const checkpointNote = [
    "",
    `<!-- SIMULATION ONLY: completed isolated workflow dry run for ${surah}:${ayah}; no real audit progress. -->`,
    `SIMULATION ONLY — Sūrah ${surah}:${ayah}; ${retrieved.rows.length} occurrence events saved to the isolated temporary store. The real audit checkpoint was not changed.`,
    "",
  ].join("\n");
  await fs.appendFile(checkpointCopy, checkpointNote, "utf8");

  // Read every saved artifact back and verify exact occurrence coverage and
  // that the copied real decision history remains byte-for-byte unchanged.
  const savedEvents = (await fs.readFile(simulatedDecisionPath, "utf8")).trim().split(/\r?\n/u).map(JSON.parse);
  assert.equal(savedEvents.length, retrieved.rows.length);
  assert.deepEqual(savedEvents.map((row) => row.occurrenceId), retrieved.rows.map((row) => row.occurrenceId));
  assert.ok(savedEvents.every((row) => row.simulated === true && row.auditState === "SIMULATION-ONLY" && row.changeNeeded === "SIMULATION-ONLY"));
  assert.ok(savedEvents.every((row) => row.comment.includes("no linguistic adjudication")));
  const copiedDecisionBytes = await fs.readFile(decisionsCopy);
  assert.equal(sha256(copiedDecisionBytes), authoritativeBefore.get(decisionsSource).sha256, "copied real decision history changed");
  const table = await fs.readFile(tablePath, "utf8");
  assert.equal((table.match(/^\| \d+ \| word:3:188:/gmu) ?? []).length, retrieved.rows.length, "full verse table is missing an occurrence");
  assert.ok(table.includes("NO-PRIOR-DECISION"));
  const notApplicableCount = retrieved.rows.filter((row) => (row.currentDisplayedBreakdown?.parts?.length ?? 0) <= 1).length;
  assert.ok(table.includes("NOT-APPLICABLE / NO-RELEVANT-SEGMENTATION (SIMULATION ONLY)"));
  assert.equal((table.match(/NOT-APPLICABLE \/ NO-RELEVANT-SEGMENTATION \(SIMULATION ONLY\)/gu) ?? []).length, notApplicableCount);
  const savedCheckpoint = await fs.readFile(checkpointCopy, "utf8");
  assert.ok(savedCheckpoint.includes("SIMULATION ONLY — Sūrah 3:188"));
  assert.ok(Buffer.from(savedCheckpoint, "utf8").subarray(0, authoritativeBytes.get(checkpointSource).length).equals(authoritativeBytes.get(checkpointSource)),
    "temporary checkpoint's copied historical content changed before appended simulation marker");

  for (const file of authoritativeFiles) {
    const bytes = await fs.readFile(file);
    assert.deepEqual({ bytes: bytes.length, sha256: sha256(bytes) }, authoritativeBefore.get(file), `${file} changed during isolated simulation`);
  }

  const afterInventory = await inventory(tempRoot);
  const generatedInventory = await inventory(sandbox);
  const elapsedMs = Number((performance.now() - began).toFixed(1));
  const copyBytes = (await fs.stat(coverageCopy)).size + (await fs.stat(decisionsCopy)).size + (await fs.stat(checkpointCopy)).size;
  const generatedBytes = generatedInventory.bytes - copyBytes;
  console.log(JSON.stringify({
    result: "PASS",
    simulatedAyah: `${surah}:${ayah}`,
    steps: {
      retrieveAllWords: true,
      retrieveArabicSplitsAndGlosses: true,
      validateOccurrenceIdsAndCanonicalPositions: true,
      saveSimulationOnlyDecisionsAndComments: true,
      persistToIsolatedTemporaryStore: true,
      updateTemporaryCheckpoint: true,
      generateFullVerseTableIncludingNotApplicableEntries: true,
      readBackAndVerifyEveryDecisionAndCheckpoint: true,
    },
    occurrenceCount: retrieved.rows.length,
    priorDecisionRowsPreservedInSandbox: true,
    filesAndBytes: { before: { files: beforeInventory.files, bytes: beforeInventory.bytes }, after: { files: afterInventory.files, bytes: afterInventory.bytes }, temporaryCopyBytesWritten: copyBytes, generatedOutputBytes: generatedBytes, expectedNewOutputFiles: 2 },
    io: {
      logicalBytesRead: 2 * (authoritativeBefore.get(coverageSource).bytes + authoritativeBefore.get(decisionsSource).bytes)
        + 2 * authoritativeBefore.get(checkpointSource).bytes + canonicalBytes.length,
      logicalBytesWritten: copyBytes + generatedBytes,
      physicalDiskIoNotMeasured: true,
    },
    elapsedMs,
    gitProcessActivity: "none; this test invokes no Git commands",
    fullLedgerOperations: "none; no consolidated ledger or global decision log read or regenerated",
    timestampedSnapshotsCreated: 0,
    largeLedgerCopiesCreated: 0,
    liveAuditRecordsOrCheckpointChanged: false,
    tablePath,
    sandboxRemovedAfterReport: true,
  }, null, 2));
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
