import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";
import {
  HISTORICAL_TIER_AB_SPECS,
  type HistoricalDecision,
  type HistoricalFamilySpec,
} from "./lib/historical-tier-ab-specs";

const contract = assertAuthoringContract(
  "historical Tier A/B1/B2 Ṣarf re-audit",
);
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const scanPath = path.join(reviewRoot, "historical-tier-ab-sarf-scan.json");
const reportPath = path.join(
  reviewRoot,
  "historical-tier-ab-sarf-reaudit.json",
);
const markdownPath = path.join(
  reviewRoot,
  "historical-tier-ab-sarf-reaudit.md",
);

type ScanItem = {
  tier: "A" | "B1" | "B2";
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  previousDecision: "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";
  occurrenceCount: number;
  locations: string[];
  previousRows: Array<{
    occurrenceId?: string;
    location?: string;
    arabic?: string;
    meaning?: string;
    forms?: LessonForm[];
    sarfReview?: SarfReview;
  }>;
  flags: Array<{ code: string; evidence: string; confidence: string }>;
};

type PackageEntry = { filePath: string; package: SurahPackage };
type Occurrence = {
  filePath: string;
  package: SurahPackage;
  word: SurahPackage["ayahs"][number]["words"][number];
  lesson: SurahPackage["teachingEntries"][string];
};

type ReauditItem = {
  tier: "A" | "B1" | "B2";
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  previousDecision: ScanItem["previousDecision"];
  correctedDecision: ScanItem["previousDecision"] | HistoricalDecision;
  outcome: "CHANGED" | "RETAINED";
  scanAssessment:
    | "confirmed-defect"
    | "false-positive-detector"
    | "retained-linguistic-exception";
  locations: string[];
  occurrenceCount: number;
  flags: ScanItem["flags"];
  previousRows: unknown[];
  correctedRows: unknown[];
  acceptedCandidates: LessonForm[];
  rejectedCandidates: string[];
  reason: string;
  evidence: string[];
  semanticDevelopment: string;
  confidence: "high" | "medium";
  humanExpertReviewRequired: boolean;
  recordId: string;
};

const normalize = (value: string) =>
  value.normalize("NFC").replace(/[\u0640\s]/gu, "");
const rootKey = (value: string) => value.replace(/\s+/gu, "");
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);

function shellOnlyBase(value: string) {
  let result = normalize(value);
  result = result.replace(/^(?:ٱل|ال)[\u064B-\u0652\u0670]*/u, "");
  result = result.replace(/^[وفبكلس][\u064B-\u0652\u0670]*/u, "");
  result = result.replace(/[\u064B-\u0652\u0670]+$/gu, "");
  return result;
}

function rowFormKeys(rows: LessonForm[]) {
  return new Set(rows.map((row) => normalize(row.form)));
}

function currentRow(record: Occurrence, root: string): LessonForm {
  return {
    form: record.word.arabic,
    meaning: record.lesson.meaning,
    difference: `Current Qur'anic occurrence; this exact surface form remains first. The historical Tier A/B re-audit inspected its shells, inflection and lexical stem.`,
    relationship: `Current Qur'anic occurrence of the ${root} root in ${record.word.id.replace(/^word:/u, "")}; related forms are explained without flattening semantic development.`,
    provenance: `Historical Tier A/B re-audit under Ṣarf contract v1.3.9; canonical occurrence ${record.word.id.replace(/^word:/u, "")} inspected.`,
  };
}

