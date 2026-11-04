import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { performance } from "node:perf_hooks";

const archiveArg = process.argv.find((value) => value.startsWith("--archive-root="))?.slice("--archive-root=".length);
const planArg = process.argv.find((value) => value.startsWith("--deletion-manifest="))?.slice("--deletion-manifest=".length);
if (!archiveArg || !planArg) throw new Error("Usage: node scripts/verify-compositional-gloss-archive-after-cleanup.mjs --archive-root=PATH --deletion-manifest=PATH");
const archiveRoot = path.resolve(archiveArg);
const planPath = path.resolve(planArg);
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const archiveManifestPath = path.join(archiveRoot, "archive-manifest.json");
const archiveManifest = JSON.parse(await fs.readFile(archiveManifestPath, "utf8"));
const started = performance.now();

async function hashExpandedGzip(file) {
  const hash = crypto.createHash("sha256");
  let expandedBytes = 0;
  for await (const chunk of createReadStream(file).pipe(createGunzip())) {
    hash.update(chunk);
    expandedBytes += chunk.length;
  }
  return { sha256: hash.digest("hex"), expandedBytes };
}

assert.equal(plan.candidateCount, 165);
assert.equal(plan.candidateBytes, 35_291_791_130);
const deletedNames = new Set(plan.candidates.map((entry) => entry.name));
const original = new Map(archiveManifest.files.map((entry) => [entry.name, entry.length]));
const expected = new Map([...original].filter(([name]) => !deletedNames.has(name)));
const actualNames = await fs.readdir(archiveRoot);
assert.equal(actualNames.length, expected.size + 1, "retained archive file count differs from the expected post-cleanup inventory");
assert.ok(actualNames.includes("archive-manifest.json"));
for (const entry of plan.candidates) {
  await assert.rejects(fs.access(path.join(archiveRoot, entry.name)), { code: "ENOENT" }, `deleted candidate remains: ${entry.name}`);
}
let archiveBytes = (await fs.stat(archiveManifestPath)).size;
for (const [name, expectedSize] of expected) {
  const stat = await fs.stat(path.join(archiveRoot, name));
  assert.equal(stat.size, expectedSize, `retained archive file size changed: ${name}`);
  archiveBytes += stat.size;
}
assert.equal(archiveBytes, 11_166_891_582, "retained archive byte count differs from expected");

const gzipFiles = actualNames.filter((name) => name.endsWith(".gz")).sort();
const duplicateGroups = new Map();
let compressedBytesRead = 0;
let expandedBytesChecked = 0;
for (let index = 0; index < gzipFiles.length; index += 1) {
  const name = gzipFiles[index];
  const file = path.join(archiveRoot, name);
  compressedBytesRead += (await fs.stat(file)).size;
  const expanded = await hashExpandedGzip(file);
  expandedBytesChecked += expanded.expandedBytes;
  const key = `${expanded.expandedBytes}:${expanded.sha256}`;
  const group = duplicateGroups.get(key) ?? { files: [], expandedBytes: expanded.expandedBytes };
  group.files.push(name);
  duplicateGroups.set(key, group);
  if ((index + 1) % 25 === 0 || index + 1 === gzipFiles.length) {
    console.log(JSON.stringify({ gzipValidated: index + 1, total: gzipFiles.length }));
  }
}

const duplicates = [...duplicateGroups.values()].filter((group) => group.files.length > 1).map((group) => group);
console.log(JSON.stringify({
  result: "PASS",
  archiveFilesAfter: actualNames.length,
  archiveBytesAfter: archiveBytes,
  approvedCandidatesAbsent: deletedNames.size,
  gzipFilesValidated: gzipFiles.length,
  compressedBytesRead,
  expandedBytesChecked,
  uncompressedDuplicateGroups: duplicates,
  elapsedMs: Number((performance.now() - started).toFixed(1)),
}, null, 2));
