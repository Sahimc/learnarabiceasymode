import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const reviewRoot = path.join(root, "artifacts", "content-review");
const sourcePath = path.join(reviewRoot, "tier-c3c4-weak-queue-handoff.json");
const classificationPath = path.join(reviewRoot, "tier-c3-low-classification.json");
const jsonPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.json");
const markdownPath = path.join(reviewRoot, "tier-c3c4-weak-classification-and-batches.md");

type Category = "W1" | "W2" | "W3" | "W4" | "W5" | "W6";
type Resolvability = "HIGH" | "MEDIUM" | "LOW";

type Family = {
  familyKey: string;
  quranicWord: string;
  root: string;
  lemma: string;
  locations: string[];
  occurrenceCount: number;
  primaryTrack?: string;
  secondaryMorphologyFlags?: string[];
  rootConfidence?: string;
  lemmaConfidence?: string;
  morphologyType?: unknown;
  semanticRisk?: string;
  originalLowReason?: unknown;
  currentRow?: { arabic?: string; meaning?: string; difference?: string };
  c3C1?: unknown;
  c3C2?: unknown;
  c3C3?: unknown;
};

type PlanSpec = {
  category: Category;
  weakRadicalPosition: "first" | "second" | "third" | "multiple" | "uncertain";
  weakRadicals: string[];
  reason: string;
  difficulty: Resolvability;
  resolvability: Resolvability;
  batch: string;
  rank: number;
};

const spec = (
  category: Category,
  position: PlanSpec["weakRadicalPosition"],
  radicals: string[],
  reason: string,
  level: Resolvability,
  batch: string,
  rank: number,
): PlanSpec => ({
  category,
  weakRadicalPosition: position,
  weakRadicals: radicals,
  reason,
  difficulty: level,
  resolvability: level,
  batch,
  rank,
});

const W1 = "W1" as const;
const W2 = "W2" as const;
const W3 = "W3" as const;
const W4 = "W4" as const;
const W5 = "W5" as const;
const W6 = "W6" as const;

