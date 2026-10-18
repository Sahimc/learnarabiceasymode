import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.join(root, "artifacts", "content-review", "final-sarf-completion-audit.json");
const reconciliationPath = path.join(root, "artifacts", "content-review", "mixed-sarf-reconciliation.json");
const outputPath = path.join(root, "artifacts", "content-review", "blocked-sarf-review-queue-classified.json");

type JsonObject = Record<string, unknown>;
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as {
  generatedAt: string;
  totals: JsonObject;
  blockedFamilyReviewRecords: Array<JsonObject & {
    familyKey: string;
    familyScope?: string | null;
    category: string;
    quranicOccurrences: Array<JsonObject & { formCount: number; occurrenceId: string; surah: number; ayah: number; position: number }>;
  }>;
};
const reconciliation = JSON.parse(fs.readFileSync(reconciliationPath, "utf8")) as {
  plans: Array<{ familyKey: string; scope?: string; decision: string; reason: string }>;
};

const modelReviewKeys = new Map<string, string>();
for (const plan of reconciliation.plans) {
  if (!plan.decision.startsWith("retain-")) continue;
  const key = plan.scope ? `${plan.familyKey}|scope=${plan.scope}` : plan.familyKey;
  modelReviewKeys.set(key, plan.reason);
}

function tier(record: (typeof audit.blockedFamilyReviewRecords)[number]) {
  if (record.familyScope === "common-city") return "D";
  if (modelReviewKeys.has(record.familyKey)) return "D";
  const maxForms = Math.max(...record.quranicOccurrences.map((occurrence) => occurrence.formCount), 0);
  if (maxForms >= 4) return "A";
  if (maxForms >= 2) return "B";
  return "C";
}

const queue = audit.blockedFamilyReviewRecords.map((record) => {
  const maxForms = Math.max(...record.quranicOccurrences.map((occurrence) => occurrence.formCount), 0);
  const classification = tier(record);
  return {
    classification,
    familyKey: record.familyKey,
    familyScope: record.familyScope ?? null,
    root: record.root ?? null,
    lemmaOrCurrentForm: record.lemmaOrCurrentForm,
    category: record.category,
    occurrenceCount: record.quranicOccurrences.length,
    maxCurrentFormCount: maxForms,
    occurrences: record.quranicOccurrences.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      location: `${occurrence.surah}:${occurrence.ayah}:${occurrence.position}`,
      surah: occurrence.surah,
      ayah: occurrence.ayah,
      position: occurrence.position,
      arabic: occurrence.arabic,
      meaning: occurrence.meaning,
      formCount: occurrence.formCount,
      status: occurrence.status,
      currentReason: occurrence.currentReason,
    })),
    currentAnalysis: record.currentAnalysis,
    competingPossibleAnalyses: record.competingPossibleAnalyses,
    whyAutomaticResolutionIsUnsafe: record.whyAutomaticResolutionIsUnsafe,
    evidenceRequiredToResolve: record.evidenceRequiredToResolve,
    codexClassificationComment:
      classification === "A"
        ? "Near-complete blocked family: four reviewed-looking rows are present in at least one occurrence, but the rows still require a family-level linguistic decision before approval. Check for distinct senses, wrong-root rows and whether the fifth form is genuinely useful."
        : classification === "B"
          ? "Partial blocked family: two or three rows are present in the strongest occurrence. Investigate genuine related forms, but do not fill the remaining slots with case, clitic or provider padding."
          : classification === "C"
            ? "Sparse blocked family: only one row is present in the strongest occurrence. Authoring evidence is substantially incomplete; resolve from lexicons and Qur'anic morphology or keep blocked."
            : modelReviewKeys.get(record.familyKey) ?? "Special/model queue: resolve family identity, lexical sense or representation before selecting forms.",
  };
});

const summary = {
  A: queue.filter((item) => item.classification === "A").length,
  B: queue.filter((item) => item.classification === "B").length,
  C: queue.filter((item) => item.classification === "C").length,
  D: queue.filter((item) => item.classification === "D").length,
};
const output = {
  reportType: "blocked-sarf-review-queue-classified",
  generatedAt: new Date().toISOString(),
  sourceAudit: path.relative(root, auditPath),
  sourceReconciliation: path.relative(root, reconciliationPath),
  definition: {
    A: "Near-complete: at least four current rows in the strongest occurrence; still requires linguistic approval.",
    B: "Partial: two or three current rows in the strongest occurrence.",
    C: "Sparse: one current row in the strongest occurrence.",
    D: "Special/model issue: family identity or representation requires resolution before row selection.",
  },
  totals: {
    blockedFamilies: queue.length,
    blockedOccurrences: queue.reduce((sum, item) => sum + item.occurrenceCount, 0),
    classifications: summary,
  },
  queue,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...output.totals }, null, 2));
