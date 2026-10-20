import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

type C3Group =
  | "C3-A"
  | "C3-B"
  | "C3-C"
  | "C3-D"
  | "C3-E";

type Resolvability = "HIGH" | "MEDIUM" | "LOW";

type ExistingFormSignal = {
  form: string;
  meaning: string;
  morphologyType: string;
  sourceLocations: string[];
  shellRisk: boolean;
};

type OccurrenceLookup = {
  word: JsonRecord;
  lesson: JsonRecord;
};

const repositoryRoot = process.cwd();
const reviewRoot = path.join(repositoryRoot, "artifacts", "content-review");
const classificationPath = path.join(reviewRoot, "tier-c-classification.json");
const auditPath = path.join(reviewRoot, "final-sarf-completion-audit.json");
const c2Path = path.join(reviewRoot, "tier-c2-sarf-adjudications.json");
const rootMeaningsPath = path.join(
  repositoryRoot,
  "content-import",
  "root-meanings.json",
);
const outputJsonPath = path.join(reviewRoot, "tier-c3-low-classification.json");
const outputMarkdownPath = path.join(
  reviewRoot,
  "tier-c3-low-classification.md",
);

const baselineCommit = "77f3a95ffde7d052ce78ecfaeb1413b0d0538057";

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object"
    ? (value as JsonRecord)
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function normalizeArabic(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u0640\s]/gu, "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "");
}

function normalizeRoot(value: string) {
  return normalizeArabic(value).replace(/[^\u0600-\u06FF]/gu, "");
}

function rootLetters(value: string) {
  return [...normalizeRoot(value)];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function parseJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonRecord;
}

function sourceLocationFromLessonId(value: string) {
  const match = /^lesson:(\d+):(\d+):(\d+)$/u.exec(value);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : "";
}

function classifyFormType(lesson: JsonRecord, form: JsonRecord) {
  const text = [
    stringValue(lesson.type),
    stringValue(form.difference),
    stringValue(form.meaning),
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(?:verbal noun|maṣdar|masdar|action noun)\b/u.test(text))
    return "verbal noun / maṣdar";
  if (/\bpassive participle\b/u.test(text)) return "passive participle";
  if (/\bactive participle\b/u.test(text)) return "active participle";
  if (/\b(?:imperative|perfect|imperfect|verb form|verb|tense)\b/u.test(text))
    return "verb / derived verb";
  if (/\b(?:adjective|noun)\b/u.test(text)) return "noun / adjective";
  if (/\b(?:place|instrument) noun\b/u.test(text))
    return "place / instrument noun";
  return "other";
}

function isShellOnly(lesson: JsonRecord, form: JsonRecord) {
  const text = [
    stringValue(lesson.type),
    stringValue(form.difference),
    stringValue(form.meaning),
  ].join(" ");
  const shellSignal =
    /case|state|gender|number|person|attached|pronoun|article|prefix|suffix|conjunction|current occurrence/iu.test(
      text,
    );
  const morphologySignal =
    /pattern|verb form|tense|part of speech|partofspeech|verbal noun|maṣdar|masdar|participle|imperative|active|passive|derived/iu.test(
      text,
    );
  return shellSignal && !morphologySignal;
}

function rootFlags(root: string, category: string) {
  const letters = rootLetters(root);
  const adjacentDuplicate = letters.some(
    (letter, index) => index > 0 && letter === letters[index - 1],
  );
  const weak = letters.some((letter) => /[ويى]/u.test(letter));
  const hamzated = letters.some((letter) => /[ءأإؤئ]/u.test(letter));
  const quadriliteral = letters.length >= 4;
  const special = /QUADRILITERAL|IRREGULAR|SPECIAL MORPHOLOGY/iu.test(category);
  return {
    weak,
    hamzated,
    doubled: adjacentDuplicate,
    quadriliteral,
    special,
    labels: uniqueStrings([
      weak ? "weak-root" : "",
      hamzated ? "hamzated-root" : "",
      adjacentDuplicate ? "doubled-root" : "",
      quadriliteral ? "quadriliteral" : "",
      special ? "special/irregular" : "",
    ]),
  };
}

function providerAnalyses(auditRecord: JsonRecord) {
  return records(asRecord(auditRecord.currentAnalysis).providerAnalyses);
}

