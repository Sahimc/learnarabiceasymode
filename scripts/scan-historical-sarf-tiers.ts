import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";

type Tier = "A" | "B1" | "B2";
type Decision = "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";

type Row = {
  form?: string;
  meaning?: string;
  difference?: string;
  relationship?: string;
  provenance?: string;
};

type OccurrenceRows = {
  occurrenceId?: string;
  location?: string;
  arabic?: string;
  meaning?: string;
  forms?: Row[];
};

type HistoricalAdjudication = {
  familyKey?: string;
  root?: string;
  lemmaOrCurrentForm?: string;
  category?: string;
  decision?: Decision;
  reasoning?: string;
  authoritativeEvidence?: string[];
  evidence?: string[];
  rejectedAlternatives?: string[];
  rejectedCandidates?: string[];
  candidates?: Row[];
  candidatesConsidered?: Row[];
  currentRows?: OccurrenceRows[];
  finalRows?: OccurrenceRows[];
  proposedFinalRows?: OccurrenceRows[];
  occurrences?: Array<{
    occurrenceId?: string;
    location?: string;
    arabic?: string;
    meaning?: string;
    formCount?: number;
  }>;
};

type HistoricalReport = {
  adjudications?: HistoricalAdjudication[];
};

type Flag = {
  code: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  confidence: "high" | "medium" | "low";
};

type QueueItem = {
  tier: Tier;
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  previousDecision: Decision;
  occurrenceCount: number;
  locations: string[];
  previousRows: OccurrenceRows[];
  flags: Flag[];
  falsePositiveRisk: string;
  reviewRequired: string;
};

const root = path.resolve(process.cwd());
const contract = assertAuthoringContract("historical Tier A/B1/B2 Ṣarf scan");
const reviewRoot = path.join(root, "artifacts", "content-review");
const reportPaths: Array<[Tier, string]> = [
  ["A", "tier-a-sarf-adjudications.json"],
  ["B1", "tier-b1-sarf-adjudications.json"],
  ["B2", "tier-b2-sarf-adjudications.json"],
];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripDiacritics(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
    .replace(/[\u0640\s]/gu, "");
}

function rootLetters(value: string): string {
  return stripDiacritics(value).replace(
    /[^\u0621-\u063A\u0641-\u064A\u0671]/gu,
    "",
  );
}

function outerShellBase(value: string): string {
  let result = value.normalize("NFC").replace(/[\u0640\s]/gu, "");
  result = result.replace(/^(?:ٱل|ال)[\u064B-\u0652\u0670]*/u, "");
  result = result.replace(/^[وفبكلس][\u064B-\u0652\u0670]*/u, "");
  result = result.replace(
    /[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0670]+$/u,
    "",
  );
  result = result.replace(/(?:هما|كما|كم|كن|هم|هن|نا|ها|ه|ك|ي)$/u, "");
  return result;
}

function normalizeRows(rows: OccurrenceRows[]): Row[] {
  return rows.flatMap((occurrence) =>
    Array.isArray(occurrence.forms) ? occurrence.forms : [],
  );
}

