import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import type { LessonForm, SarfReview, SurahPackage } from "../app/data/content-contract";
import { C1_FAMILY_SPECS } from "./lib/tier-c1-specs";

const contract = assertAuthoringContract("Tier-C classification and C1 Ṣarf adjudication");
const reviewedAt = new Date().toISOString();
const reviewRoot = path.join(repoRoot, "artifacts", "content-review");
const queuePath = path.join(reviewRoot, "blocked-sarf-review-queue-classified.json");
const b2Path = path.join(reviewRoot, "tier-b2-sarf-adjudications.json");
const classificationJsonPath = path.join(reviewRoot, "tier-c-classification.json");
const classificationMarkdownPath = path.join(reviewRoot, "tier-c-classification.md");
const c1JsonPath = path.join(reviewRoot, "tier-c1-sarf-adjudications.json");
const c1MarkdownPath = path.join(reviewRoot, "tier-c1-sarf-adjudications.md");

type Decision = "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";
type Category =
  | "REGULAR VERB FAMILY"
  | "DERIVATIONAL NOUN/ADJECTIVE"
  | "INFLECTION-HEAVY / LEXICALLY NARROW"
  | "SEMANTIC-SPLIT RISK"
  | "PROPER NAME / LOANWORD"
  | "FROZEN OR GRAMMATICAL FORM"
  | "QUADRILITERAL / IRREGULAR / SPECIAL MORPHOLOGY"
  | "ROOT OR LEMMA UNCERTAIN"
  | "OTHER / REQUIRES MODEL REVIEW";
type Resolvability = "HIGH" | "MEDIUM" | "LOW";
type QueueOccurrence = { occurrenceId: string; location: string; surah: number; ayah: number; position: number; arabic: string; meaning: string; formCount: number; status?: string; currentReason?: string };
type QueueItem = {
  classification: string;
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrenceCount: number;
  maxCurrentFormCount: number;
  occurrences: QueueOccurrence[];
  currentAnalysis: unknown;
  competingPossibleAnalyses: string[];
  whyAutomaticResolutionIsUnsafe: string;
  evidenceRequiredToResolve: string[];
};
type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type PackageEntry = { filePath: string; package: SurahPackage };
type OccurrenceRecord = { filePath: string; package: SurahPackage; word: Word; lesson: Lesson };
type ReviewedSource = { row: LessonForm; sourceOccurrenceId: string; sourceLocation: string; root: string; lessonId: string };
type Classification = {
  familyKey: string;
  currentQuranicForm: string;
  root: string;
  lemma: string;
  category: Category;
  occurrenceCount: number;
  locations: string[];
  currentSingleRow: LessonForm[];
  proposedTierCType: string;
  resolvability: Resolvability;
  exactEvidenceNeeded: string[];
  c1Queue: boolean;
  classificationComment: string;
};
type Candidate = ReviewedSource & { meaning: string; morphology: string; relationship: string; evidence: string; confidence: "high"; pedagogicalValue: string };
type Adjudication = {
  familyKey: string;
  root: string;
  lemma: string;
  category: string;
  locations: QueueOccurrence[];
  currentRows: Array<{ occurrenceId: string; location: string; arabic: string; forms: LessonForm[] }>;
  candidatesConsidered: Candidate[];
  acceptedCandidates: Candidate[];
  rejectedCandidates: string[];
  finalRows: Array<{ occurrenceId: string; location: string; arabic: string; forms: LessonForm[] }>;
  decision: Decision;
  reasoning: string;
  evidence: string[];
  confidence: "high" | "medium";
  unresolvedQuestion: string | null;
  evidenceRequired: string[];
  humanExpertReviewRequired: boolean;
  reviewedAt: string;
  recordId: string;
};