function confidenceForRoot(
  familyRoot: string,
  category: string,
  analyses: JsonRecord[],
) {
  if (category === "ROOT OR LEMMA UNCERTAIN") return "LOW";
  const expected = normalizeRoot(familyRoot);
  const observed = uniqueStrings(
    analyses.map((analysis) => normalizeRoot(stringValue(analysis.root))),
  );
  if (!expected || observed.length === 0) return "LOW";
  if (observed.every((root) => root === expected)) return "HIGH";
  if (observed.includes(expected)) return "MEDIUM";
  return "LOW";
}

function confidenceForLemma(category: string, analyses: JsonRecord[]) {
  if (category === "ROOT OR LEMMA UNCERTAIN") return "LOW";
  const observed = uniqueStrings(
    analyses.map((analysis) => stringValue(analysis.lemma).trim()),
  );
  if (observed.length === 0) return "LOW";
  if (observed.length === 1) return "HIGH";
  return "MEDIUM";
}

function familyIsGrammatical(
  category: string,
  currentType: string,
  analyses: JsonRecord[],
  root: string,
) {
  const text = [
    category,
    currentType,
    ...analyses.map((analysis) => stringValue(analysis.partOfSpeech)),
  ].join(" ");
  if (!root || category === "FROZEN OR GRAMMATICAL FORM") return true;
  const lexicalType = /noun\s*\/\s*adjective|\bverb\b|\badjective\b|\bnoun\b/iu.test(
    currentType,
  );
  const grammaticalSignal =
    /particle|preposition|conjunction|connector|demonstrative|proper name|proper noun/iu.test(
      text,
    );
  const pronounOnly = /\bpronoun\b/iu.test(text) && !lexicalType;
  return grammaticalSignal || pronounOnly;
}

function currentMorphology(
  currentType: string,
  analyses: JsonRecord[],
  currentDifference: string,
) {
  const pos = uniqueStrings(
    analyses.map((analysis) => stringValue(analysis.partOfSpeech)),
  );
  const patterns = uniqueStrings(
    analyses.map((analysis) => stringValue(analysis.pattern)),
  );
  const featureText = analyses
    .flatMap((analysis) => records(analysis.features))
    .map((feature) => {
      const key = stringValue(feature.key ?? feature.label);
      const value = stringValue(feature.value);
      return value ? `${key}: ${value}` : key;
    });
  const signals = uniqueStrings([
    ...patterns,
    ...featureText,
    currentType,
    currentDifference,
  ]);
  return {
    partOfSpeech: pos,
    patterns,
    featureSignals: signals.slice(0, 12),
    summary: signals.slice(0, 8).join("; ") || "not specified in current evidence",
  };
}

function groupFor(input: {
  category: string;
  root: string;
  rootConfidence: string;
  lemmaConfidence: string;
  currentType: string;
  analyses: JsonRecord[];
  flags: ReturnType<typeof rootFlags>;
  strongCandidateCount: number;
  candidateTypeCount: number;
}) {
  const grammatical = familyIsGrammatical(
    input.category,
    input.currentType,
    input.analyses,
    input.root,
  );
  if (grammatical) return "C3-E" as const;

  const typeText = [
    input.currentType,
    ...input.analyses.map((analysis) => stringValue(analysis.partOfSpeech)),
  ].join(" ");
  const verb = /\bverb\b|imperative|perfect|imperfect|tense/iu.test(typeText);
  const nounLike = /noun|adjective/iu.test(typeText);
  const structuralRisk =
    input.flags.weak ||
    input.flags.hamzated ||
    input.flags.doubled ||
    input.flags.quadriliteral ||
    input.flags.special ||
    input.category === "ROOT OR LEMMA UNCERTAIN";
  if (structuralRisk) return "C3-C" as const;

  if (
    verb &&
    input.rootConfidence === "HIGH" &&
    input.lemmaConfidence === "HIGH"
  )
    return "C3-A" as const;

  if (
    nounLike &&
    input.rootConfidence === "HIGH" &&
    input.lemmaConfidence === "HIGH" &&
    input.strongCandidateCount >= 2 &&
    input.candidateTypeCount >= 2
  )
    return "C3-B" as const;

  return "C3-D" as const;
}

