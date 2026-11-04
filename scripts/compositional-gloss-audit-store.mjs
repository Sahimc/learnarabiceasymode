import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createReadStream, createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts/compositional-gloss-audit-2026-10");
const storeRoot = path.resolve(process.env.QURAN_AUDIT_STORE_ROOT
  ?? path.join(os.homedir(), ".codex", "quran-compositional-gloss-audit", "store"));
const resolvedRepoRoot = path.resolve(root);
if (storeRoot === resolvedRepoRoot || storeRoot.startsWith(`${resolvedRepoRoot}${path.sep}`)) {
  throw new Error(`The audit store must remain outside the repository: ${storeRoot}`);
}
const coverageRoot = path.join(storeRoot, "coverage-by-surah");
const decisionsRoot = path.join(storeRoot, "decisions-by-surah");
const command = process.argv[2];
const traceEnabled = process.argv.includes("--trace");
const filesRead = new Map();

function fileName(surah) {
  return `${String(surah).padStart(3, "0")}.jsonl`;
}

function parseSurah(value) {
  const surah = Number(value);
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    throw new Error(`Invalid sūrah number: ${value}`);
  }
  return surah;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function readJsonl(file, onRow) {
  if (traceEnabled) {
    const stat = await fs.stat(file);
    filesRead.set(path.resolve(file), stat.size);
  }
  const reader = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line) continue;
    await onRow(line, JSON.parse(line));
  }
}

async function makeShard(sourcePath, outputRoot, kind) {
  await fs.mkdir(outputRoot, { recursive: true });
  const streams = new Map();
  const counts = Array(115).fill(0);
  const hashes = Array.from({ length: 115 }, () => crypto.createHash("sha256"));
  const ids = new Set();
  let duplicateRows = 0;
  let total = 0;
  const inputHash = crypto.createHash("sha256");

  try {
    await readJsonl(sourcePath, async (line, row) => {
      const match = kind === "coverage"
        ? /^word:(\d+):(\d+):(\d+)$/u.exec(row.occurrenceId ?? "")
        : /^word:(\d+):(\d+):(\d+)$/u.exec(row.occurrenceId ?? "");
      if (!match) throw new Error(`${kind}: invalid occurrence ID ${row.occurrenceId}`);
      const surah = Number(match[1]);
      if (surah < 1 || surah > 114 || (kind === "coverage" && row.surah !== surah)) {
        throw new Error(`${kind}: occurrence/sūrah mismatch for ${row.occurrenceId}`);
      }
      if (ids.has(row.occurrenceId)) {
        if (kind === "coverage") throw new Error(`${kind}: duplicate occurrence ID ${row.occurrenceId}`);
        duplicateRows += 1;
      }
      ids.add(row.occurrenceId);
      if (kind === "coverage" && (!Number.isInteger(row.ayah) || !Number.isInteger(row.wordPosition))) {
        throw new Error(`coverage: missing location fields for ${row.occurrenceId}`);
      }
      const outputPath = path.join(outputRoot, fileName(surah));
      let stream = streams.get(surah);
      if (!stream) {
        stream = createWriteStream(outputPath, { flags: "w" });
        streams.set(surah, stream);
      }
      const bytes = Buffer.from(`${line}\n`, "utf8");
      if (!stream.write(bytes)) await new Promise((resolve) => stream.once("drain", resolve));
      hashes[surah].update(bytes);
      inputHash.update(bytes);
      counts[surah] += 1;
      total += 1;
    });
  } finally {
    for (const stream of streams.values()) stream.end();
    await Promise.all([...streams.values()].map((stream) => finished(stream)));
  }

  const perSurah = {};
  for (let surah = 1; surah <= 114; surah += 1) {
    const count = counts[surah];
    if (!count) continue;
    const outputHash = crypto.createHash("sha256");
    let outputCount = 0;
    await readJsonl(path.join(outputRoot, fileName(surah)), async (line) => {
      outputHash.update(Buffer.from(`${line}\n`, "utf8"));
      outputCount += 1;
    });
    const expectedHash = hashes[surah].digest("hex");
    const actualHash = outputHash.digest("hex");
    if (outputCount !== count || actualHash !== expectedHash) {
      throw new Error(`${kind}: integrity mismatch for sūrah ${surah}: ${outputCount}/${count}, hash ${actualHash}/${expectedHash}`);
    }
    perSurah[surah] = { rows: count, sha256: actualHash };
  }
  return { rows: total, sha256: inputHash.digest("hex"), uniqueOccurrenceIds: ids.size, duplicateRows, perSurah };
}

