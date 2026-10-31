import type { C3C4BCandidate } from "./tier-c3c4b-specs";

export type C3C4DDecision = "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";
export type C3C4DSpec = {
  canonicalRoot: string;
  weakRadical: "و" | "ي";
  rootEvidence: string;
  initialWeakBehavior: string;
  decision: C3C4DDecision;
  reason: string;
  candidates: C3C4BCandidate[];
  rejectedCandidates: string[];
  normalizationNote?: string;
  unresolvedQuestion?: string;
  evidenceRequired?: string[];
};

const academyRoot = (root: string) =>
  `Cairo Arabic Language Academy root entry: https://www.arabicacademy.gov.eg/ar/search_engine/roots/${encodeURIComponent(root)}.`;

const evidence = (root: string, detail: string) => `${academyRoot(root)} ${detail}`;

const accepted = (
  root: string,
  form: string,
  morphology: string,
  meaning: string,
  relationship: string,
  semanticDevelopment: string,
  pedagogicalValue: string,
  detail: string,
  confidence: "high" | "medium" = "high",
): C3C4BCandidate => ({
  form,
  root,
  morphology,
  meaning,
  relationship,
  semanticDevelopment,
  evidence: evidence(root, detail),
  confidence,
  pedagogicalValue,
  accepted: true,
});

const rejected = (
  root: string,
  form: string,
  morphology: string,
  meaning: string,
  rejectionReason: string,
): C3C4BCandidate => ({
  form,
  root,
  morphology,
  meaning,
  relationship: `Candidate considered for the ${root} family.`,
  semanticDevelopment: "Not accepted into the learner-facing family.",
  evidence: academyRoot(root),
  confidence: "high",
  pedagogicalValue: "Rejected under the no-padding and evidence-first safeguards.",
  accepted: false,
  rejectionReason,
});

const full = (
  canonicalRoot: string,
  weakRadical: "و" | "ي",
  rootEvidence: string,
  initialWeakBehavior: string,
  candidates: C3C4BCandidate[],
  rejectedCandidates: string[],
  normalizationNote?: string,
): C3C4DSpec => ({
  canonicalRoot,
  weakRadical,
  rootEvidence,
  initialWeakBehavior,
  candidates,
  rejectedCandidates,
  decision: "FULL",
  reason:
    "The current Qur’anic form plus four independently attested, morphologically useful same-root forms are established. Initial و/ي behavior is explained honestly; no shell, case, pronoun or trivial inflectional padding is used.",
  ...(normalizationNote ? { normalizationNote } : {}),
});

const a = accepted;
const r = rejected;

export const C3C4D_FAMILY_KEYS = [
  "lexical|وبر|اوبار|noun/pronoun",
  "lexical|وطن|مواطن|noun/pronoun",
  "lexical|وفد|وفد|noun/pronoun",
  "lexical|وفر|موفور|noun/pronoun",
  "lexical|وقذ|موقوذة|noun/pronoun",
  "lexical|وكد|توكيد|noun/pronoun",
  "lexical|يقظ|ايقاظ|noun/pronoun",
  "lexical|ينع|ينع|noun/pronoun",
  "lexical|وصف|وصف|noun/pronoun",
  "lexical|وبق|موبق|noun/pronoun",
  "lexical|يبس|يابس|noun/pronoun",
  "lexical|ورق|ورقة|noun/pronoun",
] as const;