function predictedResolvability(input: {
  group: C3Group;
  rootConfidence: string;
  lemmaConfidence: string;
  strongCandidateCount: number;
  candidateTypeCount: number;
  semanticRisk: string;
}) {
  if (input.group === "C3-E") return "LOW" as const;
  if (input.group === "C3-A") return "HIGH" as const;
  if (
    input.group === "C3-B" &&
    input.strongCandidateCount >= 4 &&
    input.candidateTypeCount >= 2
  )
    return "HIGH" as const;
  if (
    input.group === "C3-C" &&
    input.rootConfidence === "HIGH" &&
    input.lemmaConfidence === "HIGH" &&
    input.strongCandidateCount >= 3
  )
    return "MEDIUM" as const;
  if (
    input.group === "C3-D" &&
    input.rootConfidence === "HIGH" &&
    input.lemmaConfidence === "HIGH" &&
    input.strongCandidateCount >= 3 &&
    input.semanticRisk === "MEDIUM"
  )
    return "MEDIUM" as const;
  return "LOW" as const;
}

function groupRationale(group: C3Group) {
  return {
    "C3-A":
      "Secure regular or derived verb family; investigate established tense, voice, maṣdar and participle contrasts first.",
    "C3-B":
      "Rootful noun/adjective with secure identity and multiple already-discoverable same-root derivational signals; verify sense alignment before authoring.",
    "C3-C":
      "Weak, hamzated, doubled, quadriliteral, irregular, or root/lemma-normalisation risk; morphology evidence must be checked before row authoring.",
    "C3-D":
      "Semantic branching is the main difficulty; same-root forms may be useful, but each branch needs an honest meaning and sense-scoped evidence.",
    "C3-E":
      "Frozen, grammatical, proper-name, or model-dependent item; decide whether a dedicated learner representation is needed rather than fabricating Ṣarf rows.",
  }[group];
}

function markdownEscape(value: string) {
  return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

const classification = parseJson(classificationPath) as JsonRecord;
const audit = parseJson(auditPath) as JsonRecord;
const c2Report = parseJson(c2Path) as JsonRecord;
const rootMeaningData = parseJson(rootMeaningsPath) as JsonRecord;
const rootMeanings = asRecord(rootMeaningData.meanings);

const classifications = records(classification.classifications);
const c3Source = classifications.filter(
  (item) => stringValue(item.resolvability) === "LOW",
);
if (c3Source.length !== 335) {
  throw new Error(`Expected exactly 335 C3 LOW families; found ${c3Source.length}.`);
}

const auditRecords = records(audit.blockedFamilyReviewRecords);
const auditByFamily = new Map(
  auditRecords.map((record) => [stringValue(record.familyKey), record]),
);

const occurrenceLookup = new Map<string, OccurrenceLookup>();
const formsByRoot = new Map<string, Map<string, ExistingFormSignal>>();
const packageDirectories = fs
  .readdirSync(path.join(repositoryRoot, "content-import", "surahs"), {
    withFileTypes: true,
  })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const directory of packageDirectories) {
  const packagePath = path.join(
    repositoryRoot,
    "content-import",
    "surahs",
    directory,
    "surah.json",
  );
  if (!fs.existsSync(packagePath)) continue;
  const pkg = parseJson(packagePath);
  const entries = asRecord(pkg.teachingEntries);
  for (const lesson of Object.values(entries).map(asRecord)) {
    const lessonId = stringValue(lesson.id);
    const location = sourceLocationFromLessonId(lessonId);
    if (location) {
      occurrenceLookup.set(`word:${location}`, {
        word: { id: `word:${location}` },
        lesson,
      });
    }

    const root = normalizeRoot(stringValue(lesson.root));
    if (!root) continue;
    const rootForms = formsByRoot.get(root) ?? new Map();
    for (const form of records(lesson.forms)) {
      const arabic = stringValue(form.form).trim();
      if (!arabic) continue;
      const key = normalizeArabic(arabic);
      const existing = rootForms.get(key);
      const sourceLocations = uniqueStrings([
        ...(existing?.sourceLocations ?? []),
        location,
      ]);
      rootForms.set(key, {
        form: arabic,
        meaning: stringValue(form.meaning),
        morphologyType: classifyFormType(lesson, form),
        sourceLocations,
        shellRisk: existing?.shellRisk ?? isShellOnly(lesson, form),
      });
    }
    formsByRoot.set(root, rootForms);
  }
}