const plans: Record<string, PlanSpec> = {
  "lexical|حوب|حوب|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و in the second radical; the noun’s semantic range must be separated from unrelated homonyms.", "MEDIUM", "C3-C4B", 1),
  "lexical|حير|حيران|noun/pronoun": spec(W2, "second", ["ي"], "Hollow root ي in the second radical; vowel alternation and the adjective’s lexical branch require review.", "MEDIUM", "C3-C4B", 2),
  "lexical|رخو|رخاء|noun/pronoun": spec(W1, "third", ["و"], "Defective final و root with a secure lexical noun/adjective family, but final-weak alternation must be checked.", "MEDIUM", "C3-C4A", 1),
  "lexical|رهو|رهو|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root; distinguish the lexical sense of رَهْو from visually similar forms.", "MEDIUM", "C3-C4A", 2),
  "lexical|روع|روع|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و; semantic relations around fear/awe require lexical confirmation.", "MEDIUM", "C3-C4B", 3),
  "lexical|ريش|ريشا|noun/pronoun": spec(W2, "second", ["ي"], "Hollow root ي with a noun family; investigate derived forms without confusing the feather/wealth branches.", "MEDIUM", "C3-C4B", 4),
  "lexical|ريع|ريع|noun/pronoun": spec(W2, "second", ["ي"], "Hollow root ي; the Qur’anic noun has a narrow lexical sense requiring evidence-led expansion.", "MEDIUM", "C3-C4B", 5),
  "lexical|سوح|ساحت|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و; the surface noun and its lexical relatives must be distinguished from shell variation.", "MEDIUM", "C3-C4B", 6),
  "lexical|سيب|سائبة|noun/pronoun": spec(W2, "second", ["ي"], "Hollow root ي with a known derived adjective/noun branch; verify the lexical family rather than generating a paradigm.", "HIGH", "C3-C4B", 7),
  "lexical|شوب|شوبا|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a secure mixing/impurity branch; candidate forms must be individually translated.", "HIGH", "C3-C4B", 8),
  "lexical|شوك|شوكة|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و; thorn/spike morphology is secure but the noun family must not be padded by case or number alone.", "HIGH", "C3-C4B", 9),
  "lexical|صوع|صواع|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a specialised vessel/instrument noun; productive morphology is uncertain.", "LOW", "C3-C4B", 10),
  "lexical|صوف|اصواف|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a material noun and plural; additional forms require lexical evidence beyond plural padding.", "MEDIUM", "C3-C4B", 11),
  "lexical|صيص|صياصي|noun/pronoun": spec(W2, "second", ["ي"], "Hollow root ي with an uncommon plural noun; lexical attestation and root relationship need careful checking.", "LOW", "C3-C4B", 12),
  "lexical|ضير|ضير|noun/pronoun": spec(W2, "second", ["ي"], "Hollow root ي with a narrow lexical adjective/noun; distinguish the intended semantic branch.", "LOW", "C3-C4B", 13),
  "lexical|طود|طود|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a restricted mountain noun; additional forms may be pedagogically weak.", "LOW", "C3-C4B", 14),
  "lexical|عضو|عضين|noun/pronoun": spec(W6, "uncertain", ["و"], "The provider/root normalisation for عِضِينَ and the relationship to عضو require resolution before family authoring.", "LOW", "C3-C4G", 1),
  "lexical|عوق|معوقين|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a clear derived passive/agent branch; verify the exact lexical and participial relations.", "MEDIUM", "C3-C4B", 15),
  "lexical|غزو|غزى|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root و represented through defective spelling; investigate the noun/verb family and orthographic alternation.", "MEDIUM", "C3-C4A", 3),
  "lexical|غول|غول|noun/pronoun": spec(W5, "second", ["و"], "Secure hollow root but a narrow/lexicalised noun with several semantic possibilities; likely limited rather than a generated paradigm.", "LOW", "C3-C4E", 1),
  "lexical|فجو|فجوة|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root و with a concrete gap/opening noun; verify established derivations and avoid plural/case padding.", "MEDIUM", "C3-C4A", 4),
  "lexical|فوم|فوم|noun/pronoun": spec(W5, "second", ["و"], "Secure hollow root but a narrow plant/food noun; author only independently attested lexical relatives.", "LOW", "C3-C4E", 2),
  "lexical|قنو|قنوان|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root و with a secure botanical noun/plural relationship; investigate the lexical family carefully.", "MEDIUM", "C3-C4A", 5),
  "lexical|كلو|كلا|noun/pronoun": spec(W5, "third", ["و"], "The item behaves as a fixed dual/pronominal expression; weak-root morphology must not be invented from the surface label.", "LOW", "C3-C4E", 3),
  "lexical|لحي|لحيت|noun/pronoun": spec(W1, "third", ["ي"], "Final-weak root ي with a body-part noun; inspect lexical derivatives and broken-plural evidence.", "MEDIUM", "C3-C4A", 6),
  "lexical|لوذ|لواذ|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with an established refuge/turning-away branch; derived forms require exact meanings.", "MEDIUM", "C3-C4C", 1),
  "lexical|معي|امعاء|noun/pronoun": spec(W1, "third", ["ي"], "Final-weak root ي with a broken-plural body-part noun; distinguish lexical plurality from mere inflection.", "MEDIUM", "C3-C4A", 7),
  "lexical|مكو|مكاء|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root و with a specialised noun for whistling; semantic and derivational evidence is narrow.", "MEDIUM", "C3-C4A", 8),
  "lexical|نوش|تناوش|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و in a derived Form VI noun; investigate the verbal family and semantic branch.", "MEDIUM", "C3-C4C", 2),
  "lexical|نوص|مناص|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a fixed escape/recourse noun; likely lexical-narrow and evidence-sensitive.", "LOW", "C3-C4C", 3),
  "lexical|نون|نون|noun/pronoun": spec(W5, "second", ["و"], "The item is a letter/name noun with a narrow lexical representation; do not infer an ordinary hollow-root paradigm.", "LOW", "C3-C4E", 4),
  "lexical|نوي|نوى|noun/pronoun": spec(W4, "multiple", ["و", "ي"], "Two weak radicals create multiple weak-root behaviour; canonical normalisation and contraction must be reviewed together.", "LOW", "C3-C4G", 2),
  "lexical|هيت|هيت|noun/pronoun": spec(W6, "uncertain", ["ي"], "هَيْتَ is a fixed/disputed lexical item; root and lemma identity must be settled before Ṣarf authoring.", "LOW", "C3-C4G", 3),
  "lexical|وبر|اوبار|noun/pronoun": spec(W3, "first", ["و"], "Initial و is assimilated/weak; the plural noun requires review of the underlying singular and lexical family.", "MEDIUM", "C3-C4D", 1),
  "lexical|وسن|سنة|noun/pronoun": spec(W5, "first", ["و"], "Initial-weak root is reasonably secure, but سِنَةٌ is a narrow noun and may be better treated as limited.", "LOW", "C3-C4E", 5),
  "lexical|وشي|شية|noun/pronoun": spec(W4, "multiple", ["و", "ي"], "Initial and final weak behaviour combine in وشي; spelling/contraction and lexical branch must be checked together.", "LOW", "C3-C4G", 4),
  "lexical|وطن|مواطن|noun/pronoun": spec(W3, "first", ["و"], "Initial و root with a well-attested place/person noun family; verify derived patterns rather than plural padding.", "HIGH", "C3-C4D", 2),
  "lexical|وفد|وفد|noun/pronoun": spec(W3, "first", ["و"], "Initial و root with a clear delegation/arrival noun and verb family.", "HIGH", "C3-C4D", 3),
  "lexical|وفر|موفور|noun/pronoun": spec(W3, "first", ["و"], "Initial و root in a passive participial adjective; inspect the underlying verb and honest semantic development.", "HIGH", "C3-C4D", 4),
  "lexical|وقذ|موقوذة|noun/pronoun": spec(W3, "first", ["و"], "Initial و root in a passive participle; confirm the verb, passive morphology and lexical meaning.", "HIGH", "C3-C4D", 5),
  "lexical|وكد|توكيد|noun/pronoun": spec(W3, "first", ["و"], "Initial و root in a derived verbal noun; a clear Form II/derived family is likely, subject to evidence.", "HIGH", "C3-C4D", 6),
  "lexical|يقظ|ايقاظ|noun/pronoun": spec(W3, "first", ["ي"], "Initial ي root in a derived verbal noun; verify the underlying verb and vocalisation.", "HIGH", "C3-C4D", 7),
  "lexical|ينع|ينع|noun/pronoun": spec(W3, "first", ["ي"], "Initial ي root with a maturity/ripening branch; distinguish noun/adjective and verb evidence.", "MEDIUM", "C3-C4D", 8),
  "lexical|ميد|مائدة|noun/pronoun": spec(W6, "uncertain", ["ي"], "The canonical root/lemma analysis of مَائِدَةٌ is potentially disputed; resolve weak/hamzated normalisation before authoring.", "LOW", "C3-C4G", 5),
  "lexical|زول|زوال|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a well-attested cessation/removal family; distinguish Form I and causative branches.", "HIGH", "C3-C4C", 4),
  "lexical|وصف|وصف|noun/pronoun": spec(W3, "first", ["و"], "Initial و root with a productive description/characterisation family.", "HIGH", "C3-C4D", 9),
  "lexical|بور|بوار|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a destruction/ruin semantic branch; verify noun and verb relationships.", "MEDIUM", "C3-C4C", 5),
  "lexical|زجو|مزجاة|noun/pronoun": spec(W4, "third", ["و"], "Final-weak root combined with an irregular derived/adjectival form; weak-letter normalisation and vocalisation need special review.", "LOW", "C3-C4G", 6),
  "lexical|غلي|غلى|noun/pronoun": spec(W1, "third", ["ي"], "Final-weak root ي in a verbal-noun/boiling branch; verify the lexical vowel and derived forms.", "MEDIUM", "C3-C4A", 9),
  "lexical|قوت|مقيت|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و in an adjective/active-participial branch; meaning and pattern must be separated from قوت noun forms.", "MEDIUM", "C3-C4C", 6),
  "lexical|وبق|موبق|noun/pronoun": spec(W3, "first", ["و"], "Initial و root in a place/causative-looking noun; verify whether the item has a productive family.", "MEDIUM", "C3-C4D", 10),
  "lexical|خيط|خياط|noun/pronoun": spec(W2, "second", ["ي"], "Hollow root ي with a craft/occupational noun; distinguish خِيَاط from خَيَاطَة and related forms.", "MEDIUM", "C3-C4C", 7),
  "lexical|زود|زاد|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و with a developed provision/increase branch; exact lexical relationships need review.", "MEDIUM", "C3-C4C", 8),
  "lexical|قصو|قصوى|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root و represented by a defective feminine adjective; inspect adjective and comparative morphology.", "MEDIUM", "C3-C4A", 10),
  "lexical|هور|هار|noun/pronoun": spec(W2, "second", ["و"], "Hollow root و in a collapsing/eroding adjective; distinguish the Qur’anic branch from other هور forms.", "MEDIUM", "C3-C4C", 9),
  "lexical|يبس|يابس|noun/pronoun": spec(W3, "first", ["ي"], "Initial ي root in an adjective; verify the underlying verb and semantic development.", "MEDIUM", "C3-C4D", 11),
  "lexical|ورق|ورقة|noun/pronoun": spec(W3, "first", ["و"], "Initial و root with a productive leaf/paper noun family; distinguish lexical derivation from number/case.", "MEDIUM", "C3-C4D", 12),
  "lexical|خطو|خطوة|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root و with a clear step/stride family; investigate verb, noun and plural relations.", "HIGH", "C3-C4A", 11),
  "lexical|سلو|سلوى|noun/pronoun": spec(W5, "third", ["و"], "Final-weak root is plausible, but the Qur’anic quail noun is narrow and should not inherit unrelated سلو forms without evidence.", "LOW", "C3-C4E", 6),
  "lexical|جثو|جثي|noun/pronoun": spec(W1, "third", ["و"], "Final-weak root و with a participial/adjectival form; review orthographic and vocalic alternation.", "MEDIUM", "C3-C4A", 12),
  "lexical|تور|تارة|noun/pronoun": spec(W5, "second", ["و"], "Hollow-root analysis is possible, but تَارَةً is a narrow temporal adverb/noun and may need a limited representation.", "LOW", "C3-C4E", 7),
  "lexical|خور|خوار|noun/pronoun": spec(W5, "second", ["و"], "Hollow root with an onomatopoeic/animal-sound noun; productive family and semantic branch require careful evidence.", "LOW", "C3-C4E", 8),
  "lexical|شفو|شفا|noun/pronoun": spec(W5, "third", ["و"], "Final-weak root with a narrow edge/recovery noun; investigate genuine relatives without forcing a paradigm.", "LOW", "C3-C4E", 9),
  "lexical|صنو|صنوان|noun/pronoun": spec(W5, "third", ["و"], "Final-weak botanical noun with a narrow lexical family; plural/number alone cannot fill rows.", "LOW", "C3-C4E", 10),
  "lexical|طرو|طري|noun/pronoun": spec(W5, "third", ["و"], "Final-weak adjective/noun with a freshness branch; distinguish lexical derivation from inflection.", "LOW", "C3-C4E", 11),
  "lexical|غوط|غائط|noun/pronoun": spec(W5, "second", ["و"], "Hollow root with a specialised noun and semantic split; likely needs a narrow, evidence-led family.", "LOW", "C3-C4E", 12),
  "lexical|ودق|ودق|noun/pronoun": spec(W5, "first", ["و"], "Initial و root with a narrow rain noun/verb branch; confirm productive morphology before authoring.", "LOW", "C3-C4F", 1),
  "lexical|وسل|وسيلة|noun/pronoun": spec(W5, "first", ["و"], "Initial و root with a means/approach noun; distinguish the established noun family from speculative verbs.", "LOW", "C3-C4F", 2),
  "lexical|وطر|وطر|noun/pronoun": spec(W5, "first", ["و"], "Initial و root with a narrow desire/need noun; semantic evidence must precede any paradigm.", "LOW", "C3-C4F", 3),
  "lexical|شيد|مشيدة|noun/pronoun": spec(W5, "second", ["ي"], "Hollow root in a passive/adjectival built-up branch; current adjective may be lexically narrow.", "MEDIUM", "C3-C4F", 4),
  "lexical|قوع|قاع|noun/pronoun": spec(W5, "second", ["و"], "Hollow root with a restricted terrain noun; avoid treating surface vowel variants as separate morphology.", "LOW", "C3-C4F", 5),
  "lexical|قيل|قائل|noun/pronoun": spec(W6, "uncertain", ["و", "ي"], "Provider root ق ي ل conflicts with the likely ق و ل analysis of قَائِلُونَ; canonical root ownership must be resolved first.", "LOW", "C3-C4G", 7),
  "lexical|وثن|اوثن|noun/pronoun": spec(W5, "first", ["و"], "Initial و root with a restricted idol noun/plural family; author only securely attested relatives.", "LOW", "C3-C4F", 6),
  "lexical|ثبي|ثبة|noun/pronoun": spec(W5, "third", ["ي"], "Final-weak root with a restricted collective noun; number/plural relations alone are insufficient.", "LOW", "C3-C4F", 7),
  "lexical|ثري|ثرى|noun/pronoun": spec(W5, "third", ["ي"], "Final-weak root with a narrow earth/soil noun branch; semantic relatives need evidence.", "LOW", "C3-C4F", 8),
  "lexical|جذو|جذوة|noun/pronoun": spec(W5, "third", ["و"], "Final-weak root with a restricted ember/brand noun; do not generate forms without lexical attestation.", "LOW", "C3-C4F", 9),
  "lexical|جوف|جوف|noun/pronoun": spec(W5, "second", ["و"], "Hollow root with a body/interior noun whose family and semantic branches require careful lexical review.", "LOW", "C3-C4F", 10),
};

