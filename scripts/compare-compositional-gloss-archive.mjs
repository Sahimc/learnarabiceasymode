import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

const archiveArg = process.argv.find((value) => value.startsWith("--archive-root="))?.slice("--archive-root=".length);
if (!archiveArg) throw new Error("Usage: node scripts/compare-compositional-gloss-archive.mjs --archive-root=PATH");
const manifestOutArg = process.argv.find((value) => value.startsWith("--manifest-out="))?.slice("--manifest-out=".length);
const archiveRoot = path.resolve(archiveArg);
const repositoryRoot = path.resolve(process.cwd());
if (archiveRoot === repositoryRoot || archiveRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error("Archive comparison must target an external archive directory.");
}
const archiveManifest = JSON.parse(await fs.readFile(path.join(archiveRoot, "archive-manifest.json"), "utf8"));
const archiveManifestSha256 = (await hashStream(createReadStream(path.join(archiveRoot, "archive-manifest.json")))).sha256;
const files = await fs.readdir(archiveRoot, { withFileTypes: true });
assert.ok(files.every((entry) => entry.isFile()), "archive root contains unexpected subdirectories");
const manifestFiles = new Map(archiveManifest.files.map((entry) => [entry.name, entry.length]));
const sourceNames = files.map((entry) => entry.name).filter((name) => name !== "archive-manifest.json");
assert.equal(sourceNames.length, manifestFiles.size, "archive file list differs from its manifest");
for (const name of sourceNames) {
  assert.ok(manifestFiles.has(name), `unlisted archive file: ${name}`);
  assert.equal((await fs.stat(path.join(archiveRoot, name))).size, manifestFiles.get(name), `archive size differs from manifest: ${name}`);
}
assert.deepEqual([...manifestFiles.keys()].filter((name) => !sourceNames.includes(name)), [], "manifest lists missing archive files");
const csvFiles = files.filter((entry) => entry.name.endsWith(".csv")).map((entry) => entry.name);
const candidateNames = csvFiles.filter((name) => /^coverage-ledger\.20\d+.*\.csv$/u.test(name)).sort();
const tempNames = files.map((entry) => entry.name).filter((name) => name.includes(".tmp-")).sort();

