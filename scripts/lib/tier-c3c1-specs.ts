export type C3C1Decision =
  | "FULL"
  | "CONFIRMED-LIMITED"
  | "BLOCKED"
  | "MODEL-ISSUE";

export type C3C1Candidate = {
  form: string;
  meaning: string;
  morphology: string;
  relationship: string;
  semanticDevelopment: string;
  evidence: string;
  confidence: "high" | "medium";
  pedagogicalValue: string;
  accepted: boolean;
  rejectionReason?: string;
};

export type C3C1FamilySpec = {
  decision: C3C1Decision;
  candidates: C3C1Candidate[];
  reason: string;
  rejectedCandidates: string[];
  unresolvedQuestion?: string;
  evidenceRequired?: string[];
};

const evidence = (root: string) =>
  `Canonical Qur’anic occurrence(s), the project-reviewed root-meaning dictionary for ${root}, aligned Qur’anic morphology evidence, and reliable Arabic morphology knowledge were checked. Provider output was treated as evidence, not as an automatic teaching answer.`;

const accepted = (
  root: string,
  form: string,
  meaning: string,
  morphology: string,
  relationship: string,
  semanticDevelopment: string,
  pedagogicalValue: string,
  confidence: "high" | "medium" = "high",
): C3C1Candidate => ({
  form,
  meaning,
  morphology,
  relationship,
  semanticDevelopment,
  evidence: evidence(root),
  confidence,
  pedagogicalValue,
  accepted: true,
});

const rejected = (
  root: string,
  form: string,
  meaning: string,
  morphology: string,
  rejectionReason: string,
): C3C1Candidate => ({
  form,
  meaning,
  morphology,
  relationship: `Candidate considered for the ${root} family.`,
  semanticDevelopment: "Not accepted into the learner-facing family.",
  evidence: evidence(root),
  confidence: "high",
  pedagogicalValue:
    "Rejected under the no-padding and evidence-first safeguards.",
  accepted: false,
  rejectionReason,
});

const limited = (
  root: string,
  candidates: C3C1Candidate[],
  reason: string,
  rejectedCandidates: string[],
): C3C1FamilySpec => ({
  decision: "CONFIRMED-LIMITED",
  candidates,
  reason,
  rejectedCandidates,
});

const full = (
  root: string,
  candidates: C3C1Candidate[],
  rejectedCandidates: string[],
): C3C1FamilySpec => ({
  decision: "FULL",
  candidates,
  reason: `The ${root} family has four genuinely attested and morphologically useful comparison forms. The current Qur’anic form remains first; no shell-only or case-only variant is used.`,
  rejectedCandidates,
});

const modelIssue = (
  reason: string,
  unresolvedQuestion: string,
  evidenceRequired: string[],
  rejectedCandidates: string[],
): C3C1FamilySpec => ({
  decision: "MODEL-ISSUE",
  candidates: [],
  reason,
  unresolvedQuestion,
  evidenceRequired,
  rejectedCandidates,
});

const e = accepted;
const r = rejected;

export const C3C1_EXCLUDED_MIXED_KEYS = [
  "lexical|أثث|اثاث|noun/pronoun",
  "lexical|ألل|الا|noun/pronoun",
] as const;