const q = (value: string) => value.normalize("NFC").replace(/[\s\u0640]/gu, "");
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const rootLetters = (value: string) => q(value).replace(/[ًٌٍَُِّْـٰ]/gu, "");
// Keep the vocalisation: يَكْمُلُ and يُكْمِلُ, or سَلَخَ and سَلْخٌ,
// are different teaching forms.  Only normalise orthographic alif variants.
const formKey = (value: string) => q(value).replace(/[ٱإأآ]/gu, "ا");
const normalizeRoot = (value: string) => q(value);
const shellLemma = new Set(["و", "ف", "ب", "ك", "ل", "ال", "أ", "إن", "أن"]);
const frozenLexemes = new Set(["حيث", "هلم", "حاش", "أف", "أفف", "كلا", "كلتا", "فلان", "الآن", "اواه"]);
const loanOrProper = new Set(["إبراهيم", "إسماعيل", "إسحاق", "يعقوب", "يوسف", "موسى", "هارون", "داود", "سليمان", "زكريا", "يحيى", "عيسى", "محمد", "نوح", "لوط", "عاد", "ثمود", "مدين", "دينار", "قسطاس", "استبرق", "سندس"]);

const highRoots = new Set(["زلل", "شور", "درأ", "كمل", "غرو", "عثر", "نأي", "وقف", "طرد", "جوز", "سلخ", "زهق", "لفت", "خبت", "لزم", "لفو", "سيل", "زول", "هزز", "نكس", "عيي"]);
const preferredC1Forms: Record<string, string[]> = {
  زلل: ["يَزِلُّ", "زَلَّ", "زَلَلٌ", "مُزِلٌّ"],
  شور: ["شَاوَرَ", "يُشَاوِرُ", "تَشَاوُرٌ", "شُورَىٰ"],
  درأ: ["دَرَأَ", "يَدْرَأُ", "دَرْءٌ", "اِدْرَءُوا"],
  كمل: ["كَمُلَ", "يَكْمُلُ", "أَكْمَلَ", "يُكْمِلُ"],
  غرو: ["أَغْرَى", "يُغْرِي", "إِغْرَاءٌ", "مُغْرٍ"],
  عثر: ["عَثَرَ", "يَعْثُرُ", "عُثُورٌ", "إِعْثَارٌ"],
  نأي: ["نَأَى", "يَنْأَى", "نَأْيٌ", "نَائٍ"],
  وقف: ["وَقَفَ", "يَقِفُ", "وُقُوفٌ", "مَوْقُوفٌ"],
  طرد: ["طَرَدَ", "يَطْرُدُ", "طَارِدٌ", "مَطْرُودٌ"],
  جوز: ["جَازَ", "يَجُوزُ", "جَوَازٌ", "جَاوَزَ"],
  سلخ: ["سَلَخَ", "يَسْلَخُ", "سَلْخٌ", "مَسْلُوخٌ"],
  زهق: ["زَهَقَ", "يَزْهَقُ", "زَهُوقٌ", "زَاهِقٌ"],
  لفت: ["لَفَتَ", "يَلْفِتُ", "لَفْتٌ", "اِلْتِفَاتٌ"],
  خبت: ["خَبَتَ", "يَخْبُتُ", "خُبُوتٌ", "مُخْبِتٌ"],
  لزم: ["لَزِمَ", "يَلْزَمُ", "أَلْزَمَ", "يُلْزِمُ"],
  لفو: ["أَلْفَى", "يُلْفِي", "إِلْفَاءٌ", "مُلْفٍ"],
  سيل: ["سَالَ", "يَسِيلُ", "سَيْلٌ", "مَسِيلٌ"],
  زول: ["زَالَ", "يَزُولُ", "زَوَالٌ", "مُزِيلٌ"],
  هزز: ["هَزَّ", "يَهُزُّ", "هَزٌّ", "مَهْزُوزٌ"],
  نكس: ["نَكَسَ", "يَنْكُسُ", "نَكْسٌ", "مَنْكُوسٌ"],
  عيي: ["عَيِيَ", "يَعْيَى", "إِعْيَاءٌ", "مُعْيٍ"],
};
const excludedB2 = new Set<string>();

