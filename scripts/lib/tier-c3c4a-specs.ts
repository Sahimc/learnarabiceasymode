export type C3C4ADecision =
  | "FULL"
  | "CONFIRMED-LIMITED"
  | "BLOCKED"
  | "MODEL-ISSUE";

export type C3C4ACandidate = {
  form: string;
  root: string;
  morphology: string;
  meaning: string;
  relationship: string;
  semanticDevelopment: string;
  evidence: string;
  confidence: "high" | "medium";
  pedagogicalValue: string;
  accepted: boolean;
  rejectionReason?: string;
};

export type C3C4ASpec = {
  canonicalRoot: string;
  weakRadical: "و" | "ي";
  rootEvidence: string;
  normalizationNote?: string;
  decision: C3C4ADecision;
  reason: string;
  candidates: C3C4ACandidate[];
  rejectedCandidates: string[];
  unresolvedQuestion?: string;
  evidenceRequired?: string[];
};

const academyRoot = (root: string) =>
  `Cairo Arabic Language Academy root entry: https://www.arabicacademy.gov.eg/ar/search_engine/roots/${encodeURIComponent(root)}.`;

const accepted = (
  root: string,
  form: string,
  morphology: string,
  meaning: string,
  relationship: string,
  semanticDevelopment: string,
  pedagogicalValue: string,
  evidence: string,
  confidence: "high" | "medium" = "high",
): C3C4ACandidate => ({
  form,
  root,
  morphology,
  meaning,
  relationship,
  semanticDevelopment,
  evidence,
  confidence,
  pedagogicalValue,
  accepted: true,
});

const rejected = (
  root: string,
  form: string,
  morphology: string,
  rejectionReason: string,
): C3C4ACandidate => ({
  form,
  root,
  morphology,
  meaning: "Not accepted",
  relationship: `Candidate considered for the ${root} family.`,
  semanticDevelopment: "Not accepted into the learner-facing family.",
  evidence: academyRoot(root),
  confidence: "high",
  pedagogicalValue: "Rejected under the evidence-first and no-padding safeguards.",
  accepted: false,
  rejectionReason,
});

const full = (
  canonicalRoot: string,
  weakRadical: "و" | "ي",
  rootEvidence: string,
  candidates: C3C4ACandidate[],
  rejectedCandidates: string[],
  normalizationNote?: string,
): C3C4ASpec => ({
  canonicalRoot,
  weakRadical,
  rootEvidence,
  candidates,
  rejectedCandidates,
  decision: "FULL",
  reason:
    "The current Qur’anic form plus four independently attested, morphologically useful same-root forms are established. Weak-final alternation is explained honestly; no shell, case, pronoun or bare-radical padding is used.",
  ...(normalizationNote ? { normalizationNote } : {}),
});

const limited = (
  canonicalRoot: string,
  weakRadical: "و" | "ي",
  rootEvidence: string,
  candidates: C3C4ACandidate[],
  reason: string,
  rejectedCandidates: string[],
  normalizationNote?: string,
): C3C4ASpec => ({
  canonicalRoot,
  weakRadical,
  rootEvidence,
  candidates,
  decision: "CONFIRMED-LIMITED",
  reason,
  rejectedCandidates,
  ...(normalizationNote ? { normalizationNote } : {}),
});

const e = (root: string, detail: string) => `${academyRoot(root)} ${detail}`;
const a = accepted;
const r = rejected;

export const C3C4A_FAMILY_KEYS = [
  "lexical|رخو|رخاء|noun/pronoun",
  "lexical|رهو|رهو|noun/pronoun",
  "lexical|غزو|غزى|noun/pronoun",
  "lexical|فجو|فجوة|noun/pronoun",
  "lexical|قنو|قنوان|noun/pronoun",
  "lexical|لحي|لحيت|noun/pronoun",
  "lexical|معي|امعاء|noun/pronoun",
  "lexical|مكو|مكاء|noun/pronoun",
  "lexical|غلي|غلى|noun/pronoun",
  "lexical|قصو|قصوى|noun/pronoun",
  "lexical|خطو|خطوة|noun/pronoun",
  "lexical|جثو|جثي|noun/pronoun",
] as const;