export const C3C1_SPECS: Record<string, C3C1FamilySpec> = {
  "lexical|أزز|از|noun/pronoun": full(
    "أ ز ز",
    [
      e(
        "أ ز ز",
        "أَزَّ",
        "he urged / impelled",
        "Form I perfect verb",
        "The basic verb related to the Qur’anic incitement noun.",
        "The noun names the urging; the verb presents the action.",
        "Connects the rare noun to the securely attested verbal branch.",
      ),
      e(
        "أ ز ز",
        "يَؤُزُّ",
        "he urges / incites",
        "Form I imperfect verb",
        "The imperfect counterpart of أَزَّ.",
        "Aspect changes while the incitement sense remains explicit.",
        "Shows the weak/hamzated surface change without using a person-only duplicate.",
      ),
      e(
        "أ ز ز",
        "أَزَازٌ",
        "urging / impelling",
        "Form I verbal noun (maṣdar)",
        "An attested maṣdar related to أَزَّ.",
        "The Qur’anic أَزًّا already names the action; this lexical maṣdar shows the same root in another established noun pattern.",
        "Provides a correctly vocalised maṣdar instead of the incorrect إِزَازٌ.",
      ),
      e(
        "أ ز ز",
        "أَزِيزٌ",
        "roaring / buzzing",
        "Lexical noun",
        "An established semantic branch of the same root.",
        "The meaning develops from urging/impelling to a resonant or buzzing sound; it is translated independently rather than flattened.",
        "Shows an attested same-root semantic branch.",
      ),
      r(
        "أ ز ز",
        "إِزَازٌ",
        "urging / incitement",
        "Incorrectly vocalised maṣdar candidate",
        "Rejected: the reviewed form is أَزَازٌ, not إِزَازٌ.",
      ),
      r(
        "أ ز ز",
        "أَزٌّ",
        "urging / impelling",
        "Form I verbal noun",
        "Rejected as a duplicate maṣdar of the current Qur’anic أَزًّا after removing only case marking.",
      ),
      r(
        "أ ز ز",
        "تَؤُزُّ",
        "it urges / incites",
        "Qur’anic imperfect occurrence",
        "Rejected as a separate row because it is the same imperfect lexeme as يَؤُزُّ with subject marking only; the Qur’anic occurrence is retained as evidence.",
      ),
      r(
        "أ ز ز",
        "مَأْزُوزٌ",
        "urged / impelled",
        "Passive participle",
        "Rejected because it is not needed once the attested maṣdar and semantic-branch noun are selected, and the project evidence does not establish it as a stronger teaching row.",
      ),
    ],
    [
      "The current Qur’anic أَزًّا is already a maṣdar; it was not counted again as أَزٌّ.",
      "إِزَازٌ was rejected as an incorrect vocalisation; the reviewed form is أَزَازٌ.",
      "تَؤُزُّ was rejected as person/subject-marking duplication of the accepted imperfect lexeme.",
      "مَأْزُوزٌ was rejected as weaker than the attested أَزِيزٌ semantic branch.",
    ],
  ),

  "lexical|جذذ|مجذوذ|noun/pronoun": full(
    "ج ذ ذ",
    [
      e(
        "ج ذ ذ",
        "جَذَّ",
        "he cut off / severed",
        "Form I perfect verb",
        "The active action behind the Qur’anic passive participle.",
        "The Qur’anic form presents the severed result; the verb presents the action.",
        "Teaches active versus passive morphology.",
      ),
      e(
        "ج ذ ذ",
        "يَجُذُّ",
        "he cuts off / severs",
        "Form I imperfect verb",
        "The ongoing form of جَذَّ.",
        "The aspect changes without flattening the result/action contrast.",
        "Provides a meaningful perfect–imperfect pair.",
      ),
      e(
        "ج ذ ذ",
        "جَذٌّ",
        "cutting off / severance",
        "Form I verbal noun",
        "The action noun of جَذَّ.",
        "Names the act rather than the actor or affected object.",
        "Shows the maṣdar pattern.",
      ),
      e(
        "ج ذ ذ",
        "جُذَاذٌ",
        "pieces / fragments",
        "Lexical noun",
        "The broken-result noun is attested in the Qur’anic root family.",
        "It names what has been cut into pieces, while مَجْذُوذٌ describes what has been severed.",
        "Connects action, result and participle.",
      ),
      r(
        "ج ذ ذ",
        "مَجْذُوذٌ",
        "severed / cut off",
        "Form I passive participle",
        "This is the same lexical form as the current Qur’anic مَجْذُوذٍ; changing only the case ending is not a new row.",
      ),
    ],
    [
      "مَجْذُوذٌ was rejected as a duplicate of the current passive-participle lexeme, differing only by inflection.",
    ],
  ),

  "lexical|لدد|لد|noun/pronoun": full(
    "ل د د",
    [
      e(
        "ل د د",
        "لَدَّ",
        "he disputed fiercely",
        "Form I perfect verb",
        "The action behind the Qur’anic hostile-disputant adjective/noun.",
        "The Qur’anic form names the hostile disputants; the verb supplies the action.",
        "Connects the noun/adjective branch to the verb.",
      ),
      e(
        "ل د د",
        "يَلُدُّ",
        "he disputes fiercely",
        "Form I imperfect verb",
        "The ongoing counterpart of لَدَّ.",
        "Aspect changes while the dispute sense remains explicit.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ل د د",
        "لَدَدٌ",
        "vehemence in dispute",
        "Form I verbal noun",
        "The abstract noun of the dispute branch.",
        "Names the quality or intensity rather than its participants.",
        "Shows a genuine maṣdar/abstract-noun relationship.",
      ),
      e(
        "ل د د",
        "أَلَدُّ",
        "more / most quarrelsome",
        "Elative adjective",
        "An established adjective from the same root.",
        "The Qur’anic plural hostile form and the elative show a related adjectival development.",
        "Adds an informative adjective pattern rather than a case variant.",
      ),
      r(
        "ل د د",
        "لُدٌّ",
        "hostile disputants",
        "Broken plural/adjectival noun",
        "Rejected because it is the same lexical plural represented by the current لُّدًّا; only case/definiteness changes.",
      ),
    ],
    [
      "لُدٌّ was rejected as the same lexeme as the current Qur’anic plural, not an additional morphological family member.",
    ],
  ),

  "lexical|ندد|انداد|noun/pronoun": full(
    "ن د د",
    [
      e(
        "ن د د",
        "نَدَّ",
        "he fled / strayed away",
        "Form I perfect verb",
        "The basic fleeing/aversion branch of the root.",
        "The Qur’anic plural means equals or rivals; the verb shows the root’s other established branch and is translated independently.",
        "Teaches honest semantic development rather than pretending the branches are synonyms.",
      ),
      e(
        "ن د د",
        "يَنِدُّ",
        "he flees / strays away",
        "Form I imperfect verb",
        "The ongoing form of نَدَّ.",
        "Aspect changes within the fleeing branch.",
        "Provides a useful imperfect contrast.",
      ),
      e(
        "ن د د",
        "نُدُودٌ",
        "fleeing / aversion",
        "Form I verbal noun",
        "The action noun of نَدَّ.",
        "Names the fleeing tendency rather than an equal or rival.",
        "Makes the semantic branch explicit.",
      ),
      e(
        "ن د د",
        "نِدٌّ",
        "an equal / rival",
        "Lexical noun; singular of the Qur’anic broken plural",
        "The singular lexical counterpart of أَندَادًا.",
        "The number contrast is a real broken-plural relationship, not case-only padding.",
        "Helps the learner recognise the Qur’anic plural elsewhere.",
      ),
      r(
        "ن د د",
        "أَنْدَادٌ",
        "equals / rivals",
        "Broken plural without case ending",
        "Rejected because it is the same lexical form as the current Qur’anic أَندَادًا; removing tanwīn is case-only variation.",
      ),
    ],
    [
      "أَنْدَادٌ was rejected as case-only removal of the current surface ending; نِدٌّ is the accepted lexical number contrast.",
    ],
  ),

  "lexical|جبب|جب|noun/pronoun": full(
    "ج ب ب",
    [
      e(
        "ج ب ب",
        "جَبَّ",
        "he cut off / dug out",
        "Form I perfect verb",
        "The active root action associated with cutting or hollowing.",
        "The Qur’anic جُبّ is a well or pit; the relationship is explained as the hollowed/cut space, not as identical English meaning.",
        "Shows semantic development from action to result/place.",
      ),
      e(
        "ج ب ب",
        "يَجُبُّ",
        "he cuts off / digs out",
        "Form I imperfect verb",
        "The ongoing form of جَبَّ.",
        "Aspect changes within the same lexical branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ج ب ب",
        "جَبٌّ",
        "cutting off / hollowing",
        "Form I verbal noun",
        "The action noun of جَبَّ.",
        "Names the act that produces a hollow or cut space.",
        "Shows the maṣdar pattern.",
      ),
      e(
        "ج ب ب",
        "مَجْبُوبٌ",
        "cut off / amputated",
        "Form I passive participle",
        "The affected-object form of جَبَّ.",
        "The meaning is the severed result, not the well noun; the semantic development is stated honestly.",
        "Adds an active/passive result contrast.",
      ),
      r(
        "ج ب ب",
        "جُبٌّ",
        "a well / pit",
        "Bare noun without case ending",
        "Rejected because it is the same lexical noun as the current Qur’anic جُبِّ; removing the case ending is not a new row.",
      ),
    ],
    [
      "جُبٌّ was rejected as the current lexical noun without its genitive ending.",
    ],
  ),

  "lexical|حطط|حطة|noun/pronoun": full(
    "ح ط ط",
    [
      e(
        "ح ط ط",
        "حَطَّ",
        "he lowered / put down",
        "Form I perfect verb",
        "The action behind the lowering/removal root.",
        "The Qur’anic word is a noun of release or removal; the verb names the lowering action.",
        "Shows the action behind the special noun.",
      ),
      e(
        "ح ط ط",
        "يَحُطُّ",
        "he lowers / puts down",
        "Form I imperfect verb",
        "The ongoing form of حَطَّ.",
        "Aspect changes within the same root branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ح ط ط",
        "حَطٌّ",
        "lowering / putting down",
        "Form I verbal noun",
        "The action noun of حَطَّ.",
        "Names the action rather than the command/relief noun.",
        "Shows a genuine maṣdar.",
      ),
      e(
        "ح ط ط",
        "مَحْطُوطٌ",
        "lowered / put down",
        "Form I passive participle",
        "The affected-object form of حَطَّ.",
        "The passive result is distinguished from the Qur’anic noun חِطّة.",
        "Adds a useful active/passive contrast.",
      ),
      r(
        "ح ط ط",
        "حِطَّةٌ",
        "removal / repentance",
        "Lexical noun",
        "Rejected as a duplicate of the current lexical form; an uninflected spelling would not add a new row.",
      ),
    ],
    [
      "The current حِطَّةٌ is retained as the first row; its bare or differently inflected spelling was not counted again.",
    ],
  ),

  "lexical|ذبب|ذباب|noun/pronoun": full(
    "ذ ب ب",
    [
      e(
        "ذ ب ب",
        "ذَبَّ",
        "he drove away / repelled",
        "Form I perfect verb",
        "The basic action associated with the root’s driving-away range.",
        "The Qur’anic noun names a fly; the connection is a lexical/root development and is not presented as identical meaning.",
        "Makes the project root picture visible without flattening the noun’s meaning.",
      ),
      e(
        "ذ ب ب",
        "يَذُبُّ",
        "he drives away / repels",
        "Form I imperfect verb",
        "The ongoing form of ذَبَّ.",
        "Aspect changes within the verbal branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ذ ب ب",
        "ذَبٌّ",
        "driving away / repelling",
        "Form I verbal noun",
        "The action noun of ذَبَّ.",
        "Names the action rather than the insect.",
        "Shows the maṣdar relation.",
      ),
      e(
        "ذ ب ب",
        "ذَابٌّ",
        "one who repels / drives away",
        "Form I active participle",
        "The agent form of ذَبَّ.",
        "The Qur’anic noun names the fly; this form names the one performing the repelling action.",
        "Adds a genuine agent relationship instead of padding.",
      ),
      r(
        "ذ ب ب",
        "ذَبَّابٌ",
        "one who repeatedly repels / a fly",
        "Intensive noun/adjective",
        "Rejected because its attested senses overlap the current fly noun or add no clearer contrast than the active participle ذَابٌّ.",
      ),
      r(
        "ذ ب ب",
        "مَذْبُوبٌ",
        "repelled",
        "Form I passive participle",
        "Rejected as a generated passive candidate without adequate project attestation for this lesson.",
      ),
    ],
    [
      "ذَابٌّ is retained because authoritative evidence establishes it as the active participle of the repelling branch.",
      "ذَبَّابٌ was considered but not selected because its senses overlap the current fly noun or are less useful than ذَابٌّ.",
      "مَذْبُوبٌ was rejected as a generated passive candidate without adequate project attestation.",
    ],
  ),

  "lexical|رسس|رس|noun/pronoun": modelIssue(
    "ٱلرَّسِّ is a Qur’anic proper place-name/toponym in these occurrences. The ordinary productive root-family model cannot safely turn the name into a five-row lexical paradigm; doing so would teach conjectural morphology.",
    "Should the project represent the place-name as a dedicated proper-name lesson with historical/lexical notes rather than a normal Ṣarf family?",
    [
      "Approved Qur’anic lexicon treatment of الرَّسّ as a proper name.",
      "A dedicated proper-name/model representation that does not imply invented derivation.",
    ],
    [
      "Any verb or maṣdar generated from ر س س was rejected because the proper-name identity is not enough to establish it as the learner’s lexical family.",
      "Case-only variants of ٱلرَّسِّ were rejected.",
    ],
  ),

  "lexical|زجج|زجاجة|noun/pronoun": full(
    "ز ج ج",
    [
      e(
        "ز ج ج",
        "زُجَاجٌ",
        "glass as a material",
        "Lexical material noun",
        "The material noun related to the Qur’anic glass vessel.",
        "The Qur’anic form names one vessel; this form names the substance from which it is made.",
        "Teaches vessel versus material without treating them as synonyms.",
      ),
      e(
        "ز ج ج",
        "زُجَاجِيٌّ",
        "glass / made of glass",
        "Nisbah adjective",
        "An adjective derived from زُجَاجٌ.",
        "The adjective describes material or composition rather than the vessel itself.",
        "Adds a clear noun–adjective relationship.",
      ),
      e(
        "ز ج ج",
        "زَجَّ",
        "he drove / thrust",
        "Form I perfect verb",
        "An established thrusting/spear-related verbal branch of the doubled root.",
        "The meaning develops from glass/vessel vocabulary to thrusting; the verb is translated independently.",
        "Shows genuine same-root semantic development.",
      ),
      e(
        "ز ج ج",
        "زَجَّاجٌ",
        "glassmaker / maker of glass",
        "Occupational/intensive noun",
        "An established occupational noun associated with glass and the root family.",
        "This is an agent/occupation branch, not another spelling of the vessel noun.",
        "Connects material, adjective and occupation while preserving the verbal branch.",
      ),
      r(
        "ز ج ج",
        "يَزُجُّ",
        "he drives / thrusts",
        "Form I imperfect verb",
        "Rejected in favour of the more educational occupational/material contrast; the perfect already establishes the verbal branch and the family must avoid over-weighting conjugational rows.",
      ),
      r(
        "ز ج ج",
        "زَجٌّ",
        "driving / thrusting",
        "Form I verbal noun",
        "Rejected in favour of the material, adjective and occupational derivatives, which broaden recognition more usefully for this noun lesson.",
      ),
    ],
    [
      "The current glass-vessel noun is distinguished from the material noun, nisbah adjective and occupational noun; the thrusting verb is translated as its own semantic branch.",
      "يَزُجُّ and زَجٌّ were not needed after selecting the more informative material/adjective/occupation contrasts.",
    ],
  ),

  "lexical|أدد|اد|noun/pronoun": full(
    "أ د د",
    [
      e(
        "أ د د",
        "أَدَّ",
        "he became severe / caused hardship",
        "Form I perfect verb",
        "An attested verbal branch of the root.",
        "The Qur’anic noun/adjective expresses something grave; the verb presents severity or affliction as an action/state.",
        "Connects the rare Qur’anic item to a real verb without flattening its meaning.",
      ),
      e(
        "أ د د",
        "تَأَدَّدَ",
        "he became severe / firm",
        "Form V perfect verb",
        "A derived verb from the same root.",
        "The derived pattern presents becoming severe or firm rather than the Qur’anic noun itself.",
        "Shows a genuinely different derived pattern.",
      ),
      e(
        "أ د د",
        "أَدَدٌ",
        "severity / might / greatness",
        "Lexical abstract noun",
        "An attested noun related to the root’s force and severity range.",
        "Names the quality or magnitude rather than an event or participant.",
        "Adds an abstract noun contrast.",
      ),
      e(
        "أ د د",
        "أَدِيدٌ",
        "severe / mighty / vehement",
        "Adjective",
        "An established adjective from the same root.",
        "Describes something possessing the root’s severity or force.",
        "Adds a clear adjective relationship.",
      ),
    ],
    [
      "Bare or case-only variants of إِدًّا were rejected; the four accepted forms are genuine lexical or derived contrasts.",
    ],
  ),

  "lexical|جوو|جو|noun/pronoun": limited(
    "ج و و",
    [
      e(
        "ج و و",
        "أَجْوَاءٌ",
        "atmospheres / skies",
        "Broken plural noun",
        "Established plural of جَوّ.",
        "The Qur’anic form is singular/genitive; this is a genuine lexical number contrast, not a case ending.",
        "Helps recognition of the weak doubled root in common plural form.",
      ),
      e(
        "ج و و",
        "جَوِّيٌّ",
        "atmospheric / aerial",
        "Nisbah adjective",
        "An established adjective derived from جَوّ.",
        "The adjective develops the noun’s air/atmosphere meaning honestly.",
        "Adds a useful noun–adjective relation.",
      ),
      r(
        "ج و و",
        "جَوٌّ",
        "air / atmosphere",
        "Bare singular noun",
        "Rejected because it is the same current lexical noun with only the genitive ending removed.",
      ),
      r(
        "ج و و",
        "مَجْوًى",
        "place inside / hollow",
        "Place/result noun",
        "Rejected because the available project evidence does not establish this as the intended same-sense family for the Qur’anic atmosphere noun.",
      ),
    ],
    "The weak doubled root supports a genuine plural and nisbah adjective, but the reviewed evidence does not justify manufacturing a verb paradigm for a noun family whose secure teaching material is limited. The family is confirmed limited.",
    [
      "جَوٌّ was rejected as case-only removal of the current noun.",
      "Unverified verbal/place candidates were rejected rather than used as padding.",
    ],
  ),

  "lexical|حثث|حثيث|noun/pronoun": full(
    "ح ث ث",
    [
      e(
        "ح ث ث",
        "حَثَّ",
        "he urged / encouraged",
        "Form I perfect verb",
        "The basic verb behind the speed/urgency adjective.",
        "The Qur’anic adverb expresses rapid action; the verb expresses urging, the root’s established action branch.",
        "Shows semantic development honestly.",
      ),
      e(
        "ح ث ث",
        "يَحُثُّ",
        "he urges / encourages",
        "Form I imperfect verb",
        "The ongoing form of حَثَّ.",
        "Aspect changes within the same verbal branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ح ث ث",
        "حَثٌّ",
        "urging / encouragement",
        "Form I verbal noun",
        "The action noun of حَثَّ.",
        "Names the act rather than its subject or speed quality.",
        "Shows the maṣdar pattern.",
      ),
      e(
        "ح ث ث",
        "مَحْثُوثٌ",
        "urged / encouraged",
        "Form I passive participle",
        "The affected-object form of حَثَّ.",
        "The passive result is distinct from the Qur’anic adjective/adverb.",
        "Adds an active/passive contrast.",
      ),
      r(
        "ح ث ث",
        "حَثِيثٌ",
        "rapid / urgent",
        "Adjective without case ending",
        "Rejected as the same lexical adjective as the current حَثِيثًا; removing case marking is not a new row.",
      ),
    ],
    [
      "حَثِيثٌ was rejected as the same current adjective with case-only variation.",
    ],
  ),

  "lexical|حنن|حنانا|noun/pronoun": full(
    "ح ن ن",
    [
      e(
        "ح ن ن",
        "حَنَّ",
        "he yearned / longed",
        "Form I perfect verb",
        "The verb behind the tenderness/affection noun.",
        "The Qur’anic noun names affection; the verb describes yearning or compassionate longing.",
        "Shows semantic development without flattening the meanings.",
      ),
      e(
        "ح ن ن",
        "يَحِنُّ",
        "he yearns / longs",
        "Form I imperfect verb",
        "The ongoing form of حَنَّ.",
        "Aspect changes within the same root branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ح ن ن",
        "حَنِينٌ",
        "yearning / longing",
        "Form I verbal noun",
        "The abstract noun of حَنَّ.",
        "Names the emotional state rather than the Qur’anic gift of affection.",
        "Shows a clear maṣdar relationship.",
      ),
      e(
        "ح ن ن",
        "حَنُونٌ",
        "tender / compassionate",
        "Descriptive adjective",
        "An established adjective from the same root.",
        "The adjective expresses the compassionate quality associated with the noun and verb.",
        "Adds a useful noun–adjective relation.",
      ),
      r(
        "ح ن ن",
        "حَنَانٌ",
        "affection / tenderness",
        "Lexical noun without case ending",
        "Rejected as the same lexical noun as the current وَحَنَانًا; removing the conjunction and case ending is shell/case variation.",
      ),
    ],
    [
      "حَنَانٌ was rejected as the same current noun after removing the conjunction and case ending.",
    ],
  ),

  "lexical|ضدد|ضد|noun/pronoun": full(
    "ض د د",
    [
      e(
        "ض د د",
        "ضَادَّ",
        "he opposed / contradicted",
        "Form III perfect verb",
        "The active verb corresponding to the opposition noun.",
        "The Qur’anic noun names an opponent; the verb names the act of opposing.",
        "Shows action versus participant.",
      ),
      e(
        "ض د د",
        "يُضَادُّ",
        "he opposes / contradicts",
        "Form III imperfect verb",
        "The ongoing form of ضَادَّ.",
        "Aspect changes within the derived opposition branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ض د د",
        "مُضَادَّةٌ",
        "opposition / contradiction",
        "Form III verbal noun",
        "The action noun of ضَادَّ.",
        "Names the relation rather than its participant.",
        "Shows the maṣdar pattern.",
      ),
      e(
        "ض د د",
        "مُضَادٌّ",
        "opposing / contradictory",
        "Form III active participle",
        "The agent/adjectival form of ضَادَّ.",
        "The adjective describes the opposing party, while ضِدًّا is the noun for an opponent/counterpart.",
        "Adds a clear derived-pattern contrast.",
      ),
      r(
        "ض د د",
        "أَضْدَادٌ",
        "opponents / counterparts",
        "Broken plural",
        "Rejected because it is a number variant of the same lexical noun and adds no new morphological branch for this lesson.",
      ),
    ],
    [
      "أَضْدَادٌ was rejected as number-only padding; the Form-III verb, maṣdar and participle teach more.",
    ],
  ),

  "lexical|طلل|طل|noun/pronoun": full(
    "ط ل ل",
    [
      e(
        "ط ل ل",
        "طَلَّ",
        "he sprinkled / drizzled",
        "Form I perfect verb",
        "The basic verb associated with the Qur’anic light-rain noun.",
        "The Qur’anic طَلّ is light rain; the verb names the act of sprinkling or drizzling.",
        "Shows the noun–verb relationship.",
      ),
      e(
        "ط ل ل",
        "أَطَلَّ",
        "he appeared / overlooked",
        "Form IV perfect verb",
        "An established derived branch of the same root.",
        "The meaning develops from rain/appearance to appearing or overlooking; it is translated independently.",
        "Shows a distinct derived pattern and semantic branch.",
      ),
      e(
        "ط ل ل",
        "مَطْلُولٌ",
        "moistened by dew / drizzling rain",
        "Passive participle",
        "The affected form of the rain/moistening branch.",
        "Describes what has been touched by dew or drizzle, rather than naming the rain itself.",
        "Adds an active/passive-result relationship.",
      ),
      e(
        "ط ل ل",
        "طَلَلٌ",
        "trace / ruin of a dwelling",
        "Lexical noun",
        "An established same-root noun.",
        "The semantic development reaches the visible trace or remnant left on the ground; it is not translated as drizzle.",
        "Makes the root’s semantic branching explicit.",
      ),
      r(
        "ط ل ل",
        "طَلِيلٌ",
        "moistened / rained upon",
        "Adjectival derivative",
        "Rejected from the five-row set because it is a near-synonymous lexical counterpart of مَطْلُولٌ; the selected set gives a stronger pattern and semantic contrast.",
      ),
    ],
    [
      "طَلِيلٌ was verified as an attested derivative but not selected because it substantially overlaps the selected passive/result form مَطْلُولٌ; طَلَلٌ supplies the more useful distinct lexical branch.",
    ],
  ),

  "lexical|عرر|معتر|noun/pronoun": limited(
    "ع ر ر",
    [
      e(
        "ع ر ر",
        "اِعْتَرَّ",
        "he came as a needy petitioner",
        "Form VIII perfect verb",
        "The verb behind the Qur’anic active participle مُعْتَرّ.",
        "The Qur’anic form names the petitioner; the verb names the act of coming/asking.",
        "Connects the participle to its derived verb.",
      ),
      e(
        "ع ر ر",
        "يَعْتَرُّ",
        "he comes as a needy petitioner",
        "Form VIII imperfect verb",
        "The ongoing form of اِعْتَرَّ.",
        "Aspect changes within the same petitioner branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ع ر ر",
        "اِعْتِرَارٌ",
        "coming as a needy petitioner",
        "Form VIII verbal noun",
        "The action noun of اِعْتَرَّ.",
        "Names the act rather than the person.",
        "Shows the maṣdar pattern.",
      ),
      r(
        "ع ر ر",
        "مُعْتَرٌّ",
        "a needy petitioner",
        "Form VIII active participle without shell",
        "Rejected as the same lexical participle as the current وَٱلْمُعْتَرَّ; removing conjunction/article/case does not add a row.",
      ),
      r(
        "ع ر ر",
        "مَعَرَّةٌ",
        "harm / blame",
        "Feminine noun from a competing semantic branch",
        "Rejected here because the project’s existing evidence treats the harm/blame item as a separate unresolved family; it must not be silently merged.",
      ),
    ],
    "The petitioner branch supports a genuine verb, imperfect and maṣdar, but the apparent harm/blame branch remains separately unresolved and cannot be used as padding. The family is confirmed limited.",
    [
      "مَعَرَّةٌ was rejected as a separately unresolved semantic branch.",
      "The shell-stripped مُعْتَرٌّ was rejected as the current lexical participle.",
    ],
  ),

  "lexical|فظظ|فظ|noun/pronoun": limited(
    "ف ظ ظ",
    [
      e(
        "ف ظ ظ",
        "فَظَاظَةٌ",
        "harshness / rudeness",
        "Abstract noun",
        "The abstract noun related to the Qur’anic adjective فَظّ.",
        "The Qur’anic form describes a person; this form names the quality.",
        "Provides the clearest established noun–quality contrast.",
      ),
      r(
        "ف ظ ظ",
        "فَظٌّ",
        "rude / coarse",
        "Adjective without case ending",
        "Rejected as the same current lexical adjective after removing case marking.",
      ),
      r(
        "ف ظ ظ",
        "أَفَظُّ",
        "more rude / coarser",
        "Elative adjective",
        "Rejected because it is a weak pedagogical addition for this rare adjective and does not improve recognition as much as the established abstract noun.",
      ),
      r(
        "ف ظ ظ",
        "يَفِظُّ",
        "he is rude",
        "Generated verb candidate",
        "Rejected because the project evidence does not establish this as a secure lexical verb for the lesson.",
      ),
    ],
    "فَظّ is a rare adjective with one securely useful abstract noun relation. Additional rows would either repeat the adjective, add low-value degree morphology or rely on an inadequately attested generated verb, so the family is confirmed limited.",
    [
      "Case-only فَظٌّ, weakly useful أَفَظُّ and unverified يَفِظُّ were rejected.",
    ],
  ),

  "lexical|قسس|قسيس|noun/pronoun": modelIssue(
    "قِسِّيسِينَ is a religious title/loanword-like lexical item. Treating قسس as an ordinary productive doubled Arabic root would imply a false verb/maṣdar paradigm; the correct learner treatment needs a loanword/proper-title model.",
    "Should قِسِّيس be represented through a dedicated loanword/title lesson rather than an ordinary root-based Ṣarf family?",
    [
      "Approved Qur’anic lexicon and etymological treatment of قِسِّيس.",
      "A learner-facing loanword/title model that records the form and meaning without invented Arabic derivations.",
    ],
    [
      "Generated قَسَّ/يَقُسُّ and participles were rejected because shared radicals or a provider flag do not establish productive Arabic morphology here.",
    ],
  ),

  "lexical|قطط|قط|noun/pronoun": full(
    "ق ط ط",
    [
      e(
        "ق ط ط",
        "قَطَّ",
        "he cut / divided",
        "Form I perfect verb",
        "The cutting branch associated with the root picture.",
        "The Qur’anic word means a share or allotted portion; the verb shows the cutting/dividing development and is translated independently.",
        "Teaches semantic development honestly.",
      ),
      e(
        "ق ط ط",
        "قَطٌّ",
        "cutting / division",
        "Form I verbal noun",
        "The action noun of قَطَّ.",
        "Names the action rather than the allotted share.",
        "Shows the maṣdar relation.",
      ),
      e(
        "ق ط ط",
        "قَطَّطَ",
        "he cut / shaped into pieces",
        "Form II perfect verb",
        "An attested derived cutting/shaping branch.",
        "The derived form intensifies or causatively develops the cutting action rather than repeating the current share noun.",
        "Shows a distinct derived pattern.",
      ),
      e(
        "ق ط ط",
        "مِقَطٌّ",
        "cutting instrument / pen-cutting surface",
        "Instrument noun",
        "An established instrument noun associated with cutting and trimming.",
        "Names the tool or surface used for the cutting action rather than the share/allotment noun.",
        "Adds an instrument relationship useful for recognition.",
      ),
      r(
        "ق ط ط",
        "يَقُطُّ",
        "he cuts / divides",
        "Form I imperfect verb",
        "Rejected in favour of the derived Form II and instrument contrasts, which teach more than another tense row for this noun lesson.",
      ),
      r(
        "ق ط ط",
        "قِطٌّ",
        "a share / allotted portion",
        "Lexical noun without attached pronoun",
        "Rejected because it is the same lexical noun as قِطَّنَا after removing the attached pronoun; pronoun-only variants are not new Ṣarf rows.",
      ),
      r(
        "ق ط ط",
        "قِطٌّ",
        "a cat",
        "Homonymous noun",
        "Rejected because the animal sense is a separate lexical item and would be misleading in this lesson.",
      ),
    ],
    [
      "The current share/allotment noun is kept distinct from the cat homonym. The four additional rows teach Form I action, maṣdar, Form II derivation and an instrument noun.",
    ],
  ),

  "lexical|هدد|هد|noun/pronoun": full(
    "ه د د",
    [
      e(
        "ه د د",
        "هَدَّ",
        "he demolished / pulled down",
        "Form I perfect verb",
        "The active action behind the devastation noun.",
        "The Qur’anic form names devastation; the verb names the act.",
        "Connects action and result.",
      ),
      e(
        "ه د د",
        "يَهُدُّ",
        "he demolishes / pulls down",
        "Form I imperfect verb",
        "The ongoing form of هَدَّ.",
        "Aspect changes within the same action branch.",
        "Provides a useful tense contrast.",
      ),
      e(
        "ه د د",
        "هَادٌّ",
        "demolishing / destructive",
        "Form I active participle",
        "The agent/quality form of هَدَّ.",
        "Describes the one or thing doing the demolition.",
        "Adds a distinct participial pattern.",
      ),
      e(
        "ه د د",
        "مَهْدُودٌ",
        "demolished / pulled down",
        "Form I passive participle",
        "The affected-object form of هَدَّ.",
        "Shows the passive result rather than the devastation action noun; the doubled-root د is retained in the correct passive form.",
        "Adds a clear active/passive contrast without crossing into root ه د م.",
      ),
      r(
        "ه د د",
        "هَدٌّ",
        "demolition / devastation",
        "Verbal noun without case ending",
        "Rejected because it is the same lexical noun as the current هَدًّا after removing the case ending.",
      ),
    ],
    [
      "مَهْدُومٌ was removed because it belongs to root ه د م, not ه د د. The correct ه د د passive participle is مَهْدُودٌ.",
      "هَدٌّ was rejected as case-only removal of the current verbal noun.",
    ],
  ),
};

export const C3C1_FAMILY_KEYS = Object.keys(C3C1_SPECS);