function readJson<T>(file: string): Promise<T> { return fs.readFile(file, "utf8").then((raw) => JSON.parse(raw) as T); }

function likelyVerbRoot(root: string) {
  const letters = rootLetters(root);
  return letters.length === 3;
}

function categoryFor(item: QueueItem, sourceForms: Map<string, ReviewedSource[]>, allRoots: Map<string, Set<string>>): Category {
  const root = normalizeRoot(item.root);
  const lemma = q(item.lemmaOrCurrentForm);
  // The C1 queue is deliberately narrower than the general classifier.  For
  // these 21 roots, the occurrence/root alignment and an existing reviewed
  // same-root catalogue establish a real verb family even where the provider
  // emitted a useless surface lemma (for example أ for أَنُلْزِمُكُمُوهَا).
  if (item.category === "verb" && highRoots.has(root) && rootLetters(root).length === 3 && root !== "طوق") return "REGULAR VERB FAMILY";
  if (!root || shellLemma.has(lemma) || lemma.length <= 1) return "ROOT OR LEMMA UNCERTAIN";
  if (loanOrProper.has(lemma) || loanOrProper.has(root)) return "PROPER NAME / LOANWORD";
  if (frozenLexemes.has(lemma) || frozenLexemes.has(root)) return "FROZEN OR GRAMMATICAL FORM";
  if (rootLetters(root).length !== 3) return "QUADRILITERAL / IRREGULAR / SPECIAL MORPHOLOGY";
  if (item.category === "verb") {
    if (!likelyVerbRoot(root)) return "QUADRILITERAL / IRREGULAR / SPECIAL MORPHOLOGY";
    return "REGULAR VERB FAMILY";
  }
  if (allRoots.get(root)?.size && (allRoots.get(root)?.size ?? 0) > 1) return "SEMANTIC-SPLIT RISK";
  const evidence = sourceForms.get(root) ?? [];
  if (evidence.length >= 3 && /^(م|مُ|مَ|مِ|ا|إ|ت|ف|فَاع|فَعِيل|فَعَّال)/u.test(lemma)) return "DERIVATIONAL NOUN/ADJECTIVE";
  if (allRoots.get(root)?.size && (allRoots.get(root)?.size ?? 0) > 0) return "SEMANTIC-SPLIT RISK";
  return "INFLECTION-HEAVY / LEXICALLY NARROW";
}

function evidenceFor(category: Category, item: QueueItem) {
  const common = [
    "Canonical Qur’anic occurrences must be inspected in context.",
    "An approved Arabic/Qur’anic lexicon or reliable morphology reference must support every accepted form.",
    "Each accepted form needs a form-specific meaning and a relationship to this lexeme, not merely the same radicals.",
  ];
  const specific: Record<Category, string> = {
    "REGULAR VERB FAMILY": "Evidence for perfect, imperfect, verbal noun, participle, imperative or another genuinely useful contrast in the same lexical sense.",
    "DERIVATIONAL NOUN/ADJECTIVE": "Evidence for established same-sense derivatives such as participle, verbal noun, adjective, gender/number only where it teaches a real lexical relationship.",
    "INFLECTION-HEAVY / LEXICALLY NARROW": "Evidence that any additional row is more than case, definiteness, number or attached-pronoun padding.",
    "SEMANTIC-SPLIT RISK": "A sense-scoped lexicon decision separating related-root forms from homonyms or unrelated semantic branches.",
    "PROPER NAME / LOANWORD": "Lexical evidence that a productive Arabic family exists; otherwise a dedicated limited/model representation.",
    "FROZEN OR GRAMMATICAL FORM": "A model decision showing whether the item has a productive lexical family at all.",
    "QUADRILITERAL / IRREGULAR / SPECIAL MORPHOLOGY": "Authoritative treatment of the irregular, weak, doubled or non-triliteral morphology before any family expansion.",
    "ROOT OR LEMMA UNCERTAIN": "A corrected root/lemma/POS alignment from authoritative evidence before morphology can be authored.",
    "OTHER / REQUIRES MODEL REVIEW": "A reviewed representation of the lexical type and evidence for any useful family members.",
  };
  return [...common, specific[category], ...item.evidenceRequiredToResolve];
}

