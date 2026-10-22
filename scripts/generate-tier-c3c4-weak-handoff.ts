import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const reviewRoot = path.join(root, "artifacts", "content-review");
const sourcePath = path.join(reviewRoot, "tier-c3-low-classification.json");
const jsonPath = path.join(reviewRoot, "tier-c3c4-weak-queue-handoff.json");
const markdownPath = path.join(reviewRoot, "tier-c3c4-weak-queue-handoff.md");

type Family = {
  familyKey: string;
  quranicWord: string;
  root: string;
  lemma: string;
  locations: string[];
  occurrenceCount: number;
  primaryTrack?: string;
  c3C1?: unknown;
  c3C2?: unknown;
  c3C3?: unknown;
  secondaryMorphologyFlags?: string[];
  rootConfidence?: string;
  lemmaConfidence?: string;
  semanticRisk?: string;
  predictedResolvability?: string;
  originalLowReason?: unknown;
  morphologyType?: unknown;
  [key: string]: unknown;
};

const report = JSON.parse(await fs.readFile(sourcePath, "utf8")) as {
  families: Family[];
};
const queue = report.families
  .filter(
    (family) =>
      family.primaryTrack === "WEAK" &&
      !family.c3C1 &&
      !family.c3C2 &&
      !family.c3C3,
  )
  .sort((left, right) =>
    `${left.overallRank ?? 9999}:${left.familyKey}`.localeCompare(
      `${right.overallRank ?? 9999}:${right.familyKey}`,
    ),
  );
const occurrences = queue.reduce((sum, family) => sum + family.locations.length, 0);
if (queue.length !== 77 || occurrences !== 94)
  throw new Error(`WEAK handoff mismatch: ${queue.length} families / ${occurrences} occurrences`);

const output = {
  reportType: "tier-c3c4-weak-queue-handoff",
  status: "not-started",
  source: "tier-c3-low-classification.json after C3-C3 quadriliteral completion",
  scope: { families: queue.length, occurrences },
  rule: "This is classification only. No weak-root rows were changed or adjudicated.",
  proposedSubtracks: [
    "weak-final / maqsurah and alif-maqsurah",
    "weak-middle / hollow roots",
    "weak-initial / assimilated roots",
    "weak-plus-hamzated or weak-plus-doubled mixed cases",
    "weak lexical nouns/adjectives with narrow families",
    "weak root/lemma normalization and special cases",
  ],
  families: queue.map((family) => ({
    familyKey: family.familyKey,
    quranicWord: family.quranicWord,
    root: family.root,
    lemma: family.lemma,
    locations: family.locations,
    occurrenceCount: family.occurrenceCount,
    primaryTrack: family.primaryTrack,
    secondaryMorphologyFlags: family.secondaryMorphologyFlags ?? [],
    rootConfidence: family.rootConfidence ?? null,
    lemmaConfidence: family.lemmaConfidence ?? null,
    morphologyType: family.morphologyType ?? null,
    semanticRisk: family.semanticRisk ?? null,
    predictedResolvability: family.predictedResolvability ?? null,
    originalLowReason: family.originalLowReason ?? null,
  })),
};
await fs.writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
const lines = [
  "# C3-C4 weak-root queue handoff",
  "",
  "Status: **not started**. This artifact classifies the queue only; no weak-root Ṣarf rows were changed.",
  "",
  `Scope: **${queue.length} families / ${occurrences} occurrences**.`,
  "",
  "Recommended subdivisions:",
  "",
  ...output.proposedSubtracks.map((item) => `- ${item}`),
  "",
  "| # | Qur’anic word | Root | Lemma | Location(s) | Occ. | Risk | Predicted resolvability |",
  "|---:|---|---|---|---|---:|---|---|",
  ...output.families.map(
    (family, index) =>
      `| ${index + 1} | ${family.quranicWord} | ${family.root} | ${family.lemma} | ${family.locations.join(", ")} | ${family.occurrenceCount} | ${family.semanticRisk ?? "—"} | ${family.predictedResolvability ?? "—"} |`,
  ),
  "",
];
await fs.writeFile(markdownPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ jsonPath, markdownPath, families: queue.length, occurrences }, null, 2));
