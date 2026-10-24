import type { C3C4BCandidate, C3C4BSpec } from "./tier-c3c4b-specs";

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

const full = (
  canonicalRoot: string,
  rootEvidence: string,
  hollowBehavior: string,
  candidates: C3C4BCandidate[],
  rejectedCandidates: string[],
): C3C4BSpec => ({
  canonicalRoot,
  weakRadical: ["لوذ", "نوش", "نوص", "زول", "بور", "قوت", "زود", "هور"].includes(canonicalRoot) ? "و" : "ي",
  rootEvidence,
  hollowBehavior,
  decision: "FULL",
  reason: "The current form plus four independently attested same-root forms provide useful lexical and morphological development without shell, case, pronoun or contraction padding.",
  candidates,
  rejectedCandidates,
});

export const C3C4C_FAMILY_KEYS = [
  "lexical|لوذ|لواذ|noun/pronoun",
  "lexical|نوش|تناوش|noun/pronoun",
  "lexical|نوص|مناص|noun/pronoun",
  "lexical|زول|زوال|noun/pronoun",
  "lexical|بور|بوار|noun/pronoun",
  "lexical|قوت|مقيت|noun/pronoun",
  "lexical|خيط|خياط|noun/pronoun",
  "lexical|زود|زاد|noun/pronoun",
  "lexical|هور|هار|noun/pronoun",
] as const;

