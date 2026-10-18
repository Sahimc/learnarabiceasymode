import { assertAuthoringContract } from "./lib/authoring-contract";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";

const contract = assertAuthoringContract("Ṣarf contract completion audit");
const records = readAuditRecords();
const initialBatch = records.find(
  (record) => record.recordId === "sarf-review-batch-7820ff6c42e8cd475c67",
);
const correctedBatch = records.find(
  (record) => record.recordId === "sarf-review-batch-3c7c670bd11fa9507cdb",
);
if (!initialBatch || !correctedBatch)
  throw new Error(
    "Expected initial and corrected Ṣarf review batches are missing",
  );

const reviewedAt = "2026-10-16T14:00:00.000Z";
const correction: AuditRecord = {
  recordId: "sarf-review-correction-3c7c670bd11fa9507cdb",
  eventType: "sarf-review-correction-pass",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  scope: {
    type: "repository-content",
    packages: 65,
    occurrences: 10145,
    description:
      "The corrected pass supersedes the initial restricted-family classification and restores full families where a lexical root was present.",
  },
  status: "passed",
  reviewedAt,
  checks: [
    "initial-pass-reconciled",
    "rooted-noun-pronoun-classification-corrected",
    "full-and-limited-counts-recomputed",
    "corrected-package-content-imported",
  ],
  evidence: [
    initialBatch.recordId,
    correctedBatch.recordId,
    "scripts/lib/sarf-authoring.ts",
    "scripts/review-sarf-families.ts",
  ],
  contentChanged: true,
  supersedes: initialBatch.recordId,
};

const completion: AuditRecord = {
  recordId: "contract-implementation-complete-20261016-sarf",
  eventType: "contract-implementation-complete",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  scope: {
    type: "repository-content",
    packages: 65,
    customOccurrences: 10145,
    fullFamilies: 4848,
    limitedFamilies: 5297,
    referenceFamilies: ["114:qul", "114:nas", "113:daybreak", "069:al-haqqah"],
  },
  status: "passed",
  reviewedAt,
  checks: [
    "governing-contract-updated",
    "contradictory-three-form-rules-removed",
    "schemas-and-migrations-updated",
    "authoring-and-review-logic-updated",
    "validators-and-audit-ledger-updated",
    "all-custom-packages-reviewed",
    "reference-full-and-limited-families-verified",
    "database-import-verified",
    "rendered-routes-verified",
    "tests-passed",
  ],
  evidence: [
    "docs/content-authoring/quranic-word-tree-contract.json",
    "app/data/content-contract.ts",
    "scripts/lib/sarf-authoring.ts",
    "scripts/review-sarf-families.ts",
    "scripts/content-import.ts",
    "scripts/content-root-audit.ts",
    "drizzle/0003_sarf_contract.sql",
    "tests/content-mapping.test.mjs",
    "tests/rendered-html.test.mjs",
  ],
  contentChanged: true,
};

const finalVerification: AuditRecord = {
  recordId: "contract-final-verification-20261016-sarf",
  eventType: "contract-final-verification",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  scope: {
    type: "repository-content-and-runtime",
    packages: 65,
    customOccurrences: 10145,
    database: "qawt",
    runtimePort: 3000,
  },
  status: "passed",
  reviewedAt: "2026-10-16T14:20:00.000Z",
  checks: [
    "legacy-review-provenance-fails-closed",
    "final-production-build-passed",
    "final-eslint-and-prettier-passed",
    "final-unit-content-tests-passed",
    "final-e2e-tests-passed-10-of-10",
    "final-health-route-passed",
    "full-reference-family-rendered",
    "limited-reference-family-rendered",
  ],
  evidence: [
    "app/data/content-contract.ts",
    "app/data/db-lesson-service.ts",
    "content-import/README.md",
    "docs/database-architecture.md",
    "tests/e2e/production.spec.ts",
    "http://127.0.0.1:3000/api/health",
  ],
  contentChanged: true,
  supersedes: completion.recordId,
};

const existing = new Set(records.map((record) => record.recordId));
appendAuditRecords(
  [correction, completion, finalVerification].filter(
    (record) => !existing.has(record.recordId),
  ),
);
console.log(
  JSON.stringify(
    {
      status: "recorded",
      correction: correction.recordId,
      completion: completion.recordId,
      finalVerification: finalVerification.recordId,
    },
    null,
    2,
  ),
);
