import fs from "node:fs";
import path from "node:path";
import {
  acceptedContractVersions,
  loadAuthoringContract,
  type AuthoringContract,
} from "./authoring-contract";

export type AuditRecord = {
  recordId: string;
  eventType: string;
  contractId: string;
  contractVersion: string;
  scope: unknown;
  status: string;
  reviewedAt: string;
  checks: string[];
  evidence: string[];
  [key: string]: unknown;
};

function ledgerPath(contract: AuthoringContract) {
  return path.join(process.cwd(), contract.auditLedger.path);
}

const LEDGER_SHARD_THRESHOLD_BYTES = 75 * 1024 * 1024;

export function auditLedgerPaths(contract = loadAuthoringContract()) {
  const primary = ledgerPath(contract);
  const directory = path.dirname(primary);
  const filename = path.basename(primary, path.extname(primary));
  if (!fs.existsSync(directory)) return [primary];
  const shardPrefix = `${filename}-`;
  const shardSuffix = path.extname(primary);
  const shards = fs
    .readdirSync(directory)
    .filter(
      (entry) =>
        entry.startsWith(shardPrefix) &&
        entry.endsWith(shardSuffix) &&
        /^ledger-\d{4}\.jsonl$/u.test(entry),
    )
    .sort()
    .map((entry) => path.join(directory, entry));
  return [primary, ...shards];
}

export function readAuditRecords(): AuditRecord[] {
  const contract = loadAuthoringContract();
  const acceptedVersions = acceptedContractVersions(contract);
  return auditLedgerPaths(contract).flatMap((file) => {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          const record = JSON.parse(line) as AuditRecord;
          if (record.contractId !== contract.contractId)
            throw new Error("contractId does not match the active contract");
          if (!acceptedVersions.has(record.contractVersion))
            throw new Error(
              `unsupported contractVersion ${record.contractVersion}`,
            );
          return record;
        } catch {
          throw new Error(`Invalid audit ledger record in ${file} on line ${index + 1}`);
        }
      });
  });
}

export function appendAuditRecord(record: AuditRecord) {
  appendAuditRecords([record]);
}

export function appendAuditRecords(recordsToAppend: AuditRecord[]) {
  if (recordsToAppend.length === 0) return;
  const contract = loadAuthoringContract();
  const statuses = new Set(contract.auditLedger.statuses ?? []);
  const requiredFields = new Set(
    contract.auditLedger.requiredRecordFields ?? [],
  );
  const seenIds = new Set<string>();
  for (const record of recordsToAppend) {
    if (!record.recordId.trim()) throw new Error("Audit recordId is required");
    if (!record.eventType.trim())
      throw new Error("Audit eventType is required");
    if (seenIds.has(record.recordId))
      throw new Error(`Duplicate audit recordId in batch: ${record.recordId}`);
    seenIds.add(record.recordId);
    if (record.contractId !== contract.contractId)
      throw new Error(
        "Audit record contractId does not match the active contract",
      );
    if (record.contractVersion !== contract.contractVersion)
      throw new Error("New audit records must use the active contractVersion");
    if (!statuses.has(record.status))
      throw new Error(`Unknown audit status: ${record.status}`);
    if (!Array.isArray(record.checks) || !Array.isArray(record.evidence))
      throw new Error("Audit record checks and evidence must be arrays");
    for (const field of requiredFields)
      if (record[field] === undefined || record[field] === null)
        throw new Error(`Audit record ${record.recordId} is missing ${field}`);
  }

  const records = readAuditRecords();
  const existingIds = new Set(records.map((record) => record.recordId));
  const duplicate = recordsToAppend.find((record) =>
    existingIds.has(record.recordId),
  );
  if (duplicate)
    throw new Error(`Audit recordId already exists: ${duplicate.recordId}`);

  const primary = ledgerPath(contract);
  let target = primary;
  if (fs.existsSync(primary) && fs.statSync(primary).size >= LEDGER_SHARD_THRESHOLD_BYTES) {
    const paths = auditLedgerPaths(contract);
    const nextNumber =
      paths
        .map((file) => file.match(/ledger-(\d{4})\.jsonl$/u)?.[1])
        .filter(Boolean)
        .map(Number)
        .reduce((max, value) => Math.max(max, value), 0) + 1;
    target = path.join(
      path.dirname(primary),
      `ledger-${String(nextNumber).padStart(4, "0")}.jsonl`,
    );
  }
  fs.appendFileSync(
    target,
    `${recordsToAppend.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}
