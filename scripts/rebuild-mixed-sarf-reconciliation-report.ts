import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.join(root, "artifacts", "content-review", "final-sarf-completion-audit.json");
const queuePath = path.join(root, "artifacts", "content-review", "blocked-sarf-review-queue-classified.json");
const outputPath = path.join(root, "artifacts", "content-review", "mixed-sarf-reconciliation.json");

type LedgerRecord = {
  eventType: string;
  scope: {
    familyKey?: string;
    familyScope?: string | null;
    occurrenceIds?: string[];
    occurrenceId?: string;
  };
  decision?: string;
  reason?: string;
  referenceOccurrenceId?: string | null;
  changedOccurrenceIds?: string[];
  skippedOccurrenceIds?: string[];
  sarfStatus?: string;
};
type AuditReport = {
  totals: {
    mixedFamilyCount: number;
    familyCounts: Record<string, number>;
    occurrenceCounts: Record<string, number>;
  };
};
type QueueReport = { totals: { classifications: Record<string, number> } };
const records: LedgerRecord[] = [];
for (const file of fs.readdirSync(path.join(root, "artifacts", "content-review"))) {
  if (file !== "ledger.jsonl" && !/^ledger-\d{4}\.jsonl$/u.test(file)) continue;
  for (const line of fs.readFileSync(path.join(root, "artifacts", "content-review", file), "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as LedgerRecord;
    if (record.eventType === "mixed-sarf-family-consistency-reconciliation" || record.eventType === "mixed-sarf-occurrence-reconciled") records.push(record);
  }
}
const familyRecords = records.filter((record) => record.eventType === "mixed-sarf-family-consistency-reconciliation");
const occurrenceRecords = records.filter((record) => record.eventType === "mixed-sarf-occurrence-reconciled");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditReport;
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as QueueReport;
const plans = familyRecords.map((record) => ({
  familyKey: record.scope.familyKey ?? "",
  familyScope: record.scope.familyScope ?? null,
  decision: record.decision,
  reason: record.reason,
  referenceOccurrenceId: record.referenceOccurrenceId,
  occurrenceIds: record.scope.occurrenceIds ?? [],
  changedOccurrenceIds: record.changedOccurrenceIds ?? [],
  skippedOccurrenceIds: record.skippedOccurrenceIds ?? [],
}));
const baseFamilyKeys = new Set(plans.map((plan) => plan.familyKey));
const uniqueOccurrenceRecords = new Map(occurrenceRecords.filter((record) => record.scope.occurrenceId).map((record) => [record.scope.occurrenceId as string, record]));
const output = {
  reportType: "mixed-sarf-family-reconciliation-final",
  generatedAt: new Date().toISOString(),
  source: {
    contract: "docs/content-authoring/quranic-word-tree-contract.json",
    initialAudit: "artifacts/content-review/final-sarf-completion-audit.json before reconciliation",
    ledger: "artifacts/content-review/ledger.jsonl and numbered shards",
    finalAudit: path.relative(root, auditPath),
  },
  startingMixedFamilyCount: baseFamilyKeys.size,
  totals: {
    familyScopesReviewed: plans.length,
    occurrenceChangeRecords: uniqueOccurrenceRecords.size,
    fullPropagationRecords: [...uniqueOccurrenceRecords.values()].filter((record) => record.sarfStatus === "full").length,
    limitedSenseCorrectionRecords: [...uniqueOccurrenceRecords.values()].filter((record) => record.sarfStatus === "limited").length,
    blockedScopeCorrectionRecords: [...uniqueOccurrenceRecords.values()].filter((record) => record.sarfStatus === "blocked").length,
    remainingMixedFamilyCount: audit.totals.mixedFamilyCount,
    remainingBlockedFamilies: audit.totals.familyCounts.blocked,
    remainingBlockedOccurrences: audit.totals.occurrenceCounts.blocked,
    queueClassifications: queue.totals.classifications,
  },
  plans,
  remainingBlockedQueue: "artifacts/content-review/blocked-sarf-review-queue-classified.json",
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...output.totals }, null, 2));