const source = JSON.parse(await fs.readFile(sourcePath, "utf8")) as {
  families: Family[];
  scope: { families: number; occurrences: number };
};
const classificationSource = JSON.parse(await fs.readFile(classificationPath, "utf8")) as { families: Family[] };
const classificationByKey = new Map(classificationSource.families.map((family) => [family.familyKey, family]));
if (source.scope.families !== 77 || source.scope.occurrences !== 94)
  throw new Error(`Unexpected weak handoff scope: ${source.scope.families}/${source.scope.occurrences}`);

const keys = new Set(source.families.map((family) => family.familyKey));
const plannedKeys = new Set(Object.keys(plans));
const missing = [...keys].filter((key) => !plannedKeys.has(key));
const extra = [...plannedKeys].filter((key) => !keys.has(key));
if (missing.length || extra.length) throw new Error(`Classification coverage mismatch. Missing=${missing.join(", ")} Extra=${extra.join(", ")}`);

const planned = source.families.map((family) => {
  const plan = plans[family.familyKey];
  if (family.primaryTrack !== "WEAK") throw new Error(`${family.familyKey} is not WEAK-owned`);
  if (family.c3C1 || family.c3C2 || family.c3C3) throw new Error(`${family.familyKey} was already adjudicated in a completed C3 track`);
  const classifiedFamily = classificationByKey.get(family.familyKey);
  if (!classifiedFamily?.currentRow) throw new Error(`Missing current row for ${family.familyKey}`);
  return {
    familyKey: family.familyKey,
    quranicWord: family.quranicWord,
    root: family.root,
    lemma: family.lemma,
    locations: family.locations,
    occurrenceCount: family.occurrenceCount,
    currentRow: classifiedFamily.currentRow,
    currentMeaning: classifiedFamily.currentRow.meaning ?? null,
    partOfSpeech: (family.morphologyType as { partOfSpeech?: unknown } | null)?.partOfSpeech ?? null,
    weakRadicalPosition: plan.weakRadicalPosition,
    weakRadicals: plan.weakRadicals,
    primaryCategory: plan.category,
    secondaryMorphologyFlags: family.secondaryMorphologyFlags ?? [],
    rootConfidence: family.rootConfidence ?? null,
    lemmaConfidence: family.lemmaConfidence ?? null,
    reasonForClassification: plan.reason,
    predictedDifficulty: plan.difficulty,
    predictedResolvability: plan.resolvability,
    originalLowReason: family.originalLowReason ?? null,
    batch: plan.batch,
    batchRank: plan.rank,
  };
});

