import fs from "node:fs";
import path from "node:path";
import {
  assertAuthoringContract,
  AUTHORING_CONTRACT_PATH,
  acceptedContractVersions,
} from "./lib/authoring-contract";
import { readAuditRecords } from "./lib/review-ledger";

const contract = assertAuthoringContract("content contract validation");
const repositoryRoot = process.cwd();
const ledgerRecords = readAuditRecords();
const recordIds = new Set<string>();
const statuses = new Set(contract.auditLedger.statuses ?? []);
const acceptedVersions = acceptedContractVersions(contract);
for (const [index, record] of ledgerRecords.entries()) {
  for (const field of contract.auditLedger.requiredRecordFields) {
    if (record[field] === undefined || record[field] === null)
      throw new Error(`Audit ledger line ${index + 1} is missing ${field}`);
  }
  const recordId = String(record.recordId);
  if (recordIds.has(recordId))
    throw new Error(`Duplicate audit ledger recordId: ${recordId}`);
  recordIds.add(recordId);
  if (record.contractId !== contract.contractId)
    throw new Error(
      `Audit ledger line ${index + 1} uses a different contractId`,
    );
  if (!acceptedVersions.has(String(record.contractVersion)))
    throw new Error(
      `Audit ledger line ${index + 1} uses an unsupported contractVersion`,
    );
  if (
    typeof record.eventType !== "string" ||
    typeof record.reviewedAt !== "string"
  )
    throw new Error(
      `Audit ledger line ${index + 1} has invalid event metadata`,
    );
  if (!statuses.has(String(record.status)))
    throw new Error(`Audit ledger line ${index + 1} has an unknown status`);
  if (!Array.isArray(record.checks) || !Array.isArray(record.evidence))
    throw new Error(
      `Audit ledger line ${index + 1} must include checks and evidence arrays`,
    );
}

for (const reference of contract.referenceLessons) {
  const referencePath = path.join(repositoryRoot, reference.path);
  if (!fs.existsSync(referencePath))
    throw new Error(`Missing contract reference: ${reference.path}`);
}

console.log(
  JSON.stringify({
    status: "ok",
    contractPath: path.relative(repositoryRoot, AUTHORING_CONTRACT_PATH),
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    problemEntries: contract.entries.length,
    checklistItems: contract.reviewChecklist.length,
    references: contract.referenceLessons.length,
    ledgerRecords: ledgerRecords.length,
  }),
);