const families = c3Source.map((source) => {
  const familyKey = stringValue(source.familyKey);
  const auditRecord = auditByFamily.get(familyKey);
  if (!auditRecord) throw new Error(`Missing audit record for ${familyKey}.`);

  const root = normalizeRoot(stringValue(source.root));
  const firstLocation = strings(source.locations)[0] ?? "";
  const locationText = firstLocation;
  const occurrence = occurrenceLookup.get(`word:${locationText}`);
  const lesson = occurrence?.lesson ?? {};
  const currentType = stringValue(
    lesson.type,
    familyKey.split("|").at(-1) ?? "",
  );
  const analyses = providerAnalyses(auditRecord);
  const currentOccurrence = records(auditRecord.quranicOccurrences)[0];
  const currentForm = stringValue(source.currentQuranicForm);
  const currentMeaning = stringValue(currentOccurrence?.meaning, stringValue(lesson.meaning));
  const currentSingleRows = Array.isArray(source.currentSingleRow)
    ? source.currentSingleRow
    : [];
  const currentRow = records(currentSingleRows[0])[0];
  const currentDifference = stringValue(currentRow?.difference);
  const morphology = currentMorphology(currentType, analyses, currentDifference);
  const flags = rootFlags(root, stringValue(source.category));
  const rootConfidence = confidenceForRoot(
    root,
    stringValue(source.category),
    analyses,
  );
  const lemmaConfidence = confidenceForLemma(
    stringValue(source.category),
    analyses,
  );
  const rootForms = [...(formsByRoot.get(root)?.values() ?? [])];
  const potential = rootForms.filter(
    (form) =>
      !form.shellRisk && normalizeArabic(form.form) !== normalizeArabic(currentForm),
  );
  const potentialTypes = uniqueStrings(potential.map((form) => form.morphologyType));
  const semanticRisk = semanticRiskForFamily(
    stringValue(source.category),
    potential.length,
    potentialTypes.length,
  );
  const group = groupFor({
    category: stringValue(source.category),
    root,
    rootConfidence,
    lemmaConfidence,
    currentType,
    analyses,
    flags,
    strongCandidateCount: potential.length,
    candidateTypeCount: potentialTypes.length,
  });
  const predicted = predictedResolvability({
    group,
    rootConfidence,
    lemmaConfidence,
    strongCandidateCount: potential.length,
    candidateTypeCount: potentialTypes.length,
    semanticRisk,
  });
  const currentAnalysis = asRecord(auditRecord.currentAnalysis);

  return {
    familyKey,
    quranicWord: currentForm,
    root,
    lemma: stringValue(source.lemma),
    locations: strings(source.locations),
    occurrenceCount: numberValue(source.occurrenceCount),
    partOfSpeech: uniqueStrings([
      ...analyses.map((analysis) => stringValue(analysis.partOfSpeech)),
      currentType,
    ]),
    currentLessonType: currentType,
    currentRow: {
      arabic: currentForm,
      meaning: currentMeaning,
      difference: currentDifference || "Current one-row lesson; detailed morphology is in the source package/provider evidence.",
    },
    rootConfidence,
    lemmaConfidence,
    morphologyType: morphology,
    morphologicalFlags: flags.labels,
    semanticBranchingMainDifficulty:
      stringValue(source.category) === "SEMANTIC-SPLIT RISK",
    semanticRisk,
    frozenOrModelDependent: familyIsGrammatical(
      stringValue(source.category),
      currentType,
      analyses,
      root,
    ),
    projectRootMeaningAvailable: Boolean(rootMeanings[root]),
    potentialSameRootEvidence: {
      discoverableDistinctForms: rootForms.length,
      strongPotentialCandidateCount: potential.length,
      candidateTypes: potentialTypes,
      examples: potential.slice(0, 12).map((form) => ({
        arabic: form.form,
        meaning: form.meaning,
        morphologyType: form.morphologyType,
        locations: form.sourceLocations,
      })),
      note: "These are existing project same-root signals only. They are research leads, not approved C3 rows; shell, inflection and semantic-branch risks still require independent review.",
    },
    originalLowReason: {
      category: stringValue(source.category),
      classificationComment: stringValue(source.classificationComment),
      whyAutomaticResolutionIsUnsafe: stringValue(
        auditRecord.whyAutomaticResolutionIsUnsafe,
      ),
      currentReasons: uniqueStrings(
        records(auditRecord.quranicOccurrences).map((item) =>
          stringValue(item.currentReason),
        ),
      ),
      evidenceRequired: strings(auditRecord.evidenceRequiredToResolve),
    },
    proposedC3Group: group,
    groupRationale: groupRationale(group),
    predictedResolvability: predicted,
    recommendedPrioritySignals: {
      occurrenceCount: numberValue(source.occurrenceCount),
      rootConfidence,
      lemmaConfidence,
      strongPotentialCandidateCount: potential.length,
      evidenceStrength: predicted,
    },
    c2Touched: Boolean(source.c2),
    c2Decision: source.c2 ? asRecord(source.c2).decision : null,
    sourceRecord: {
      category: stringValue(source.category),
      resolvability: stringValue(source.resolvability),
      exactEvidenceNeeded: strings(source.exactEvidenceNeeded),
      providerAnalyses: analyses,
      currentAnalysisNote: stringValue(currentAnalysis.note),
    },
  };
});