const byCategory = (category: Category) => planned.filter((family) => family.primaryCategory === category);
const byBatch = (batch: string) => planned.filter((family) => family.batch === batch).sort((left, right) => left.batchRank - right.batchRank);
const summarize = (families: typeof planned) => ({
  families: families.length,
  occurrences: families.reduce((sum, family) => sum + family.occurrenceCount, 0),
  predicted: {
    HIGH: families.filter((family) => family.predictedResolvability === "HIGH").length,
    MEDIUM: families.filter((family) => family.predictedResolvability === "MEDIUM").length,
    LOW: families.filter((family) => family.predictedResolvability === "LOW").length,
  },
});

const categoryDefinitions = {
  W1: "Weak-final / defective: final و or ي, including defective/alif-maqṣūrah behaviour.",
  W2: "Weak-middle / hollow: second radical و or ي with hollow-root behaviour.",
  W3: "Weak-initial / assimilated: first radical و or ي with initial-weak behaviour.",
  W4: "Mixed weak morphology: multiple weak radicals or an additional irregular/contracted weak-root complication.",
  W5: "Weak lexical nouns/adjectives: secure weak root but narrow, fixed or non-productive learner family.",
  W6: "Root/lemma-normalisation uncertainty: root, lemma or canonical weak radical must be resolved before authoring.",
};