async function hashStream(stream) {
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function hashFile(file) {
  return hashStream(createReadStream(file));
}

async function hashGunzip(file) {
  return hashStream(createReadStream(file).pipe(createGunzip()));
}

const verifiedPairs = [];
const unmatchedPlain = [];
for (let index = 0; index < candidateNames.length; index += 1) {
  const csvName = candidateNames[index];
  const compressedName = `${csvName}.gz`;
  const csvPath = path.join(archiveRoot, csvName);
  const compressedPath = path.join(archiveRoot, compressedName);
  if (!files.some((entry) => entry.name === compressedName)) {
    unmatchedPlain.push(csvName);
    continue;
  }
  const [plain, expanded] = await Promise.all([hashFile(csvPath), hashGunzip(compressedPath)]);
  verifiedPairs.push({ file: csvName, compressedCounterpart: compressedName, bytes: plain.bytes, identical: plain.bytes === expanded.bytes && plain.sha256 === expanded.sha256, sha256: plain.sha256 });
  if ((index + 1) % 10 === 0 || index + 1 === candidateNames.length) {
    console.log(JSON.stringify({ progress: `${index + 1}/${candidateNames.length}`, verifiedIdentical: verifiedPairs.filter((pair) => pair.identical).length }));
  }
}

const exactTemporaryDuplicates = [];
for (const tempName of tempNames) {
  const finalName = tempName.replace(/\.tmp-.*$/u, "");
  const finalPath = path.join(archiveRoot, finalName);
  const tempPath = path.join(archiveRoot, tempName);
  const finalStat = await fs.stat(finalPath).catch(() => null);
  const tempStat = await fs.stat(tempPath);
  if (!finalStat || finalStat.size !== tempStat.size) continue;
  const [finalHash, tempHash] = await Promise.all([hashFile(finalPath), hashFile(tempPath)]);
  if (finalHash.sha256 === tempHash.sha256) {
    exactTemporaryDuplicates.push({ file: tempName, duplicateOf: finalName, bytes: tempStat.size, sha256: tempHash.sha256 });
  }
}

const stablePair = ["coverage-ledger.csv", "coverage-ledger.lookup-20261031.csv"];
const stableStats = await Promise.all(stablePair.map((name) => fs.stat(path.join(archiveRoot, name))));
const stableHashes = await Promise.all(stablePair.map((name) => hashFile(path.join(archiveRoot, name))));
const stableDuplicate = stableStats[0].size === stableStats[1].size && stableHashes[0].sha256 === stableHashes[1].sha256;
const actualBytes = (await Promise.all(files.map((entry) => fs.stat(path.join(archiveRoot, entry.name))))).reduce((sum, stat) => sum + stat.size, 0);
const archiveManifestSize = (await fs.stat(path.join(archiveRoot, "archive-manifest.json"))).size;
assert.equal(files.length - 1, archiveManifest.count, "archived source file count differs from its manifest");
assert.equal(actualBytes - archiveManifestSize, archiveManifest.totalBytes, "archived source bytes differ from its manifest");

const approvedTempNames = new Set([
  "coverage-ledger.20261031182502-31000.csv.tmp-31000-1793471102361",
  "coverage-ledger.20261031182502-31000.jsonl.gz.tmp-31000-1793471102361",
  "coverage-ledger.csv.tmp-21920-1793470153653",
]);
assert.equal(candidateNames.length, 161, "timestamped CSV candidate count differs from approval");
assert.equal(verifiedPairs.length, 161, "timestamped CSV counterpart count differs from approval");
assert.equal(verifiedPairs.filter((pair) => pair.identical).length, 161, "not every compressed counterpart is byte-identical after decompression");
assert.equal(stableDuplicate, true, "stable duplicate CSV pair no longer matches");
assert.equal(exactTemporaryDuplicates.length, 3, "verified temporary duplicate count differs from approval");
assert.deepEqual(new Set(exactTemporaryDuplicates.map((entry) => entry.file)), approvedTempNames, "verified temporary duplicates differ from approval");

const deletionCandidates = [
  ...verifiedPairs.map((pair) => ({ name: pair.file, bytes: pair.bytes, sha256: pair.sha256, retainedCounterpart: pair.compressedCounterpart, kind: "timestamped-plain-csv" })),
  { name: stablePair[1], bytes: stableStats[1].size, sha256: stableHashes[1].sha256, retainedCounterpart: stablePair[0], kind: "stable-identical-csv" },
  ...exactTemporaryDuplicates.map((entry) => ({ name: entry.file, bytes: entry.bytes, sha256: entry.sha256, retainedCounterpart: entry.duplicateOf, kind: "verified-temporary-duplicate" })),
];
assert.equal(new Set(deletionCandidates.map((entry) => entry.name)).size, 165, "deletion candidates contain duplicate paths or an unexpected count");
const deletionBytes = deletionCandidates.reduce((sum, entry) => sum + entry.bytes, 0);
assert.equal(deletionBytes, 35_291_791_130, "deletion byte total differs from approved amount");
if (manifestOutArg) {
  const manifestOut = path.resolve(manifestOutArg);
  if (manifestOut === archiveRoot || manifestOut.startsWith(`${archiveRoot}${path.sep}`)
      || manifestOut === repositoryRoot || manifestOut.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("The exact deletion manifest must be kept outside the repository and archive.");
  }
  await fs.mkdir(path.dirname(manifestOut), { recursive: true });
  await fs.writeFile(manifestOut, `${JSON.stringify({
    schemaVersion: 1,
    archiveRoot,
    archiveManifestSha256,
    verifiedAt: new Date().toISOString(),
    candidateCount: deletionCandidates.length,
    candidateBytes: deletionBytes,
    candidates: deletionCandidates,
  }, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  result: "COMPLETE",
  archiveRoot,
  archiveFiles: files.length,
  archiveBytes: actualBytes,
  timestampedPlainCsvFiles: candidateNames.length,
  timestampedCompressedPairs: verifiedPairs.length,
  identicalCompressedPairs: verifiedPairs.filter((pair) => pair.identical).length,
  nonIdenticalCompressedPairs: verifiedPairs.filter((pair) => !pair.identical),
  unmatchedPlain,
  redundantPlainCsvBytesIfApproved: verifiedPairs.filter((pair) => pair.identical).reduce((sum, pair) => sum + pair.bytes, 0),
  stableCsvDuplicate: { files: stablePair, identical: stableDuplicate, bytesRecoverableIfApproved: stableDuplicate ? stableStats[1].size : 0, sha256: stableHashes[0].sha256 },
  exactTemporaryDuplicates,
  exactTemporaryDuplicateBytesIfApproved: exactTemporaryDuplicates.reduce((sum, entry) => sum + entry.bytes, 0),
  deletionCandidateCount: deletionCandidates.length,
  deletionCandidateBytes: deletionBytes,
  deletionManifestOut: manifestOutArg ? path.resolve(manifestOutArg) : null,
  note: "Read-only comparison. No archive files were deleted or modified.",
}, null, 2));