export const C3C4A_SPECS: Record<string, C3C4ASpec> = {
  "lexical|رخو|رخاء|noun/pronoun": full(
    "رخو",
    "و",
    e("رخو", "The entry attests رَخَا, رَخِيَ, رَخُوَ, أَرْخَى, ارتخَى and the noun الرَّخاء; the Qur’anic adverbial form is the root-family noun/adverb branch."),
    [
      a("رخو", "رَخَا", "Form-I weak-final perfect verb", "became broad, comfortable or abundant", "Basic weak-final verb associated with الرخاء.", "The Qur’anic form expresses gentleness/relaxed motion; the verb names becoming spacious or comfortable.", "Shows the weak-final verb behind the noun/adverb family.", e("رخو", "The Academy defines رَخَا ... رَخاءً and identifies the root.")),
      a("رخو", "رَخِيَ", "Form-I adjective/state verb", "became soft or loose", "A distinct Form-I vocalic pattern in the same root family.", "The meaning narrows from general ease to softness/looseness.", "Makes the root’s semantic range visible without flattening it.", e("رخو", "The Academy defines رَخِيَ ... رَخًا ورَخاءً.")),
      a("رخو", "أَرْخَى", "Form-IV causative verb", "loosened, released or made soft", "Derived causative form of the same weak-final root.", "The form shifts from becoming relaxed to causing something to be loose or released.", "Contrasts intransitive state with causative action.", e("رخو", "The Academy defines أَرْخَى as making something رِخْوًا, releasing or loosening.")),
      a("رخو", "اِرْتَخَى", "Form-VIII derived verb", "became slack or relaxed", "Established derived verb in the same root family.", "The reflexive/derived pattern presents the subject as entering a relaxed or slack state.", "Adds a genuinely different weak-root derived pattern.", e("رخو", "The Academy lists ارتخَى and defines it as becoming رِخْوًا or relaxing.")),
    ],
    ["الرَّخاءُ and الرُّخاءُ are lexical vocalic variants, not separate additional rows.", "Case, article and the current adverbial ending were not counted as morphology."],
  ),

  "lexical|رهو|رهو|noun/pronoun": full(
    "رهو",
    "و",
    e("رهو", "The entry attests رَهَا, أَرْهَى, الرَّهْو, الرَّهْوَة and الرَّهَاء; the Qur’anic رَهْوًا is the still/at-rest branch."),
    [
      a("رهو", "رَهَا", "Form-I weak-final perfect verb", "moved gently, became still or spread its wings", "Basic weak-final verb underlying the رَهْو semantic field.", "The Qur’anic noun/adverb means at rest; the verb shows the state/action from which that field develops.", "Connects the Qur’anic noun to a real weak-final verb.", e("رهو", "The Academy gives رَهَا ... رَهْوًا with meanings including moving gently and becoming still.")),
      a("رهو", "أَرْهَى", "Form-IV derived verb", "quieted, settled or enabled", "Derived causative/relational form in the same root.", "The meaning develops from stillness to causing something to settle or making it possible.", "Teaches a useful derived pattern rather than a case variant.", e("رهو", "The Academy defines أَرْهَى as quieting, settling or enabling.")),
      a("رهو", "رَهْوَةٌ", "lexical feminine noun", "a low place where water collects", "Established noun derivative of الرَّهْو.", "The still/low sense develops into a geographical noun for a depression holding water.", "Shows how the root meaning becomes a concrete place noun.", e("رهو", "The Academy defines الرَّهْوَة as a low place where water collects.")),
      a("رهو", "رَهَاءٌ", "lexical noun/adjective", "a broad, level place", "Established lexical derivative in the same root family.", "The spatial branch develops from stillness/levelness to a wide level place.", "Adds a distinct noun branch with an honest meaning.", e("رهو", "The Academy defines الرَّهَاء as a broad level place.")),
    ],
    ["الرَّهْوُ is the same lexical noun as the current form, so article/case changes were not counted.", "رِهاءٌ is the plural of رَهْو/رَهْوَة and was not used as a padding row after the stronger derivations were selected."],
  ),

  "lexical|غزو|غزى|noun/pronoun": full(
    "غزو",
    "و",
    e("غزو", "The entry attests غَزَا, أَغْزَى, غَزَّى, اغْتَزَى, الغَزْو, الغَزْوَة and المَغْزَى, and explicitly lists غُزًّى as a plural."),
    [
      a("غزو", "غَزَا", "Form-I weak-final perfect verb", "raided or went out to fight", "Basic verb whose active-participant plural includes غُزًّى.", "The Qur’anic plural names those engaged in fighting; the verb names the action.", "Anchors the current plural in the real Form-I verb.", e("غزو", "The Academy defines غَزَا as going to fight/raid and lists غُزًّى among its plurals.")),
      a("غزو", "غَزْوٌ", "Form-I maṣdar", "warfare or raiding", "Verbal noun of غَزَا.", "Moves from the fighters/action participants to the action itself.", "Provides the core verbal noun for recognition across the root family.", e("غزو", "The Academy defines الغَزْو as armed attempted control/warfare.")),
      a("غزو", "غَزْوَةٌ", "lexical event noun", "a raid or campaign", "Established single-campaign noun from the same root.", "The general action غَزْو becomes one concrete campaign.", "Adds a useful event-noun contrast without relying on number alone.", e("غزو", "The Academy defines الغَزْوَة as one occurrence of غزو/a campaign.")),
      a("غزو", "مَغْزًى", "lexical place/goal noun", "aim, purpose or objective", "Established derivative under the same root.", "The root develops from going out/aiming at an enemy to the aim or purpose of an act or statement.", "Demonstrates honest semantic development beyond the warfare branch.", e("غزو", "The Academy defines المَغْزَى as a place of raiding, objective, aim or meaning.")),
    ],
    ["غَازٍ was not needed as an additional row: it is the singular active participle corresponding to the current plural and would add less teaching value than the event and goal nouns.", "Case and plural spelling variants were not counted separately."],
  ),

  "lexical|فجو|فجوة|noun/pronoun": full(
    "فجو",
    "و",
    e("فجو", "The entry groups فَجَا, فَجِيَ, أَفْجَى, فَجَّى and تَفَاجَى with الفَجْوَة and الفَجْوَاء."),
    [
      a("فجو", "فَجَا", "Form-I weak-final perfect verb", "became open or spacious", "Basic weak-final verb behind the open-space noun.", "The Qur’anic noun names the opening; the verb names becoming open.", "Makes the noun-to-state relation recognisable.", e("فجو", "The Academy lists فَجَا and the noun الفَجْوَة under فجو.")),
      a("فجو", "فَجِيَ", "Form-I state verb", "became wide or open", "A distinct vocalic Form-I state verb in the same root.", "It presents openness as a developed state rather than the concrete space itself.", "Shows weak-final vocalic variation with a different lexical function.", e("فجو", "The Academy lists فَجِيَ in the same root family.")),
      a("فجو", "أَفْجَى", "Form-IV derived verb", "made more open or spacious", "Causative/derived form of the same root.", "Changes from becoming open to causing or making something open.", "Contrasts state and causation.", e("فجو", "The Academy lists أَفْجَى in the فجو family.")),
      a("فجو", "تَفَاجَى", "Form-VI derived verb", "opened apart or separated", "Established derived form in the same weak-final family.", "The opening develops into reciprocal/separating movement.", "Provides a distinct derived pattern and semantic branch.", e("فجو", "The Academy lists تَفَاجَى in the فجو family.")),
    ],
    ["فَجْوَاءُ was considered but not selected after four stronger verb-pattern contrasts were established.", "The article and case ending in الفَجْوَةِ were not counted."],
  ),

  "lexical|قنو|قنوان|noun/pronoun": full(
    "قنو",
    "و",
    e("قنو", "The entry explicitly defines القُنْو/القِنْو as a date stalk with its dates and gives قِنْوان as a plural; it also attests قَنَى, قَنِيَ, أَقْنَى, اقْتَنَى and المُقْتَنَى."),
    [
      a("قنو", "قِنْوٌ", "lexical singular noun", "a date cluster or stalk with its dates", "Lexical base corresponding to the Qur’anic broken plural قِنْوَان.", "This is a meaningful singular/plural lexical relationship because it identifies the concrete noun behind the Qur’anic form.", "Helps the learner recognise the unusual broken plural without treating a mere case ending as morphology.", e("قنو", "The Academy defines القُنْو/القِنْو and gives قِنْوان among its plurals.")),
      a("قنو", "قَنَى", "Form-I weak-final verb", "acquired or gathered", "Basic verb in the same root family.", "The date-cluster noun shares the wider root field of acquiring/collecting; the meanings are kept distinct.", "Introduces the lexical semantic development beyond the plant noun.", e("قنو", "The Academy defines قَنَى as acquiring or gathering.")),
      a("قنو", "قَنِيَ", "Form-I state verb", "was content or satisfied", "Attested weak-final Form-I branch under the same root.", "The root develops from acquiring/possessing to being satisfied with what one has.", "Shows a genuine semantic branch without falsely glossing it as dates.", e("قنو", "The Academy defines قَنِيَ as being satisfied/content.")),
      a("قنو", "مُقْتَنًى", "Form-VIII passive participle/noun", "a valuable possession kept", "Derived noun from اقْتَنَى in the same root family.", "The acquisition branch develops into the valued thing that is kept.", "Adds a recognisable derived noun rather than another plural variant.", e("قنو", "The Academy defines المُقْتَنَى as a valuable thing acquired and kept.")),
    ],
    ["قِنْوَةٌ and قِنْيَةٌ were not used as extra rows because they are close noun variants in the acquisition branch and would add less recognition value than the selected forms.", "Plural/case variants beyond the lexical singular قِنْوٌ were rejected as padding."],
  ),

  "lexical|لحي|لحيت|noun/pronoun": full(
    "لحي",
    "ي",
    e("لحو", "The Academy labels the weak-final lexicographic entry لحو and attests لَحَا, لَحَى, أَلْحَى, الْتَحَى, اللِّحاء, اللَّحْي, اللِّحية and المِلْحاة."),
    [
      a("لحي", "لَحْيٌ", "lexical noun", "jawbone or jaw", "A distinct lexical noun in the beard/jaw branch.", "The Qur’anic surface is a possessed beard noun; لَحْيٌ names the jaw or jawbone rather than repeating the same possessed form.", "Teaches the lexical distinction between beard and jaw.", e("لحو", "The Academy defines اللَّحْي as the beard-growth area or the jawbones.")),
      a("لحي", "اِلْتَحَى", "Form-VIII derived verb", "grew a beard or became bearded", "Derived verb from the beard branch.", "Moves from the beard as a noun to acquiring/growing it as an event.", "Provides a clear morphological contrast without simply removing بِـ or ـي.", e("لحو", "The Academy defines الْتَحَى as becoming bearded or growing a beard.")),
      a("لحي", "لِحَاءٌ", "lexical noun", "bark or outer covering", "Established same-root noun in a developed covering branch.", "The root’s covering/jaw semantic development is stated honestly and not collapsed into ‘beard’.", "Shows the root’s wider lexical range.", e("لحو", "The Academy defines اللِّحاء as the bark/outer covering of a thing.")),
      a("لحي", "مِلْحَاةٌ", "instrument noun", "a tool used to strip bark", "Established instrument noun from the bark/peeling branch.", "The covering branch develops into the tool used to remove it.", "Adds an informative instrument pattern.", e("لحو", "The Academy defines المِلْحاة as what is used to peel bark.")),
    ],
    ["لِحْيَةٌ was not added: it is the same lexical noun already present inside the current بِـ...ـي surface, so adding it would be shell/possessive removal rather than a new Ṣarf member.", "The Academy’s root label لحو is recorded as an alternate weak-root normalization; project/Qur’anic provider canonical root لحي is retained and every candidate is mapped to that canonical family."],
    "Academy uses the conventional weak-root label لحو; the project’s aligned Qur’anic data uses لحي. This is a documented normalization difference, not a change of lexical family.",
  ),

  "lexical|معي|امعاء|noun/pronoun": limited(
    "معي",
    "ي",
    e("ماعي", "The Academy defines المَعَى/المِعَى as part of the intestines, with plural أَمْعاء, and labels the entry root ماعي."),
    [
      a("معي", "مَعًى", "lexical singular noun", "an intestine or part of the intestinal tract", "Singular lexical counterpart of the Qur’anic plural أَمْعَاء.", "The current plural is decoded through its real singular noun; no unrelated verb paradigm is claimed.", "Provides the necessary singular/plural lexical recognition.", e("ماعي", "The Academy gives المَعَى/المِعَى and plural أَمْعاء.")),
      r("معي", "مِعًى", "vocalic variant of the same noun", "The Academy records it as a pronunciation variant of المَعَى, not an independent morphological family member.",),
    ],
    "The approved evidence securely establishes the intestinal noun and its singular/plural relationship, but not four additional learner-useful same-root derivations. Treating the Academy label ماعي and the project/Qur’anic root معي as silently identical would be unsafe, so this is confirmed-limited with the normalization difference recorded.",
    ["مِعًى is a vocalic variant of the same lexical noun, not a second independent row.", "The old project root-picture gloss meaning ‘being with someone’ is unrelated to this occurrence and was corrected to ‘intestine · intestinal tract’.", "Generated verbs or participles were rejected because the approved evidence does not establish them for this lexical branch."],
    "Academy labels this lexical entry ماعي; project/Qur’anic provider data uses معي. The project root key is retained for aligned occurrence data, while the root meaning is corrected to the intestinal lexical branch.",
  ),

  "lexical|مكو|مكاء|noun/pronoun": full(
    "مكو",
    "و",
    e("مكو", "The entry attests مَكا, مَكِيَ, تَمَكَّى, المَكا and المُكّاء, and defines مُكاءً as whistling."),
    [
      a("مكو", "مَكَا", "Form-I weak-final perfect verb", "whistled with his mouth", "Basic verb whose maṣdar is the Qur’anic مُكاء.", "The Qur’anic noun names the act; the verb names the performer of that act.", "Anchors the unusual weak-final masdar in a real verb.", e("مكو", "The Academy defines مَكا ... مُكاءً ومَكْوًا as whistling.")),
      a("مكو", "مَكِيَ", "Form-I state verb", "became sore from work", "Distinct Form-I weak-final branch in the same root entry.", "This branch is semantically different from whistling and is translated separately.", "Demonstrates honest same-root semantic development.", e("مكو", "The Academy defines مَكِيَتْ يَدُه as becoming sore from work.")),
      a("مكو", "تَمَكَّى", "Form-V derived verb", "purified himself; of a horse, became wet with sweat", "Derived form in the same weak-final family.", "The root branches into cleansing and sweating, not another gloss for whistling.", "Adds a genuinely distinct derived pattern.", e("مكو", "The Academy defines تَمَكَّى with purification and horse-sweat senses.")),
      a("مكو", "المَكَا", "lexical noun", "a burrow or resting place of a fox or rabbit", "Established noun in the same root entry.", "The sound/act branch develops into a concrete animal-place noun; the meaning is kept separate.", "Shows a real lexical noun rather than a generated participle.", e("مكو", "The Academy defines المَكا as an animal burrow or resting place.")),
    ],
    ["مَكْوٌ was not selected because it is a second maṣdar alongside the current مُكاءً and would add less contrast.", "المُكّاءُ (the bird) was considered but the selected place noun gave a clearer independent lexical contrast."],
  ),

  "lexical|غلي|غلى|noun/pronoun": full(
    "غلي",
    "ي",
    e("غلي", "The entry attests غَلَى with غَلْيًا and غَلَيَانًا, أَغْلَى, مُغْلًى and الغَلّاية; the Qur’anic form is the maṣdar branch with the preposition كَـ."),
    [
      a("غلي", "غَلَى", "Form-I weak-final perfect verb", "boiled", "Basic verb corresponding to the Qur’anic boiling noun.", "The Qur’anic form names the process; the verb names the event as completed.", "Creates a clear noun/verb contrast.", e("غلي", "The Academy defines غَلَى الماء ... غَلْيًا وغَلَيَانًا.")),
      a("غلي", "غَلَيَانٌ", "Form-I verbal noun", "boiling", "Established second verbal noun of غَلَى.", "It highlights the ongoing/intensive process rather than the short maṣdar غَلْي.", "Provides a useful contrast in the weak-final noun family.", e("غلي", "The Academy explicitly gives غَلَيَانًا alongside غَلْيًا.")),
      a("غلي", "أَغْلَى", "Form-IV causative verb", "caused water or a liquid to boil", "Causative derived form of the same root.", "Changes spontaneous boiling to causing something to boil.", "Teaches a strong voice/valency contrast.", e("غلي", "The Academy defines أَغْلَى as making water boil.")),
      a("غلي", "مُغْلًى", "Form-IV passive participle", "made to boil", "Passive participle of the attested causative verb.", "Names the liquid that has been caused to boil, not the act itself.", "Contrasts causative action with its patient.", e("غلي", "The Academy identifies the object of أَغْلَى as مُغْلًى.")),
    ],
    ["غَلْيٌ was not added because the current كَغَلْيِ already contains that lexical maṣdar; removing كَـ and changing case would be shell/inflection padding.", "غَلَّى was not selected because the stronger Form-IV causative pair already teaches the same causative contrast."],
  ),

  "lexical|قصو|قصوى|noun/pronoun": full(
    "قصو",
    "و",
    e("قصو", "The entry attests قَصَا, قَصِيّ, أَقْصَى and قاصية, with the Qur’anic feminine elative القُصْوَى in the same weak-final family."),
    [
      a("قصو", "قَصَا", "Form-I weak-final perfect verb", "became distant or went far away", "Basic verb underlying the distance family.", "The Qur’anic elative describes the farther side; the verb describes becoming distant.", "Anchors the adjective in a real weak-final verb.", e("قصو", "The Academy defines قَصَا/قَصًا as becoming or going far away.")),
      a("قصو", "قَصِيٌّ", "lexical adjective", "far or remote", "Established adjective from the same root.", "Moves from the event of becoming distant to the stable quality of remoteness.", "Provides an adjective contrast without repeating the current elative.", e("قصو", "The Academy lists قَصِيّ in the قَصْو family.")),
      a("قصو", "قَاصٍ", "active participle/adjective", "distant; one who is distant", "Established active participle/adjectival form.", "Names the entity characterized by distance.", "Shows a useful participial pattern.", e("قصو", "The Academy lists قاصية and the related distance derivatives under قصو.")),
      a("قصو", "أَقْصَى", "elative adjective / Form-IV verb", "farther/farthest; put farther away", "Masculine counterpart and related causative lexical form of the Qur’anic feminine elative.", "The family shows both comparison and causing distance; the gloss keeps those functions distinct.", "Connects the Qur’anic feminine elative with a familiar masculine/derived form.", e("قصو", "The Academy lists أَقْصَى in the قصو family.")),
    ],
    ["قُصْوَى and أَقْصَى are not counted as mere spelling variants: the former is the Qur’anic feminine elative and the latter is the established masculine/derived counterpart with its own lexical functions.", "Article and case changes were rejected."],
  ),

  "lexical|خطو|خطوة|noun/pronoun": full(
    "خطو",
    "و",
    e("خطو", "The entry attests خَطا, أَخْطى, خَطّى, اختَطَى, تخطَّى and the noun الخَطْوة/الخُطْوة with its plurals."),
    [
      a("خطو", "خَطَا", "Form-I weak-final perfect verb", "walked or took a step", "Basic verb behind the Qur’anic footsteps noun.", "The current plural names steps; the verb names taking them.", "Gives the core verb for recognising خُطُوات.", e("خطو", "The Academy defines خَطا ... خَطْوًا as walking.")),
      a("خطو", "أَخْطَى", "Form-IV causative verb", "made someone step or caused him to walk", "Causative derivative of the same weak-final root.", "Changes taking a step to causing another to step.", "Provides a useful valency contrast.", e("خطو", "The Academy defines أَخْطَى as making someone walk or causing him to step.")),
      a("خطو", "اِخْتَطَى", "Form-VIII derived verb", "crossed or went beyond", "Established derived verb in the same root family.", "The motion of stepping develops into crossing beyond something.", "Teaches a distinct derived pattern and semantic development.", e("خطو", "The Academy defines اختَطَى as crossing or going beyond.")),
      a("خطو", "تَخَطَّى", "Form-V derived verb", "crossed over or overcame", "Established derived verb related to stepping across.", "The physical step develops into overcoming an obstacle.", "Adds another attested derived pattern rather than singular/plural padding.", e("خطو", "The Academy defines تخطَّى as crossing and overcoming obstacles.")),
    ],
    ["خَطْوَةٌ/خُطْوَةٌ and plural variants were not added as extra rows because the current word already represents the lexical step noun in plural form.", "Case and the attached article were not counted."],
  ),

  "lexical|جثو|جثي|noun/pronoun": full(
    "جثو",
    "و",
    e("جثو", "The entry attests جَثَا, جاثٍ, الجَاثِيَة and related derived forms; reliable Arabic morphology evidence also establishes the weak-final imperfect and maṣdar forms."),
    [
      a("جثو", "جَثَا", "Form-I weak-final perfect verb", "knelt or sat on his knees", "Basic verb corresponding to the Qur’anic kneeling form.", "The Qur’anic plural/collective form describes kneeling people; the verb names the act.", "Anchors the weak-final family in a clear verb.", e("جثو", "The Academy root entry defines جَثَا and identifies the kneeling semantic branch.")),
      a("جثو", "يَجْثُو", "Form-I weak-final imperfect verb", "kneels or sits on his knees", "Imperfect of the attested weak-final verb جَثَا.", "Changes completed kneeling to ongoing or habitual kneeling.", "Provides a useful tense recognition contrast.", e("جثو", "The Academy root entry and aligned Arabic morphology evidence establish the imperfect of جثا.")),
      a("جثو", "جُثُوٌّ", "Form-I maṣdar", "kneeling", "Verbal noun of جَثَا/يَجْثُو.", "Names the action rather than the person performing it.", "Connects the Qur’anic form to the root action noun.", e("جثو", "The Academy root entry gives the kneeling noun family; aligned Arabic morphology evidence supplies the standard maṣdar vocalisation.")),
      a("جثو", "تَجَاثَى", "Form-VI derived verb", "knelt toward one another", "Mutual derived form in the same root family.", "The basic kneeling action develops into reciprocal kneeling.", "Adds a genuinely distinct derived pattern.", e("جثو", "The Academy root entry lists the mutual/derived جثو forms, including تجاثى.")),
    ],
    ["جَاثٍ and الجَاثِيَةُ were not added because they are participial/gendered forms close to the current kneeling participant and the selected family already contains the stronger verb, imperfect, maṣdar and reciprocal contrasts.", "The current Qur’anic form’s case ending was not counted."],
  ),
};