function allEvidence(item: HistoricalAdjudication): string {
  return [
    item.reasoning,
    ...(item.authoritativeEvidence ?? []),
    ...(item.evidence ?? []),
    ...(item.rejectedAlternatives ?? []),
    ...(item.rejectedCandidates ?? []),
    ...(item.candidates ?? []).flatMap((candidate) => [
      candidate.form,
      candidate.meaning,
      candidate.difference,
      candidate.relationship,
      candidate.provenance,
    ]),
    ...(item.candidatesConsidered ?? []).flatMap((candidate) => [
      candidate.form,
      candidate.meaning,
      candidate.difference,
      candidate.relationship,
      candidate.provenance,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function currentRows(item: HistoricalAdjudication): OccurrenceRows[] {
  return Array.isArray(item.finalRows) && item.finalRows.length > 0
    ? item.finalRows
    : Array.isArray(item.proposedFinalRows) && item.proposedFinalRows.length > 0
      ? item.proposedFinalRows
      : (item.currentRows ?? []);
}

function addFlag(flags: Flag[], flag: Flag): void {
  if (!flags.some((existing) => existing.code === flag.code)) flags.push(flag);
}

function scanFamily(
  tier: Tier,
  item: HistoricalAdjudication,
): QueueItem | null {
  const decision = item.decision;
  if (!decision) return null;
  const rowsByOccurrence = currentRows(item);
  const rows = normalizeRows(rowsByOccurrence);
  const flags: Flag[] = [];
  const evidenceText = allEvidence(item);
  const rootValue = text(item.root);
  const category = text(item.category).toLowerCase();
  const lexical =
    Boolean(rootValue) &&
    !/(particle|preposition|pronoun|connector|conjunction|article|adverb|proper)/u.test(
      category,
    );

  const duplicateOccurrence = rowsByOccurrence.find((occurrence) => {
    const bases = (occurrence.forms ?? [])
      .map((row) => outerShellBase(text(row.form)))
      .filter(Boolean);
    const baseCounts = new Map<string, number>();
    for (const base of bases)
      baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
    return Array.from(baseCounts.values()).some((count) => count > 1);
  });
  if (duplicateOccurrence) {
    addFlag(flags, {
      code: "duplicate-after-shell-case-normalization",
      severity: "high",
      evidence: `At least two historical rows for ${text(duplicateOccurrence.occurrenceId)} collapse to the same lexical surface after removing outer clitics, article/shell material and inflectional endings.`,
      confidence: "high",
    });
  }

  for (const occurrence of rowsByOccurrence) {
    const current = text(occurrence.arabic);
    const related = (occurrence.forms ?? []).slice(1);
    const shellOnly = related.filter(
      (row) => outerShellBase(text(row.form)) === outerShellBase(current),
    );
    if (shellOnly.length > 0) {
      addFlag(flags, {
        code: "current-form-shell-or-inflection-padding",
        severity: "high",
        evidence: `Historical related rows overlap ${current} after shell/inflection normalization (${shellOnly
          .map((row) => text(row.form))
          .filter(Boolean)
          .join(", ")}).`,
        confidence: "medium",
      });
    }
  }

  if (
    rows.some((row) => {
      const form = text(row.form);
      return (
        rootLetters(form) === rootLetters(rootValue) &&
        rootLetters(rootValue).length >= 3 &&
        !/[\u064B-\u0652\u0670\u0651\u0653\u0654\u06D6-\u06ED]/u.test(form)
      );
    })
  ) {
    addFlag(flags, {
      code: "bare-root-row",
      severity: "high",
      evidence:
        "A historical Ṣarf row appears to be bare root radicals rather than an inflected or derived lexical form.",
      confidence: "high",
    });
  }

  const missingVocalisation = rows.filter((row) => {
    const form = text(row.form);
    return (
      form &&
      /[\u0621-\u064A]/u.test(form) &&
      !/[\u064B-\u0652\u0670\u0651\u0653\u0654\u06D6-\u06ED]/u.test(form)
    );
  });
  if (missingVocalisation.length > 0 && rows.length >= 3) {
    addFlag(flags, {
      code: "insufficient-vocalisation",
      severity: "medium",
      evidence: `One or more historical rows lack lexical vocalisation (${missingVocalisation.map((row) => text(row.form)).join(", ")}).`,
      confidence: "medium",
    });
  }

  if (
    /(different meaning|semantic branch|semantic split|same root|shared root|meaning differs|unrelated sense|different sense|root relationship)/u.test(
      evidenceText,
    ) &&
    ["CONFIRMED-LIMITED", "BLOCKED", "MODEL-ISSUE"].includes(decision)
  ) {
    addFlag(flags, {
      code: "semantic-branch-rejected-or-unresolved",
      severity: "high",
      evidence:
        "A non-full historical decision discusses semantic divergence or same-root relationships; verify that useful same-root development was not rejected solely because English meanings differ.",
      confidence: "medium",
    });
  }

  if (
    lexical &&
    ["CONFIRMED-LIMITED", "BLOCKED"].includes(decision) &&
    rows.length < 5
  ) {
    const noAccepted =
      (item.candidates ?? item.candidatesConsidered ?? []).length === 0;
    if (
      noAccepted ||
      /(not established|insufficient|no additional|restricted|narrow|could not|did not establish)/u.test(
        evidenceText,
      )
    ) {
      addFlag(flags, {
        code: "lexical-limited-or-blocked-needs-same-root-review",
        severity: "medium",
        evidence: `A lexical ${decision.toLowerCase()} family has ${rows.length} current row(s) and historical evidence indicating that additional forms were not established; test semantic development under contract 1.3.9.`,
        confidence: "low",
      });
    }
  }

  if (
    /(weak root|normalization|normalized root|weak-root|canonicalise|canonicalize|quadriliteral|root conflict|wrong root)/u.test(
      evidenceText,
    )
  ) {
    addFlag(flags, {
      code: "weak-root-or-root-normalization",
      severity: "medium",
      evidence: `The historical family uses a weak/root-sensitive analysis (${rootValue}); verify normalized root ownership and row relationships.`,
      confidence: "low",
    });
  }

  const provenanceMissing = rows.filter((row) => !text(row.provenance));
  if (provenanceMissing.length > 0) {
    addFlag(flags, {
      code: "row-provenance-missing",
      severity: "high",
      evidence: `${provenanceMissing.length} historical row(s) have no row-level provenance.`,
      confidence: "high",
    });
  }

  if (flags.length === 0) return null;
  const occurrenceLocations = (item.occurrences ?? rowsByOccurrence)
    .map(
      (occurrence) =>
        text(occurrence.location) || text(occurrence.occurrenceId),
    )
    .filter(Boolean);
  return {
    tier,
    familyKey: text(item.familyKey),
    root: rootValue,
    lemmaOrCurrentForm: text(item.lemmaOrCurrentForm),
    category: text(item.category),
    previousDecision: decision,
    occurrenceCount: occurrenceLocations.length,
    locations: Array.from(new Set(occurrenceLocations)),
    previousRows: rowsByOccurrence,
    flags,
    falsePositiveRisk:
      "Automated flags are review candidates, not decisions. Same-root semantic development and legitimate inflection can trigger a flag; only row-level linguistic review can confirm a defect.",
    reviewRequired:
      "Inspect every occurrence, row, root, vocalisation, meaning, relationship and provenance before changing content.",
  };
}

const queue: QueueItem[] = [];
const checked: Array<{
  tier: Tier;
  familyKey: string;
  decision: Decision;
  flagged: boolean;
}> = [];
for (const [tier, filename] of reportPaths) {
  const report = JSON.parse(
    await fs.readFile(path.join(reviewRoot, filename), "utf8"),
  ) as HistoricalReport;
  for (const item of report.adjudications ?? []) {
    const familyKey = text(item.familyKey);
    const decision = item.decision;
    if (!familyKey || !decision) continue;
    const result = scanFamily(tier, item);
    checked.push({ tier, familyKey, decision, flagged: Boolean(result) });
    if (result) queue.push(result);
  }
}

const byTier = Object.fromEntries(
  (
    [
      ["A", "A"],
      ["B1", "B1"],
      ["B2", "B2"],
    ] as const
  ).map(([key, value]) => {
    const rows = checked.filter((item) => item.tier === key);
    return [
      value,
      {
        checked: rows.length,
        flagged: rows.filter((item) => item.flagged).length,
      },
    ];
  }),
);
const flagCounts = Object.fromEntries(
  Array.from(
    new Set(queue.flatMap((item) => item.flags.map((flag) => flag.code))),
  )
    .sort()
    .map((code) => [
      code,
      queue.filter((item) => item.flags.some((flag) => flag.code === code))
        .length,
    ]),
);
const report = {
  reportType: "historical-sarf-tier-scan",
  contractVersion: contract.contractVersion,
  scope: { tiers: ["A", "B1", "B2"], familiesChecked: checked.length, byTier },
  summary: {
    flaggedFamilies: queue.length,
    flagCounts,
    falsePositivePolicy:
      "Every flag requires human-style Codex linguistic review; no automated flag changes content.",
  },
  queue: queue.sort(
    (left, right) =>
      left.tier.localeCompare(right.tier) ||
      left.familyKey.localeCompare(right.familyKey),
  ),
  checked,
  generatedAt: new Date().toISOString(),
};
const jsonPath = path.join(reviewRoot, "historical-tier-ab-sarf-scan.json");
const markdownPath = path.join(reviewRoot, "historical-tier-ab-sarf-scan.md");
await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const markdown = [
  "# Historical Tier A/B1/B2 Ṣarf scan",
  "",
  `Contract: ${contract.contractVersion}`,
  "",
  `Checked ${checked.length} historical families; flagged ${queue.length} for targeted linguistic review.`,
  "",
  "## Summary",
  "",
  "```json",
  JSON.stringify({ scope: report.scope, summary: report.summary }, null, 2),
  "```",
  "",
  "## Flagged queue",
  "",
  "| Tier | Family | Decision | Category | Locations | Flags |",
  "|---|---|---|---|---|---|",
  ...report.queue.map(
    (item) =>
      `| ${item.tier} | ${item.familyKey} | ${item.previousDecision} | ${item.category} | ${item.locations.join(", ")} | ${item.flags.map((flag) => flag.code).join(", ")} |`,
  ),
  "",
  "Automated flags are not adjudications. Unflagged families are unchanged by this scan.",
  "",
].join("\n");
await fs.writeFile(markdownPath, markdown, "utf8");
console.log(
  JSON.stringify(
    { ...report.scope, ...report.summary, jsonPath, markdownPath },
    null,
    2,
  ),
);