function semanticRiskForFamily(
  category: string,
  strongCandidateCount: number,
  candidateTypeCount: number,
) {
  if (category === "FROZEN OR GRAMMATICAL FORM") return "NOT APPLICABLE";
  if (category === "ROOT OR LEMMA UNCERTAIN") return "HIGH";
  if (category === "SEMANTIC-SPLIT RISK") {
    if (strongCandidateCount >= 3 && candidateTypeCount >= 2) return "MEDIUM";
    return "HIGH";
  }
  return strongCandidateCount >= 2 ? "MEDIUM" : "LOW";
}

const familyKeys = families.map((family) => family.familyKey);
if (new Set(familyKeys).size !== 335)
  throw new Error("C3 LOW classification contains duplicate family keys.");
if (families.some((family) => family.c2Touched))
  throw new Error("C3 LOW classification unexpectedly contains a C2 family.");

const groupOrder: C3Group[] = ["C3-A", "C3-B", "C3-C", "C3-D", "C3-E"];
const groupBatchSizes: Record<C3Group, number> = {
  "C3-A": 25,
  "C3-B": 25,
  "C3-C": 15,
  "C3-D": 20,
  "C3-E": 10,
};

const sortedFamilies = [...families].sort((left, right) => {
  const groupDifference =
    groupOrder.indexOf(left.proposedC3Group) -
    groupOrder.indexOf(right.proposedC3Group);
  if (groupDifference) return groupDifference;
  const resolutionDifference =
    ["HIGH", "MEDIUM", "LOW"].indexOf(left.predictedResolvability) -
    ["HIGH", "MEDIUM", "LOW"].indexOf(right.predictedResolvability);
  if (resolutionDifference) return resolutionDifference;
  const occurrenceDifference = right.occurrenceCount - left.occurrenceCount;
  if (occurrenceDifference) return occurrenceDifference;
  const candidateDifference =
    right.potentialSameRootEvidence.strongPotentialCandidateCount -
    left.potentialSameRootEvidence.strongPotentialCandidateCount;
  if (candidateDifference) return candidateDifference;
  return left.familyKey.localeCompare(right.familyKey);
});

const rankedFamilies = sortedFamilies.map((family, index) => {
  const groupMembers = sortedFamilies.filter(
    (item) => item.proposedC3Group === family.proposedC3Group,
  );
  const groupRank = groupMembers.findIndex(
    (item) => item.familyKey === family.familyKey,
  );
  return {
    ...family,
    overallRank: index + 1,
    groupRank: groupRank + 1,
    recommendedBatchSize: groupBatchSizes[family.proposedC3Group],
    recommendedBatch:
      Math.floor(groupRank / groupBatchSizes[family.proposedC3Group]) + 1,
  };
});

