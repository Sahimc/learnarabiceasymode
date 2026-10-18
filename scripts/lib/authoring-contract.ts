import fs from "node:fs";
import path from "node:path";

export const AUTHORING_CONTRACT_PATH = path.join(
  process.cwd(),
  "docs",
  "content-authoring",
  "quranic-word-tree-contract.json",
);

export type AuthoringContract = {
  schemaVersion: string;
  contractId: string;
  contractVersion: string;
  acceptedHistoricalContractVersions?: string[];
  status: "active" | "retired";
  authority: {
    mustLoadBefore: string[];
    mustRecordAfter: string[];
    humanLinguisticReviewOwner: string;
    unknownIsNotDone: boolean;
    noSilentFallback: boolean;
    spotChecksAreNotTheCompletionGate: boolean;
  };
  lessonContract: Record<string, unknown>;
  sectionContract: Record<string, unknown>;
  reviewChecklist: string[];
  failClosedRules: string[];
  referenceLessons: Array<{ path: string; lesson: string }>;
  auditLedger: {
    path: string;
    format: string;
    requiredRecordFields: string[];
    statuses: string[];
    acceptedHistoricalContractVersions?: string[];
    appendOnly: boolean;
    unknownIsNotComplete: boolean;
  };
  completionGates: Record<string, string>;
  entries: Array<{ id: string; problem: string; safeguard: string }>;
};

export function acceptedContractVersions(contract: AuthoringContract) {
  return new Set([
    contract.contractVersion,
    ...(contract.acceptedHistoricalContractVersions ?? []),
    ...(contract.auditLedger.acceptedHistoricalContractVersions ?? []),
  ]);
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(
      `Authoring contract field ${field} must be a non-empty string`,
    );
}

function requireStringArray(value: unknown, field: string) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  )
    throw new Error(
      `Authoring contract field ${field} must be a non-empty string array`,
    );
}

export function loadAuthoringContract(): AuthoringContract {
  const contract = JSON.parse(
    fs.readFileSync(AUTHORING_CONTRACT_PATH, "utf8"),
  ) as AuthoringContract;
  requireString(contract.contractId, "contractId");
  requireString(contract.contractVersion, "contractVersion");
  if (contract.status !== "active")
    throw new Error(`Authoring contract is not active: ${contract.status}`);
  if (contract.authority?.unknownIsNotDone !== true)
    throw new Error("Authoring contract must fail closed for unknown work");
  if (contract.authority?.noSilentFallback !== true)
    throw new Error("Authoring contract must forbid silent fallbacks");
  if (contract.auditLedger?.appendOnly !== true)
    throw new Error("Authoring audit ledger must be append-only");
  if (contract.auditLedger?.unknownIsNotComplete !== true)
    throw new Error(
      "Authoring audit ledger must treat unknown work as incomplete",
    );
  requireStringArray(contract.reviewChecklist, "reviewChecklist");
  requireStringArray(contract.failClosedRules, "failClosedRules");
  const historicalVersions = [
    ...(contract.acceptedHistoricalContractVersions ?? []),
    ...(contract.auditLedger.acceptedHistoricalContractVersions ?? []),
  ];
  if (
    historicalVersions.some(
      (version) => typeof version !== "string" || version.trim().length === 0,
    ) ||
    historicalVersions.includes(contract.contractVersion)
  )
    throw new Error(
      "Authoring contract historical versions must be non-empty and older than the active version",
    );
  if (!contract.entries?.length)
    throw new Error("Authoring contract must contain common-problem entries");
  const ids = contract.entries.map((entry) => entry.id);
  if (
    ids.some((id) => !id) ||
    new Set(ids).size !== ids.length ||
    contract.entries.some(
      (entry) => !entry.problem?.trim() || !entry.safeguard?.trim(),
    )
  )
    throw new Error(
      "Authoring contract contains invalid or duplicate problem entries",
    );
  return contract;
}

export function assertAuthoringContract(context: string) {
  try {
    return loadAuthoringContract();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot continue ${context}: ${message}`);
  }
}