const batches = ["C3-C4A", "C3-C4B", "C3-C4C", "C3-C4D", "C3-C4E", "C3-C4F", "C3-C4G"].map((batch) => ({
  batch,
  morphologyType: batch === "C3-C4A" ? "W1 weak-final / defective" : batch === "C3-C4B" || batch === "C3-C4C" ? "W2 weak-middle / hollow" : batch === "C3-C4D" ? "W3 weak-initial / assimilated" : batch === "C3-C4E" || batch === "C3-C4F" ? "W5 weak lexical nouns/adjectives" : "W4 mixed weak + W6 normalisation/special cases",
  rationale: batch === "C3-C4G" ? "Last: mixed weak and root/lemma-normalisation cases require the most conservative evidence review." : "Grouped by the same dominant weak-root behaviour and ordered before more uncertain families.",
  ...summarize(byBatch(batch)),
  families: byBatch(batch),
}));

const output = {
  reportType: "tier-c3c4-weak-classification-and-batches",
  contractVersion: "1.3.9",
  status: "planning-only-not-started",
  source: "tier-c3c4-weak-queue-handoff.json",
  rule: "No Ṣarf rows, corpus decisions or package content were changed. Each family has exactly one primary category and one execution batch; existing secondary morphology flags are preserved.",
  scope: { families: planned.length, occurrences: planned.reduce((sum, family) => sum + family.occurrenceCount, 0) },
  categoryDefinitions,
  categoryTotals: Object.fromEntries(Object.entries(categoryDefinitions).map(([category]) => [category, summarize(byCategory(category as Category))])),
  batchOrder: batches.map((batch) => batch.batch),
  batches,
  safetyReconciliation: {
    everyQueueFamilyClassifiedExactlyOnce: planned.length === 77 && plannedKeys.size === keys.size,
    everyQueueOccurrenceIncluded: planned.reduce((sum, family) => sum + family.occurrenceCount, 0) === 94,
    duplicatePrimaryAssignments: planned.length - new Set(planned.map((family) => family.familyKey)).size,
    completedTracksReappeared: planned.some((family) => family.batch === "") ? null : false,
    rowsChanged: false,
    corpusDecisionsChanged: false,
    secondaryFlagsPreserved: true,
  },
  families: planned,
};

