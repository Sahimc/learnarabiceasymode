import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const repoRoot = process.cwd();
const surah = Number(process.env.AUDIT_DRY_RUN_SURAH ?? 3);
const ayah = Number(process.env.AUDIT_DRY_RUN_AYAH ?? 34);
const wordValue = process.env.AUDIT_DRY_RUN_WORD;
const word = wordValue === undefined ? null : Number(wordValue);
const sourceStore = path.resolve(process.env.QURAN_AUDIT_SOURCE_STORE
  ?? path.join(os.homedir(), ".codex", "quran-compositional-gloss-audit", "store"));
const externalTempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quran-audit-regression-"));
const sandboxStore = path.join(externalTempRoot, "store");
const artifactRoot = path.join(repoRoot, "artifacts/compositional-gloss-audit-2026-10");

async function inventory(directory) {
  const entries = {};
  let files = 0;
  let bytes = 0;
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        files += 1;
        bytes += stat.size;
        entries[path.relative(directory, fullPath)] = { size: stat.size, mtimeMs: stat.mtimeMs };
      }
    }
  }
  await walk(directory);
  return { files, bytes, entries };
}

function runLookup() {
  const command = process.execPath;
  const script = path.join(repoRoot, "scripts/compositional-gloss-audit-store.mjs");
  const args = [script, "lookup", "--surah", String(surah), "--ayah", String(ayah)];
  if (word !== null) args.push("--word", String(word));
  args.push("--trace");
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, QURAN_AUDIT_STORE_ROOT: sandboxStore },
    maxBuffer: 10 * 1024 * 1024,
  });
  return { ...result, elapsedMs: performance.now() - started };
}

function assertGuard(script, expectedText) {
  const args = script === "scripts/compositional-gloss-audit.mjs"
    ? ["--import", "tsx", path.join(repoRoot, script)]
    : [path.join(repoRoot, script)];
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.notEqual(result.status, 0, `${script} should refuse an ungated full-ledger operation`);
  assert.match(`${result.stderr}\n${result.stdout}`, expectedText);
}

const relativeShard = String(surah).padStart(3, "0") + ".jsonl";
const activeCoverage = path.join(sourceStore, "coverage-by-surah", relativeShard);
const activeDecisions = path.join(sourceStore, "decisions-by-surah", relativeShard);
const beforeArtifacts = await inventory(artifactRoot);
const beforeStore = await inventory(sourceStore);
const authoritativeNames = [
  "coverage-ledger.jsonl",
  "review-decisions.jsonl",
  "PHASE-1-CHECKPOINT.md",
];
const authoritativeBefore = new Map();
for (const name of authoritativeNames) {
  const file = path.join(artifactRoot, name);
  const stat = await fs.stat(file);
  authoritativeBefore.set(name, { size: stat.size, mtimeMs: stat.mtimeMs });
}