export const C3C4D_SPECS: Record<string, C3C4DSpec> = {
  "lexical|وبر|اوبار|noun/pronoun": full(
    "وبر",
    "و",
    evidence("وبر", "The Academy defines الوَبَر as camel wool/rabbit fur and gives its plural أَوْبَار; it also records وَبِرَ with imperfect يَوْبَرُ and وَبَّرَ with several established lexical meanings."),
    "The initial و is retained in the noun and in the imperfect يَوْبَرُ; the Qur’anic أَوْبَارِهَا is the plural noun with conjunction, genitive and possessive shell preserved only in the current row.",
    [
      a("وبر", "وَبَرٌ", "lexical noun", "wool or fur", "Singular lexical base of the Qur’anic plural أَوْبَار.", "The Qur’anic plural names the material; the singular exposes the lexical base without treating the conjunction or possessive suffix as morphology.", "Makes the current plural noun recognisable.", "The Academy defines الوَبَر as camel wool and rabbit fur and gives أَوْبَار as its plural."),
      a("وبر", "وَبِرَ", "Form-I verb", "became woolly / had much fur", "Basic verb related to the wool/fur noun.", "The material noun develops into the state of being richly covered with it.", "Connects the noun to a real verbal family.", "The Academy defines وَبِرَ and gives يَوْبَرُ as its imperfect."),
      a("وبر", "يَوْبَرُ", "Form-I imperfect verb", "becomes woolly / has much fur", "Imperfect counterpart of وَبِرَ.", "The initial و remains visible in this attested imperfect rather than being generated as a shell variant.", "Shows how the initial weak radical behaves across tense.", "The Academy explicitly writes (يَوْبَر) in the وَبِرَ entry."),
      a("وبر", "وَبَّرَ", "Form-II derived verb", "hid traces / made woolly; also pollinated a palm", "Established Form-II development of the same root.", "The semantic field branches from fur to covering, concealment and related lexical actions; the gloss is not flattened to ‘fur’.", "Shows a genuine derived pattern and honest semantic development.", "The Academy records وَبَّرَ with meanings including making a young ostrich fuzzy, hiding traces and pollinating a palm."),
      r("وبر", "وَبْرٌ", "lexical noun", "hyrax", "Rejected from the selected family because the Academy’s separate animal noun is a weaker learner connection than the attested verb and derived form; it is not needed as padding."),
    ],
    ["وَبْرٌ ‘hyrax’ was investigated but not selected: it is a separate lexical branch and the four accepted rows already teach the material noun and its verbal/derived development.", "Article, conjunction وَ, case ending and possessive ـهَا were not counted."],
  ),

  "lexical|وطن|مواطن|noun/pronoun": full(
    "وطن",
    "و",
    evidence("وطن", "The Academy records وَطَنَ/يَطِنُ for residing, أَوْطَنَ for taking a place as a homeland, and المَوْطِن with plural مَواطِن for a place of residence, assembly or battle."),
    "The initial و is visible in وَطَنَ and the derived forms; the Qur’anic مَوَاطِنَ is the broken plural of مَوْطِن, not a generated shell variant.",
    [
      a("وطن", "مَوْطِنٌ", "place noun", "place of residence; location", "Singular lexical base of مَوَاطِنَ.", "The Qur’anic plural ‘regions/places’ is linked to the established singular place noun.", "Explains the plural’s lexical base.", "The Academy defines المَوْطِن as الوطن, a place where a person resides, an assembly and a scene of battle, and gives مَواطِن as its plural."),
      a("وطن", "وَطَنَ", "Form-I perfect verb", "resided in / stayed at", "Basic verb underlying the residence noun family.", "The place noun develops into the act of inhabiting or staying in a place.", "Connects the Qur’anic noun to a clear root action.", "The Academy defines وَطَنَ بالمكان as أقام به."),
      a("وطن", "يَطِنُ", "Form-I imperfect verb", "resides / stays", "Imperfect counterpart of وَطَنَ.", "The initial و is retained in the attested imperfect; this is a tense contrast, not a fabricated weak-root form.", "Shows the initial radical across the verb paradigm.", "The Academy explicitly gives يَطِنُ in the وَطَنَ entry."),
      a("وطن", "أَوْطَنَ", "Form-IV derived verb", "made a place a homeland / settled in it", "Causative/derived form of the same root.", "The meaning develops from residing to establishing or adopting a place as a homeland.", "Shows a useful derived pattern and semantic development.", "The Academy defines أَوْطَنَ المكانَ and البلدَ as making it a homeland or taking it as one."),
      r("وطن", "مُواطَنَةٌ", "Form-III verbal noun", "citizenship / living together in one homeland", "Rejected from this Qur’anic lesson because the Academy’s definition is a modern civic term and the selected family already supplies stronger classical/Qur’anic recognition contrasts."),
    ],
    ["مُواطَنَةٌ was investigated but not selected: although same-root and attested, its modern civic sense is less directly useful here than the classical place/verb family.", "Case and plural morphology in مَوَاطِنَ were not duplicated beyond the singular lexical base."],
  ),

  "lexical|وفد|وفد|noun/pronoun": full(
    "وفد",
    "و",
    evidence("وفد", "The Academy defines وَفَدَ/يَفِدُ as arriving and coming as a messenger, gives وَفْد and وُفُود, and records أَوْفَدَ as sending a representative or delegation."),
    "The initial و is preserved in the basic verb and noun forms; the Qur’anic وَفْدًا is itself the delegation noun with only case marking.",
    [
      a("وفد", "وَفَدَ", "Form-I perfect verb", "arrived / came as a delegate", "Basic verbal source of the delegation noun.", "The Qur’anic noun names the group; the verb names their arrival or representation.", "Makes the noun’s verbal basis clear.", "The Academy defines وَفَدَ as قَدِمَ and as coming as a messenger."),
      a("وفد", "يَفِدُ", "Form-I imperfect verb", "arrives / comes as a delegate", "Imperfect counterpart of وَفَدَ.", "The initial و remains in the attested imperfect and gives a useful tense contrast.", "Shows the root in present/imperfect use.", "The Academy explicitly gives يَفِدُ in the وَفَدَ entry."),
      a("وفد", "وَافِدٌ", "Form-I active participle", "one who arrives / a delegate", "Active participle of the same arrival/representation branch.", "The group noun becomes the individual participant or representative.", "Provides a person-oriented recognition form.", "The Academy says فهو وافِدٌ and defines الوافد as one temporarily residing away from home and related arriving forms."),
      a("وفد", "أَوْفَدَ", "Form-IV derived verb", "sent / delegated", "Derived causative/commissioning form of the same root.", "The direction changes from arriving as a delegation to sending a representative.", "Shows a valuable participant-role contrast.", "The Academy defines أَوْفَدَ فلانًا as sent him and says أَوْفَدَ شخصًا يمثله."),
      r("وفد", "وُفُودٌ", "broken plural noun", "delegations / arrivals", "Rejected because it is a close plural counterpart of the current delegation noun and adds less morphological teaching than the attested derived verb أَوْفَدَ."),
    ],
    ["وُفُودٌ was investigated but not selected: it is a useful plural, but the selected four rows provide greater verb/participle/derived-form diversity.", "Accusative ending in وَفْدًا was not counted."],
  ),

  "lexical|وفر|موفور|noun/pronoun": full(
    "وفر",
    "و",
    evidence("وفر", "The Academy defines وَفَرَ/يَفِرُ as becoming abundant, gives وَفْرٌ and وافِرٌ, records وَفَّرَ and تَوَفَّرَ, and defines المَوْفُور as complete and undiminished."),
    "The initial و is retained in the Form-I verb and nominal family. The Qur’anic مَّوْفُورًا is a result/passive adjective meaning complete or ample, not a case variant of وافِر.",
    [
      a("وفر", "وَفَرَ", "Form-I perfect verb", "became abundant / expanded", "Basic verb underlying the abundance family.", "The Qur’anic result adjective is connected to the state of becoming plentiful.", "Makes the passive/result adjective’s lexical base visible.", "The Academy defines وَفَرَ الشيء as كثُر واتّسع."),
      a("وفر", "يَفِرُ", "Form-I imperfect verb", "becomes abundant / expands", "Imperfect counterpart of وَفَرَ.", "The initial و is retained in the attested imperfect, giving a real tense contrast.", "Shows the initial radical in present/imperfect form.", "The Academy explicitly gives يَفِرُ in the وَفَرَ entry."),
      a("وفر", "وَفْرٌ", "lexical noun", "abundance / completeness", "Abstract noun of the same abundance branch.", "The result adjective becomes a stable abstract noun meaning abundance or fullness.", "Adds a clear noun pattern without mere inflection.", "The Academy defines الوَفْر as wealth, fullness and something ample."),
      a("وفر", "وَفَّرَ", "Form-II derived verb", "made plentiful / supplied fully", "Derived causative/intensive form of the same root.", "The meaning develops from being abundant to actively increasing or fully supplying something.", "Teaches the causative relationship directly.", "The Academy defines وَفَّرَ الشيءَ as كثّره and gives related complete/safeguard meanings."),
      r("وفر", "وَافِرٌ", "active adjective", "abundant / plentiful", "Rejected as the fifth row because it is a near-adjectival counterpart to the current مَوْفُورٌ; the selected verb, imperfect, noun and derived verb teach more distinct morphology."),
    ],
    ["وَافِرٌ was investigated but not selected: it is genuine, but too close to the current result adjective for the fifth slot; no form was rejected as unattested.", "Accusative ending and the prefixed assimilation in مَّوْفُورًا were not counted."],
  ),

  "lexical|وقذ|موقوذة|noun/pronoun": full(
    "وقذ",
    "و",
    evidence("وقذ", "The Academy defines وَقَذَ/يَقِذُ as striking someone until weakened or near death, gives وَقْذًا, أَوْقَذَ, and the passive noun المَوْقُوذةُ used in the Qur’anic sense."),
    "The initial و is retained in وَقَذَ, while the passive participle mīm-prefix marks the result of the action. The Qur’anic وَٱلْمَوْقُوذَةُ keeps conjunction and article only in the current occurrence row.",
    [
      a("وقذ", "وَقَذَ", "Form-I perfect verb", "struck someone fatally / weakened him", "Basic verb underlying the passive Qur’anic noun.", "The Qur’anic form presents the animal as the one struck; the verb presents the act.", "Makes the passive relationship explicit.", "The Academy defines وَقَذَ as striking until the person is weakened or near death, and as knocking down or leaving ill."),
      a("وقذ", "يَقِذُ", "Form-I imperfect verb", "strikes / weakens", "Imperfect counterpart of وَقَذَ.", "The initial و remains in the attested imperfect and supplies a genuine tense contrast.", "Shows the root in an active present form.", "The Academy explicitly gives يَقِذُه in the وَقَذَ entry."),
      a("وقذ", "وَقْذٌ", "verbal noun", "striking / weakening", "Maṣdar of وَقَذَ.", "The action becomes an abstract event noun while retaining the same semantic branch.", "Provides the learner with the action noun behind the passive form.", "The Academy gives وَقْذًا in the وَقَذَ entry."),
      a("وقذ", "أَوْقَذَ", "Form-IV derived verb", "left someone ill / caused lasting weakness", "Derived form from the same root.", "The meaning develops from striking to causing or leaving a person in an injured state.", "Shows a real derived pattern without inventing a passive form.", "The Academy defines أَوْقَذَ as تركه عليلًا."),
      r("وقذ", "مَوْقِذٌ", "place/body-part noun", "a limb or joint struck", "Rejected because it is a distinct body-part noun and is less useful than the direct verb/maṣdar family for the Qur’anic passive occurrence."),
    ],
    ["مَوْقِذٌ and وَقِيذٌ were investigated; they are attested, but the selected rows give a cleaner active/action/derived relationship to المَوْقُوذة.", "Conjunction وَ and article ال were not counted."],
  ),

  "lexical|وكد|توكيد|noun/pronoun": full(
    "وكد",
    "و",
    evidence("وكد", "The Academy defines وَكَدَ/يَكِدُ for fastening, strengthening and pursuing, أَوْكَدَ for strengthening or confirming, وَكَّدَ as the Form-II counterpart, تَوَكَّدَ as becoming firm, and التوكيد as confirmation/emphasis."),
    "The initial و is retained in the attested Form-I verb; the Qur’anic تَوْكِيدِهَا is the Form-II verbal noun with possessive and case shell excluded from the comparison rows.",
    [
      a("وكد", "وَكَدَ", "Form-I perfect verb", "fastened / strengthened / pursued", "Basic verb in the firmness and fastening branch.", "The Qur’anic verbal noun names confirmation; the basic verb shows fastening or making firm.", "Connects the derived verbal noun to its root action.", "The Academy defines وَكَدَ for fastening a saddle, strengthening a contract and pursuing an aim."),
      a("وكد", "يَكِدُ", "Form-I imperfect verb", "fastens / strengthens / pursues", "Imperfect counterpart of وَكَدَ.", "The initial و is retained in the attested imperfect, giving a useful tense contrast.", "Makes the initial radical visible in the basic paradigm.", "The Academy explicitly gives يَكِدُ in the وَكَدَ entry."),
      a("وكد", "أَوْكَدَ", "Form-IV derived verb", "strengthened / confirmed", "Derived form of the same root.", "The meaning develops from fastening or making firm to explicitly confirming or strengthening an agreement.", "Shows a clear derived pattern linked to the Qur’anic noun.", "The Academy defines أَوْكَدَ العهد as أَوْثَقَه and records the confirmation sense."),
      a("وكد", "تَوَكَّدَ", "Form-V derived verb", "became firm / became confirmed", "Reflexive/inchoative derived form of the same root.", "The action of confirming becomes a state of becoming firm or established.", "Adds participant-direction and state change.", "The Academy defines تَوَكَّدَ as اشتدّ وتوثّق."),
      r("وكد", "وَكَّدَ", "Form-II perfect verb", "confirmed / strengthened", "Rejected as a separate row because the current تَوْكِيد is already its verbal noun and the selected rows provide greater morphological variety; the form remains documented as the current family’s source.")
    ],
    ["وَكَّدَ was investigated and retained as the source of the current maṣdar but not duplicated as an extra row; this avoids spending two slots on the same Form-II stem.", "Possessive ـهَا and genitive case were not counted."],
  ),

  "lexical|يقظ|ايقاظ|noun/pronoun": full(
    "يقظ",
    "ي",
    evidence("يقظ", "The Academy defines يَقِظَ with waking and alertness meanings, gives أَيْقَاظ as its plural, and records أَيْقَظَ, تَيَقَّظَ, استيقظَ and اليَقَظَة."),
    "The initial ي is a radical in the lexical root ي ق ظ. The Qur’anic أَيْقَاظًا is the plural adjective ‘awake/alert’; it is not the Form-IV maṣdar أَيْقَاظًا, despite the identical surface spelling in unvocalised text.",
    [
      a("يقظ", "يَقِظَ", "Form-I perfect verb", "woke up / became alert", "Basic verb underlying the awake adjective.", "The Qur’anic plural describes the sleepers as awake; the verb shows becoming awake or attentive.", "Connects the adjective to the basic root action.", "The Academy defines يَقِظَ as waking and becoming attentive or cautious."),
      a("يقظ", "يَيْقَظُ", "Form-I imperfect verb", "wakes up / is alert", "Imperfect counterpart of يَقِظَ.", "The initial ي remains in the attested imperfect; this is not a generated form based only on spelling.", "Shows the first radical across tense.", "The Academy explicitly gives يَيْقَظُ in the يَقِظَ entry."),
      a("يقظ", "يَقْظَةٌ", "lexical verbal noun", "wakefulness / alertness", "Abstract noun from the same waking branch.", "The adjective’s state becomes a noun naming wakefulness or attentiveness.", "Provides a stable nominal recognition form.", "The Academy defines اليَقَظَة as attentiveness from sleep or heedlessness."),
      a("يقظ", "أَيْقَظَ", "Form-IV derived verb", "awakened / alerted", "Causative derived form of the same root.", "The meaning changes from becoming awake to causing someone else to wake or pay attention.", "Teaches the basic causative relationship.", "The Academy defines أَيْقَظَ as warning, stirring or waking someone."),
      r("يقظ", "يَقِظٌ", "adjective singular", "awake / alert", "Rejected as a separate fifth row because it is the singular counterpart of the Qur’anic plural adjective; the selected abstract and derived forms are more useful than number-only padding."),
    ],
    ["يَقِظٌ was investigated but rejected as number-only padding relative to أَيْقَاظًا; the word’s identical unvocalised spelling with the Form-IV maṣdar was explicitly disambiguated by vocalisation and morphology.", "Accusative plural ending was not counted."],
  ),

  "lexical|ينع|ينع|noun/pronoun": full(
    "ينع",
    "ي",
    evidence("ينع", "The Academy defines يَنَعَ with imperfect يَيْنَعُ/يَيْنِعُ, maṣdars يَنْعًا and يُنْعًا, and the adjective يانِعٌ; it also records أَيْنَعَ as a derived form."),
    "The initial ي is a root radical. The Qur’anic وَيَنْعِهِۦٓ is the ripening noun with conjunction, genitive and possessive shell; the root’s weak-initial behavior does not justify treating those shells as Ṣarf rows.",
    [
      a("ينع", "يَنَعَ", "Form-I perfect verb", "ripened / became ready to harvest", "Basic verb underlying the ripening noun.", "The Qur’anic noun names ripeness; the verb names the fruit’s reaching that state.", "Connects the noun to a clear lexical verb.", "The Academy defines يَنَعَ الثمر as reaching ripeness and becoming ready for harvest."),
      a("ينع", "يَيْنَعُ", "Form-I imperfect verb", "ripens / becomes ready to harvest", "Attested imperfect of يَنَعَ.", "The initial ي remains visible in the attested imperfect; the Academy also records the vocalic variant يَيْنِعُ.", "Shows a real tense and vocalisation contrast without inventing a root.", "The Academy gives يَيْنَعُ ويَيْنِعُ in the يَنَعَ entry."),
      a("ينع", "يَانِعٌ", "active participle/adjective", "ripe / mature; deep red", "Established adjective/participle of the same root.", "The ripening action develops into the adjective describing ripe fruit or intense redness.", "Provides the learner with a common adjective pattern.", "The Academy defines اليانِع as ripe fruit and as red/intensely coloured."),
      a("ينع", "أَيْنَعَ", "Form-IV derived verb", "ripened / became mature", "Derived form of the same root.", "The derived verb presents the same maturity branch in another established pattern.", "Shows how the root appears in a derived verb without changing the honest meaning.", "The Academy defines أَيْنَعَ الثمر as يَنَعَ and gives the adjective مُونِعٌ."),
      r("ينع", "يَنْعٌ", "verbal noun", "ripeness", "Rejected as a separate row because the current Qur’anic form is already the noun يَنْع in a genitive/possessive shell; duplicating the bare noun would violate the current-form-first and no-shell-padding rules."),
    ],
    ["يَنْعٌ was investigated but not duplicated: it is the lexical noun underlying the current وَيَنْعِهِۦٓ, so its bare form would only remove conjunction, case and possessive shell.", "The Academy’s alternate imperfect يَيْنِعُ is documented in evidence but not added as a separate row from يَيْنَعُ because the difference is vocalic variant within the same tense/stem."],
  ),

  "lexical|وصف|وصف|noun/pronoun": full(
    "وصف",
    "و",
    evidence("وصف", "The Academy defines وَصَفَ/يَصِفُ for describing and characterising, gives وَصْفًا and صِفَةً, and records واصِفٌ, وَصَّفَ, اتَّصَفَ and تَواصَفَ."),
    "The initial و is retained in وَصَفَ but assimilates in the imperfect يَصِفُ; this is ordinary initial-weak behavior, not a different root. The Qur’anic وَصْفَهُمْ is the verbal noun with conjunction and pronoun shell.",
    [
      a("وصف", "وَصَفَ", "Form-I perfect verb", "described / characterised", "Basic verb underlying the verbal noun وَصْف.", "The Qur’anic noun names their attribution; the verb names the act of describing.", "Makes the root action transparent.", "The Academy defines وَصَفَ الشيء or person as describing it by its qualities."),
      a("وصف", "يَصِفُ", "Form-I imperfect verb", "describes / characterises", "Imperfect counterpart of وَصَفَ.", "The initial و is absent on the surface in the attested imperfect through normal weak-initial assimilation; this is a genuine tense form, not shell removal.", "Demonstrates an important recognition pattern for initial و roots.", "The Academy explicitly gives يَصِفُ in the وَصَفَ entry."),
      a("وصف", "وَاصِفٌ", "Form-I active participle", "one who describes / describer", "Active participle of the same root.", "The action becomes the person or thing performing description.", "Provides a clear participial pattern.", "The Academy states فهو واصِفٌ after defining وَصَفَ."),
      a("وصف", "وَصَّفَ", "Form-II derived verb", "described in detail / specified precisely", "Derived intensive form of the same root.", "The semantic development moves from describing to giving a detailed or technical description.", "Shows a meaningful derived pattern and semantic sharpening.", "The Academy defines وَصَّفَ الشيء as describing it accurately and in detail."),
      r("وصف", "صِفَةٌ", "lexical noun", "quality / attribute", "Rejected as the fifth row because it is an established noun but offers less morphological contrast than the selected perfect, assimilated imperfect, participle and Form-II verb; it remains documented as evidence."),
    ],
    ["صِفَةٌ was investigated but not selected for the fifth slot; it is genuine, but the selected rows better demonstrate initial-w assimilation and derived morphology.", "Conjunction وَ, possessive ـهُمْ and case were not counted."],
  ),

  "lexical|وبق|موبق|noun/pronoun": full(
    "وبق",
    "و",
    evidence("وبق", "The Academy defines وَبَقَ/يَبِقُ as perishing, gives وَبْقًا and مَوْبِقًا, records أَوْبَقَ as destroying or imprisoning, and defines المَوْبِق as a barrier, prison, appointment or means of destruction."),
    "The initial و is retained in the attested Form-I verb and disappears in the imperfect يَبِقُ through ordinary weak-initial behavior. The Qur’anic مَّوْبِقًا is a lexical place/means noun, not a case-only variant.",
    [
      a("وبق", "وَبَقَ", "Form-I perfect verb", "perished / was destroyed", "Basic verb underlying the destructive noun.", "The Qur’anic noun can denote a barrier or means of destruction; the verb gives the root’s underlying perishing branch.", "Makes the semantic development explicit rather than flattening the noun to ‘perish’.", "The Academy defines وَبَقَ as هَلَكَ."),
      a("وبق", "يَبِقُ", "Form-I imperfect verb", "perishes / is destroyed", "Imperfect counterpart of وَبَقَ.", "The initial و is absent in the attested imperfect through normal assimilation; this is a real tense contrast.", "Highlights weak-initial recognition in a rare root.", "The Academy explicitly gives يَبِقُ in the وَبَقَ entry."),
      a("وبق", "وَبْقٌ", "verbal noun", "perishing / destruction", "Maṣdar of وَبَقَ.", "The event of perishing becomes an abstract noun connected to the Qur’anic place/means noun.", "Provides a stable action noun.", "The Academy gives وَبْقًا for the act of perishing."),
      a("وبق", "أَوْبَقَ", "Form-IV derived verb", "destroyed / imprisoned", "Causative derived form of the same root.", "The semantic direction changes from perishing to causing destruction or confinement; the gloss remains independent and honest.", "Shows the causative relationship and the root’s semantic branch.", "The Academy defines أَوْبَقَه as أهلكه and also as حبسه."),
      r("وبق", "وَبِقَ", "Form-I variant verb", "perished / became stuck", "Rejected as a separate row because it is a variant vocalisation of the same basic lexical verb, not a better morphological contrast than the attested derived أَوْبَقَ."),
    ],
    ["وَبِقَ was investigated but not selected: the Academy presents it as a basic lexical variant of وَبَقَ, so adding it would overcount vocalic variation.", "The mīm-prefix is part of the lexical place/means noun; case and initial assimilation were not padded."],
  ),

  "lexical|يبس|يابس|noun/pronoun": full(
    "يبس",
    "ي",
    evidence("يبس", "The Academy defines يَبِسَ for drying after moisture, gives يُبْسًا and يُبُوسةً, the adjective يابِس, and records أَيْبَسَ, يَبَّسَ and تَيَبَّسَ."),
    "The initial ي is a root radical and remains in the attested forms. The Qur’anic يَابِسٍ is an adjective with genitive case; the case ending is not treated as morphology.",
    [
      a("يبس", "يَبِسَ", "Form-I perfect verb", "became dry / dried out", "Basic verb underlying the Qur’anic adjective.", "The adjective describes the dry object; the verb describes its becoming dry.", "Connects the adjective to the basic root action.", "The Academy defines يَبِسَ الشيء as becoming dry after moisture."),
      a("يبس", "يُبْسٌ", "verbal noun", "dryness / dryness after moisture", "Abstract noun of the same root.", "The state expressed by يَابِس becomes a noun naming dryness.", "Provides a clear noun pattern.", "The Academy gives يُبْسًا and يُبُوسةً in the يَبِسَ entry and defines اليَبْس as the dry state."),
      a("يبس", "أَيْبَسَ", "Form-IV derived verb", "dried / made dry and hard", "Causative derived form of the same root.", "The meaning changes from becoming dry to causing something to dry or harden.", "Shows a useful causative pattern.", "The Academy defines أَيْبَسَ الشيءَ as جفّفه وصلّبه."),
      a("يبس", "تَيَبَّسَ", "Form-V derived verb", "dried up / became stiff", "Derived inchoative form of the same root.", "The root develops from simple dryness to a process of drying or stiffening.", "Adds a distinct derived pattern with honest meaning.", "The Academy defines تَيَبَّسَ as اتّبس and as becoming stiff or losing flexibility."),
      r("يبس", "يَبَسٌ", "adjective/noun variant", "dry / dryness", "Rejected as a separate row because it is an established vocalic variant closely overlapping the current يَابِس adjective; the selected verbal and derived forms provide better teaching value."),
    ],
    ["يَبَسٌ was investigated but not selected because it is a close adjective/noun variant of the current lexical branch; it was not treated as unattested.", "Genitive ending in يَابِسٍ was not counted."],
  ),

  "lexical|ورق|ورقة|noun/pronoun": full(
    "ورق",
    "و",
    evidence("ورق", "The Academy defines وَرَقَ/يَرِقُ for a tree producing leaves, gives أَوْرَقَ and وَرَّقَ, and records تَوَرَّقَ for an animal eating leaves; the noun ورقة is the single leaf."),
    "The initial و is retained in the basic verb and disappears in the attested imperfect يَرِقُ through weak-initial assimilation. The Qur’anic وَرَقَةٍ is the singular leaf noun with only case marking.",
    [
      a("ورق", "وَرَقَ", "Form-I perfect verb", "began to produce leaves / became leafy", "Basic verb underlying the leaf noun.", "The Qur’anic noun names one leaf; the verb names the tree’s production or appearance of leaves.", "Connects the concrete noun to a real lexical verb.", "The Academy defines وَرَقَ الشجر as beginning to show or fully producing its leaves."),
      a("ورق", "يَرِقُ", "Form-I imperfect verb", "produces leaves / becomes leafy", "Imperfect counterpart of وَرَقَ.", "The initial و is absent in the attested imperfect through normal assimilation; this is a genuine tense contrast.", "Demonstrates an important initial-weak recognition pattern.", "The Academy explicitly gives يَرِقُ in the وَرَقَ entry."),
      a("ورق", "أَوْرَقَ", "Form-IV derived verb", "became leafy; also prospered or failed to catch", "Derived form of the same root.", "The root develops from leafing to related lexical branches of gain or failure; the learner-facing gloss remains form-specific.", "Shows semantic development without pretending all branches are synonymous.", "The Academy defines أَوْرَقَ الشجر as وَرَقَ and records additional prospering and failing senses."),
      a("ورق", "تَوَرَّقَ", "Form-V derived verb", "ate leaves", "Derived inchoative/medial form of the same root.", "The noun branch develops into an action involving leaves as food.", "Adds a clear derived pattern directly related to the lexical noun.", "The Academy defines تَوَرَّقَ الحيوان as أكل الورق."),
      r("ورق", "وَرَقٌ", "collective noun", "leaves / foliage", "Rejected as the fifth row because it is the collective/base noun for the current singular ورقة; the selected verb and derived forms provide stronger morphology than singular/collective padding."),
    ],
    ["وَرَقٌ was investigated but not selected: it is genuine, but using it beside وَرَقَةٍ would mainly teach collective/singular number; the four selected rows provide more useful morphology.", "Case ending in وَرَقَةٍ was not counted."],
  ),
};
