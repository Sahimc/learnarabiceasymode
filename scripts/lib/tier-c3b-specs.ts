export type C3BDecision =
  | "FULL"
  | "CONFIRMED-LIMITED"
  | "BLOCKED"
  | "MODEL-ISSUE";

export type C3BCandidate = {
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

export type C3BFamilySpec = {
  decision: C3BDecision;
  candidates: C3BCandidate[];
  reason: string;
  rejectedCandidates: string[];
  unresolvedQuestion?: string;
  evidenceRequired?: string[];
  predictedLowAssessment?: string;
};

const evidence = (root: string) =>
  `Canonical Qur’anic occurrences for ${root}; approved project root/lexical data; aligned Qur’anic morphology evidence; and reliable Arabic morphology knowledge were checked. Provider output was treated as evidence, not as the teaching answer.`;

const candidate = (
  root: string,
  form: string,
  meaning: string,
  morphology: string,
  relationship: string,
  semanticDevelopment: string,
  pedagogicalValue: string,
): C3BCandidate => ({
  form,
  meaning,
  morphology,
  relationship,
  semanticDevelopment,
  evidence: evidence(root),
  confidence: "high",
  pedagogicalValue,
  accepted: true,
});

const rejected = (
  root: string,
  form: string,
  meaning: string,
  morphology: string,
  reason: string,
): C3BCandidate => ({
  form,
  meaning,
  morphology,
  relationship: `Candidate considered for the ${root} root family.`,
  semanticDevelopment: "Not accepted into the learner-facing family.",
  evidence: evidence(root),
  confidence: "high",
  pedagogicalValue: "Rejected under the no-padding safeguard.",
  accepted: false,
  rejectionReason: reason,
});

const full = (
  root: string,
  candidates: C3BCandidate[],
  reasonOrRejected: string | string[],
  rejectedOrPrediction: string[] | string = [],
  predictedLowAssessment?: string,
): C3BFamilySpec => {
  const reason = Array.isArray(reasonOrRejected)
    ? `The ${root} family has four attested, morphologically useful comparison forms. They teach genuine same-root development without shell or inflection padding.`
    : reasonOrRejected;
  const rejectedCandidates = Array.isArray(reasonOrRejected)
    ? reasonOrRejected
    : Array.isArray(rejectedOrPrediction)
      ? rejectedOrPrediction
      : [];
  const prediction = Array.isArray(reasonOrRejected)
    ? typeof rejectedOrPrediction === "string"
      ? rejectedOrPrediction
      : predictedLowAssessment
    : predictedLowAssessment;
  return { decision: "FULL", candidates, reason, rejectedCandidates, predictedLowAssessment: prediction };
};

const limited = (
  root: string,
  candidates: C3BCandidate[],
  reasonOrRejected: string | string[],
  rejectedOrPrediction: string[] | string = [],
  predictedLowAssessment?: string,
): C3BFamilySpec => {
  const reason = Array.isArray(reasonOrRejected)
    ? `The ${root} family is correctly limited because the remaining candidates add only shell, inflection or duplicate conjugation.`
    : reasonOrRejected;
  const rejectedCandidates = Array.isArray(reasonOrRejected)
    ? reasonOrRejected
    : Array.isArray(rejectedOrPrediction)
      ? rejectedOrPrediction
      : [];
  const prediction = Array.isArray(reasonOrRejected)
    ? typeof rejectedOrPrediction === "string"
      ? rejectedOrPrediction
      : predictedLowAssessment
    : predictedLowAssessment;
  return { decision: "CONFIRMED-LIMITED", candidates, reason, rejectedCandidates, predictedLowAssessment: prediction };
};

const e = (root: string, form: string, meaning: string, morphology: string, relationship: string, development: string, value: string) =>
  candidate(root, form, meaning, morphology, relationship, development, value);
const r = (root: string, form: string, meaning: string, morphology: string, reason: string) =>
  rejected(root, form, meaning, morphology, reason);

export const C3B_SPECS: Record<string, C3BFamilySpec> = {
  "lexical|دحر|مدحور|noun/pronoun": full(
    "د ح ر",
    [
      e("د ح ر", "دَحَرَ", "he drove away / expelled", "Form I perfect verb", "The basic action from which the passive Qur’anic participle is formed.", "The Qur’anic word names the expelled result; this is the active driving-away action.", "Contrasts active action with the Qur’anic passive result."),
      e("د ح ر", "يَدْحَرُ", "he drives away / expels", "Form I imperfect verb", "The ongoing form of the same basic action.", "The imperfect presents the action as ongoing rather than completed.", "Teaches the perfect/imperfect contrast without changing the root."),
      e("د ح ر", "دَحْرٌ", "driving away / expulsion", "Form I verbal noun (maṣdar)", "The action noun for دَحَرَ.", "Names the action rather than its agent or recipient.", "Makes the verbal noun pattern visible."),
      e("د ح ر", "دَاحِرٌ", "one who drives away", "Form I active participle", "The agent noun derived from دَحَرَ.", "Moves from the action to its agent; it is not a case variant of the Qur’anic passive participle.", "Adds a useful active/passive semantic contrast."),
      r("د ح ر", "مَدْحُورٌ", "driven away", "Form I passive participle", "Same lexical stem as the current مَّدْحُورًا; the difference is only case/ending and therefore cannot be a separate row."),
    ],
    ["مَدْحُورٌ was rejected because it is the same passive-participle lexeme as the Qur’anic form, differing only in inflectional ending."],
  ),
  "lexical|جهز|جهاز|noun/pronoun": full(
    "ج ه ز",
    [
      e("ج ه ز", "جَهَّزَ", "he prepared / equipped", "Form II perfect verb", "The causative/intensive verb related to جَهَاز supplies or equipment.", "The noun denotes what is prepared or supplied; the verb denotes preparing it.", "Shows noun-to-verb derivation and Form II."),
      e("ج ه ز", "يُجَهِّزُ", "he equips / prepares", "Form II imperfect verb", "The ongoing form of جَهَّزَ.", "The meaning remains the preparation action but shifts from completed to ongoing.", "Teaches tense while keeping a substantive Form II family."),
      e("ج ه ز", "تَجْهِيزٌ", "preparation / equipping", "Form II verbal noun (maṣdar)", "The action noun of جَهَّزَ.", "Names the preparation process rather than the equipment itself.", "Provides a clear maṣdar contrast."),
      e("ج ه ز", "مُجَهَّزٌ", "equipped / prepared", "Form II passive participle", "The prepared result of جَهَّزَ.", "Moves from supplies/equipment to the state of being equipped.", "Adds an active-action/result relationship."),
      r("ج ه ز", "جَهَّزَهُم", "he had furnished them", "Form II perfect with attached pronoun", "The attached pronoun is object inflection, not a new lexical or morphological family member."),
    ],
    ["جَهَّزَهُم was rejected as a pronoun-bearing occurrence of جَهَّزَ; the bare lexical form is used instead."],
  ),
  "lexical|مزق|ممزق|noun/pronoun": full(
    "م ز ق",
    [
      e("م ز ق", "مَزَقَ", "he tore apart", "Form I perfect verb", "The basic tearing action related to the Qur’anic passive Form II result.", "The Qur’anic word presents a state/result; this form presents the basic action.", "Contrasts root action with derived passive result."),
      e("م ز ق", "يَمْزِقُ", "he tears apart", "Form I imperfect verb", "The ongoing form of مَزَقَ.", "The action is viewed as ongoing rather than completed.", "Teaches a real tense contrast."),
      e("م ز ق", "تَمْزِيقٌ", "tearing apart / disintegration", "Form II verbal noun (maṣdar)", "The action noun of the intensive/causative Form II branch.", "The Qur’anic passive participle names a disintegrated result; the maṣdar names the process.", "Makes the Form II maṣdar recognisable."),
      e("م ز ق", "مَزَّقَ", "he tore to pieces / dispersed", "Form II perfect verb", "The active Form II counterpart of مُمَزَّقٍ.", "Form II intensifies or causes the basic tearing action.", "Shows Form I/Form II development."),
      r("م ز ق", "وَمَزَّقْنَاهُمْ", "and We dispersed them", "Form II perfect with conjunction and pronoun", "The conjunction and object pronoun are shell material; the lexical form is مَزَّقَ."),
    ],
    ["وَمَزَّقْنَاهُمْ was rejected as a prefixed and pronoun-bearing occurrence of the accepted lexical form مَزَّقَ."],
  ),
  "lexical|مرح|مرح|noun/pronoun": limited(
    "م ر ح",
    [
      e("م ر ح", "مَرِحَ", "he was exultant / insolent", "Form I perfect verb", "The verb related to the Qur’anic maṣdar مَرَحًا.", "The noun names exultation or insolence; the verb describes the person exhibiting it.", "Connects the occurrence meaning to the verbal source."),
      e("م ر ح", "يَمْرَحُ", "he is exultant / insolent", "Form I imperfect verb", "The ongoing form of مَرِحَ.", "The semantic branch is retained honestly while tense changes.", "Provides a useful tense contrast."),
      e("م ر ح", "مَارِحٌ", "exultant / insolent", "Form I active participle", "The descriptive adjective/agent form of مَرِحَ.", "Describes the person characterised by the state named in مَرَحًا.", "Adds a noun/adjective relationship."),
    ],
    ["مَرَحٌ was rejected as the same maṣdar lexeme as مَرَحًا with only case/ending variation.", "تَمْرَحُونَ was rejected as a person/number variant of the same imperfect verb, not a new teaching contrast."],
  ),
  "lexical|رفق|رفيق|noun/pronoun": full(
    "ر ف ق",
    [
      e("ر ف ق", "رِفْقٌ", "gentleness / kindness", "Form I verbal noun or abstract noun", "An abstract noun in the same root family as رَفِيقًا.", "The Qur’anic word denotes a companion; this branch highlights the root’s gentleness/companionship range.", "Teaches semantic development without pretending the meanings are identical."),
      e("ر ف ق", "يَرْفُقُ", "he is gentle", "Form I imperfect verb", "The basic gentleness verb.", "Moves from a companion/person noun to the quality or action of gentleness.", "Shows the root’s verbal development."),
      e("ر ف ق", "اِرْتَفَقَ", "he benefited / rested", "Form VIII perfect verb", "A derived Form VIII branch attested in the Qur’anic vocabulary.", "The derived branch develops the notion of obtaining benefit or rest; it is translated on its own terms.", "Shows a useful derived pattern."),
      e("ر ف ق", "اِرْتِفَاقٌ", "benefiting / resting", "Form VIII verbal noun (maṣdar)", "The maṣdar of اِرْتَفَقَ.", "Names the benefit/rest branch rather than the companion noun.", "Makes the derived maṣdar recognisable."),
      r("ر ف ق", "ٱلْمَرَافِقِ", "the elbows", "Broken plural noun with article", "This is a different concrete lexical branch and is not needed to teach the رَفِيقًا family."),
    ],
    ["ٱلْمَرَافِقِ was considered but rejected from this five-row family because it introduces a separate anatomical branch without improving recognition of the selected companion/gentleness/rest sequence."],
  ),
  "lexical|جرح|جروح|noun/pronoun": full(
    "ج ر ح",
    [
      e("ج ر ح", "جَرَحَ", "he wounded / committed", "Form I perfect verb", "The basic wounding/acquiring action related to جُرُوح.", "The same root develops from physical wounds to metaphorical acquisition or committing.", "Shows the root’s semantic range honestly."),
      e("ج ر ح", "يَجْرَحُ", "he wounds / commits", "Form I imperfect verb", "The ongoing form of جَرَحَ.", "Keeps the lexical branch while changing aspect.", "Provides a useful tense contrast."),
      e("ج ر ح", "جَارِحٌ", "one who wounds, earns, or hunts", "Form I active participle", "The agent noun from جَرَحَ.", "The agent meaning is translated according to context rather than flattened to wounds.", "Connects the wounds, earning and hunting branches."),
      e("ج ر ح", "اِجْتَرَحَ", "he acquired / committed", "Form VIII perfect verb", "A derived Form VIII branch from the same root.", "This branch develops toward acquiring or committing an act, distinct from the physical wound sense.", "Shows a meaningful derived pattern."),
      r("ج ر ح", "جُرُوحٌ", "wounds", "Plural noun without article", "The current وَٱلْجُرُوحَ already contains this same plural lexeme; removing conjunction/article and changing case is shell variation."),
    ],
    ["جُرُوحٌ was rejected because it is the same plural noun as the Qur’anic word after removing وَالْ and changing inflection."],
  ),
  "lexical|جرح|جوارح|noun/pronoun": full(
    "ج ر ح",
    [
      e("ج ر ح", "جَرَحَ", "he wounded / acquired", "Form I perfect verb", "The basic root action behind the hunting-animal noun.", "The Qur’anic hunting-animal sense is a developed agent/instrument branch of the root.", "Explains the semantic development instead of treating all meanings as synonyms."),
      e("ج ر ح", "يَجْرَحُ", "he wounds / acquires", "Form I imperfect verb", "The ongoing form of جَرَحَ.", "Keeps the same root while changing aspect and retaining the wider lexical range.", "Provides a useful tense contrast."),
      e("ج ر ح", "جَارِحٌ", "one who wounds or hunts", "Form I active participle", "The singular agent form corresponding to ٱلْجَوَارِحِ.", "The hunting-animal sense is made explicit as an agent/creature that hunts.", "Directly supports recognition of the Qur’anic noun."),
      e("ج ر ح", "اِجْتَرَحَ", "he acquired / committed", "Form VIII perfect verb", "A genuine derived branch from the same root.", "The meaning develops toward acquiring or committing rather than hunting.", "Adds a distinct derived pattern."),
      r("ج ر ح", "جُرُوحٌ", "wounds", "Plural noun", "It is a different surface noun but adds little beyond the already represented root branch for this one-occurrence family; the selected agent and derived forms teach more."),
    ],
    ["جُرُوحٌ was considered but rejected for this occurrence because it duplicates the physical-wound branch without adding a stronger recognition contrast than the active participle and Form VIII verb."],
  ),
  "lexical|حصد|حصاد|noun/pronoun": full(
    "ح ص د",
    [
      e("ح ص د", "حَصَدَ", "he reaped / harvested", "Form I perfect verb", "The action from which حَصَاد is derived.", "The Qur’anic noun names the harvest; the verb names the reaping action.", "Connects the harvest noun to its basic verb."),
      e("ح ص د", "يَحْصُدُ", "he reaps / harvests", "Form I imperfect verb", "The ongoing form of حَصَدَ.", "The action is presented as ongoing rather than completed.", "Teaches tense and root recognition."),
      e("ح ص د", "حَصِيدٌ", "harvested crop / clean-mown", "Form I passive/result adjective", "A Qur’anic result noun/adjective from the root.", "The root moves from harvesting to what has been harvested or cut down.", "Shows a useful result-state relationship."),
      e("ح ص د", "حَاصِدٌ", "one who reaps / harvests", "Form I active participle", "The agent noun from حَصَدَ.", "Names the reaper rather than the harvest or action.", "Completes an action/agent/result teaching sequence."),
      r("ح ص د", "حَصَدْتُمْ", "you reap", "Form I perfect with person/number change", "A person/number variant of the same verb; it adds no distinct morphological teaching here."),
    ],
    ["حَصَدْتُمْ and ٱلْحَصِيدِ were rejected as person/number or article/case variants where stronger lexical forms were available."],
  ),
  "lexical|خدع|خادع|noun/pronoun": full(
    "خ د ع",
    [
      e("خ د ع", "خَدَعَ", "he deceived", "Form I perfect verb", "The basic deception verb related to the current Form III active participle.", "The Qur’anic form describes a deceiver; this form presents the basic act.", "Contrasts agent noun and action."),
      e("خ د ع", "يَخْدَعُ", "he deceives", "Form I imperfect verb", "The ongoing basic deception verb.", "Keeps the meaning branch while changing aspect.", "Teaches the imperfect pattern."),
      e("خ د ع", "خَادَعَ", "he dealt deceptively / sought to deceive", "Form III perfect verb", "The derived Form III action underlying the Qur’anic active participle خَادِعُ.", "The reciprocal/attempted deception nuance is translated rather than flattened.", "Shows a derived pattern and semantic development."),
      e("خ د ع", "خِدَاعٌ", "deception", "Form III verbal noun (maṣdar)", "The action noun of خَادَعَ.", "Names the deceptive dealing rather than the person who performs it.", "Provides the maṣdar contrast."),
      r("خ د ع", "يَخْدَعُوكَ", "they deceive you", "Form I imperfect with attached pronoun", "The attached object pronoun is not a new lexical family member."),
    ],
    ["يَخْدَعُوكَ was rejected as pronoun-bearing repetition of يَخْدَعُ; خَادِعٌ was not added separately because the current خَادِعُهُمْ already supplies that active-participle lexeme."],
  ),
  "lexical|سخط|سخط|noun/pronoun": full(
    "س خ ط",
    [
      e("س خ ط", "سَخِطَ", "he was angry / displeased", "Form I perfect verb", "The basic state/action related to سَخَط.", "The Qur’anic noun names wrath/displeasure; the verb describes becoming displeased.", "Connects abstract noun and verb honestly."),
      e("س خ ط", "يَسْخَطُ", "he becomes angry / displeased", "Form I imperfect verb", "The ongoing form of سَخِطَ.", "Keeps the semantic branch while changing aspect.", "Teaches the imperfect pattern."),
      e("س خ ط", "سَاخِطٌ", "angry / displeased", "Form I active participle", "The describing participle from سَخِطَ.", "Names the person in the state of displeasure.", "Adds a useful adjective/participle relationship."),
      e("س خ ط", "مَسْخُوطٌ", "displeased with / rejected", "Form I passive participle", "The passive/result counterpart of the root’s displeasure branch.", "The affected/rejected sense is distinct from the person who is angry.", "Teaches active/passive semantic direction."),
    ],
    ["أَسْخَطَ and person-plural variants were not needed once the basic verb, imperfect, active participle and passive participle supplied stronger contrasts."],
  ),
  "lexical|نسخ|نسخت|noun/pronoun": full(
    "ن س خ",
    [
      e("ن س خ", "نَسَخَ", "he copied / abrogated", "Form I perfect verb", "The basic action related to نُسْخَة.", "The Qur’anic inscription/copy noun is shown alongside the root’s copying and abrogating action.", "Makes the root’s semantic split explicit."),
      e("ن س خ", "يَنْسَخُ", "he copies / abrogates", "Form I imperfect verb", "The ongoing form of نَسَخَ.", "The meaning remains branch-sensitive and is not reduced to one English gloss.", "Teaches tense and semantic range."),
      e("ن س خ", "نَسْخٌ", "copying / abrogation", "Form I verbal noun (maṣdar)", "The action noun of نَسَخَ.", "Names the process rather than the resulting copy.", "Provides the maṣdar pattern."),
      e("ن س خ", "اِسْتَنْسَخَ", "he transcribed / had copied", "Form X perfect verb", "A derived branch meaning to make or obtain a copy/transcription.", "Develops the copying sense into deliberate transcription.", "Adds a distinct derived pattern."),
      r("ن س خ", "نُسْخَةٌ", "a copy", "Noun without attached pronoun", "This is the same lexical noun as the current نُسْخَتِهَا after removing the possessive suffix; it is shell/inflection variation, not a new row."),
    ],
    ["نُسْخَةٌ was rejected because it differs from the Qur’anic noun only by removal of the attached pronoun and inflection."],
  ),
  "lexical|بذر|تبذير|noun/pronoun": full(
    "ب ذ ر",
    [
      e("ب ذ ر", "بَذَرَ", "he sowed / scattered seed", "Form I perfect verb", "The basic sowing action related to the Form II wastefulness branch.", "The root develops from scattering seed to scattering/spending wastefully; the meanings are kept distinct.", "Explains the semantic development clearly."),
      e("ب ذ ر", "يَبْذُرُ", "he sows / scatters seed", "Form I imperfect verb", "The ongoing form of بَذَرَ.", "Retains the concrete sowing branch while changing aspect.", "Teaches the basic imperfect pattern."),
      e("ب ذ ر", "بَذْرٌ", "sowing / seed", "Form I verbal noun or root noun", "The action/material noun of the basic branch.", "Contrasts the seed/sowing branch with Form II wasteful scattering.", "Shows how the root supports related noun meanings."),
      e("ب ذ ر", "مُبَذِّرٌ", "one who squanders", "Form II active participle", "The agent noun of the Form II wasteful-scattering branch.", "Names the person who performs the action expressed by تَبْذِيرًا.", "Connects the occurrence maṣdar to its agent."),
      r("ب ذ ر", "تُبَذِّرْ", "you spend wastefully", "Form II imperfect with person change", "A person/number variant of the current Form II family, not a stronger independent teaching contrast here."),
    ],
    ["تُبَذِّرْ was rejected as conjugational padding; the selected rows instead contrast Form I sowing with Form II wasteful scattering."],
  ),
  "lexical|بذر|مبذرين|noun/pronoun": full(
    "ب ذ ر",
    [
      e("ب ذ ر", "بَذَرَ", "he sowed / scattered seed", "Form I perfect verb", "The basic root action related to the Form II active participle.", "The root develops from scattering seed to wasteful scattering; the distinction is stated honestly.", "Shows the root’s concrete and figurative branches."),
      e("ب ذ ر", "يَبْذُرُ", "he sows / scatters seed", "Form I imperfect verb", "The ongoing form of بَذَرَ.", "Keeps the basic sowing branch while changing aspect.", "Teaches a useful imperfect form."),
      e("ب ذ ر", "بَذْرٌ", "sowing / seed", "Form I verbal noun or root noun", "The root noun of the basic branch.", "Names the seed/sowing material or action rather than the wasteful person.", "Adds a concrete noun contrast."),
      e("ب ذ ر", "تَبْذِيرٌ", "squandering / wasteful scattering", "Form II verbal noun (maṣdar)", "The action noun corresponding to مُبَذِّر.", "Names the wasteful action rather than its agent.", "Makes the Form II maṣdar recognisable."),
      r("ب ذ ر", "مُبَذِّرٌ", "one who squanders", "Form II active participle singular", "The singular is only number variation of the current plural active participle and is not used as a separate row."),
    ],
    ["مُبَذِّرٌ and ٱلْمُبَذِّرِينَ were treated as one active-participle lexeme; the selected family avoids singular/plural duplication."],
  ),
  "lexical|برم|مبرم|noun/pronoun": full(
    "ب ر م",
    [
      e("ب ر م", "بَرَمَ", "he planned / twisted", "Form I perfect verb", "The basic root action related to the Form IV determination branch.", "The Qur’anic form expresses firm determination; the basic root also carries planning/twisting senses.", "Teaches semantic development without flattening it."),
      e("ب ر م", "يَبْرِمُ", "he plans / twists", "Form I imperfect verb", "The ongoing form of بَرَمَ.", "Keeps the basic branch while changing aspect.", "Provides a useful imperfect contrast."),
      e("ب ر م", "إِبْرَامٌ", "firm planning / completion", "Form IV verbal noun (maṣdar)", "The action noun related to أَبْرَمَ and مُبْرِم.", "Names the process of firmly concluding or arranging.", "Adds a clear maṣdar relationship."),
      e("ب ر م", "مُبْرَمٌ", "firmly concluded / arranged", "Form IV passive participle", "The result counterpart of مُبْرِمُونَ.", "Moves from the determining agent to what has been firmly concluded.", "Teaches active/passive Form IV development."),
    ],
    ["أَبْرَمُوا was not used because the perfect occurrence adds person/number and interrogative context, while بَرَمَ, إِبْرَامٌ and مُبْرَمٌ give stronger lexical contrasts."],
  ),
  "lexical|خضع|خاضع|noun/pronoun": limited(
    "خ ض ع",
    [
      e("خ ض ع", "خَضَعَ", "he submitted / humbled himself", "Form I perfect verb", "The basic action related to the Qur’anic active participle.", "The Qur’anic word describes people in a state of humility; the verb describes entering or showing that state.", "Connects adjective/participle and verb."),
      e("خ ض ع", "يَخْضَعُ", "he submits / is humble", "Form I imperfect verb", "The ongoing form of خَضَعَ.", "The semantic meaning is retained while aspect changes.", "Provides a useful tense contrast."),
      e("خ ض ع", "خُضُوعٌ", "submission / humility", "Form I verbal noun (maṣdar)", "The action/state noun of خَضَعَ.", "Names the state rather than its participants.", "Provides the maṣdar pattern."),
      r("خ ض ع", "تَخْضَعْنَ", "be soft / submit", "Form I imperfect/imperative context with feminine plural subject", "This is a person/gender/conjugational variant of the same verb and adds no independent lexical contrast."),
      r("خ ض ع", "خَاضِعٌ", "submissive", "Form I active participle singular", "This is number variation of the current خَاضِعِينَ, not an additional family member."),
    ],
    ["The family is confirmed-limited at four forms: the remaining secure evidence is a participle, perfect, imperfect and maṣdar; the other apparent rows are conjugational or number variants."],
  ),
  "lexical|ستر|مستور|noun/pronoun": full(
    "س ت ر",
    [
      e("س ت ر", "سَتَرَ", "he concealed / covered", "Form I perfect verb", "The active action related to the Qur’anic passive participle.", "The Qur’anic word presents something concealed; this form presents the concealing action.", "Contrasts active action and passive result."),
      e("س ت ر", "يَسْتُرُ", "he conceals / covers", "Form I imperfect verb", "The ongoing form of سَتَرَ.", "Retains the concealment branch while changing aspect.", "Teaches the imperfect pattern."),
      e("س ت ر", "سِتْرٌ", "concealment / covering", "Form I verbal noun or abstract noun", "The action/state noun of the root.", "Names concealment itself rather than the concealed object.", "Adds a distinct noun relationship."),
      e("س ت ر", "اِسْتَتَرَ", "he concealed himself / became hidden", "Form VIII perfect verb", "A derived reflexive branch from the same root.", "The meaning develops from covering something to becoming hidden oneself.", "Shows a genuinely useful derived pattern."),
      r("س ت ر", "مَسْتُورٌ", "concealed", "Form I passive participle without inflection", "Same passive-participle lexeme as the Qur’anic مَّسْتُورًا; only the ending differs."),
    ],
    ["مَسْتُورٌ was rejected as case/ending variation of the current passive participle."],
  ),
  "lexical|نقب|نقيب|noun/pronoun": full(
    "ن ق ب",
    [
      e("ن ق ب", "نَقَبَ", "he pierced / explored", "Form I perfect verb", "The basic action related to the leadership/inspection noun نَقِيب.", "The Qur’anic title develops from the root sense of penetrating, inspecting or investigating.", "Makes the semantic development explicit."),
      e("ن ق ب", "يَنْقُبُ", "he pierces / explores", "Form I imperfect verb", "The ongoing form of نَقَبَ.", "Keeps the same root branch while changing aspect.", "Teaches a useful tense contrast."),
      e("ن ق ب", "نَقْبٌ", "piercing / passage", "Form I verbal noun (maṣdar)", "The action noun of نَقَبَ.", "Names the penetrating or passage action rather than the leader.", "Provides the maṣdar pattern."),
      e("ن ق ب", "نَقَّبَ", "he explored thoroughly", "Form II perfect verb", "The intensive/causative derived form related to exploration.", "Develops basic piercing into repeated or thorough exploration.", "Shows Form I/Form II development."),
      r("ن ق ب", "فَنَقَّبُوا۟", "so they explored", "Form II perfect with conjunction and plural suffix", "The shell and person/number marking are removed; the lexical form نَقَّبَ is used instead."),
    ],
    ["فَنَقَّبُوا۟ was rejected as a prefixed, person/number-bearing occurrence of the accepted lexical form نَقَّبَ."],
  ),
  "lexical|طعن|طعنا|noun/pronoun": full(
    "ط ع ن",
    [
      e("ط ع ن", "طَعَنَ", "he stabbed / criticised", "Form I perfect verb", "The basic action related to the Qur’anic verbal noun.", "The root’s physical stabbing and verbal criticism branches are both stated.", "Teaches semantic development honestly."),
      e("ط ع ن", "يَطْعَنُ", "he stabs / criticises", "Form I imperfect verb", "The ongoing form of طَعَنَ.", "Keeps both attested branches while changing aspect.", "Provides a useful imperfect contrast."),
      e("ط ع ن", "طَاعِنٌ", "one who stabs / criticises", "Form I active participle", "The agent form from طَعَنَ.", "Names the person performing the physical or verbal action.", "Adds an action/agent contrast."),
      e("ط ع ن", "مَطْعُونٌ", "stabbed / criticised", "Form I passive participle", "The passive/result form from طَعَنَ.", "Moves from the agent/action to the affected result.", "Teaches active/passive direction."),
      r("ط ع ن", "وَطَعَنُوا۟", "and they defame", "Form I perfect with conjunction and plural suffix", "The conjunction and person/number marking are shell/conjugation variation; طَعَنَ is the lexical row."),
    ],
    ["وَطَعَنُوا۟ was rejected as a conjunction-bearing plural occurrence of طَعَنَ."],
  ),
  "lexical|عبث|عبث|noun/pronoun": limited(
    "ع ب ث",
    [
      e("ع ب ث", "عَبِثَ", "he acted foolishly / played idly", "Form I perfect verb", "The basic verb related to the Qur’anic maṣdar.", "The occurrence describes purposelessness; the verb describes acting in that manner.", "Connects the maṣdar and verb honestly."),
      e("ع ب ث", "يَعْبَثُ", "he acts foolishly / plays idly", "Form I imperfect verb", "The ongoing form of عَبِثَ.", "Retains the semantic branch while changing aspect.", "Provides a useful tense contrast."),
      e("ع ب ث", "عَابِثٌ", "acting foolishly / playing idly", "Form I active participle", "The descriptive participle from عَبِثَ.", "Describes the actor rather than the purposeless action itself.", "Adds a noun/adjective relationship."),
      r("ع ب ث", "تَعْبَثُونَ", "you amuse yourselves / act foolishly", "Form I imperfect with person/number change", "This is conjugational variation of يَعْبَثُ and is not an independent lexical teaching contrast."),
      r("ع ب ث", "عَبَثٌ", "foolish play", "Same maṣdar without case ending", "This is the same maṣdar lexeme as عَبَثًا, differing only in inflection."),
    ],
    ["The family is confirmed-limited at four forms because the only additional recorded rows are the same maṣdar with a different ending or conjugational variants of the same verb."],
  ),
  "lexical|فتر|فترة|noun/pronoun": full(
    "ف ت ر",
    [
      e("ف ت ر", "فَتَرَ", "he slackened / became less intense", "Form I perfect verb", "The basic verb related to فَتْرَة.", "The interval noun develops from the root idea of slackening or cessation.", "Connects noun and verb meaning."),
      e("ف ت ر", "يَفْتُرُ", "he slackens / becomes less intense", "Form I imperfect verb", "The ongoing form of فَتَرَ.", "Keeps the same semantic branch while changing aspect.", "Provides a useful tense contrast."),
      e("ف ت ر", "فُتُورٌ", "slackening / cessation", "Form I verbal noun (maṣdar)", "The action noun of فَتَرَ.", "Names the process/state from which an interval can be understood.", "Provides the maṣdar pattern."),
      e("ف ت ر", "فَاتِرٌ", "slackening / lukewarm", "Form I active participle/adjective", "The descriptive form from فَتَرَ.", "Describes something marked by reduced intensity rather than the interval itself.", "Adds a useful adjective relationship."),
    ],
    ["يَفْتُرُونَ was not used because it is only a plural conjugation of يَفْتُرُ; the selected rows provide stronger lexical contrasts."],
  ),
  "lexical|هضم|هضم|noun/pronoun": full(
    "ه ض م",
    [
      e("ه ض م", "هَضَمَ", "he digested / diminished", "Form I perfect verb", "The basic action related to هَضْمًا.", "The Qur’anic occurrence uses the diminution/deprivation branch; digestion is another established root sense and is translated honestly.", "Shows semantic development across the root."),
      e("ه ض م", "يَهْضِمُ", "he digests / diminishes", "Form I imperfect verb", "The ongoing form of هَضَمَ.", "Retains both established branches while changing aspect.", "Provides a useful imperfect contrast."),
      e("ه ض م", "هَاضِمٌ", "digesting / diminishing", "Form I active participle", "The agent/process descriptor from هَضَمَ.", "Describes what performs the action rather than naming the deprivation itself.", "Adds an action/agent relationship."),
      e("ه ض م", "هَضِيمٌ", "soft / tender", "Form I adjective", "A lexical adjective in the same root family.", "This established adjective reflects the root’s softening/digestion branch, not the Qur’anic deprivation gloss.", "Shows meaningful same-root semantic development."),
    ],
    ["The candidate list’s generic root-related forms were screened; no case-only or generated derivative was accepted."],
  ),
  "lexical|زفر|زفير|noun/pronoun": full(
    "ز ف ر",
    [
      e("ز ف ر", "زَفَرَ", "he exhaled / roared", "Form I perfect verb", "The basic action related to زَفِيرٌ.", "The Qur’anic noun describes a sound/breath; the verb describes producing it.", "Connects noun and verb while preserving both exhalation and roaring senses."),
      e("ز ف ر", "يَزْفِرُ", "he exhales / roars", "Form I imperfect verb", "The ongoing form of زَفَرَ.", "Retains the established semantic range while changing aspect.", "Provides a useful imperfect contrast."),
      e("ز ف ر", "زَفْرٌ", "exhalation / roaring", "Form I verbal noun (maṣdar)", "The action noun of زَفَرَ.", "Names the act or sound rather than its occurrence as a noun of sound.", "Provides the maṣdar pattern."),
      e("ز ف ر", "زَافِرٌ", "exhaling / roaring", "Form I active participle", "The agent/descriptor from زَفَرَ.", "Describes the one producing the breath or roar.", "Completes a useful noun/verb/agent family."),
    ],
    ["The original LOW prediction was conservative because only three candidate rows were discoverable. Authoritative Form I evidence establishes زَفَرَ as a fourth distinct comparison form, so the prediction was not confirmed."],
    "The original LOW prediction was not confirmed: the missing Form I perfect زَفَرَ is a genuine, attested and pedagogically useful family member, giving five rows without padding.",
  ),
  "lexical|ندم|ندمين|noun/pronoun": full(
    "ن د م",
    [
      e("ن د م", "نَدِمَ", "he regretted", "Form I perfect verb", "The basic verb related to the Qur’anic active participle.", "The Qur’anic form describes the regretful; the verb presents the experience of regretting.", "Connects adjective/participle and verb."),
      e("ن د م", "يَنْدَمُ", "he regrets", "Form I imperfect verb", "The ongoing form of نَدِمَ.", "Keeps the same semantic meaning while changing aspect.", "Provides a useful tense contrast."),
      e("ن د م", "نَدَمٌ", "regret", "Form I verbal noun (maṣdar)", "The action/state noun of نَدِمَ.", "Names the state rather than the person experiencing it.", "Provides the maṣdar pattern."),
      e("ن د م", "نَدَامَةٌ", "regret / remorse", "Lexical abstract noun", "An established abstract noun in the same root family.", "Adds a related remorse noun without pretending it is a different tense of the Qur’anic participle.", "Shows a genuine noun-to-noun relationship."),
      r("ن د م", "نَـٰدِمِينَ", "regretful", "Active participle without article", "This is the same active-participle lexeme as ٱلنَّـٰدِمِينَ after removing the article; it is shell/inflection variation."),
    ],
    ["The original LOW prediction was not confirmed: the secure perfect and imperfect verbs, together with two attested regret nouns, establish a full family without using the article-stripped duplicate."],
    "The original LOW prediction was not confirmed: the candidate scan had undercounted the secure Form I verb paradigm and treated a shell variant as a lead; the corrected family uses four genuine lexical contrasts.",
  ),
};

export const C3B_FAMILY_KEYS = Object.keys(C3B_SPECS);