try {
  await fs.mkdir(path.join(sandboxStore, "coverage-by-surah"), { recursive: true });
  await fs.mkdir(path.join(sandboxStore, "decisions-by-surah"), { recursive: true });
  await fs.copyFile(activeCoverage, path.join(sandboxStore, "coverage-by-surah", relativeShard));
  await fs.copyFile(activeDecisions, path.join(sandboxStore, "decisions-by-surah", relativeShard));
  const sandboxBefore = await inventory(sandboxStore);
  const protectedLedgerTools = [
    ["scripts/verify-compositional-gloss-ledger.mjs", /--surah-complete/u],
    ["scripts/render-compositional-gloss-ledger.mjs", /--surah-complete/u],
    ["scripts/compositional-gloss-audit.mjs", /--full-corpus-bootstrap/u],
  ];
  for (const [script, expectedText] of protectedLedgerTools) assertGuard(script, expectedText);
  const result = runLookup();
  assert.equal(result.status, 0, result.stderr || `lookup exited with ${result.status}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.surah, surah);
  assert.equal(output.ayah, ayah);
  assert.equal(output.word, word);
  assert.ok(output.rows.length > 0, "dry run should retrieve at least one occurrence");
  if (surah === 3 && ayah === 34 && word === null) assert.equal(output.rows.length, 7, "verse-level dry run should retrieve all seven word occurrences");
  assert.equal(output.readTrace.files.length, 2, "lookup should read exactly two active-sūrah shard files");
  const readPaths = output.readTrace.files.map((entry) => path.resolve(entry.file));
  assert.deepEqual(new Set(readPaths), new Set([
    path.join(sandboxStore, "coverage-by-surah", relativeShard),
    path.join(sandboxStore, "decisions-by-surah", relativeShard),
  ].map((file) => path.resolve(file))));
  assert.equal(output.readTrace.estimatedBytesRead, sandboxBefore.bytes);
  const sandboxAfter = await inventory(sandboxStore);
  assert.deepEqual(sandboxAfter, sandboxBefore, "lookup modified its isolated active-sūrah store");
  const afterArtifacts = await inventory(artifactRoot);
  const afterStore = await inventory(sourceStore);
  assert.deepEqual(afterArtifacts, beforeArtifacts, "repository audit artifact inventory changed");
  assert.deepEqual(afterStore, beforeStore, "authoritative external audit store changed");
  for (const name of authoritativeNames) {
    const file = path.join(artifactRoot, name);
    const stat = await fs.stat(file);
    assert.deepEqual({ size: stat.size, mtimeMs: stat.mtimeMs }, authoritativeBefore.get(name), `${name} metadata changed`);
  }
  const snapshotNames = Object.keys(afterArtifacts.entries).filter((name) =>
    /^coverage-ledger\.(?:20\d{6}|full-20\d{6})/u.test(path.basename(name)));
  assert.deepEqual(snapshotNames, Object.keys(beforeArtifacts.entries).filter((name) =>
    /^coverage-ledger\.(?:20\d{6}|full-20\d{6})/u.test(path.basename(name))));
  const copiedShardBytes = (await fs.stat(activeCoverage)).size + (await fs.stat(activeDecisions)).size;

  console.log(JSON.stringify({
    result: "PASS",
    dryRun: { surah, ayah, word },
    elapsedMs: Number(result.elapsedMs.toFixed(1)),
    regressionHarnessElapsedScope: "lookup subprocess only; excludes isolated shard copies and gate checks",
    filesRead: output.readTrace.files,
    estimatedBytesRead: output.readTrace.estimatedBytesRead,
    ioEstimate: {
      ordinaryLookupLogicalBytesRead: output.readTrace.estimatedBytesRead,
      harnessLogicalBytesReadIncludingTemporaryShardCopiesAndLookup: 2 * copiedShardBytes,
      temporaryShardCopyBytesWritten: copiedShardBytes,
      physicalDiskIoMayBeLowerBecauseOfOperatingSystemCache: true,
    },
    consolidatedFilesCheckedByMetadataOnly: authoritativeNames,
    isolatedSandbox: { filesBefore: sandboxBefore.files, bytesBefore: sandboxBefore.bytes, filesAfter: sandboxAfter.files, bytesAfter: sandboxAfter.bytes },
    repositoryArtifacts: { filesBefore: beforeArtifacts.files, bytesBefore: beforeArtifacts.bytes, filesAfter: afterArtifacts.files, bytesAfter: afterArtifacts.bytes },
    authoritativeStore: { filesBefore: beforeStore.files, bytesBefore: beforeStore.bytes, filesAfter: afterStore.files, bytesAfter: afterStore.bytes },
    ledgerSnapshotsCreated: 0,
    consolidatedLedgerRegenerated: false,
    authoritativeRecordsModified: false,
    gitCommandsRun: 0,
    gitProcessesSpawnedByTest: 0,
    ungatedFullLedgerToolsRefused: protectedLedgerTools.map(([script]) => script),
    cleanup: "isolated temporary store removed",
  }, null, 2));
} finally {
  await fs.rm(externalTempRoot, { recursive: true, force: true });
}
