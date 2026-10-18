import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.join(root, "artifacts", "content-review", "final-sarf-completion-audit.json");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const packagesRoot = path.join(root, "content-import", "surahs");

const wordsById = new Map();
const teachingById = new Map();
for (const dir of fs.readdirSync(packagesRoot)) {
  const file = path.join(packagesRoot, dir, "surah.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const ayah of pkg.ayahs ?? []) {
    for (const word of ayah.words ?? []) wordsById.set(word.id, word);
  }
  for (const [id, teaching] of Object.entries(pkg.teachingEntries ?? {})) {
    teachingById.set(id, teaching);
  }
}

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const unique = (values) => [...new Set(values.filter(Boolean))];

const rows = audit.blockedFamilyReviewRecords.map((record, index) => {
  const occurrences = record.quranicOccurrences.map((occurrence) => {
    const word = wordsById.get(occurrence.occurrenceId) ?? {};
    const teaching = teachingById.get(word.teachingId) ?? {};
    const forms = (teaching.forms ?? []).map((form, formIndex) =>
      `${formIndex + 1}. ${compact(form.form)} — ${compact(form.meaning)} [${compact(form.difference)}]`,
    );
    const display = [
      `${occurrence.surah}:${occurrence.ayah}:${occurrence.position}`,
      compact(word.arabic || occurrence.arabic),
      compact(teaching.meaning || occurrence.meaning),
      `status=${compact(teaching.sarfReview?.auditDecision || teaching.sarfReview?.status || occurrence.status)}`,
      `rows=${forms.length}`,
      forms.join(" | "),
    ].join(" — ");
    return { occurrence, teaching, display, forms };
  });
  const formCounts = unique(occurrences.map(({ forms }) => forms.length)).join(", ");
  const currentStatuses = unique(occurrences.map(({ teaching, occurrence }) => teaching.sarfReview?.auditDecision || teaching.sarfReview?.status || occurrence.status)).join(", ");
  const currentReason = unique(occurrences.map(({ teaching, occurrence }) => teaching.sarfReview?.limitedReason || occurrence.currentReason)).join(" | ");
  const evidence = (record.evidenceRequired ?? []).map(compact).join(" | ");
  const comment = `Blocked for genuine ambiguity: the current learner display contains ${formCounts || "an unknown number of"} Ṣarf row(s) across ${occurrences.length} occurrence(s), but the evidence does not safely establish the complete teaching family. Review the actual forms shown in the display column; do not add rows merely to reach five. Resolve to full only with authoritative morphology evidence, or record a specific reviewed-limited justification.`;
  return {
    number: index + 1,
    familyKey: record.familyKey,
    root: record.root,
    lemmaOrCurrentForm: record.lemmaOrCurrentForm,
    category: record.category,
    occurrenceCount: occurrences.length,
    surahNumbers: unique(occurrences.map(({ occurrence }) => occurrence.surah)).join("; "),
    ayahNumbers: unique(occurrences.map(({ occurrence }) => occurrence.ayah)).join("; "),
    wordPositions: unique(occurrences.map(({ occurrence }) => occurrence.position)).join("; "),
    locations: occurrences.map(({ occurrence }) => `${occurrence.surah}:${occurrence.ayah}:${occurrence.position}`).join("; "),
    occurrenceIds: occurrences.map(({ occurrence }) => occurrence.occurrenceId).join("; "),
    currentStatuses,
    currentFormCounts: formCounts,
    currentDisplay: occurrences.map(({ display }) => display).join(" || "),
    currentReason,
    codexComment: comment,
    whyAutomaticResolutionIsUnsafe: record.whyAutomaticResolutionIsUnsafe,
    evidenceRequired: evidence,
    reviewedAt: record.reviewedAt,
  };
});

const headers = [
  "No.",
  "Family key",
  "Root",
  "Lemma/current form",
  "Category",
  "Occurrences",
  "Sūrah number(s)",
  "Āyah number(s)",
  "Word position(s)",
  "Locations (sūrah:āyah:word)",
  "Occurrence IDs",
  "Current status",
  "Current form counts",
  "What it currently displays",
  "Current reason/status explanation",
  "Codex comment",
  "Why automatic resolution is unsafe",
  "Evidence required",
  "Reviewed at",
];

const csvRows = [headers, ...rows.map((row) => [
  row.number,
  row.familyKey,
  row.root,
  row.lemmaOrCurrentForm,
  row.category,
  row.occurrenceCount,
  row.surahNumbers,
  row.ayahNumbers,
  row.wordPositions,
  row.locations,
  row.occurrenceIds,
  row.currentStatuses,
  row.currentFormCounts,
  row.currentDisplay,
  row.currentReason,
  row.codexComment,
  row.whyAutomaticResolutionIsUnsafe,
  row.evidenceRequired,
  row.reviewedAt,
])].map((row) => row.map(csv).join(",")).join("\n") + "\n";

const markdownRows = rows.map((row) => [
  row.number,
  row.familyKey,
  row.root,
  row.lemmaOrCurrentForm,
  row.category,
  row.occurrenceCount,
  row.locations,
  row.currentStatuses,
  row.currentDisplay,
  row.codexComment,
].map((value) => compact(value).replaceAll("|", "\\|")).join(" | "));
const markdown = [
  "# Blocked Ṣarf families — team review table",
  "",
  `Generated from ${path.relative(root, auditPath)} on ${audit.generatedAt}.`,
  "",
  `Total distinct blocked families: **${rows.length}**. Each row is one family; the occurrence count and display column include every Qur’anic occurrence in that family. The display column reproduces the current lesson forms and meanings. The Codex comment is a review note, not a replacement for expert adjudication.`,
  "",
  `| No. | Family key | Root | Lemma/current form | Category | Occurrences | Locations (sūrah:āyah:word) | Status | What it currently displays | Codex comment |`,
  "|---:|---|---|---|---|---:|---|---|---|---|",
  ...markdownRows,
  "",
].join("\n");

const outputDir = path.join(root, "artifacts", "content-review");
fs.writeFileSync(path.join(outputDir, "blocked-sarf-team-review.csv"), csvRows, "utf8");
fs.writeFileSync(path.join(outputDir, "blocked-sarf-team-review.md"), markdown, "utf8");
console.log(JSON.stringify({ rows: rows.length, csv: "artifacts/content-review/blocked-sarf-team-review.csv", markdown: "artifacts/content-review/blocked-sarf-team-review.md" }, null, 2));
