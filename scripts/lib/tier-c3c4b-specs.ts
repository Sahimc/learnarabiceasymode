export type C3C4BDecision = "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";

export type C3C4BCandidate = {
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

export type C3C4BSpec = {
  canonicalRoot: string;
  weakRadical: "و" | "ي";
  rootEvidence: string;
  hollowBehavior: string;
  decision: C3C4BDecision;
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
  rejectionReason: string,
): C3C4BCandidate => ({
  form,
  root,
  morphology,
  meaning: "Not accepted",
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
  hollowBehavior: string,
  candidates: C3C4BCandidate[],
  rejectedCandidates: string[],
  normalizationNote?: string,
): C3C4BSpec => ({
  canonicalRoot,
  weakRadical,
  rootEvidence,
  hollowBehavior,
  candidates,
  rejectedCandidates,
  decision: "FULL",
  reason:
    "The current Qur’anic form plus four independently attested, morphologically useful same-root forms are established. The hollow middle radical is explained honestly; no shell, case, pronoun or bare-radical padding is used.",
  ...(normalizationNote ? { normalizationNote } : {}),
});

const limited = (
  canonicalRoot: string,
  weakRadical: "و" | "ي",
  rootEvidence: string,
  hollowBehavior: string,
  candidates: C3C4BCandidate[],
  reason: string,
  rejectedCandidates: string[],
  normalizationNote?: string,
): C3C4BSpec => ({
  canonicalRoot,
  weakRadical,
  rootEvidence,
  hollowBehavior,
  candidates,
  rejectedCandidates,
  decision: "CONFIRMED-LIMITED",
  reason,
  ...(normalizationNote ? { normalizationNote } : {}),
});

const a = accepted;
const r = rejected;

export const C3C4B_FAMILY_KEYS = [
  "lexical|حوب|حوب|noun/pronoun",
  "lexical|حير|حيران|noun/pronoun",
  "lexical|روع|روع|noun/pronoun",
  "lexical|ريش|ريشا|noun/pronoun",
  "lexical|ريع|ريع|noun/pronoun",
  "lexical|سوح|ساحت|noun/pronoun",
  "lexical|سيب|سائبة|noun/pronoun",
  "lexical|شوب|شوبا|noun/pronoun",
  "lexical|شوك|شوكة|noun/pronoun",
  "lexical|صوع|صواع|noun/pronoun",
  "lexical|صوف|اصواف|noun/pronoun",
  "lexical|صيص|صياصي|noun/pronoun",
  "lexical|ضير|ضير|noun/pronoun",
  "lexical|طود|طود|noun/pronoun",
  "lexical|عوق|معوقين|noun/pronoun",
] as const;

export const C3C4B_SPECS: Record<string, C3C4BSpec> = {
  "lexical|حوب|حوب|noun/pronoun": full(
    "حوب",
    "و",
    evidence("حوب", "The entry attests حَابَ/حَوْبًا for sin, أَحْوَبَ, حَوَّبَ and تَحَوَّبَ, alongside الحَوْب/الحُوب as sin or guilt."),
    "The middle و appears as the long ā of حَابَ and is retained in the lexical/root analysis even when the surface form is حُوب.",
    [
      a("حوب", "حَابَ", "Form-I hollow perfect verb", "he sinned / committed a wrong", "Basic hollow verb in the sin branch of حوب.", "The Qur’anic noun names the sin; the verb names committing it.", "Connects the concrete noun to its verbal action.", "The Academy defines حَابَ ... حَوْبًا as أَثِمَ."),
      a("حوب", "أَحْوَبَ", "Form-IV derived verb", "he fell into sin / did wrong", "Established derived form from the same root.", "The meaning remains in the sin branch but presents entering or causing a sinful state.", "Shows a real derived pattern without repeating case or number.", "The Academy lists أَحْوَبَ with the sin meaning."),
      a("حوب", "حَوَّبَ", "Form-II derived verb", "he caused or attributed sin", "Form-II development of the same root.", "The root develops from committing sin to assigning or causing the sin relation.", "Contrasts basic and intensive/causative morphology.", "The Academy lists حَوَّبَ in the حوب family."),
      a("حوب", "تَحَوَّبَ", "Form-V derived verb", "he abandoned sin / repented", "Established derived form in the same root family.", "The semantic development moves from sin to turning away from it; it is not flattened into the Qur’anic noun’s meaning.", "Teaches a useful semantic reversal within the root.", "The Academy defines تَحَوَّبَ as leaving sin or repenting."),
    ],
    ["حَوْبٌ and حُوبٌ are lexical vocalic variants of the same noun, not separate rows.", "Article, case ending and the Qur’anic accusative were not counted."],
  ),

  "lexical|حير|حيران|noun/pronoun": full(
    "حير",
    "ي",
    evidence("حير", "The entry attests حَارَ, حَيْرَان/حَيْرَى, حَيَّرَ, تَحَيَّرَ and related confusion/perplexity forms."),
    "The middle ي is represented by the hollow long ā in حَارَ and by the yāʾ-bearing nominal forms حَيْرَان and حَيْرَة.",
    [
      a("حير", "حَارَ", "Form-I hollow perfect verb", "he became confused / lost his way", "Basic hollow verb underlying حَيْرَان.", "The current adjective describes the confused state; the verb presents entering that state.", "Makes the adjective’s verbal base visible.", "The Academy defines حَارَ as becoming confused or lost."),
      a("حير", "حَيْرَةٌ", "lexical verbal noun", "confusion / perplexity", "Maṣdar/noun of the same confusion branch.", "The state expressed by حَيْرَان becomes an abstract noun.", "Gives the learner a stable noun pattern for recognition.", "The Academy records حَيْرَة in the حير family."),
      a("حير", "حَائِرٌ", "Form-I active participle/adjective", "confused / perplexed", "Active-participial adjective related to حَارَ.", "The current Qur’anic form is an adjective of the same state; حَائِرٌ shows another established adjective pattern.", "Contrasts two real lexical adjective formations without pretending they are identical spellings.", "The Academy records حَائِر and حَيْرَان/حَيْرَى in the same family."),
      a("حير", "حَيَّرَ", "Form-II causative/intensive verb", "he confused / perplexed someone", "Derived Form-II of the same root.", "The meaning develops from being confused to causing another person’s confusion.", "Teaches the causative relationship clearly.", "The Academy defines حَيَّرَ as causing perplexity."),
    ],
    ["حَيْرَى is the feminine counterpart of حَيْرَان and was not added as a separate row because gender variation alone adds little here.", "Case endings on حَيْرَانَ were not counted."],
  ),

  "lexical|روع|روع|noun/pronoun": full(
    "روع",
    "و",
    evidence("روع", "The entry attests رَاعَ, رَوِعَ, أَرَاعَ, رَوَّعَ, اِرْتَاعَ and related nouns including الرَّوْع and الرُّوع."),
    "The middle و is visible in the hollow noun الرَّوْع and alternates with ā in رَاعَ; this is hollow-root behavior, not a different root.",
    [
      a("روع", "رَاعَ", "Form-I hollow perfect verb", "he frightened / astonished", "Basic hollow verb in the fear/awe branch.", "The Qur’anic noun is the fright; the verb is the act of frightening or astonishing.", "Connects the abstract noun to its basic verbal source.", "The Academy defines رَاعَ with fright and astonishment senses."),
      a("روع", "أَرَاعَ", "Form-IV derived verb", "he frightened / alarmed", "Derived causative form of the same root.", "The causative branch makes the fear relation explicit.", "Shows a distinct derived pattern rather than an inflectional duplicate.", "The Academy lists أَرَاعَ in the روع family."),
      a("روع", "رَوَّعَ", "Form-II derived verb", "he terrified", "Form-II development of the same root.", "The meaning intensifies from frightening to terrorising.", "Provides a useful intensity contrast.", "The Academy defines رَوَّعَ with terror/fear meanings."),
      a("روع", "اِرْتَاعَ", "Form-VIII derived verb", "he was frightened / startled", "Derived intransitive/passive-like state form of the same root.", "The semantic direction shifts from causing fear to experiencing it.", "Teaches the learner how the derived pattern changes participant roles.", "The Academy lists اِرْتَاعَ in the روع family."),
    ],
    ["الرُّوع (heart/mind) was rejected from this lesson because it is a distinct lexical branch and the selected four forms already provide stronger fear/awe contrasts.", "Article and case were not counted."],
  ),

  "lexical|ريش|ريشا|noun/pronoun": full(
    "ريش",
    "ي",
    evidence("ريش", "The entry attests رَاشَ, رَيَّشَ, اِرْتَاشَ, مَرِيش and الرّيش in feathering/adornment and prosperity branches."),
    "The middle ي alternates in the hollow perfect رَاشَ and remains visible in رِيش, while derived forms preserve the same root.",
    [
      a("ريش", "رَاشَ", "Form-I hollow perfect verb", "he grew feathers / attached feathers", "Basic hollow verb related to the feather/adornment noun.", "The Qur’anic noun means adornment; the verb shows the concrete feathering/adorning action.", "Makes the noun’s lexical root recognisable.", "The Academy defines رَاشَ with feathering and support/adornment senses."),
      a("ريش", "رَيَّشَ", "Form-II derived verb", "he feathered / adorned", "Derived form of the same root.", "The meaning develops from having or attaching feathers to actively furnishing or adorning.", "Adds a clear derived pattern.", "The Academy lists رَيَّشَ in the ريش family."),
      a("ريش", "مَرِيشٌ", "passive participle/adjective", "feathered / furnished with feathers", "Established participial derivative of رَاشَ.", "The noun branch becomes a state or result adjective.", "Shows a useful passive/result relationship.", "The Academy records مَرِيشٌ in the same root entry."),
      a("ريش", "اِرْتَاشَ", "Form-VIII derived verb", "he prospered / gained benefit", "Established derived semantic branch of the same root.", "The root develops from adornment/support to benefiting or prospering; the meaning is kept distinct.", "Demonstrates honest same-root semantic development.", "The Academy lists اِرْتَاشَ with prosperity/benefit meanings."),
    ],
    ["رِيشٌ is the same lexical noun underlying the current وَرِيشًا and was not duplicated after removing the conjunction/case shell.", "رَائِشٌ was not selected because the stronger direct passive/result form مَرِيشٌ gives clearer learner value."],
  ),

  "lexical|ريع|ريع|noun/pronoun": full(
    "ريع",
    "ي",
    evidence("ريع", "The entry attests رَاعَ, أَرَاعَ, رَيَّعَ, تَرَيَّعَ and the noun رَيْع with increase, growth and elevation branches."),
    "The middle ي is represented by the hollow ā of رَاعَ and the yāʾ-bearing noun رَيْع; the Qur’anic رِيع is a lexical vocalic form, not a separate root.",
    [
      a("ريع", "رَاعَ", "Form-I hollow perfect verb", "he grew / increased", "Basic hollow verb in the increase/elevation semantic field.", "The Qur’anic noun names an elevated place; the verb shows growth or rising.", "Connects spatial elevation with the root’s increase branch.", "The Academy defines رَاعَ with growth/increase and related senses."),
      a("ريع", "أَرَاعَ", "Form-IV derived verb", "he increased / nourished", "Causative/derived form of the same root.", "The root develops from growing to causing growth or increase.", "Shows causation rather than a surface variant.", "The Academy lists أَرَاعَ with increase/nourishment meanings."),
      a("ريع", "رَيَّعَ", "Form-II derived verb", "he caused to increase / gathered", "Form-II development of the same root.", "The action is intensified or made causative in a different derived pattern.", "Adds a useful pattern contrast.", "The Academy lists رَيَّعَ in the ريع family."),
      a("ريع", "تَرَيَّعَ", "Form-V derived verb", "he expanded / fluctuated", "Established derived form of the same root.", "The semantic field develops from elevation/increase to expansion or fluctuation; the gloss remains form-specific.", "Shows an honest developed branch.", "The Academy lists تَرَيَّعَ in the same root family."),
    ],
    ["رَيْعٌ is a close vocalic noun variant of the Qur’anic رِيع and was not counted separately from the current noun.", "Case ending in رِيعٍ was not counted."],
  ),

  "lexical|سوح|ساحت|noun/pronoun": limited(
    "سوح",
    "و",
    evidence("سوح", "The Academy’s ساحة entry defines the open space/courtyard and gives the plural ساحٌ and سُوحٌ; classical lexica likewise derive الساحة from the hollow root س و ح.",),
    "The middle و is preserved by the plural سُوح; the long ā in سَاحَة is the expected hollow-root surface outcome.",
    [
      a("سوح", "سُوحٌ", "broken plural noun", "open spaces / courtyards", "Lexical plural of سَاحَة, the noun in the Qur’anic بِسَاحَتِهِمْ.", "The current occurrence is a possessed singular; the plural gives a real lexical number contrast without treating the prefix بِـ or suffix ـهِمْ as morphology.", "Provides the one strong additional lexical relation securely evidenced.", "The Academy defines سَاحَة and explicitly gives سُوحٌ as a plural."),
      r("سوح", "سَاحَ", "Form-I verb", "The travelling meaning ‘travelled / roamed’ belongs to the disputed/alternative س ي ح branch in the relevant lexica, not securely to the project’s canonical س و ح family for this lesson."),
      r("سوح", "سَاحَةٌ", "same lexical noun with shell removed", "The current بِسَاحَتِهِمْ already contains this noun; removing بِـ, case and ـهِمْ would be shell normalization, not a new Ṣarf row.",),
      r("سوح", "سَاحٌ", "plural variant", "A lexical plural variant of the same noun, but using both سَاحٌ and سُوحٌ would provide duplicate number teaching rather than a genuinely distinct morphological contrast.",),
    ],
    "The evidence securely establishes the Qur’anic noun and its plural, but does not establish four additional learner-useful forms under the canonical س و ح analysis without importing the disputed س ي ح travelling branch or counting shell/near-duplicate noun variants. This is a reviewed limited family, not an unfinished blocked family.",
    ["The verb سَاحَ meaning travelled/roamed was rejected because its root assignment is disputed with س ي ح and would require a documented normalization decision before being used here.", "سَاحَةٌ is the lexical stem already present in بِسَاحَتِهِمْ; prefix, case and possessive removal do not count.", "سَاحٌ and سُوحٌ are plural variants of the same noun; only سُوحٌ was retained."],
  ),

  "lexical|سيب|سائبة|noun/pronoun": full(
    "سيب",
    "ي",
    evidence("سيب", "The entry attests سَابَ, سَيَّبَ, اِنْسَابَ, السَّيْب and السَّائِبَة, with meanings of free movement, release and flowing."),
    "The middle ي appears in the hollow perfect سَابَ and is visible in the participial/noun forms سَائِب and سَيْب.",
    [
      a("سيب", "سَابَ", "Form-I hollow perfect verb", "he went freely / flowed", "Basic hollow verb in the free-movement branch.", "The Qur’anic سائبة is an animal released from ordinary use; the verb names free movement or flowing.", "Connects the special noun to the basic root action.", "The Academy defines سَابَ with free movement, flowing and leaving senses."),
      a("سيب", "سَيَّبَ", "Form-II derived verb", "he released / let go", "Derived causative/intensive form of the same root.", "The root develops from being free or flowing to actively releasing something.", "Shows the cause/effect contrast directly.", "The Academy defines سَيَّبَ as letting go or releasing."),
      a("سيب", "اِنْسَابَ", "Form-VII derived verb", "he flowed / slipped along", "Established derived form in the same hollow family.", "The flowing branch becomes an intransitive or gradual movement pattern.", "Adds a recognisable derived pattern.", "The Academy defines اِنْسَابَ with flowing/slipping meanings."),
      a("سيب", "سَيْبٌ", "lexical noun", "release, flow or free gift", "Established noun in the same root family.", "The free/released branch develops into the abstract noun or a thing given freely.", "Adds a stable noun relation without duplicating the current feminine noun.", "The Academy records السَّيْب in the سيب family."),
    ],
    ["The masculine/feminine alternation between سَائِبٌ and سَائِبَةٌ was not used as a separate row; the selected rows provide stronger pattern contrasts.", "Case ending in سَآئِبَةٍ was not counted."],
  ),

  "lexical|شوب|شوبا|noun/pronoun": full(
    "شوب",
    "و",
    evidence("شوب", "The entry attests شَابَ, شَوَّبَ, الشَّوْب, الشَّائِب and مَشُوب with mixing/admixture meanings."),
    "The middle و is retained in the noun شَوْب and appears as the long ā in the hollow verb شَابَ.",
    [
      a("شوب", "شَابَ", "Form-I hollow perfect verb", "he mixed / became mixed", "Basic hollow verb underlying the mixture noun.", "The Qur’anic noun names a mixture; the verb names mixing or becoming mixed.", "Makes the noun’s verbal root transparent.", "The Academy defines شَابَ with mixing meanings."),
      a("شوب", "شَوَّبَ", "Form-II derived verb", "he mixed / added an admixture", "Derived intensive/causative form of the same root.", "The meaning develops from mixing to actively introducing an admixture.", "Shows a useful derived pattern.", "The Academy lists شَوَّبَ in the شوب family."),
      a("شوب", "شَائِبٌ", "active participle/adjective", "mixed / containing an admixture", "Established adjective/participle in the same root.", "The action becomes a property of a thing containing another element.", "Provides a recognisable adjective contrast.", "The Academy records الشَّائِب with admixture/impurity meanings."),
      a("شوب", "مَشُوبٌ", "passive participle/adjective", "mixed / adulterated", "Established result adjective from the same root.", "The form presents the thing as having been mixed or adulterated.", "Contrasts active property and affected result.", "The Academy records مَشُوب in the same lexical family."),
    ],
    ["شَوْبٌ is the lexical noun already present in لَشَوْبًا and was not duplicated.", "The prefix لَـ and case ending were not counted."],
  ),

  "lexical|شوك|شوكة|noun/pronoun": full(
    "شوك",
    "و",
    evidence("شوك", "The Academy’s شاكت entry attests شَاكَ, شَاكَتْ, شِيكَ, أَشَاكَ, شَوَّكَ and the noun الشَّوْكة with thorn/strength meanings."),
    "The middle و is visible in شَوْك and شَوْكَة; hollow alternation appears in the verb شَاكَ.",
    [
      a("شوك", "شَاكَ", "Form-I hollow perfect verb", "thorns appeared / he became strong", "Basic hollow verb in the thorn/strength semantic field.", "The Qur’anic noun uses the developed sense of strength/power; the verb also has the concrete thorn and power senses.", "Teaches the semantic bridge without flattening the branches.", "The Academy defines شَاكَ for thorns appearing and strength emerging."),
      a("شوك", "شَاكَتْ", "Form-I perfect with a thorn as subject", "the thorn pricked", "Attested Form-I occurrence with the thorn as the acting subject.", "The root shifts from thorn emergence to the thorn’s effect on a person.", "Shows a useful valency change inside the same verb family.", "The Academy defines شَاكَتْه الشَّوْكةُ as the thorn pricking him."),
      a("شوك", "شِيكَ", "Form-I passive perfect", "he was pricked by a thorn", "Passive counterpart of the same attested thorn verb.", "The participant role reverses from the thorn acting to the person affected.", "Provides a meaningful active/passive contrast.", "The Academy defines شِيكَ as a body having a thorn enter it."),
      a("شوك", "شَوَّكَ", "Form-II derived verb", "he made thorny / thorns emerged", "Derived form in the same root family.", "The basic thorn branch becomes a causative/intensive or growth pattern.", "Adds a distinct derived pattern.", "The Academy defines شَوَّكَ for plants producing thorns and related growth."),
    ],
    ["شَوْكَةٌ is the lexical noun already present in ٱلشَّوْكَةِ; removing the article/case shell would not create a new row.", "شَوْكٌ was not added separately because it is the same noun family and would duplicate the current lexical branch."],
  ),

  "lexical|صوع|صواع|noun/pronoun": full(
    "صوع",
    "و",
    evidence("صوع", "The entry attests صَاعَ, صَوَّعَ, اِنْصَاعَ, تَصَوَّعَ and the measure/vessel nouns الصَّاع and الصُّواع."),
    "The middle و is retained in صُوَاع and surfaces as the long ā in the hollow verb صَاعَ.",
    [
      a("صوع", "صَاعَ", "Form-I hollow perfect verb", "he dispersed / scattered or measured", "Basic hollow verb in the same root entry.", "The Qur’anic vessel noun belongs to the measure branch; the verb displays the wider root meanings honestly.", "Shows the root’s lexical development beyond the specialised vessel.", "The Academy records صَاعَ with dispersing, collecting and measuring senses."),
      a("صوع", "صَوَّعَ", "Form-II derived verb", "he made level / prepared or measured", "Derived form of the same root.", "The measuring/arranging branch develops into causing something to be level or prepared.", "Adds a clear derived pattern.", "The Academy lists صَوَّعَ in the صوع family."),
      a("صوع", "اِنْصَاعَ", "Form-VII derived verb", "he submitted / obeyed", "Established derived form in the same root family.", "The root develops from yielding or dispersal into submission; the meaning is translated independently.", "Shows semantic development and a distinct pattern.", "The Academy defines اِنْصَاعَ with submission/obedience meanings."),
      a("صوع", "تَصَوَّعَ", "Form-V derived verb", "he dispersed / scattered", "Established derived form in the same root.", "The dispersal branch is marked as a derived intransitive pattern.", "Contrasts basic and derived movement meanings.", "The Academy lists تَصَوَّعَ in the صوع family."),
    ],
    ["صَاعٌ was considered but not selected because the Qur’anic صُوَاع already occupies the closely related measure/vessel noun branch; the selected verb forms teach more morphology.", "Case ending in صُوَاعَ was not counted."],
  ),

  "lexical|صوف|اصواف|noun/pronoun": full(
    "صوف",
    "و",
    evidence("صوف", "The entry attests صَافَ, صَوَّفَ, تَصَوَّفَ and the nouns الصُّوف and صُوفَة with wool and wool-related developments."),
    "The middle و remains visible in صُوف and appears as the long ā in the hollow verb صَافَ.",
    [
      a("صوف", "صَافَ", "Form-I hollow perfect verb", "a ram grew wool", "Basic hollow verb directly related to the wool noun.", "The Qur’anic plural names wool; the verb names its growth on the animal.", "Connects material noun and natural process.", "The Academy defines صَافَ for a ram developing wool."),
      a("صوف", "صَوَّفَ", "Form-II derived verb", "he made woolly / made a Sufi", "Derived form in the same root family.", "The root develops from wool to making wool-like or associating someone with wool; the gloss is kept specific.", "Shows a genuine derived semantic branch.", "The Academy lists صَوَّفَ with woolly/Sufi meanings."),
      a("صوف", "تَصَوَّفَ", "Form-V derived verb", "he became a Sufi / adopted Sufi practice", "Established Form-V branch of the same root.", "The lexical history develops from wool to the named religious association; it is not presented as ‘wool’ itself.", "Teaches semantic development across a derived form.", "The Academy defines تَصَوَّفَ in the Sufi branch."),
      a("صوف", "صُوفَةٌ", "lexical noun", "a tuft or piece of wool", "Established singular noun related to the current plural material noun.", "The general material develops into one tuft/piece; this is more informative than merely repeating the plural.", "Provides a concrete noun contrast.", "The Academy records صُوفَةٌ in the صوف family."),
    ],
    ["أَصْوَافٌ is the current lexical plural without the possessive shell; it was not duplicated as a separate row.", "صُوفٌ was not added as a fifth row because the selected صُوفَةٌ gives a more distinct lexical noun while remaining directly connected."],
  ),

  "lexical|صيص|صياصي|noun/pronoun": full(
    "صيص",
    "ي",
    evidence("صيص", "The entry attests صَاصَ, أَصَاصَ, صَيَّصَ and the nouns الصِّيص, الصِّيصَاء, الصِّيصَة and الصِّيصِيَة, including the stronghold branch."),
    "The middle ي is visible in صِيصِيَة and the broken plural صَيَاصِي; the hollow alternation is lexical rather than a new root.",
    [
      a("صيص", "صِيصِيَةٌ", "lexical singular noun", "a fortress / stronghold", "Singular lexical counterpart of the Qur’anic plural صَيَاصِي.", "The current plural is decoded through its genuine singular and the possessive suffix is not counted.", "Makes the unusual broken plural recognisable.", "The Academy records الصِّيصِيَة as a fortress/stronghold."),
      a("صيص", "صَاصَ", "Form-I hollow perfect verb", "a palm became ṣīṣ / developed an unripe date", "Basic verb in the same four-letter lexical family.", "The root has a plant/fruit branch distinct from the stronghold branch; the meaning is stated honestly.", "Shows real semantic development rather than rejecting it for gloss difference.", "The Academy defines صَاصَ in the palm/unripe-date branch."),
      a("صيص", "أَصَاصَ", "Form-IV derived verb", "he caused or made ṣīṣ", "Derived form in the same root family.", "The plant/fruit branch becomes causative.", "Adds a genuinely distinct derived pattern.", "The Academy lists أَصَاصَ under صيص."),
      a("صيص", "صَيَّصَ", "Form-II derived verb", "he made or produced ṣīṣ", "Form-II development of the same root.", "The same plant branch appears in an intensive/causative pattern.", "Provides another real form without shell padding.", "The Academy lists صَيَّصَ under صيص."),
    ],
    ["صِيصٌ and صِيصَاءُ were considered as plant-branch nouns but the selected singular fortress noun plus three attested verbal patterns gives a more useful mix.", "The possessive suffix in صَيَاصِيهِمْ was not counted."],
  ),

  "lexical|ضير|ضير|noun/pronoun": full(
    "ضير",
    "ي",
    evidence("ضير", "The Academy and classical Qur’anic lexica attest ضَارَ يَضِيرُ ضَيْرًا for harming; the established derivatives include ضَائِر and مَضِير in approved dictionary evidence."),
    "The middle ي is visible in ضَيْر and يَضِير; the hollow vowel pattern must not be normalised to the unrelated ضَرَر branch.",
    [
      a("ضير", "ضَارَ", "Form-I hollow perfect verb", "he harmed / caused loss", "Basic hollow verb whose maṣdar is ضَيْر.", "The Qur’anic noun names harm; the verb names causing it.", "Connects the noun directly to its verbal source.", "Classical Qur’anic lexica explain ضَيْر as from ضَارَ."),
      a("ضير", "يَضِيرُ", "Form-I hollow imperfect verb", "he harms / causes loss", "Imperfect counterpart of ضَارَ.", "The present/imperfect pattern makes the hollow alternation visible.", "Provides a meaningful tense/pattern contrast.", "Classical Qur’anic lexica attest ضَارَ يَضِيرُ ضَيْرًا."),
      a("ضير", "ضَائِرٌ", "Form-I active participle", "harmful / one who harms", "Active participle of ضَارَ.", "The event becomes an agent or property that causes harm.", "Adds a useful participial recognition form.", "Approved Arabic dictionary evidence records ضَائِرٌ from ضَارَ يَضِيرُ."),
      a("ضير", "مَضِيرٌ", "Form-I passive participle/adjective", "harmed / affected", "Result adjective/passive participle in the same root family.", "The participant role reverses from causing harm to being affected by it.", "Completes an honest active/passive teaching contrast.", "Approved Arabic dictionary evidence records مَضِيرٌ as the affected/result form."),
    ],
    ["ضَارَ يَضُورُ is a documented alternate hollow pronunciation, but it was not added as a separate row because the Qur’anic/root lesson is centred on the established ض ي ر branch.", "Case ending in ضَيْرَ was not counted."],
  ),

  "lexical|طود|طود|noun/pronoun": full(
    "طود",
    "و",
    evidence("طود", "The entry attests طَادَ, طَوَّدَ, اِنْطَادَ, تَطَوَّدَ and الطَّوْد with mountain, height and firmness branches."),
    "The middle و is retained in الطَّوْد and appears as the long ā in طَادَ; the surface noun is not reanalysed as a different root.",
    [
      a("طود", "طَادَ", "Form-I hollow perfect verb", "he stood firm / settled", "Basic hollow verb in the firmness/height family.", "The Qur’anic noun is a mountain; the verb shows the root’s firmness branch.", "Connects the concrete mountain to the wider root semantics.", "The Academy defines طَادَ with settling/standing-firm senses."),
      a("طود", "طَوَّدَ", "Form-II derived verb", "he made high / raised", "Derived Form-II of the same root.", "The mountain/height branch becomes causative or intensive.", "Shows a useful derived pattern.", "The Academy defines طَوَّدَ with making long/high and related senses."),
      a("طود", "اِنْطَادَ", "Form-VII derived verb", "he rose / became elevated", "Derived intransitive form in the same root family.", "The height branch is presented as a change of state.", "Adds a distinct derived movement/elevation form.", "The Academy lists اِنْطَادَ in the طود family."),
      a("طود", "تَطَوَّدَ", "Form-V derived verb", "he became elevated / acquired height", "Established derived form of the same root.", "The root develops from mountain/firmness into entering an elevated state.", "Provides a fifth useful root-pattern view without duplicating الطَّوْد.", "The Academy lists تَطَوَّدَ in the طود family."),
    ],
    ["طَوْدٌ is the same lexical noun already present inside كَٱلطَّوْدِ; article, preposition and case removal were not counted.", "The selected four verbs are preferred over noun-number variants."],
  ),

  "lexical|عوق|معوقين|noun/pronoun": full(
    "عوق",
    "و",
    evidence("عوق", "The entry attests عَاقَ, يَعُوقُ, أَعَاقَ, عَوَّقَ, تَعَوَّقَ, العَوْق and العَائِق, all in the hindering/prevention family."),
    "The middle و is preserved in يَعُوقُ and عَوْق; the doubled Form-II stem in مُعَوِّقِينَ is a derived form of the same hollow root.",
    [
      a("عوق", "عَاقَ", "Form-I hollow perfect verb", "he hindered / prevented", "Basic verb underlying the Qur’anic Form-II active participle.", "The current word names those who hinder; the basic verb names the act.", "Makes the derived participle’s lexical base visible.", "The Academy defines عَاقَ with hindering/preventing meanings."),
      a("عوق", "أَعَاقَ", "Form-IV derived verb", "he hindered / disabled", "Causative/derived form of the same root.", "The meaning develops from hindering to causing an impediment or disability.", "Shows a useful Form-IV contrast.", "The Academy defines أَعَاقَ as hindering."),
      a("عوق", "تَعَوَّقَ", "Form-V derived verb", "he held back / hesitated", "Derived intransitive/reflexive form of the same root.", "The external hindrance becomes a subject’s being held back or hesitating.", "Teaches a change in participant structure.", "The Academy defines تَعَوَّقَ with holding back and hesitation senses."),
      a("عوق", "عَائِقٌ", "active participle/noun", "an obstacle / hindering agent", "Established noun/active participle in the same root family.", "The act of hindering becomes the person or thing that obstructs.", "Adds a concise lexical noun contrast without using another shell variant.", "The Academy defines العَائِق as a blocker or occupier."),
    ],
    ["يَعُوقُ was considered, but the same-root imperfect would add less teaching value than the selected Form-IV, Form-V and agent-noun contrasts.", "The plural ending in مُعَوِّقِينَ and the article/case shell were not counted."],
  ),
};

if (Object.keys(C3C4B_SPECS).length !== C3C4B_FAMILY_KEYS.length) {
  throw new Error(`C3-C4B specification count mismatch: ${Object.keys(C3C4B_SPECS).length}`);
}