const groupCounts = Object.fromEntries(
  groupOrder.map((group) => [
    group,
    rankedFamilies.filter((family) => family.proposedC3Group === group).length,
  ]),
);
const groupOccurrences = Object.fromEntries(
  groupOrder.map((group) => [
    group,
    rankedFamilies
      .filter((family) => family.proposedC3Group === group)
      .reduce((sum, family) => sum + family.occurrenceCount, 0),
  ]),
);
const groupResolvability = Object.fromEntries(
  groupOrder.map((group) => [
    group,
    Object.fromEntries(
      (["HIGH", "MEDIUM", "LOW"] as Resolvability[]).map((level) => [
        level,
        rankedFamilies.filter(
          (family) =>
            family.proposedC3Group === group &&
            family.predictedResolvability === level,
        ).length,
      ]),
    ),
  ]),
);

const c2UnresolvedKeys = new Set(
  records(c2Report.adjudications)
    .filter((item) =>
      ["BLOCKED", "MODEL-ISSUE"].includes(stringValue(item.decision)),
    )
    .map((item) => stringValue(item.familyKey)),
);
const c3Keys = new Set(familyKeys);
const earlierResidualRecords = auditRecords.filter(
  (record) =>
    !c3Keys.has(stringValue(record.familyKey)) &&
    !c2UnresolvedKeys.has(stringValue(record.familyKey)),
);
const c3Occurrences = rankedFamilies.reduce(
  (sum, family) => sum + family.occurrenceCount,
  0,
);
const c2UnresolvedOccurrences = records(audit.blockedFamilyReviewRecords)
  .filter((record) => c2UnresolvedKeys.has(stringValue(record.familyKey)))
  .reduce(
    (sum, record) => sum + records(record.quranicOccurrences).length,
    0,
  );
const earlierResidualOccurrences = earlierResidualRecords.reduce(
  (sum, record) => sum + records(record.quranicOccurrences).length,
  0,
);

const batchPlan = groupOrder.map((group, index) => {
  const count = numberValue(groupCounts[group]);
  const batchSize = groupBatchSizes[group];
  return {
    order: index + 1,
    group,
    familyCount: count,
    occurrenceCount: numberValue(groupOccurrences[group]),
    batchSize,
    batches: Math.ceil(count / batchSize),
    selectionRule:
      "Within the group: secure root/lemma first, then occurrence count, then strongest existing same-root evidence; hardest semantic or normalization cases last.",
  };
});

const output = {
  reportType: "tier-c3-low-classification",
  contractVersion: "1.3.9",
  baselineCommit,
  generatedAt: new Date().toISOString(),
  scope: {
    source: "artifacts/content-review/tier-c-classification.json",
    filter: "resolvability === LOW",
    families: 335,
    occurrences: c3Occurrences,
    contentRowsChanged: 0,
    corpusPackagesChanged: 0,
    candidateRowsGenerated: 0,
  },
  methodology: {
    purpose:
      "Classification and execution planning only. No Ṣarf row is authored, changed, upgraded, downgraded or propagated in this phase.",
    candidateEvidence:
      "Potential same-root forms are existing project-authored rows discovered by root; they remain research leads and are not approved candidates.",
    groups: {
      "C3-A": groupRationale("C3-A"),
      "C3-B": groupRationale("C3-B"),
      "C3-C": groupRationale("C3-C"),
      "C3-D": groupRationale("C3-D"),
      "C3-E": groupRationale("C3-E"),
    },
  },
  groupCounts,
  groupOccurrences,
  groupResolvability,
  batchPlan,
  reconciliation: {
    c3Low: { families: 335, occurrences: c3Occurrences },
    c2Unresolved: {
      families: c2UnresolvedKeys.size,
      occurrences: c2UnresolvedOccurrences,
    },
    earlierResiduals: {
      families: earlierResidualRecords.length,
      occurrences: earlierResidualOccurrences,
    },
    totalRemainingFamilies:
      335 + c2UnresolvedKeys.size + earlierResidualRecords.length,
    totalRemainingOccurrences:
      c3Occurrences + c2UnresolvedOccurrences + earlierResidualOccurrences,
    expectedFamilies: 367,
  },
  families: rankedFamilies,
};