async function prepare() {
  const ledgerPath = path.join(artifactRoot, "coverage-ledger.jsonl");
  const decisionsPath = path.join(artifactRoot, "review-decisions.jsonl");
  const checkpointPath = path.join(artifactRoot, "PHASE-1-CHECKPOINT.md");
  const manifestPath = path.join(storeRoot, "store-manifest.json");
  if (await fs.access(manifestPath).then(() => true).catch(() => false)) {
    throw new Error(`Verified store already exists; refusing to overwrite: ${manifestPath}`);
  }
  const checkpointHash = await hashFile(checkpointPath);
  const coverage = await makeShard(ledgerPath, coverageRoot, "coverage");
  const decisions = await makeShard(decisionsPath, decisionsRoot, "decisions");
  const manifest = {
    schemaVersion: 1,
    sourceCoverage: path.relative(root, ledgerPath).replaceAll("\\", "/"),
    sourceDecisions: path.relative(root, decisionsPath).replaceAll("\\", "/"),
    checkpoint: path.relative(root, checkpointPath).replaceAll("\\", "/"),
    checkpointSha256: checkpointHash,
    coverage,
    decisions,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ storeRoot, manifestPath, coverageRows: coverage.rows, decisionRows: decisions.rows, coverageSha256: coverage.sha256, decisionsSha256: decisions.sha256, checkpointSha256: checkpointHash, surahsWithCoverage: Object.keys(coverage.perSurah).length }, null, 2));
}

async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function lookup() {
  const surah = parseSurah(arg("--surah"));
  const ayah = Number(arg("--ayah"));
  const word = arg("--word") === undefined ? undefined : Number(arg("--word"));
  if (!Number.isInteger(ayah) || ayah < 1 || (word !== undefined && (!Number.isInteger(word) || word < 1))) {
    throw new Error("Usage: node scripts/compositional-gloss-audit-store.mjs lookup --surah N --ayah N [--word N]");
  }
  const coveragePath = path.join(coverageRoot, fileName(surah));
  const decisionsPath = path.join(decisionsRoot, fileName(surah));
  const decisions = new Map();
  if (await fs.access(decisionsPath).then(() => true).catch(() => false)) {
    await readJsonl(decisionsPath, (_line, row) => {
      const history = decisions.get(row.occurrenceId) ?? [];
      history.push(row);
      decisions.set(row.occurrenceId, history);
    });
  }
  const rows = [];
  await readJsonl(coveragePath, (_line, row) => {
    if (row.surah === surah && row.ayah === ayah && (word === undefined || row.wordPosition === word)) {
      const occurrenceDecisionHistory = decisions.get(row.occurrenceId) ?? [];
      rows.push({
        ...row,
        occurrenceDecision: occurrenceDecisionHistory.at(-1) ?? null,
        occurrenceDecisionHistory,
      });
    }
  });
  if (!rows.length) throw new Error(`No rows found for sūrah ${surah}, āyah ${ayah}${word === undefined ? "" : `, word ${word}`}.`);
  const result = { surah, ayah, word: word ?? null, rows };
  if (traceEnabled) {
    result.readTrace = {
      files: [...filesRead].map(([file, bytes]) => ({ file, bytes })),
      estimatedBytesRead: [...filesRead.values()].reduce((sum, bytes) => sum + bytes, 0),
    };
  }
  console.log(JSON.stringify(result, null, 2));
}

try {
  if (command === "prepare") await prepare();
  else if (command === "lookup") await lookup();
  else throw new Error("Use command: prepare or lookup.");
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