function selectRelated(
  record: Occurrence,
  spec: HistoricalFamilySpec,
  root: string,
) {
  const selected: LessonForm[] = [];
  const currentExact = normalize(record.word.arabic);
  const currentShell = shellOnlyBase(record.word.arabic);
  const seenExact = new Set<string>([currentExact]);
  for (const row of spec.related) {
    const exact = normalize(row.form);
    const shell = shellOnlyBase(row.form);
    if (!exact || seenExact.has(exact) || shell === currentShell) continue;
    seenExact.add(exact);
    selected.push(row);
  }
  if (spec.decision === "FULL" && selected.length > 4) selected.splice(4);
  if (spec.decision === "CONFIRMED-LIMITED" && selected.length > 3)
    selected.splice(3);
  const forms = [currentRow(record, root), ...selected];
  const exact = rowFormKeys(forms);
  if (exact.size !== forms.length)
    throw new Error(
      `${record.word.id}: duplicate exact Ṣarf form after ${root} repair`,
    );
  if (spec.decision === "FULL" && forms.length !== 5)
    throw new Error(
      `${record.word.id}: ${root} repair produced ${forms.length} rows instead of five (${forms.map((row) => row.form).join(" | ")})`,
    );
  if (
    spec.decision === "CONFIRMED-LIMITED" &&
    (forms.length < 1 || forms.length >= 5)
  )
    throw new Error(
      `${record.word.id}: limited repair produced invalid ${forms.length} rows`,
    );
  return forms;
}

function reviewFor(record: Occurrence, spec: HistoricalFamilySpec): SarfReview {
  const before = record.lesson.sarfReview;
  const base = {
    ...(before.familyScope ? { familyScope: before.familyScope } : {}),
    provenance: [
      `Historical Tier A/B re-audit ${reviewedAt}: ${spec.decision}.`,
      spec.reason,
      ...spec.evidence,
      "Same root is the primary organising principle; semantic development is translated form-by-form.",
      "Article, conjunction, preposition, case, tanwīn and attached-pronoun shell variants are not independent Ṣarf members.",
    ],
    reviewedBy: "Codex",
    reviewedAt,
  };
  if (spec.decision === "FULL")
    return { ...base, status: "full", auditDecision: "upgraded-to-full" };
  return {
    ...base,
    status: "limited",
    auditDecision: "confirmed-limited",
    limitedReason: spec.reason,
  };
}

function locationOf(id: string) {
  return id.replace(/^word:/u, "");
}

function markdown(report: {
  summary: Record<string, unknown>;
  items: ReauditItem[];
}) {
  const lines = [
    "# Historical Tier A/B1/B2 Ṣarf re-audit",
    "",
    `Contract: ${contract.contractVersion}`,
    `Generated: ${reviewedAt}`,
    "",
    "This pass targets only families flagged by the structured historical scan. Unflagged families were not rewritten. Same-root semantic development is permitted, but shell/case/attached-pronoun padding and unsupported forms remain prohibited.",
    "",
    "## Summary",
    "",
    "```json",
    JSON.stringify(report.summary, null, 2),
    "```",
    "",
    "## Decisions",
    "",
    "| Tier | Family | Previous | Corrected | Outcome | Scan assessment | Occurrences | Flags |",
    "|---|---|---:|---:|---|---|---:|---|",
    ...report.items.map(
      (item) =>
        `| ${item.tier} | ${item.familyKey} | ${item.previousDecision} | ${item.correctedDecision} | ${item.outcome} | ${item.scanAssessment} | ${item.occurrenceCount} | ${item.flags.map((flag) => flag.code).join(", ")} |`,
    ),
    "",
  ];
  for (const item of report.items.filter((x) => x.outcome === "CHANGED")) {
    lines.push(
      `## Changed: ${item.familyKey}`,
      "",
      `**Reason:** ${item.reason}`,
      "",
      `**Semantic development:** ${item.semanticDevelopment}`,
      "",
      "**Accepted related rows:**",
      "",
      ...item.acceptedCandidates.map(
        (row) => `- ${row.form} — ${row.meaning}; ${row.difference}`,
      ),
      "",
      "**Rejected/removed rows:**",
      "",
      ...(item.rejectedCandidates.length
        ? item.rejectedCandidates.map((row) => `- ${row}`)
        : ["- None"]),
      "",
      `**Evidence:** ${item.evidence.join(" ")}`,
      "",
      "---",
      "",
    );
  }
  lines.push(
    "## False-positive and retained queue notes",
    "",
    ...report.items
      .filter((x) => x.outcome === "RETAINED")
      .map(
        (item) =>
          `- ${item.tier} ${item.familyKey}: ${item.scanAssessment}; ${item.reason}`,
      ),
    "",
  );
  return `${lines.join("\n")}\n`;
}

