import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createReadStream } from "node:fs";

const repoRoot = process.cwd();
const artifactRoot = path.join(repoRoot, "artifacts/compositional-gloss-audit-2026-10");
const storeRoot = path.resolve(process.env.QURAN_AUDIT_STORE_ROOT
  ?? path.join(os.homedir(), ".codex", "quran-compositional-gloss-audit", "store"));
const manifest = JSON.parse(await fs.readFile(path.join(storeRoot, "store-manifest.json"), "utf8"));
const checkpoint = path.join(artifactRoot, "PHASE-1-CHECKPOINT.md");

async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyShards(kind, directory, expected) {
  let rows = 0;
  let duplicates = 0;
  const ids = new Set();
  const shardCount = Object.keys(expected.perSurah).length;
  for (let surah = 1; surah <= 114; surah += 1) {
    const entry = expected.perSurah[surah];
    if (!entry) continue;
    const file = path.join(directory, `${String(surah).padStart(3, "0")}.jsonl`);
    const hash = crypto.createHash("sha256");
    let shardRows = 0;
    const reader = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of reader) {
      if (!line) continue;
      const row = JSON.parse(line);
      const occurrenceId = row.occurrenceId;
      assert.match(occurrenceId ?? "", new RegExp(`^word:${surah}:\\d+:\\d+$`, "u"), `${kind} row in wrong sūrah shard`);
      if (kind === "coverage") assert.equal(row.surah, surah, `${occurrenceId} has mismatched sūrah field`);
      if (ids.has(occurrenceId)) {
        if (kind === "coverage") assert.fail(`duplicate coverage occurrence ${occurrenceId}`);
        duplicates += 1;
      }
      ids.add(occurrenceId);
      hash.update(`${line}\n`, "utf8");
      shardRows += 1;
      rows += 1;
    }
    assert.equal(shardRows, entry.rows, `${kind} Sūrah ${surah} row count mismatch`);
    assert.equal(hash.digest("hex"), entry.sha256, `${kind} Sūrah ${surah} record hash mismatch`);
  }
  assert.equal(rows, expected.rows, `${kind} overall row count mismatch`);
  assert.equal(ids.size, expected.uniqueOccurrenceIds, `${kind} unique ID count mismatch`);
  assert.equal(duplicates, expected.duplicateRows, `${kind} duplicate history count mismatch`);
  return { rows, uniqueOccurrenceIds: ids.size, duplicateRows: duplicates, surahShards: shardCount };
}

const [coverage, decisions] = await Promise.all([
  verifyShards("coverage", path.join(storeRoot, "coverage-by-surah"), manifest.coverage),
  verifyShards("decisions", path.join(storeRoot, "decisions-by-surah"), manifest.decisions),
]);
const sourceCoverageHash = await hashFile(path.join(artifactRoot, "coverage-ledger.jsonl"));
const sourceDecisionsHash = await hashFile(path.join(artifactRoot, "review-decisions.jsonl"));
const checkpointHash = await hashFile(checkpoint);
assert.equal(sourceCoverageHash, manifest.coverage.sha256, "authoritative coverage ledger differs from recorded source hash");
assert.equal(sourceDecisionsHash, manifest.decisions.sha256, "authoritative decision history differs from recorded source hash");
assert.equal(checkpointHash, manifest.checkpointSha256, "checkpoint differs from recorded source hash");

console.log(JSON.stringify({
  result: "PASS",
  coverage,
  decisions,
  sourceLedgerSha256: sourceCoverageHash,
  decisionHistorySha256: sourceDecisionsHash,
  checkpointSha256: checkpointHash,
}, null, 2));
