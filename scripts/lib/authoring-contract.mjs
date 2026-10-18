import fs from "node:fs";
import path from "node:path";

export function assertAuthoringContract(context) {
  const contractPath = path.join(
    process.cwd(),
    "docs",
    "content-authoring",
    "quranic-word-tree-contract.json",
  );
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  if (contract.status !== "active")
    throw new Error(
      `Cannot continue ${context}: authoring contract is not active`,
    );
  if (contract.authority?.unknownIsNotDone !== true)
    throw new Error(
      `Cannot continue ${context}: contract does not fail closed`,
    );
  if (contract.authority?.noSilentFallback !== true)
    throw new Error(
      `Cannot continue ${context}: silent fallback is not forbidden`,
    );
  if (contract.auditLedger?.appendOnly !== true)
    throw new Error(
      `Cannot continue ${context}: audit ledger is not append-only`,
    );
  const historicalVersions = [
    ...(contract.acceptedHistoricalContractVersions ?? []),
    ...(contract.auditLedger?.acceptedHistoricalContractVersions ?? []),
  ];
  if (
    historicalVersions.some(
      (version) => typeof version !== "string" || version.trim().length === 0,
    ) ||
    historicalVersions.includes(contract.contractVersion)
  )
    throw new Error(
      `Cannot continue ${context}: contract historical versions are invalid`,
    );
  if (
    !Array.isArray(contract.reviewChecklist) ||
    contract.reviewChecklist.length === 0
  )
    throw new Error(`Cannot continue ${context}: review checklist is missing`);
  return contract;
}