await fs.writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

const lines = [
  "# C3-C4 weak-root classification and execution batches",
  "",
  "Status: **planning only; weak-root adjudication has not started**.",
  "",
  `Scope: **${output.scope.families} families / ${output.scope.occurrences} Qur’anic occurrences**.`,
  "",
  "No Ṣarf rows, corpus decisions or package content were changed.",
  "",
  "## Classification totals",
  "",
  "| Category | Families | Occurrences | Predicted HIGH | Predicted MEDIUM | Predicted LOW |",
  "|---|---:|---:|---:|---:|---:|",
  ...Object.entries(output.categoryTotals).map(([category, total]) => `| ${category} | ${total.families} | ${total.occurrences} | ${total.predicted.HIGH} | ${total.predicted.MEDIUM} | ${total.predicted.LOW} |`),
  `| **TOTAL** | **${output.scope.families}** | **${output.scope.occurrences}** | **${planned.filter((family) => family.predictedResolvability === "HIGH").length}** | **${planned.filter((family) => family.predictedResolvability === "MEDIUM").length}** | **${planned.filter((family) => family.predictedResolvability === "LOW").length}** |`,
  "",
  "## Category definitions",
  "",
  ...Object.entries(categoryDefinitions).map(([category, definition]) => `- **${category}** — ${definition}`),
  "",
  "## Proposed batches",
  "",
  ...batches.flatMap((batch) => [
    `### ${batch.batch} — ${batch.morphologyType}`,
    "",
    `- Families: **${batch.families.length}**`,
    `- Occurrences: **${batch.occurrences}**`,
    `- Predicted resolution: HIGH ${batch.predicted.HIGH}, MEDIUM ${batch.predicted.MEDIUM}, LOW ${batch.predicted.LOW}.`,
    `- Why together: ${batch.rationale}`,
    "",
    "| # | Word | Root | Category | Location(s) | Occ. | Predicted |",
    "|---:|---|---|---|---|---:|---|",
    ...batch.families.map((family) => `| ${family.batchRank} | ${family.quranicWord} | ${family.root} | ${family.primaryCategory} | ${family.locations.join(", ")} | ${family.occurrenceCount} | ${family.predictedResolvability} |`),
    "",
  ]),
  "## Safety reconciliation",
  "",
  "- Every one of the 77 families appears exactly once.",
  "- Occurrence totals reconcile to 94.",
  "- No completed C3-C1, C3-C2 or C3-C3 family appears in the queue.",
  "- No family belongs to two primary categories or two batches.",
  "- Existing secondary morphology flags are copied unchanged.",
  "- No Ṣarf rows, package content or corpus decisions were changed.",
  "",
];
await fs.writeFile(markdownPath, `${lines.join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  jsonPath,
  markdownPath,
  scope: output.scope,
  categoryTotals: output.categoryTotals,
  batches: batches.map((batch) => ({
    batch: batch.batch,
    morphologyType: batch.morphologyType,
    rationale: batch.rationale,
    families: batch.families.length,
    occurrences: batch.occurrences,
    predicted: batch.predicted,
  })),
  safetyReconciliation: output.safetyReconciliation,
}, null, 2));