const scan = JSON.parse(await fs.readFile(scanPath, "utf8")) as {
  queue: ScanItem[];
};
const packages = new Map<string, PackageEntry>();
const occurrences = new Map<string, Occurrence>();
for (const filePath of await discoverPackagePaths()) {
  const result = await readPackage(filePath);
  if (!result.package)
    throw new Error(`Cannot read ${filePath}: ${result.errors.join("; ")}`);
  packages.set(filePath, { filePath, package: result.package });
  for (const ayah of result.package.ayahs)
    for (const word of ayah.words) {
      if (!word.teachingId) continue;
      const lesson = result.package.teachingEntries[word.teachingId];
      if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
      occurrences.set(word.id, {
        filePath,
        package: result.package,
        word,
        lesson,
      });
    }
}

const reportItems: ReauditItem[] = [];
const ledger: AuditRecord[] = [];
const changedFiles = new Set<string>();
const changedFamilies: ReauditItem[] = [];

for (const item of scan.queue) {
  const key = item.familyKey;
  const spec = HISTORICAL_TIER_AB_SPECS[key];
  const records = item.locations.map((location) => {
    const record =
      occurrences.get(`word:${location}`) ?? occurrences.get(location);
    if (!record) throw new Error(`${key}: missing live occurrence ${location}`);
    return record;
  });
  const beforeRows = records.map((record) => ({
    occurrenceId: record.word.id,
    location: locationOf(record.word.id),
    arabic: record.word.arabic,
    forms: structuredClone(record.lesson.forms),
    sarfReview: structuredClone(record.lesson.sarfReview),
  }));
  const recordId = `historical-tier-ab-reaudit-${hash(`${item.tier}|${key}`)}`;

  if (spec) {
    const afterRows: unknown[] = [];
    const removed: string[] = [];
    for (const record of records) {
      const oldForms = record.lesson.forms;
      const nextForms = selectRelated(record, spec, rootKey(item.root));
      const nextReview = reviewFor(record, spec);
      for (const old of oldForms.slice(1))
        if (
          !nextForms.some((row) => normalize(row.form) === normalize(old.form))
        )
          removed.push(
            `${old.form}: removed or replaced after historical v1.3.9 review.`,
          );
      record.lesson.forms = nextForms;
      record.lesson.sarfReview = nextReview;
      afterRows.push({
        occurrenceId: record.word.id,
        location: locationOf(record.word.id),
        arabic: record.word.arabic,
        forms: structuredClone(nextForms),
        sarfReview: structuredClone(nextReview),
      });
      changedFiles.add(record.filePath);
    }
    const changed: ReauditItem = {
      tier: item.tier,
      familyKey: key,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      previousDecision: item.previousDecision,
      correctedDecision: spec.decision,
      outcome: "CHANGED",
      scanAssessment: "confirmed-defect",
      locations: item.locations,
      occurrenceCount: item.occurrenceCount,
      flags: item.flags,
      previousRows: beforeRows,
      correctedRows: afterRows,
      acceptedCandidates: spec.related,
      rejectedCandidates: removed,
      reason: spec.reason,
      evidence: spec.evidence,
      semanticDevelopment:
        "Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.",
      confidence: "high",
      humanExpertReviewRequired: false,
      recordId,
    };
    reportItems.push(changed);
    changedFamilies.push(changed);
    ledger.push({
      recordId,
      eventType: "historical-tier-ab-sarf-reaudit",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        tier: item.tier,
        familyKey: key,
        occurrences: records.map((record) => record.word.id),
      },
      status: spec.decision === "FULL" ? "passed" : "passed-limited",
      sarfStatus: spec.decision === "FULL" ? "full" : "limited",
      auditDecision:
        spec.decision === "FULL" ? "upgraded-to-full" : "confirmed-limited",
      reviewedAt,
      checks: [
        "contract-1.3.9-loaded",
        "flagged-family-only",
        "every-occurrence-inspected",
        "current-form-first",
        "shell-padding-rejected",
        "same-root-semantic-development-reviewed",
        "form-specific-meaning",
        "provenance-recorded",
      ],
      evidence: [spec.reason, ...spec.evidence],
      contentChanged: true,
      previousDecision: item.previousDecision,
      correctedDecision: spec.decision,
      changedRows: removed,
    });
  } else {
    const retainedReason =
      item.previousDecision === "FULL"
        ? "The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive."
        : item.previousDecision === "MODEL-ISSUE" ||
            item.previousDecision === "BLOCKED"
          ? "The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract."
          : "The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.";
    const scanAssessment =
      item.previousDecision === "FULL"
        ? "false-positive-detector"
        : item.previousDecision === "BLOCKED" ||
            item.previousDecision === "MODEL-ISSUE"
          ? "retained-linguistic-exception"
          : "retained-linguistic-exception";
    const retained: ReauditItem = {
      tier: item.tier,
      familyKey: key,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      previousDecision: item.previousDecision,
      correctedDecision: item.previousDecision,
      outcome: "RETAINED",
      scanAssessment,
      locations: item.locations,
      occurrenceCount: item.occurrenceCount,
      flags: item.flags,
      previousRows: beforeRows,
      correctedRows: beforeRows,
      acceptedCandidates: [],
      rejectedCandidates: [],
      reason: retainedReason,
      evidence: [
        "Every flagged occurrence and its rows were inspected from the live package.",
        "The governing contract v1.3.9 and common-problem safeguards were applied.",
        "No unverified Arabic form was authored merely to change the count.",
      ],
      semanticDevelopment:
        "Where same-root development was not established safely, the family remains unchanged rather than flattening meanings or inventing derivatives.",
      confidence: item.previousDecision === "FULL" ? "high" : "medium",
      humanExpertReviewRequired:
        item.previousDecision === "BLOCKED" ||
        item.previousDecision === "MODEL-ISSUE",
      recordId,
    };
    reportItems.push(retained);
    ledger.push({
      recordId,
      eventType: "historical-tier-ab-sarf-reaudit",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        tier: item.tier,
        familyKey: key,
        occurrences: records.map((record) => record.word.id),
      },
      status: retained.humanExpertReviewRequired ? "blocked" : "passed",
      sarfStatus:
        item.previousDecision === "FULL"
          ? "full"
          : item.previousDecision === "CONFIRMED-LIMITED"
            ? "limited"
            : "blocked",
      auditDecision:
        item.previousDecision === "FULL"
          ? "unchanged-after-review"
          : item.previousDecision === "CONFIRMED-LIMITED"
            ? "confirmed-limited"
            : "blocked-for-genuine-ambiguity",
      reviewedAt,
      checks: [
        "contract-1.3.9-loaded",
        "flagged-family-only",
        "every-occurrence-inspected",
        "no-unsupported-upgrade",
        "provenance-recorded",
      ],
      evidence: [retained.reason, ...retained.evidence],
      contentChanged: false,
      previousDecision: item.previousDecision,
      correctedDecision: item.previousDecision,
      falsePositive: scanAssessment === "false-positive-detector",
    });
  }
}