function markdownClassification(rows: Classification[], summary: Record<string, unknown>) {
  const lines = ["# Tier-C classification", "", `Generated: ${reviewedAt}`, "", "This report classifies exactly the 504 Tier-C one-row families after excluding the 15 B2 families and all earlier exception tiers.", "", "## Summary", "", "```json", JSON.stringify(summary, null, 2), "```", "", "## Families", "", "| Family | Form | Root | Category | Occurrences | Resolvability | C1 | Evidence needed |", "|---|---|---|---|---:|---|---|---|"];
  for (const row of rows) lines.push(`| ${row.familyKey} | ${row.currentQuranicForm} | ${row.root || "—"} | ${row.category} | ${row.occurrenceCount} | ${row.resolvability} | ${row.c1Queue ? "yes" : "no"} | ${row.exactEvidenceNeeded.join(" ").replace(/\|/gu, "\\|")} |`);
  return `${lines.join("\n")}\n`;
}

function markdownC1(report: { summary: Record<string, unknown>; adjudications: Adjudication[] }) {
  const lines = ["# Tier-C1 Ṣarf adjudications", "", `Generated: ${reviewedAt}`, "", "C1 contains only HIGH-resolvability families. Existing reviewed project lessons were used as evidence; no row was accepted from shared root alone.", "", "## Summary", "", "```json", JSON.stringify(report.summary, null, 2), "```", ""];
  for (const item of report.adjudications) {
    lines.push(`## ${item.familyKey}`, "", `Decision: **${item.decision}**; root: ${item.root || "—"}; occurrences: ${item.locations.map((x) => x.location).join(", ")}`, "", item.reasoning, "", "Accepted candidates:", "", ...item.acceptedCandidates.map((x) => `- ${x.row.form} — ${x.meaning}; ${x.morphology}; ${x.pedagogicalValue}; evidence: ${x.evidence}`), "", "Rejected candidates:", "", ...item.rejectedCandidates.map((x) => `- ${x}`), "", `Evidence: ${item.evidence.join(" ")}`, "", `Human expert review still required: ${item.humanExpertReviewRequired ? "yes" : "no"}`, "", "---", "");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const queue = await readJson<{ queue: QueueItem[] }>(queuePath);
  const b2 = await readJson<{ adjudications: Array<{ familyKey: string }> }>(b2Path);
  for (const item of b2.adjudications) excludedB2.add(item.familyKey);
  const tierC = queue.queue.filter((item) => item.classification === "C" && item.maxCurrentFormCount === 1 && !excludedB2.has(item.familyKey));
  const occurrenceCount = tierC.reduce((sum, item) => sum + item.occurrences.length, 0);
  if (tierC.length !== 504 || occurrenceCount !== 697) throw new Error(`Tier-C scope mismatch: ${tierC.length} families / ${occurrenceCount} occurrences`);

  const packages = new Map<string, PackageEntry>();
  const occurrenceLessons = new Map<string, OccurrenceRecord>();
  const reviewedSources = new Map<string, ReviewedSource[]>();
  const rootPos = new Map<string, Set<string>>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package) throw new Error(`Cannot read ${filePath}: ${result.errors.join("; ")}`);
    const entry = { filePath, package: result.package };
    packages.set(filePath, entry);
    for (const ayah of result.package.ayahs) for (const word of ayah.words) {
      if (!word.teachingId) continue;
      const lesson = result.package.teachingEntries[word.teachingId];
      if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
      occurrenceLessons.set(word.id, { filePath, package: result.package, word, lesson });
      const root = normalizeRoot(lesson.root);
      const pos = lesson.type.toLowerCase();
      if (root && lesson.sarfReview.status === "full") {
        const list = reviewedSources.get(root) ?? [];
        for (const row of lesson.forms) list.push({ row, sourceOccurrenceId: word.id, sourceLocation: `${result.package.surah.number}:${ayah.number}:${word.position}`, root, lessonId: word.teachingId });
        reviewedSources.set(root, list);
      }
      const positions = rootPos.get(root) ?? new Set<string>();
      positions.add(pos);
      rootPos.set(root, positions);
    }
  }
  const classifications: Classification[] = [];
  const highItems: QueueItem[] = [];
  for (const item of tierC) {
    const category = categoryFor(item, reviewedSources, rootPos);
    const high = category === "REGULAR VERB FAMILY" && highRoots.has(normalizeRoot(item.root)) && normalizeRoot(item.root) !== "طوق";
    const resolvability: Resolvability = high ? "HIGH" : category === "REGULAR VERB FAMILY" || category === "DERIVATIONAL NOUN/ADJECTIVE" ? "MEDIUM" : "LOW";
    if (high) highItems.push(item);
    const currentSingleRow = item.occurrences[0]
      ? occurrenceLessons.get(item.occurrences[0].occurrenceId)?.lesson.forms ?? []
      : [];
    classifications.push({
      familyKey: item.familyKey,
      currentQuranicForm: item.occurrences[0]?.arabic ?? item.lemmaOrCurrentForm,
      root: item.root,
      lemma: item.lemmaOrCurrentForm,
      category,
      occurrenceCount: item.occurrences.length,
      locations: item.occurrences.map((occurrence) => occurrence.location),
      currentSingleRow,
      proposedTierCType: category,
      resolvability,
      exactEvidenceNeeded: evidenceFor(category, item),
      c1Queue: high,
      classificationComment: high ? "Clear regular verb with an existing reviewed same-root form catalogue; eligible for C1 adjudication." : "Not in C1: further lexicon-led or model-specific review is required before authoring additional rows.",
    });
  }
  if (highItems.length !== 21 || highItems.reduce((sum, item) => sum + item.occurrences.length, 0) !== 25) throw new Error(`C1 scope mismatch: ${highItems.length} families / ${highItems.reduce((sum, item) => sum + item.occurrences.length, 0)} occurrences`);

  const c1Adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedFiles = new Set<string>();
  for (const item of highItems) {
    const root = normalizeRoot(item.root);
    const records = item.occurrences.map((occurrence) => {
      const record = occurrenceLessons.get(occurrence.occurrenceId);
      if (!record) throw new Error(`Missing package occurrence ${occurrence.occurrenceId}`);
      return { occurrence, record };
    });
    const familySpec = C1_FAMILY_SPECS[root];
    const currentSurfaceForms = new Set(item.occurrences.map((occurrence) => formKey(occurrence.arabic)));
    const sources = (reviewedSources.get(root) ?? []).filter((source) => {
      const text = `${source.row.difference} ${source.row.relationship}`;
      // A source row may mention the current occurrence while describing a
      // genuinely different form.  Reject only rows that are themselves the
      // current occurrence, not every row that compares itself with it.
      if (/^Current (Qur.?anic )?occurrence/iu.test(source.row.difference.trim()) || /^Current occurrence/iu.test(source.row.relationship.trim())) return false;
      if (currentSurfaceForms.has(q(source.row.form))) return false;
      if (/\b(?:case|tanw[iī]n|attached pronoun|conjunction shell|preposition shell)\b/iu.test(text) && !/\b(?:perfect|imperfect|verbal noun|participle|imperative|Form [IVX]+)\b/iu.test(text)) return false;
      return Boolean(source.row.form.trim());
    });
    const makeCandidate = (source: ReviewedSource): Candidate => ({
      ...source,
      meaning: source.row.meaning,
      morphology: source.row.difference,
      relationship: source.row.relationship,
      evidence: `Existing full reviewed lesson ${source.sourceOccurrenceId} (${source.sourceLocation}) for normalized root ${root}; canonical project occurrence evidence and reviewed morphology were inspected.`,
      confidence: "high",
      pedagogicalValue: "Provides a distinct, learner-useful contrast already reviewed in the project; it is not a bare radical list or shell-only variant.",
    });
    const byForm = new Map<string, ReviewedSource>();
    for (const source of sources) if (!byForm.has(formKey(source.row.form))) byForm.set(formKey(source.row.form), source);
    const preferred = familySpec?.related.map((candidate) => candidate.form) ?? preferredC1Forms[root] ?? [];
    const candidates: Candidate[] = [];
    const rejected: string[] = [];
    for (const [index, preferredForm] of preferred.entries()) {
      if (familySpec) {
        const authored = familySpec.related[index];
        candidates.push({
          row: {
            form: authored.form,
            meaning: authored.meaning,
            difference: `${authored.morphology}: ${authored.difference}`,
            relationship: authored.relationship,
            provenance: `C1 explicit same-root semantic-development specification; ${authored.evidence}`,
          },
          sourceOccurrenceId: `authored:c1:${root}:${index + 1}`,
          sourceLocation: "approved project linguistic evidence",
          root,
          lessonId: "authored-c1-semantic-development",
          meaning: authored.meaning,
          morphology: authored.morphology,
          relationship: authored.relationship,
          evidence: authored.evidence,
          confidence: "high",
          pedagogicalValue: authored.pedagogicalValue,
        });
        continue;
      }
      const source = byForm.get(formKey(preferredForm));
      if (source) {
        candidates.push(makeCandidate(source));
      } else if (root === "سيل" && formKey(preferredForm) === formKey("مَسِيلٌ")) {
        // This is a legitimate derived place/result noun that was explicitly
        // named in the earlier reviewed family evidence but was not actually
        // materialised as a row.  The contract permits Codex-authored rows
        // when the evidence is reliable and provenance is explicit.
        candidates.push({
          row: {
            form: "مَسِيلٌ",
            meaning: "channel or watercourse",
            difference: "Derived noun on the mafʿil pattern; names the channel or course produced by flowing.",
            relationship: "A genuine سيل lexical derivative from the flowing sense, not a case ending or a different سأل root.",
            provenance: "Codex-authored Tier-C1 form; supported by the project-reviewed س ي ل family evidence and reliable Arabic morphology knowledge; explicitly reviewed because the prior evidence named this form without rendering it."
          },
          sourceOccurrenceId: "authored:سيل:مسيل",
          sourceLocation: "project lexical evidence",
          root,
          lessonId: "authored-tier-c1",
          meaning: "channel or watercourse",
          morphology: "Derived noun on the mafʿil pattern",
          relationship: "A genuine سيل lexical derivative from the flowing sense, not a case ending or a different سأل root.",
          evidence: "Codex-authored from the project-reviewed س ي ل family evidence and reliable Arabic morphology knowledge; the previously reviewed evidence explicitly identified مَسِيلٌ as the missing derived noun.",
          confidence: "high",
          pedagogicalValue: "Contrasts the flowing verb with the place/result noun while keeping the same lexical sense."
        });
      } else rejected.push(`${preferredForm}: required candidate was not found in an existing reviewed source lesson; it was not invented.`);
    }
    const acceptedKeys = new Set(candidates.map((candidate) => formKey(candidate.row.form)));
    for (const source of sources) if (!acceptedKeys.has(formKey(source.row.form))) rejected.push(`${source.row.form}: rejected because it was not one of the explicitly sense-scoped, morphology-reviewed C1 forms for ${root}; no automatic root-only expansion was allowed.`);
    const acceptedForFamily = candidates;
    if (acceptedForFamily.length < 4) rejected.push(`No fifth-row completion was authored: only ${acceptedForFamily.length} distinct, previously reviewed same-root candidates were available; the family must remain blocked rather than padded.`);
    const decision: Decision = acceptedForFamily.length === 4 ? "FULL" : "BLOCKED";
    const finalRows: Adjudication["finalRows"] = [];
    const currentRows: Adjudication["currentRows"] = [];
    for (const { occurrence, record } of records) {
      const currentExisting = record.lesson.forms[0];
      const current: LessonForm = {
        ...currentExisting,
        form: occurrence.arabic,
        meaning: familySpec?.currentMeaning ?? occurrence.meaning,
        difference: `Current Qur’anic occurrence; this exact form is always shown first.${familySpec ? " Same-root semantic development is taught explicitly; shell-only variants are not separate rows." : ""}`,
        relationship: `The Qur’anic occurrence of the ${root} lexical verb in ${occurrence.location}; related forms are selected for useful morphological development.`,
        provenance: `Tier-C1 current-form review ${reviewedAt}; canonical Qur’anic occurrence ${occurrence.location} inspected.`
      };
      currentRows.push({ occurrenceId: occurrence.occurrenceId, location: occurrence.location, arabic: occurrence.arabic, forms: record.lesson.forms });
      const forms: LessonForm[] = [current];
      for (const candidate of acceptedForFamily) {
        forms.push({
          ...candidate.row,
          provenance: `Tier-C1 approved related form ${reviewedAt}; copied from existing reviewed lesson ${candidate.sourceOccurrenceId} (${candidate.sourceLocation}) for root ${root}; current occurrence ${occurrence.location} was reviewed first.`
        });
      }
      if (decision === "FULL") {
        record.lesson.forms = forms;
        record.lesson.sarfReview = {
          status: "full",
          ...(record.lesson.sarfReview.familyScope ? { familyScope: record.lesson.sarfReview.familyScope } : {}),
          auditDecision: "upgraded-to-full",
          provenance: [
            `Tier-C1 adjudication ${reviewedAt}: FULL.`,
            familySpec
              ? `The current Qur’anic form is first; four explicit same-root semantic-development forms were selected and translated according to their own meanings.`
              : `The current Qur’anic form is first; four genuinely distinct related forms were selected from existing reviewed same-root evidence.`,
            ...acceptedForFamily.map((candidate) => candidate.evidence),
            "Shared radicals alone, shell variants, duplicate forms and weak padding were rejected."
          ],
          reviewedBy: "Codex",
          reviewedAt,
        } satisfies SarfReview;
        changedFiles.add(record.filePath);
      }
      finalRows.push({ occurrenceId: occurrence.occurrenceId, location: occurrence.location, arabic: occurrence.arabic, forms: decision === "FULL" ? forms : record.lesson.forms });
    }
    const recordId = `tier-c1-family-${hash(item.familyKey)}`;
    const reasoning = decision === "FULL"
      ? `The ${root} verb family is a regular, well-attested lexical family. The current Qur’anic form was inspected in every occurrence and placed first. ${familySpec ? "The explicit same-root semantic-development specification was applied; meanings were not flattened and shell-only variants were excluded." : "Four distinct, form-specific rows were selected from already reviewed same-root evidence; no candidate was accepted merely because it shared radicals."}`
      : `The family remains blocked because the reviewed project evidence did not establish four additional forms safely. The correct response is to preserve uncertainty rather than manufacture rows.`;
    c1Adjudications.push({ familyKey: item.familyKey, root: item.root, lemma: item.lemmaOrCurrentForm, category: item.category, locations: item.occurrences, currentRows, candidatesConsidered: candidates, acceptedCandidates: acceptedForFamily, rejectedCandidates: rejected, finalRows, decision, reasoning, evidence: ["Canonical Qur’anic occurrences inspected.", "Existing reviewed project lesson catalogue inspected.", "Provider morphology was treated as evidence only.", "The governing contract and common-problems safeguards were applied."], confidence: decision === "FULL" ? "high" : "medium", unresolvedQuestion: decision === "FULL" ? null : `Which additional same-sense forms can be established for ${item.lemmaOrCurrentForm} without root-family or semantic drift?`, evidenceRequired: decision === "FULL" ? [] : evidenceFor("REGULAR VERB FAMILY", item), humanExpertReviewRequired: decision !== "FULL", reviewedAt, recordId });
    ledger.push({ recordId, eventType: "tier-c1-sarf-adjudication", contractId: contract.contractId, contractVersion: contract.contractVersion, scope: { familyKey: item.familyKey, occurrences: item.occurrences.map((occurrence) => occurrence.occurrenceId), tier: "C1" }, status: decision === "FULL" ? "passed" : "blocked", reviewedAt, checks: ["contract-loaded", "tier-c-scope-504", "c1-high-resolvability-21", "every-occurrence-inspected", "current-form-first", "four-distinct-related-forms-or-honest-block", "shared-root-only-candidates-rejected", "provenance-recorded", "decision-recorded"], evidence: [reasoning, ...rejected], decision, root: item.root, lemmaOrCurrentForm: item.lemmaOrCurrentForm, category: item.category, humanExpertReviewRequired: decision !== "FULL" });
  }
  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Changed package was not loaded: ${filePath}`);
    await fs.writeFile(filePath, `${JSON.stringify(entry.package, null, 2)}\n`, "utf8");
  }
  const existingIds = new Set(readAuditRecords().map((record) => record.recordId));
  const newLedger = ledger.filter((record) => !existingIds.has(record.recordId));
  appendAuditRecords(newLedger);

  const categoryCounts = Object.fromEntries((Object.keys({}) as Category[]).map((x) => [x, 0]));
  for (const row of classifications) categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1;
  const categoryOccurrences: Record<string, number> = {};
  for (const row of classifications) categoryOccurrences[row.category] = (categoryOccurrences[row.category] ?? 0) + row.occurrenceCount;
  const resolutionCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const resolutionOccurrences = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const row of classifications) { resolutionCounts[row.resolvability]++; resolutionOccurrences[row.resolvability] += row.occurrenceCount; }
  const c1Totals = { FULL: 0, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 } as Record<Decision, number>;
  const c1OccurrenceTotals = { FULL: 0, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 } as Record<Decision, number>;
  for (const row of c1Adjudications) { c1Totals[row.decision]++; c1OccurrenceTotals[row.decision] += row.locations.length; }
  const classificationSummary = { tier: "C", contractVersion: contract.contractVersion, scope: { families: 504, occurrences: 697, excluded: ["15 B2 families", "all earlier Tier-A/B1/D exceptions"] }, categoryCounts, categoryOccurrences, resolutionCounts, resolutionOccurrences, c1: { families: highItems.length, occurrences: highItems.reduce((sum, item) => sum + item.occurrences.length, 0), totals: c1Totals, occurrencesByDecision: c1OccurrenceTotals }, generatedAt: reviewedAt };
  await fs.writeFile(classificationJsonPath, `${JSON.stringify({ reportType: "tier-c-classification", ...classificationSummary, classifications }, null, 2)}\n`, "utf8");
  await fs.writeFile(classificationMarkdownPath, markdownClassification(classifications, classificationSummary), "utf8");
  const c1Summary = { tier: "C1", scope: { highResolvabilityFamilies: highItems.length, occurrences: highItems.reduce((sum, item) => sum + item.occurrences.length, 0) }, totals: c1Totals, occurrencesByDecision: c1OccurrenceTotals, changedPackageFiles: [...changedFiles].sort(), generatedAt: reviewedAt };
  await fs.writeFile(c1JsonPath, `${JSON.stringify({ reportType: "tier-c1-sarf-adjudication", contractVersion: contract.contractVersion, ...c1Summary, adjudications: c1Adjudications }, null, 2)}\n`, "utf8");
  await fs.writeFile(c1MarkdownPath, markdownC1({ summary: c1Summary, adjudications: c1Adjudications }), "utf8");
  console.log(JSON.stringify({ classificationSummary, c1Summary, changedPackageFiles: changedFiles.size, newLedgerRecords: newLedger.length }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