fs.writeFileSync(outputJsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

const lines: string[] = [
  "# Tier C3 LOW classification and execution map",
  "",
  `Baseline: \`${baselineCommit}\``,
  "Contract: v1.3.9",
  `Scope: 335 families / ${c3Occurrences} occurrences.`,
  "Content rows changed: **0**. Candidate rows generated: **0**.",
  "",
  "This is a classification-only planning pass. Existing same-root forms are listed as research leads, never as approved C3 rows.",
  "",
  "## Group totals",
  "",
  "| Order | Group | Families | Occurrences | HIGH | MEDIUM | LOW | Batch size | Batches |",
  "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
];
for (const batch of batchPlan) {
  const resolution = asRecord(groupResolvability[batch.group]);
  lines.push(
    `| ${batch.order} | ${batch.group} | ${batch.familyCount} | ${batch.occurrenceCount} | ${numberValue(resolution.HIGH)} | ${numberValue(resolution.MEDIUM)} | ${numberValue(resolution.LOW)} | ${batch.batchSize} | ${batch.batches} |`,
  );
}
lines.push(
  "",
  "## Recommended order",
  "",
  ...batchPlan.map(
    (batch) =>
      `${batch.order}. **${batch.group}** — ${batch.familyCount} families / ${batch.occurrenceCount} occurrences, in batches of ${batch.batchSize}. ${batch.selectionRule}`,
  ),
  "",
  "## Global queue reconciliation",
  "",
  `- C3 LOW: **335 families / ${c3Occurrences} occurrences**`,
  `- C2 unresolved: **${c2UnresolvedKeys.size} families / ${c2UnresolvedOccurrences} occurrences**`,
  `- Earlier residuals: **${earlierResidualRecords.length} families / ${earlierResidualOccurrences} occurrences**`,
  `- Remaining total: **${output.reconciliation.totalRemainingFamilies} families / ${output.reconciliation.totalRemainingOccurrences} occurrences**`,
  "",
  "## Family map",
  "",
);

for (const group of groupOrder) {
  const groupFamilies = rankedFamilies.filter(
    (family) => family.proposedC3Group === group,
  );
  lines.push(`### ${group}`, "", groupRationale(group), "");
  lines.push(
    "| Rank | Qur’anic word | Root | Lemma | Location(s) | Occ. | Root/Lemma confidence | Morphology | Flags | Semantic risk | Potential evidence | Predicted |",
    "| ---: | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |",
  );
  for (const family of groupFamilies) {
    const potential = family.potentialSameRootEvidence;
    const potentialSummary = [
      `${potential.strongPotentialCandidateCount} strong leads`,
      potential.candidateTypes.join(", ") || "none",
      potential.examples
        .slice(0, 3)
        .map((example) => example.arabic)
        .join(" / "),
    ].join("; ");
    lines.push(
      `| ${family.groupRank} | ${markdownEscape(family.quranicWord)}<br>${markdownEscape(family.currentRow.meaning)} | ${markdownEscape(family.root || "—")} | ${markdownEscape(family.lemma || "—")} | ${family.locations.join(", ")} | ${family.occurrenceCount} | ${family.rootConfidence} / ${family.lemmaConfidence} | ${markdownEscape(family.morphologyType.summary)} | ${markdownEscape(family.morphologicalFlags.join(", ") || "regular signal")} | ${family.semanticRisk} | ${markdownEscape(potentialSummary)} | ${family.predictedResolvability} |`,
    );
  }
  lines.push("", "#### Original LOW reason for this group", "");
  const reasons = uniqueStrings(
    groupFamilies.flatMap((family) => [
      family.originalLowReason.classificationComment,
      family.originalLowReason.whyAutomaticResolutionIsUnsafe,
    ]),
  );
  for (const reason of reasons.slice(0, 8)) lines.push(`- ${reason}`);
  lines.push("");
}

fs.writeFileSync(outputMarkdownPath, `${lines.join("\n").trimEnd()}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      outputJsonPath,
      outputMarkdownPath,
      families: output.scope.families,
      occurrences: output.scope.occurrences,
      groupCounts,
      groupOccurrences,
      reconciliation: output.reconciliation,
      rowsChanged: output.scope.contentRowsChanged,
    },
    null,
    2,
  ),
);
