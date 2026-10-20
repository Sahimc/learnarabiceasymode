import type { LessonForm } from "../../app/data/content-contract";

export type C1RelatedForm = Pick<LessonForm, "form" | "meaning" | "difference" | "relationship"> & {
  morphology: string;
  pedagogicalValue: string;
  evidence: string;
};

export type C1FamilySpec = {
  root: string;
  currentMeaning: string;
  familyTeachingNote: string;
  related: C1RelatedForm[];
};

const evidence = (root: string, basis: string) =>
  `${basis} The form is an attested ${root} same-root derivation; semantic development is stated explicitly and shared radicals alone are not treated as sufficient evidence.`;

const row = (
  root: string,
  form: string,
  meaning: string,
  morphology: string,
  difference: string,
  relationship: string,
  pedagogicalValue: string,
  basis: string,
): C1RelatedForm => ({
  form,
  meaning,
  morphology,
  difference,
  relationship,
  pedagogicalValue,
  evidence: evidence(root, basis),
});

/**
 * The C1 family catalogue is deliberately explicit.  It is the reviewed
 * authoring source for this tier, rather than a root-wide copy of rows from
 * another lesson.  A future adjudication must add a reviewed specification or
 * leave the family blocked; it must not silently fall back to root-only rows.
 */
export const C1_FAMILY_SPECS: Record<string, C1FamilySpec> = {
  زلل: {
    root: "زلل",
    currentMeaning: "caused/induced them to slip",
    familyTeachingNote: "Form I slipping, Form IV causing to slip and Form X causing to slip are shown as related semantic development.",
    related: [
      row("زلل", "زَلَّ", "he slipped / erred", "Form I perfect", "Basic completed slipping event.", "Form I of the same root; the basic event behind the Qur’anic causative form.", "Contrasts the basic event with causing someone else to slip.", "Canonical Qur’anic root evidence and reviewed project morphology."),
      row("زلل", "يَزِلُّ", "he slips / errs", "Form I imperfect", "Ongoing Form I slipping.", "Form I imperfect of the same lexical root.", "Makes the root recognisable in the ongoing pattern.", "Canonical Qur’anic root evidence and reviewed project morphology."),
      row("زلل", "زَلَلٌ", "slipping / error", "Form I verbal noun", "Names the slipping or error.", "Form I action noun of the same root.", "Connects the event to its abstract noun.", "Approved project root-family evidence."),
      row("زلل", "أَزَلَّ", "he caused someone to slip", "Form IV perfect", "Causative Form IV.", "Form IV causative development of the same root.", "Shows how the root changes from slipping to causing a slip.", "Canonical Qur’anic evidence for the causative branch and reviewed morphology."),
    ],
  },
  شور: {
    root: "شور",
    currentMeaning: "and consult them",
    familyTeachingNote: "Form III consultation, its action noun, mutual consultation and the established noun shūrā are compared.",
    related: [
      row("شور", "شَاوَرَ", "he consulted", "Form III perfect", "Completed Form III consultation.", "Form III verb of the same root as the Qur’anic imperative.", "Shows the dictionary verb behind the occurrence.", "Canonical Qur’anic evidence and reviewed project morphology."),
      row("شور", "مُشَاوَرَةٌ", "consultation", "Form III verbal noun", "Names the consultation.", "Form III maṣdar of شَاوَرَ.", "Connects the verb to its action noun.", "Canonical Qur’anic evidence at 42:38 and reviewed project morphology."),
      row("شور", "تَشَاوُرٌ", "mutual consultation", "Form VI verbal noun", "Shows reciprocal consultation.", "Form VI development of the same root.", "Teaches the mutuality added by the derived pattern.", "Approved same-root morphology evidence."),
      row("شور", "شُورَىٰ", "consultation / counsel", "Established lexical noun", "A lexical noun for counsel or consultation.", "Established noun in the same root family, with its own meaning.", "Shows meaning development beyond verb conjugation.", "Canonical Qur’anic evidence and approved project lexical evidence."),
    ],
  },
  درأ: {
    root: "درأ",
    currentMeaning: "then repel / avert",
    familyTeachingNote: "The shell-only imperative without فـ is excluded; the Form VI mutual-dispute development is taught instead.",
    related: [
      row("درأ", "دَرَأَ", "he repelled / averted", "Form I perfect", "Completed repelling or averting.", "Form I basic verb of the same root.", "Shows the basic action behind the current imperative.", "Canonical Qur’anic root evidence and reviewed project morphology."),
      row("درأ", "يَدْرَأُ", "he repels / averts", "Form I imperfect", "Ongoing Form I repelling.", "Form I imperfect of the same root.", "Contrasts completed and ongoing action.", "Canonical Qur’anic root evidence and reviewed project morphology."),
      row("درأ", "دَرْءٌ", "repelling / averting", "Form I verbal noun", "Names the action.", "Form I action noun of the same root.", "Adds an abstract action noun rather than shell padding.", "Approved project root-family evidence."),
      row("درأ", "ٱدَّارَأَ", "he disputed with another", "Form VI perfect", "Mutual/disputing development of the root.", "A genuinely derived same-root form, not the current imperative with فـ removed.", "Shows a distinct derived pattern and semantic development.", "Canonical Qur’anic evidence for فَادَّارَأْتُمْ and reviewed morphology."),
    ],
  },
  كمل: {
    root: "كمل",
    currentMeaning: "I completed / perfected",
    familyTeachingNote: "State, causative completion, abstract noun, adjective and becoming-complete are compared.",
    related: [
      row("كمل", "كَمُلَ", "became complete / perfect", "Form I perfect", "Basic state of being complete.", "Form I state verb of the same root.", "Contrasts the state with the causative current form.", "Approved project root-family evidence."),
      row("كمل", "كَمَالٌ", "completeness / perfection", "Lexical abstract noun", "Names completeness or perfection.", "Established noun of the same root.", "Teaches the abstract meaning without another person/tense variant.", "Approved Arabic lexical and project root evidence."),
      row("كمل", "كَامِلٌ", "complete / perfect", "Form I active adjective", "Describes something complete.", "Established adjective in the same root family.", "Connects the state to a learner-facing adjective.", "Approved Arabic lexical and project root evidence."),
      row("كمل", "اِكْتَمَلَ", "became complete", "Form VIII perfect", "Derived becoming-complete pattern.", "Form VIII development of the same root.", "Shows the change into a complete state.", "Approved same-root morphology evidence."),
    ],
  },
  غرو: {
    root: "غرو",
    currentMeaning: "so We stirred/incited",
    familyTeachingNote: "A clean Form IV verb, imperfect, verbal noun and active participle are retained.",
    related: [
      row("غرو", "أَغْرَى", "he incited", "Form IV perfect", "Completed causative/inciting action.", "Form IV stem of the same root.", "Shows the dictionary form behind the inflected occurrence.", "Canonical Qur’anic root evidence and reviewed project morphology."),
      row("غرو", "يُغْرِي", "he incites", "Form IV imperfect", "Ongoing Form IV incitement.", "Form IV imperfect of the same root.", "Makes the current stem recognisable across tense.", "Canonical Qur’anic root evidence and reviewed project morphology."),
      row("غرو", "إِغْرَاءٌ", "incitement", "Form IV verbal noun", "Names the inciting action.", "Form IV maṣdar of أَغْرَى.", "Connects the verb to its action noun.", "Approved project root-family evidence."),
      row("غرو", "مُغْرٍ", "inciting / one who incites", "Form IV active participle", "Names the inciting agent.", "Form IV active participle of the same root.", "Shows the agent pattern.", "Approved project root-family evidence."),
    ],
  },
  عثر: {
    root: "عثر",
    currentMeaning: "was discovered (in عُثِرَ عَلَىٰ)",
    familyTeachingNote: "The discovery sense is tied to the construction عَثَرَ عَلَىٰ / عُثِرَ عَلَىٰ; the root’s stumbling sense is not silently substituted.",
    related: [
      row("عثر", "عَثَرَ", "he stumbled / discovered", "Form I perfect", "Form I has both stumbling and finding branches.", "Same root; the finding sense is expressed in عَثَرَ عَلَىٰ.", "Prevents the discovery construction from being confused with the separate stumbling sense.", "Canonical Qur’anic occurrence evidence and approved lexical distinction."),
      row("عثر", "يَعْثُرُ", "he stumbles / discovers", "Form I imperfect", "Ongoing Form I branch; discovery takes عَلَىٰ.", "Form I imperfect of the same root.", "Shows the root while preserving the construction-sensitive meaning.", "Approved same-root morphology evidence."),
      row("عثر", "عُثُورٌ", "finding / discovery", "Form I verbal noun", "Names finding or discovery.", "Form I action noun of the same root in the finding branch.", "Connects the construction to its action noun.", "Approved project lexical evidence."),
      row("عثر", "أَعْثَرَ", "caused someone to discover / made known", "Form IV perfect", "Causative discovery.", "Form IV causative development of the same root.", "Shows how the root moves from finding to causing discovery.", "Canonical Qur’anic evidence at 5:107 and reviewed morphology."),
    ],
  },
  نأي: {
    root: "نأي",
    currentMeaning: "and they keep away",
    familyTeachingNote: "The active participle is نَاءٍ, not نَائٍ; the weak-root spelling is preserved.",
    related: [
      row("نأي", "نَأَى", "went / kept away", "Form I defective perfect", "Completed withdrawal.", "Form I perfect of the same root.", "Shows the completed action behind the current imperfect.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("نأي", "نَأْيٌ", "distancing / remoteness", "Form I verbal noun", "Names distancing.", "Form I action noun of the same root.", "Adds the abstract meaning.", "Approved project root-family evidence."),
      row("نأي", "نَاءٍ", "distant / one keeping away", "Form I active participle", "Describes the one who is distant or keeps away.", "Weak-root active participle of the same root.", "Corrects the spelling while teaching the participle pattern.", "Approved Arabic lexical evidence and weak-root morphology."),
      row("نأي", "أَنْأَى", "caused to become distant / removed", "Form IV perfect", "Causative distancing.", "Form IV development of the same root.", "Shows a genuine derived meaning rather than a shell variant.", "Approved same-root morphology evidence."),
    ],
  },
  وقف: {
    root: "وقف",
    currentMeaning: "they were made to stand",
    familyTeachingNote: "The passive Qur’anic form is compared with the basic verb, imperfect, maṣdar and passive participle.",
    related: [
      row("وقف", "وَقَفَ", "stood / stopped", "Form I perfect", "Basic completed standing or stopping.", "Form I verb of the same root.", "Shows the active base of the passive occurrence.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("وقف", "يَقِفُ", "stands / stops", "Form I imperfect", "Ongoing standing or stopping.", "Form I imperfect of the same root.", "Adds the ongoing pattern.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("وقف", "وُقُوفٌ", "standing / stopping", "Form I verbal noun", "Names the state or action.", "Form I action noun of the same root.", "Connects the verb to its abstract noun.", "Approved project root-family evidence."),
      row("وقف", "مَوْقُوفٌ", "stopped / made to stand / detained", "Form I passive participle", "Shows the affected participant.", "Passive participle of the same root.", "Makes the passive relationship visible.", "Approved project morphology evidence."),
    ],
  },
  طرد: {
    root: "طرد",
    currentMeaning: "you drive them away",
    familyTeachingNote: "Active verb, imperfect, active participle and passive participle are shown.",
    related: [
      row("طرد", "طَرَدَ", "drove away", "Form I perfect", "Completed driving away.", "Form I verb of the same root.", "Shows the basic action.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("طرد", "يَطْرُدُ", "drives away", "Form I imperfect", "Ongoing driving away.", "Form I imperfect of the same root.", "Contrasts completed and ongoing action.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("طرد", "طَارِدٌ", "one who drives away", "Form I active participle", "Names the agent.", "Active participle of the same root.", "Shows the agent pattern.", "Canonical Qur’anic evidence and approved morphology."),
      row("طرد", "مَطْرُودٌ", "one driven away", "Form I passive participle", "Names the affected person.", "Passive participle of the same root.", "Shows the active/passive contrast.", "Approved project morphology evidence."),
    ],
  },
  جوز: {
    root: "جوز",
    currentMeaning: "We took across / passed beyond",
    familyTeachingNote: "The passage/crossing sense is kept distinct from unrelated modern glosses such as passport or permission.",
    related: [
      row("جوز", "جَازَ", "passed / crossed", "Form I hollow perfect", "Completed passage or crossing.", "Form I base of the same root.", "Shows the basic passage event.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("جوز", "يَجُوزُ", "passes / crosses", "Form I hollow imperfect", "Ongoing passage or crossing.", "Form I imperfect of the same root.", "Makes the hollow-root pattern recognisable.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("جوز", "جَوَازٌ", "passage / crossing", "Lexical noun", "Names passage or crossing in this root sense.", "Established noun of the same root; not automatically modern permission/passport.", "Teaches the relevant lexical branch honestly.", "Approved project root-family evidence."),
      row("جوز", "تَجَاوَزَ", "passed beyond / went beyond / overlooked", "Form VI perfect", "Derived going-beyond pattern.", "Form VI development of the same root.", "Shows useful semantic extension.", "Canonical Qur’anic evidence at 46:16 and reviewed morphology."),
    ],
  },
  سلخ: {
    root: "سلخ",
    currentMeaning: "detached / withdrew / passed out",
    familyTeachingNote: "فَ in فَٱنسَلَخَ remains a conjunction shell, not a separate family member; each occurrence keeps its exact current surface first.",
    related: [
      row("سلخ", "سَلَخَ", "stripped / removed", "Form I perfect", "Basic stripping action.", "Form I base of the same root.", "Shows the source action behind detaching.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("سلخ", "يَسْلَخُ", "strips / removes", "Form I imperfect", "Ongoing stripping action.", "Form I imperfect of the same root.", "Adds the ongoing pattern.", "Approved project root-family evidence."),
      row("سلخ", "سَلْخٌ", "stripping / removal", "Form I verbal noun", "Names the action.", "Form I action noun of the same root.", "Connects the verb to its abstract noun.", "Approved project root-family evidence."),
      row("سلخ", "مَسْلُوخٌ", "stripped", "Form I passive participle", "Shows the removed object.", "Passive participle of the same root.", "Shows the result of stripping.", "Approved project morphology evidence."),
    ],
  },
  زهق: {
    root: "زهق",
    currentMeaning: "should depart / perish",
    familyTeachingNote: "Basic verb, maṣdar, participle and causative destruction are compared.",
    related: [
      row("زهق", "زَهَقَ", "vanished / perished", "Form I perfect", "Completed departure or perishing.", "Form I base of the same root.", "Shows the basic event.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("زهق", "زُهُوقٌ", "vanishing / perishing", "Form I verbal noun", "Names the event.", "Form I action noun of the same root.", "Adds the abstract event.", "Approved project root-family evidence."),
      row("زهق", "زَاهِقٌ", "vanishing / perishing", "Form I active participle", "Describes what is departing or perishing.", "Active participle of the same root.", "Shows the participial state.", "Approved project morphology evidence."),
      row("زهق", "أَزْهَقَ", "caused to perish / destroyed", "Form IV perfect", "Causative destruction.", "Form IV development of the same root.", "Shows the root changing from perishing to causing destruction.", "Approved same-root morphology evidence."),
    ],
  },
  لفت: {
    root: "لفت",
    currentMeaning: "to turn us away",
    familyTeachingNote: "Basic verb, action noun, Form VIII and Form V derived turning patterns are shown.",
    related: [
      row("لفت", "لَفَتَ", "turned / diverted", "Form I perfect", "Basic turning or diverting action.", "Form I base of the same root.", "Shows the basic event.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("لفت", "لَفْتٌ", "turning / diversion", "Form I verbal noun", "Names the action.", "Form I action noun of the same root.", "Adds the abstract action.", "Approved project root-family evidence."),
      row("لفت", "اِلْتَفَتَ", "turned oneself / looked back", "Form VIII perfect", "Reflexive or inward turning.", "Form VIII development of the same root.", "Shows a genuinely different derived behaviour.", "Canonical Qur’anic evidence and reviewed morphology."),
      row("لفت", "تَلَفَّتَ", "turned repeatedly / looked around", "Form V perfect", "Repeated or intensified turning.", "Form V development of the same root.", "Shows another useful derived pattern.", "Approved same-root morphology evidence."),
    ],
  },
  خبت: {
    root: "خبت",
    currentMeaning: "they humbled/submitted themselves",
    familyTeachingNote: "The Form IV humility branch and Form I stillness/low-ground branch are both shown with separate meanings; neither is mistranslated as the other.",
    related: [
      row("خبت", "أَخْبَتَ", "humbled / submitted himself", "Form IV perfect", "Form IV humility and submission.", "Form IV branch of the Qur’anic sense.", "Shows the base form of the current Qur’anic verb.", "Canonical Qur’anic root evidence and approved morphology."),
      row("خبت", "مُخْبِتٌ", "humble / submissive person", "Form IV active participle", "Names the person marked by humility.", "Form IV active participle of أَخْبَتَ.", "Connects the verb to the learner-facing adjective/noun.", "Canonical Qur’anic root evidence and approved morphology."),
      row("خبت", "خَبَتَ", "became still / low / hidden", "Form I perfect", "Form I stillness, low ground or hiddenness branch.", "Same root with a distinct lexical branch; its meaning is not ‘humbled himself’.", "Demonstrates semantic development across derived forms honestly.", "Approved Arabic lexical distinction and root evidence."),
      row("خبت", "خَبْتٌ", "low / open tract of land", "Lexical noun", "Names the low/open ground branch.", "Established noun related to the Form I lexical branch.", "Shows a noun meaning rather than forcing the Form IV spiritual sense.", "Approved Arabic lexical distinction and root evidence."),
    ],
  },
  لزم: {
    root: "لزم",
    currentMeaning: "shall We compel you to adhere to it?",
    familyTeachingNote: "Basic adherence, action noun, causative compulsion and the binding noun are preferred over another person/tense of the current Form IV stem.",
    related: [
      row("لزم", "لَزِمَ", "adhered / remained attached / became incumbent", "Form I perfect", "Basic adherence or incumbency.", "Form I base of the same root.", "Shows the state behind the causative current form.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("لزم", "لُزُومٌ", "adherence / necessity", "Form I verbal noun", "Names adherence or necessity.", "Form I action noun of the same root.", "Adds the abstract root meaning.", "Approved project root-family evidence."),
      row("لزم", "أَلْزَمَ", "compelled / imposed", "Form IV perfect", "Causative compulsion.", "Form IV causative of the same root.", "Shows the derived force of the current word.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("لزم", "لِزَامٌ", "something binding / inevitable", "Lexical noun", "Names what is binding or inevitable.", "Established noun of the same root.", "Provides a richer lexical contrast than يُلْزِمُ.", "Canonical Qur’anic evidence and approved project lexical evidence."),
    ],
  },
  لفو: {
    root: "لفو",
    currentMeaning: "they both found",
    familyTeachingNote: "The project’s weak-root normalisation is ل ف و; the row family stays within Form IV and uses exact current-first handling.",
    related: [
      row("لفو", "أَلْفَى", "found", "Form IV perfect", "Dictionary form of finding.", "Form IV base of the current occurrence.", "Shows the lexical form behind the dual occurrence.", "Canonical Qur’anic evidence and reviewed morphology."),
      row("لفو", "يُلْفِي", "finds", "Form IV imperfect", "Ongoing finding.", "Form IV imperfect of the same root.", "Adds tense contrast without shell padding.", "Approved project root-family evidence."),
      row("لفو", "إِلْفَاءٌ", "finding", "Form IV verbal noun", "Names the finding action.", "Form IV maṣdar of أَلْفَى.", "Connects the verb to its action noun.", "Approved project root-family evidence."),
      row("لفو", "مُلْفٍ", "one who finds", "Form IV active participle", "Names the finding agent.", "Form IV active participle of the same root.", "Shows the agent pattern.", "Approved project root-family evidence."),
    ],
  },
  سيل: {
    root: "سيل",
    currentMeaning: "then it flowed",
    familyTeachingNote: "Verb, imperfect, root noun, place/channel noun and causative are compared.",
    related: [
      row("سيل", "يَسِيلُ", "flows", "Form I imperfect", "Ongoing flowing.", "Form I imperfect of the same root.", "Contrasts the current perfect with ongoing action.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("سيل", "سَيْلٌ", "torrent / flood / flowing water", "Lexical root noun", "Names the flowing water or event.", "Established noun of the same root.", "Connects the verb to the root noun.", "Canonical Qur’anic evidence and approved project lexical evidence."),
      row("سيل", "مَسِيلٌ", "channel / place of flowing", "Derived place noun", "Names the channel or place produced by flowing.", "Established ma fʿil place/result noun of the same root.", "Shows place/result development.", "Existing reviewed project provenance for مَسِيلٌ and approved morphology evidence."),
      row("سيل", "أَسَالَ", "caused to flow", "Form IV perfect", "Causative flowing.", "Form IV development of the same root.", "Shows the root changing from flowing to causing flow.", "Approved same-root morphology evidence."),
    ],
  },
  زول: {
    root: "زول",
    currentMeaning: "to cease / move away",
    familyTeachingNote: "The Form I branch is kept visible with زَائِلٌ before the causative Form IV أَزَالَ.",
    related: [
      row("زول", "زَالَ", "ceased / moved away", "Form I hollow perfect", "Completed cessation or movement away.", "Form I base of the same root.", "Shows the basic change.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("زول", "زَوَالٌ", "cessation / passing away", "Form I verbal noun", "Names the change.", "Form I action noun of the same root.", "Adds the abstract event.", "Approved project root-family evidence."),
      row("زول", "زَائِلٌ", "passing / vanishing", "Form I active participle", "Describes what is passing away.", "Form I active participle of the same root.", "Keeps the learner inside the basic branch before the causative.", "Approved Arabic weak-root morphology evidence."),
      row("زول", "أَزَالَ", "removed / caused to cease", "Form IV perfect", "Causative removal.", "Form IV development of the same root.", "Shows the causative meaning explicitly.", "Canonical Qur’anic/root evidence and approved morphology."),
    ],
  },
  هزز: {
    root: "هزز",
    currentMeaning: "and shake!",
    familyTeachingNote: "The Form VIII self-movement pattern is preferred to a mechanically generated passive participle.",
    related: [
      row("هزز", "هَزَّ", "shook", "Form I doubled-root perfect", "Completed shaking.", "Form I base of the same root.", "Shows the basic action.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("هزز", "يَهُزُّ", "shakes", "Form I doubled-root imperfect", "Ongoing shaking.", "Form I imperfect of the same root.", "Adds the ongoing pattern.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("هزز", "هَزٌّ", "shaking", "Form I verbal noun", "Names the action.", "Form I action noun of the same root.", "Connects the verb to its abstract noun.", "Approved project root-family evidence."),
      row("هزز", "اِهْتَزَّ", "moved / shook itself", "Form VIII perfect", "Self-movement or responsive shaking.", "Form VIII development of the same root.", "Shows a genuinely different derived pattern.", "Canonical Qur’anic evidence at 22:5 and 41:39 and reviewed morphology."),
    ],
  },
  نكس: {
    root: "نكس",
    currentMeaning: "they were turned/reversed",
    familyTeachingNote: "Passive occurrence, active base, maṣdar, active participle and Form II are compared.",
    related: [
      row("نكس", "نَكَسَ", "turned / reversed", "Form I perfect", "Basic completed reversal.", "Form I base of the same root.", "Shows the active action behind the passive occurrence.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("نكس", "نَكْسٌ", "reversal / overturning", "Form I verbal noun", "Names the action.", "Form I action noun of the same root.", "Adds the abstract event.", "Approved project root-family evidence."),
      row("نكس", "نَاكِسٌ", "lowering / turning down", "Form I active participle", "Describes the one turning or lowering.", "Form I active participle of the same root.", "Shows the agent/state pattern.", "Approved project morphology evidence."),
      row("نكس", "نَكَّسَ", "reversed / turned back", "Form II perfect", "Intensive/causative derived reversal.", "Form II development of the same root.", "Shows a distinct derived pattern.", "Approved same-root morphology evidence."),
    ],
  },
  عيي: {
    root: "عيي",
    currentMeaning: "become unable / fail",
    familyTeachingNote: "The Form I inability branch is distinguished from the Form IV weariness/causative branch, with each meaning translated honestly.",
    related: [
      row("عيي", "عَيِيَ", "became unable / was at a loss", "Form I defective perfect", "Completed inability or perplexity.", "Form I branch of the same root.", "Shows the basic state behind the Qur’anic imperfect.", "Canonical Qur’anic root evidence and reviewed morphology."),
      row("عيي", "عِيٌّ", "inability / incapacity", "Form I lexical noun", "Names inability.", "Established noun of the Form I branch.", "Adds an abstract lexical meaning.", "Approved Arabic lexical evidence."),
      row("عيي", "عَيِيٌّ", "unable / incapable", "Form I adjective", "Describes one who is unable.", "Established adjective of the same root branch.", "Shows the adjective relationship.", "Approved Arabic lexical evidence."),
      row("عيي", "أَعْيَا", "wearied / rendered incapable / proved too difficult", "Form IV perfect", "Causative or resultative weariness/inability.", "Form IV semantic development of the same root; not silently equated with Form I.", "Teaches the broader root development without mistranslating the form.", "Approved same-root morphology and lexical evidence."),
    ],
  },
};