export const C3C4C_SPECS: Record<string, C3C4BSpec> = {
  "lexical|لوذ|لواذ|noun/pronoun": full(
    "لوذ",
    evidence("لوذ", "The Academy attests لاذَ, لَوْذًا/لِياذًا/لِواذًا, أَلاذَ, لاوَذَ, المَلاذ and related nouns."),
    "The second radical is و. The Qur’anic لِوَاذًا is a Form-III verbal noun in the refuge/avoidance branch; ordinary hollow-vowel alternation is not counted as a separate form.",
    [
      accepted("لوذ", "لَاذَ", "Form-I hollow perfect verb", "he sought refuge / hid behind", "Basic Form-I source of the refuge branch.", "The Qur’anic Form-III noun is related to the basic act of seeking refuge, while its contextual sense can include evasive withdrawal.", "Makes the hollow Form-I base visible.", "The Academy defines لاذَ as sought refuge, hid and fortified himself."),
      accepted("لوذ", "يَلُوذُ", "Form-I hollow imperfect verb", "he seeks refuge / hides", "Imperfect counterpart of لاذَ.", "The long ū displays the hollow middle radical in the imperfect.", "Shows the recognisable hollow alternation.", "The Academy’s لاذَ entry establishes the Form-I hollow family and its imperfect is the standard lexical counterpart.", "medium"),
      accepted("لوذ", "مَلَاذٌ", "place noun", "refuge / sanctuary", "Established place noun from the refuge branch.", "The action of seeking protection develops into the place or protection sought.", "Connects the Qur’anic verbal noun to a common learner-facing noun.", "The Academy lists المَلاذُ as refuge and fortress."),
      accepted("لوذ", "لَاوَذَ", "Form-III derived verb", "he evaded / acted evasively with another", "Derived Form-III branch represented by the Qur’anic verbal noun.", "The root develops from seeking shelter into mutual avoidance or manoeuvring; the meaning is kept distinct.", "Explains the Qur’anic Form-III pattern without pretending it means only refuge.", "The Academy defines لاوَذَ as mutual seeking of shelter and, contextually, evasion."),
    ],
    ["لَوْذٌ and لِيَاذٌ were considered as genuine maṣdar variants, but are lexical variants of the same refuge action rather than better additional morphology.", "لِوَاذًا without its case ending was not counted separately.", "Article, preposition and any attached material were not counted."],
  ),

  "lexical|نوش|تناوش|noun/pronoun": full(
    "نوش",
    evidence("نوش", "The Academy attests ناشَ, ناوَشَ, تَناوَشَ and اِنْتاشَ in movement, reaching, taking and engagement branches."),
    "The second radical is و. The Qur’anic Form-VI verbal noun is retained as the current form; hollow contraction and inflection are not separate rows.",
    [
      accepted("نوش", "نَاشَ", "Form-I hollow perfect verb", "he reached / took / sought", "Basic Form-I verb underlying the derived receiving/reaching branch.", "The root develops from movement and reaching to the reciprocal or mutual reaching of تَناوَشَ.", "Gives the learner the lexical base of the Qur’anic derived noun.", "The Academy defines ناشَ with walking, reaching, seeking and taking senses."),
      accepted("نوش", "يَنُوشُ", "Form-I hollow imperfect verb", "he reaches / takes", "Imperfect counterpart of ناشَ.", "The hollow ū makes the middle و visible in the imperfect pattern.", "Provides a useful tense and hollow-pattern contrast.", "The Academy’s ناشَ entry establishes the Form-I family; يَنُوشُ is the regular attested imperfect counterpart.", "medium"),
      accepted("نوش", "نَاوَشَ", "Form-III derived verb", "he engaged / exchanged attacks from a distance", "Derived Form-III branch related to reaching or taking one another.", "The simple reaching branch develops into mutual engagement; the military sense is translated honestly.", "Shows semantic development without flattening it into receiving.", "The Academy defines ناوَشَ as mixing with something and engaging/testing an opponent."),
      accepted("نوش", "اِنْتَاشَ", "Form-VIII derived verb", "he rescued / pulled out", "Derived form in the same root family.", "The act of reaching develops into extracting or rescuing someone from danger.", "Adds a distinct derived pattern and a useful semantic branch.", "The Academy records انتاشني فلانٌ as he rescued me from destruction."),
    ],
    ["تَنَاوَشَ and تَنَاوُشٌ are the verbal form and maṣdar represented by the current Qur’anic family; the current form itself already supplies that row.", "نَوْشٌ was considered as a maṣdar but was not added alongside the current Form-VI maṣdar to avoid near-duplicate verbal-noun rows.", "The definite article and nominative ending in ٱلتَّنَاوُشُ were not counted separately."],
  ),

  "lexical|نوص|مناص|noun/pronoun": full(
    "نوص",
    evidence("نوص", "The Academy attests ناصَ, نَوْصًا/نَوَصانًا, أَناصَ, ناوَصَ, اِنْتاصَ, اسْتَناصَ and المَناصُ as refuge, movement, escape and seeking branches."),
    "The second radical is و. مَنَاصٌ is a place noun meaning refuge or escape; its lexical family is broader than the surface noun but must remain within root ن و ص.",
    [
      accepted("نوص", "نَاصَ", "Form-I hollow perfect verb", "he moved / escaped / sought refuge", "Basic verb underlying the escape and refuge noun.", "The place noun مَناصٌ is linked to the action of moving away or seeking refuge.", "Connects the Qur’anic noun to its lexical verb.", "The Academy defines ناصَ with movement, withdrawal, seeking and taking refuge senses."),
      accepted("نوص", "يَنُوصُ", "Form-I hollow imperfect verb", "he moves away / escapes", "Imperfect counterpart of ناصَ.", "The hollow ū exposes the middle و in the imperfect.", "Provides the learner a clear hollow-root pattern.", "The Academy’s ناصَ entry explicitly gives the verbal family; يَنُوصُ is the established imperfect form.", "medium"),
      accepted("نوص", "نَوْصٌ", "Form-I maṣdar", "movement / escape", "Maṣdar of the basic escape/movement branch.", "The concrete refuge noun is connected to the abstract action of moving or escaping.", "Distinguishes the place noun from the action noun.", "The Academy gives نَوْصًا as a maṣdar for movement and escape."),
      accepted("نوص", "اِسْتَنَاصَ", "Form-X derived verb", "he delayed / moved away / sought help", "Derived Form-X branch in the same root family.", "The root develops from movement or escape into seeking movement/help or withdrawing.", "Adds an attested derived pattern while preserving the semantic distinction.", "The Academy records استناصَ with delaying, moving and seeking help senses."),
    ],
    ["أَنَاصَ was considered, but the selected basic verb, imperfect, maṣdar and Form-X pattern give a clearer teaching progression.", "مَنَاصٌ without its case ending was not counted separately.", "The meaning of مَنَاصٌ was not flattened into the verb’s full semantic range; it remains refuge/escape."],
  ),

  "lexical|زول|زوال|noun/pronoun": full(
    "زول",
    evidence("زول", "The Academy attests زالَ, زَوَالًا, أَزالَ, زاوَلَ, زَوَّلَ, انْزالَ, الزّائِلُ and related forms."),
    "The second radical is و. زَوَالٌ is the maṣdar/noun of cessation, departure or disappearance; the same root also has a causative removal branch.",
    [
      accepted("زول", "زَالَ", "Form-I hollow perfect verb", "he ceased / moved away", "Basic Form-I verb of زَوَالٌ.", "The noun’s idea of ending or passing away is shown through the verb that ceases or departs.", "Makes the root’s basic verbal meaning recognisable.", "The Academy defines زالَ as moved, disappeared, ceased and went away."),
      accepted("زول", "يَزُولُ", "Form-I hollow imperfect verb", "he ceases / moves away", "Imperfect counterpart of زالَ.", "The hollow ū visibly reflects the middle و.", "Provides the core hollow tense contrast.", "The Academy’s زالَ entry establishes the standard imperfect family."),
      accepted("زول", "زَائِلٌ", "Form-I active participle/adjective", "passing / vanishing", "Active participle from زالَ.", "The event of passing becomes a property or state.", "Adds a useful participial recognition form.", "The Academy lists الزّائِلُ in the زول family."),
      accepted("زول", "أَزَالَ", "Form-IV derived verb", "he removed / caused to cease", "Causative Form-IV counterpart of زالَ.", "The intransitive cessation branch develops into causing something to disappear or be removed.", "Teaches the key intransitive/causative contrast.", "The Academy defines أَزالَ as removed and caused to be taken away."),
    ],
    ["زَوْلٌ and زَوَّلَ were considered; زَوْلٌ belongs to a distinct lively/clever noun branch, while زَوَّلَ would add less value than the selected basic/causative contrast.", "The earlier C1 family using لِتَزُولَ is a separate Qur’anic occurrence family; this family is adjudicated independently with the same canonical root."],
  ),

  "lexical|بور|بوار|noun/pronoun": full(
    "بور",
    evidence("بور", "The Academy attests بارَ, بَوْرًا/بَوارًا, أَبارَ, بَوَّرَ, ابْتارَ, بائِرٌ, بُورٌ and البَوارُ."),
    "The second radical is و. البَوارُ is the destruction/ruin noun; the root also includes perishing, failure, barrenness and causing ruin.",
    [
      accepted("بور", "بَارَ", "Form-I hollow perfect verb", "he perished / was ruined", "Basic Form-I verb underlying البَوارُ.", "The destruction noun is linked to the event of perishing or becoming ruined.", "Makes the lexical source of the current noun clear.", "The Academy defines بارَ as perished, failed and became unproductive."),
      accepted("بور", "يَبُورُ", "Form-I hollow imperfect verb", "he perishes / is ruined", "Imperfect counterpart of بارَ.", "The hollow ū presents the middle و in the imperfect.", "Provides a useful hollow tense pattern.", "The Academy’s بارَ entry establishes the Form-I family; يَبُورُ is its attested imperfect form.", "medium"),
      accepted("بور", "بَائِرٌ", "Form-I active participle/adjective", "perishing / ruined / unsuccessful", "Active participle/adjective from بارَ.", "The event develops into a description of a person, land or enterprise in ruin.", "Adds an independently useful descriptive form.", "The Academy defines بائرٌ as perishing, failed and, of land, uncultivated."),
      accepted("بور", "أَبَارَ", "Form-IV derived verb", "he destroyed / made unsuccessful", "Causative Form-IV branch of the same root.", "The state of ruin becomes an action that causes destruction or failure.", "Teaches the causative relationship rather than a case or plural variant.", "The Academy defines أَبارَه as destroyed or made unsuccessful."),
    ],
    ["بَوْرٌ and بُورٌ were considered as genuine noun variants, but the selected verb, imperfect, participle and causative give stronger morphology.", "The article in ٱلْبَوَارِ and its genitive ending were not counted separately."],
  ),

  "lexical|قوت|مقيت|noun/pronoun": full(
    "قوت",
    evidence("قوت", "The Academy attests قاتَ, أَقاتَ, اقْتاتَ, تَقَوَّتَ, اسْتَقاتَ, القُوتُ and المُقِيتُ."),
    "The second radical is و. The Qur’anic مُقِيتٌ is an active participle in the Form-IV sustaining/providing branch, not the noun قُوتٌ itself.",
    [
      accepted("قوت", "قَاتَ", "Form-I hollow perfect verb", "he fed / sustained", "Basic Form-I feeding verb related to مُقِيتٌ.", "The Qur’anic keeper/provider sense is connected to the basic act of supplying nourishment.", "Shows the lexical base behind the derived participle.", "The Academy defines قاتَ as fed and supported."),
      accepted("قوت", "أَقَاتَ", "Form-IV derived verb", "he gave nourishment / sustained", "Form-IV verb corresponding to the Qur’anic participial branch.", "The act of feeding becomes causative provision or sustaining.", "Makes the Form-IV relation visible without duplicating person or tense.", "The Academy defines أَقاتَ as gave someone food and as being able to sustain."),
      accepted("قوت", "اِقْتَاتَ", "Form-VIII derived verb", "he fed himself on / took nourishment", "Derived self-directed feeding form.", "The root shifts from giving nourishment to taking something as one’s food.", "Adds participant-structure development.", "The Academy defines اقتاتَ as made something his food."),
      accepted("قوت", "قُوتٌ", "root noun", "nourishment / food", "Core noun of nourishment in the same root family.", "The provider/keeper meaning is anchored in the concrete thing that sustains the body.", "Separates the noun from the Form-IV participle honestly.", "The Academy defines القوت as food that sustains the body."),
    ],
    ["تَقَوَّتَ and اسْتَقاتَ were investigated but were not needed after selecting the basic verb, Form-IV, Form-VIII and root noun.", "The doubled consonant in مُقِيتًا is not a new root; it is the established Form-IV participial pattern."],
  ),

  "lexical|خيط|خياط|noun/pronoun": full(
    "خيط",
    evidence("خيط", "The Academy attests خاطَ, خَيِطَ, خَيَّطَ, اخْتاطَ, تَخَيَّطَ, الخِياطُ, الخِياطةُ, الخَيْطُ, الخَيّاطُ, المَخِيطُ and المِخْيَطُ."),
    "The second radical is ي. The Qur’anic الخِياطِ is the needle/instrument noun; the family also contains sewing verbs, the craft noun and the tailor noun.",
    [
      accepted("خيط", "خَاطَ", "Form-I hollow perfect verb", "he sewed / stitched", "Basic verb underlying the sewing and instrument family.", "The needle noun is linked to the action performed with thread and needle.", "Provides the direct lexical base of the current instrument noun.", "The Academy defines خاطَ as sewed and joined parts with thread."),
      accepted("خيط", "خِيَاطَةٌ", "verbal noun", "sewing / tailoring", "Maṣdar/craft noun from خاطَ.", "The individual act becomes the established craft or process.", "Distinguishes the craft from the instrument الخِياطِ.", "The Academy defines الخِياطة as the profession of the tailor."),
      accepted("خيط", "خَيَّاطٌ", "Form-I occupational noun", "tailor / one who sews", "Occupational noun related to sewing.", "The action develops into the person who performs it.", "Adds a highly recognisable agent/occupation relationship.", "The Academy lists الخيّاط among the خيط family and defines the tailor branch."),
      accepted("خيط", "مَخِيطٌ", "passive participle/result noun", "sewn / stitched", "Result form from the act of sewing.", "The family moves from tool and action to the thing that has been sewn.", "Provides a useful result/passive contrast without repeating the needle noun.", "The Academy lists المَخِيطُ among the established خيط derivatives.", "medium"),
    ],
    ["مِخْيَطٌ was investigated and is genuine for needle, but it substantially repeats the current instrument meaning الخِياطِ; مَخِيطٌ gives better morphological diversity.", "خَيْطٌ itself is the material noun ‘thread’ and was considered, but the selected set more directly explains the Qur’anic needle/craft branch.", "The long vowel in الخِياطِ is lexical patterning, not evidence for a different root."],
  ),

  "lexical|زود|زاد|noun/pronoun": full(
    "زود",
    evidence("زود", "The Academy attests زادَ, أَزادَ, زوَّدَ, تَزَوَّدَ, الزّادُ and المِزْوَدُ."),
    "The second radical is و. The Qur’anic الزَّادِ is the provision noun; the root has basic preparation, giving, supplying and taking-provision branches.",
    [
      accepted("زود", "زَادَ", "Form-I hollow perfect verb", "he prepared provisions", "Basic verb underlying the provision noun.", "The noun provision is connected to the act of preparing travel food or supplies.", "Makes the source of الزاد recognisable.", "The Academy defines زادَ as prepared provisions."),
      accepted("زود", "أَزَادَ", "Form-IV derived verb", "he gave provisions", "Causative/giving branch of the same root.", "Preparation of provisions develops into supplying them to another person.", "Shows a clear participant change.", "The Academy defines أَزادَه as gave him provisions."),
      accepted("زود", "زَوَّدَ", "Form-II derived verb", "he supplied / provisioned", "Intensive/causative supply verb.", "The provision noun becomes an active act of supplying someone with what is needed.", "Adds a distinct derived pattern.", "The Academy defines زوَّدَه as supplied or provided him with something."),
      accepted("زود", "تَزَوَّدَ", "Form-V derived verb", "he took provisions / provisioned himself", "Self-directed derived form from the provision noun.", "The root develops from supplying provisions to taking them for oneself.", "Completes a useful giver/receiver contrast.", "The Academy defines تزوَّدَ as took provisions."),
    ],
    ["المِزْوَدُ was considered as a place/container noun, but the selected verb-pattern progression teaches more about the Qur’anic provision word.", "The article and genitive ending in ٱلزَّادِ were not counted."],
  ),

  "lexical|هور|هار|noun/pronoun": full(
    "هور",
    evidence("هور", "The Academy attests هارَ, هَوْرًا/هُؤُورًا, هَوَّرَ, اهْتَوَرَ, انْهارَ, الهائِرُ and الهارُ."),
    "The second radical is و. The Qur’anic هَارٍ is a lexical adjective describing something collapsing or eroding; it is not merely a surface contraction of an ordinary verb form.",
    [
      accepted("هور", "هَارَ", "Form-I hollow perfect verb", "it collapsed / broke down", "Basic verb underlying the collapsing adjective.", "The adjective describes a structure in the state resulting from the collapse expressed by the verb.", "Connects the Qur’anic descriptive form to the basic event.", "The Academy defines هارَ البناء as the building collapsed or cracked."),
      accepted("هور", "هَوْرٌ", "Form-I maṣdar", "collapse / crumbling", "Maṣdar of the collapse branch.", "The event is separated from the adjective describing its result or tendency.", "Gives a clear noun/verb/adjective relationship.", "The Academy gives هَوْرًا as the maṣdar of collapse."),
      accepted("هور", "هَوَّرَ", "Form-II derived verb", "he caused to collapse / knocked down", "Causative/intensive Form-II branch.", "The intransitive collapse becomes an action imposed on a structure or person.", "Teaches the causative distinction honestly.", "The Academy defines هوَّرَ البناء as caused the building to collapse."),
      accepted("هور", "اِنْهَارَ", "Form-VII derived verb", "it collapsed / gave way", "Derived intransitive collapse form.", "The root develops a clear inchoative/resultative pattern for collapse.", "Adds a distinct derived pattern rather than gender or case padding.", "The Academy defines انهارَ البناء as the building collapsed."),
    ],
    ["هَائِرٌ and الهَارُ were considered as genuine adjective/agent branches, but the selected maṣdar and derived verbs provide more useful morphology around the Qur’anic form.", "The Qur’anic tanwīn and genitive ending in هَارٍ were not counted separately."],
  ),
};

if (Object.keys(C3C4C_SPECS).length !== C3C4C_FAMILY_KEYS.length) {
  throw new Error(`C3-C4C specification count mismatch: ${Object.keys(C3C4C_SPECS).length}`);
}

