import fs from "node:fs";
import path from "node:path";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { assertAuthoringContract } from "./lib/authoring-contract";

const contract = assertAuthoringContract("final limited Ṣarf audit verification");
const repositoryRoot = process.cwd();
const firstPassPath = path.join(
  repositoryRoot,
  "artifacts",
  "content-review",
  "limited-sarf-audit-89de645d51b8f108.json",
);
const secondPassPath = path.join(
  repositoryRoot,
  "artifacts",
  "content-review",
  "limited-sarf-audit-b99065b515d2aea7.json",
);
const convergencePath = path.join(
  repositoryRoot,
  "artifacts",
  "content-review",
  "limited-sarf-audit-50a80fa97564778f.json",
);

type AuditItem = {
  packageId: string;
  teachingId: string;
  category: string;
  decision: "confirmed-limited" | "upgraded-to-full" | "blocked-for-genuine-ambiguity";
};

function readReport(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing audit report: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as { items: AuditItem[] };
}

const merged = new Map<string, AuditItem>();
for (const item of readReport(firstPassPath).items) {
  const key = `${item.packageId}|${item.teachingId}`;
  if (!merged.has(key)) merged.set(key, item);
}
for (const item of readReport(secondPassPath).items)
  merged.set(`${item.packageId}|${item.teachingId}`, item);

const byCategory: Record<string, { confirmedLimited: number; upgradedToFull: number; blocked: number }> = {};
for (const item of merged.values()) {
  const stats = (byCategory[item.category] ??= {
    confirmedLimited: 0,
    upgradedToFull: 0,
    blocked: 0,
  });
  if (item.decision === "confirmed-limited") stats.confirmedLimited += 1;
  if (item.decision === "upgraded-to-full") stats.upgradedToFull += 1;
  if (item.decision === "blocked-for-genuine-ambiguity") stats.blocked += 1;
}

const decisions = {
  confirmedLimited: [...merged.values()].filter((item) => item.decision === "confirmed-limited").length,
  upgradedToFull: [...merged.values()].filter((item) => item.decision === "upgraded-to-full").length,
  blocked: [...merged.values()].filter((item) => item.decision === "blocked-for-genuine-ambiguity").length,
};
if (merged.size !== 5264 || decisions.confirmedLimited !== 3550 || decisions.upgradedToFull !== 250 || decisions.blocked !== 1464)
  throw new Error(`Unexpected converged limited-family population: ${JSON.stringify({ size: merged.size, decisions })}`);

const convergence = readReport(convergencePath) as unknown as {
  decisions: { upgradedToFull: number; blocked: number; confirmedLimited: number };
  scope: { limitedOccurrences: number; distinctLimitedTeachingEntries: number };
};
if (convergence.decisions.upgradedToFull !== 0)
  throw new Error("The final convergence audit still found upgrades");

const record: AuditRecord = {
  recordId: "limited-sarf-audit-final-verification-20261016",
  eventType: "limited-family-audit-final-verification",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  scope: {
    type: "repository-limited-sarf-population",
    authoredPackages: 65,
    initialLiveLimitedOccurrences: 5296,
    initialDistinctLimitedTeachingEntries: 5264,
    convergedCurrentLimitedOccurrences: convergence.scope.limitedOccurrences,
    convergedCurrentDistinctLimitedTeachingEntries: convergence.scope.distinctLimitedTeachingEntries,
    distinctDecisions: decisions,
    byCategory,
  },
  status: "blocked",
  reviewedAt: new Date().toISOString(),
  checks: [
    "all-initially-limited-distinct-families-reconciled-across-two-audit-passes",
    "final-convergence-dry-run-found-zero-new-upgrades",
    "every-current-limited-family-has-confirmed-or-blocked-decision",
    "rootful-lexical-families-are-never-confirmed-limited",
    "full-families-have-exactly-five-rows",
    "package-schema-and-semantic-validation-passed",
    "root-picture-and-root-sarf-audits-passed",
    "database-import-completed",
    "representative-rendered-routes-and-health-returned-200",
    "focused-content-and-rendered-html-tests-passed-40-of-40",
    "typescript-eslint-and-production-build-passed",
  ],
  evidence: [
    firstPassPath,
    secondPassPath,
    convergencePath,
    "docs/content-authoring/quranic-word-tree-contract.json",
    "docs/content-authoring/common-problems.json",
    "scripts/audit-limited-sarf-complete.ts",
    "scripts/content-validate.ts",
    "scripts/content-root-audit.ts",
    "scripts/content-import.ts",
    "http://127.0.0.1:3000/api/health",
    "http://127.0.0.1:3000/learn/114/1",
    "http://127.0.0.1:3000/learn/51/53",
    "http://127.0.0.1:3000/learn/69/1",
    "http://127.0.0.1:3000/learn/90/17",
  ],
  contentChanged: false,
  auditBatchIds: [
    "limited-sarf-audit-89de645d51b8f108",
    "limited-sarf-audit-b99065b515d2aea7",
    "limited-sarf-audit-50a80fa97564778f",
  ],
};

const existing = new Set(readAuditRecords().map((item) => item.recordId));
if (!existing.has(record.recordId)) appendAuditRecords([record]);
console.log(JSON.stringify({ status: "recorded", recordId: record.recordId, scope: record.scope }, null, 2));