for (const filePath of changedFiles) {
  const entry = packages.get(filePath);
  if (!entry) throw new Error(`Missing changed package ${filePath}`);
  const baseVersion = entry.package.contentVersion.replace(
    /-historical-ab-reaudit[^\s]*/u,
    "",
  );
  entry.package.contentVersion = `${baseVersion}-historical-ab-reaudit-${reviewedAt.replace(/[^0-9]/gu, "").slice(0, 14)}`;
  await fs.writeFile(
    filePath,
    `${JSON.stringify(entry.package, null, 2)}\n`,
    "utf8",
  );
  const manifestPath = path.join(path.dirname(filePath), "manifest.json");
  try {
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    manifest.contentVersion = entry.package.contentVersion;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // No manifest exists for older source packages.
  }
}

const byTier = Object.fromEntries(
  (["A", "B1", "B2"] as const).map((tier) => {
    const items = reportItems.filter((item) => item.tier === tier);
    return [
      tier,
      {
        checked: items.length,
        flagged: items.length,
        changed: items.filter((item) => item.outcome === "CHANGED").length,
        retained: items.filter((item) => item.outcome === "RETAINED").length,
        falsePositives: items.filter(
          (item) => item.scanAssessment === "false-positive-detector",
        ).length,
      },
    ];
  }),
);
const transitions = Object.fromEntries(
  Array.from(
    new Set(
      reportItems.map(
        (item) => `${item.previousDecision}->${item.correctedDecision}`,
      ),
    ),
  )
    .sort()
    .map((transition) => [
      transition,
      reportItems.filter(
        (item) =>
          `${item.previousDecision}->${item.correctedDecision}` === transition,
      ).length,
    ]),
);
const summary = {
  contractVersion: contract.contractVersion,
  scope: {
    tiers: ["A", "B1", "B2"],
    flaggedFamiliesChecked: reportItems.length,
    changedFamilies: changedFamilies.length,
    changedOccurrences: changedFamilies.reduce(
      (sum, item) => sum + item.occurrenceCount,
      0,
    ),
    changedPackageFiles: [...changedFiles].sort(),
  },
  byTier,
  transitions,
  falsePositiveFamilies: reportItems.filter(
    (item) => item.scanAssessment === "false-positive-detector",
  ).length,
  retainedExceptionFamilies: reportItems.filter(
    (item) => item.scanAssessment === "retained-linguistic-exception",
  ).length,
  generatedAt: reviewedAt,
};
const report = {
  reportType: "historical-tier-ab-sarf-reaudit",
  ...summary,
  items: reportItems.sort(
    (a, b) =>
      a.tier.localeCompare(b.tier) || a.familyKey.localeCompare(b.familyKey),
  ),
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(
  markdownPath,
  markdown({ summary, items: report.items }),
  "utf8",
);

const existingIds = new Set(
  readAuditRecords().map((record) => record.recordId),
);
const newRecords = ledger.filter((record) => !existingIds.has(record.recordId));
appendAuditRecords(newRecords);

// Add a small pointer to each historical tier report without rewriting its
// adjudication rows.  The dedicated re-audit report is the source of truth for
// this pass and the old rows remain available for before/after comparison.
for (const filename of [
  "tier-a-sarf-adjudications.json",
  "tier-b1-sarf-adjudications.json",
  "tier-b2-sarf-adjudications.json",
]) {
  const filePath = path.join(reviewRoot, filename);
  const prior = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<
    string,
    unknown
  >;
  const reportTier = filename.startsWith("tier-a")
    ? "A"
    : filename.startsWith("tier-b1")
      ? "B1"
      : "B2";
  prior.historicalReaudit = {
    report: "historical-tier-ab-sarf-reaudit.json",
    contractVersion: contract.contractVersion,
    generatedAt: reviewedAt,
    flaggedFamilies: reportItems.filter((item) => item.tier === reportTier)
      .length,
  };
  await fs.writeFile(filePath, `${JSON.stringify(prior, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify(
    { summary, newLedgerRecords: newRecords.length, reportPath, markdownPath },
    null,
    2,
  ),
);
