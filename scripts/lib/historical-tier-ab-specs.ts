import type { LessonForm } from "../../app/data/content-contract";

export type HistoricalDecision = "FULL" | "CONFIRMED-LIMITED";

export type HistoricalFamilySpec = {
  decision: HistoricalDecision;
  reason: string;
  related: LessonForm[];
  evidence: string[];
};

const related = (
  root: string,
  rows: Array<[string, string, string, string]>,
): LessonForm[] =>
  rows.map(([form, meaning, difference, relationship]) => ({
    form,
    meaning,
    difference,
    relationship,
    provenance: `Historical Tier A/B re-audit under Ṣarf contract v1.3.9; ${root} form checked against canonical Qur'anic evidence, approved project root/morphology evidence and reliable Arabic morphology knowledge.`,
  }));

/**
 * These are deliberately explicit repairs.  Families absent from this map
 * are still reviewed by the re-audit report but their live content is not
 * changed.  That keeps the historical pass targeted and prevents a root-wide
 * generator from silently rewriting good content.
 */
export const HISTORICAL_TIER_AB_SPECS: Record<string, HistoricalFamilySpec> = {
  "lexical|ألم|اليم|noun/pronoun": {
    decision: "FULL",
    reason:
      "The former family counted أَلِيمٌ beside the current أَلِيمٌۢ as a separate member even though the difference was only inflectional. The replacement uses the attested Form-IV causative instead.",
    related: related("أ ل م", [
      [
        "أَلَمٌ",
        "pain",
        "State noun; names the pain rather than describing something as painful.",
        "State noun of the same root.",
      ],
      [
        "تَأَلَّمَ",
        "he suffered",
        "Form V perfect; shows the experiencer undergoing pain.",
        "Derived Form V of أ ل م.",
      ],
      [
        "يَأْلَمُ",
        "he suffers",
        "Form I imperfect; ongoing suffering.",
        "Form I imperfect of the same root.",
      ],
      [
        "آلَمَ",
        "he caused pain",
        "Form IV perfect; causative development.",
        "Form IV causative of the same root.",
      ],
    ]),
    evidence: [
      "Canonical Qur'anic occurrences of أَلِيمٌ and يَأْلَمُ were inspected.",
      "The duplicate adjective with a different case/tanwīn was rejected as shell/inflection padding.",
    ],
  },
  "lexical|جني|جنى|noun/pronoun": {
    decision: "FULL",
    reason:
      "The old family counted جَنَى beside وَجَنَى even though the initial و was only a conjunction. The repaired family replaces that shell copy with the action noun while preserving the current surface form first.",
    related: related("ج ن ي", [
      [
        "يَجْنِي",
        "he harvests / gathers",
        "Form I imperfect; ongoing gathering.",
        "Form I imperfect of the same root.",
      ],
      [
        "جَانٍ",
        "one who gathers / harvests",
        "Active participle; names the agent.",
        "Form I active participle.",
      ],
      [
        "اِجْتَنَى",
        "he gathered / harvested",
        "Form VIII perfect; derived gathering pattern.",
        "Form VIII development of the same root.",
      ],
      [
        "مَجْنِيٌّ",
        "harvested / gathered",
        "Passive participial adjective; names what has been gathered.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical Qur'anic occurrence of وَجَنَى and aligned root evidence were inspected.",
      "وَجَنَى and جَنَى were not counted as two Ṣarf members.",
    ],
  },
  "lexical|دأب|داب|noun/pronoun": {
    decision: "CONFIRMED-LIMITED",
    reason:
      "كَدَأْبِ and دَأْبٌ were treated as separate despite differing only by a preposition/shell and case. The family now uses the established adjective دَؤُوبٌ instead.",
    related: related("د أ ب", [
      [
        "دَأَبَ",
        "he persisted / worked diligently",
        "Form I perfect; completed persistent action.",
        "Form I of the same root.",
      ],
      [
        "يَدْأَبُ",
        "he persists / works diligently",
        "Form I imperfect; ongoing persistence.",
        "Form I imperfect of the same root.",
      ],
      [
        "دَؤُوبٌ",
        "persistent / diligent",
        "Established adjective; describes sustained effort.",
        "Adjective of the same root.",
      ],
      [
        "دَأَبًا",
        "persistent practice / way",
        "Lexical verbal noun; names the habitual course.",
        "Established noun of the same root.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of دَأْب and دَأَبًا were inspected.",
      "The initial كَ and case ending were treated as shell/inflection, not new morphology.",
    ],
  },
  "lexical|دمدم|دمدم|verb": {
    decision: "FULL",
    reason:
      "The former family counted فَدَمْدَمَ and دَمْدَمَ as separate. The conjunction is removed conceptually, and the fourth related row is an active participle rather than a shell copy.",
    related: related("د م د م", [
      [
        "يُدَمْدِمُ",
        "he destroys / crushes",
        "Imperfect of the quadriliteral verb.",
        "Quadriliteral imperfect of the same root.",
      ],
      [
        "دَمْدِمْ",
        "destroy / crush",
        "Imperative; direct command form.",
        "Quadriliteral imperative of the same root.",
      ],
      [
        "دَمْدَمَةٌ",
        "destruction / crushing",
        "Verbal noun; names the action.",
        "Quadriliteral verbal noun.",
      ],
      [
        "مُدَمْدِمٌ",
        "one who destroys / crushes",
        "Active participle; names the agent.",
        "Active participle of the same quadriliteral root.",
      ],
    ]),
    evidence: [
      "The quadriliteral root د م د م was checked as a complete root, not a weak-root family.",
      "فَ was treated as a conjunction shell only.",
    ],
  },
  "lexical|شور|تشاور|noun/pronoun": {
    decision: "FULL",
    reason:
      "وَتَشَاوُرٍ and تَشَاوُرٌ were previously counted as distinct. The repaired family keeps the current form first and substitutes the Form III imperfect, while retaining the useful noun and Form III/VI contrasts.",
    related: related("ش و ر", [
      [
        "شُورَىٰ",
        "consultation / counsel",
        "Established lexical noun; meaning is not flattened to the verb.",
        "Established same-root noun.",
      ],
      [
        "شَاوَرَ",
        "he consulted",
        "Form III perfect; completed consultation.",
        "Form III of the same root.",
      ],
      [
        "مُشَاوَرَةٌ",
        "consultation",
        "Form III verbal noun; names the action.",
        "Maṣdar of شَاوَرَ.",
      ],
      [
        "يُشَاوِرُ",
        "he consults",
        "Form III imperfect; ongoing consultation.",
        "Form III imperfect of the same root.",
      ],
    ]),
    evidence: [
      "The consultation/counsel semantic development is supported by canonical Qur'anic and reviewed project evidence.",
      "Case and conjunction variants were excluded.",
    ],
  },
  "lexical|طرد|طارد|noun/pronoun": {
    decision: "FULL",
    reason:
      "بِطَارِدِ and طَارِدٌ were counted as separate although بِ and case were shell/inflection. The replacement is the action noun طَرْدٌ.",
    related: related("ط ر د", [
      [
        "طَرَدَ",
        "he drove away",
        "Form I perfect; completed expulsion.",
        "Form I of the same root.",
      ],
      [
        "يَطْرُدُ",
        "he drives away",
        "Form I imperfect; ongoing expulsion.",
        "Form I imperfect of the same root.",
      ],
      [
        "طَرْدٌ",
        "driving away / expulsion",
        "Verbal noun; names the action.",
        "Form I verbal noun.",
      ],
      [
        "مَطْرُودٌ",
        "one driven away",
        "Passive participle; names the affected person.",
        "Form I passive participle.",
      ],
    ]),
    evidence: [
      "Canonical occurrence and reviewed root-family evidence were checked.",
      "The preposition بِ and genitive ending were not counted as Ṣarf rows.",
    ],
  },
  "lexical|غضض|يغض|verb": {
    decision: "FULL",
    reason:
      "The prior family included a same-stem imperfect with only a mood/ending difference. The repaired set uses the basic perfect, feminine imperfect, imperative and verbal noun.",
    related: related("غ ض ض", [
      [
        "غَضَّ",
        "he lowered / restrained",
        "Form I perfect; completed restraint.",
        "Form I of the same root.",
      ],
      [
        "يَغْضُضْنَ",
        "they lower / restrain",
        "Form I imperfect, feminine plural; a meaningful gender/number contrast.",
        "Form I imperfect of the same root.",
      ],
      [
        "يَغُضُّونَ",
        "they lower / restrain",
        "Form I imperfect, masculine plural; contrasts with the feminine form.",
        "Form I imperfect of the same root.",
      ],
      [
        "اِغْضُضْ",
        "lower / restrain",
        "Form I imperative; command form.",
        "Form I imperative of the same root.",
      ],
      [
        "غَضٌّ",
        "lowering / restraint",
        "Verbal noun; names the action.",
        "Form I verbal noun.",
      ],
    ]),
    evidence: [
      "Canonical Qur'anic occurrences of the imperative and imperfect were inspected.",
      "The same-person imperfect differing only by case/mood ending was rejected as padding.",
    ],
  },
  "lexical|فلق|فالق|noun/pronoun": {
    decision: "FULL",
    reason:
      "The current active participle was previously repeated with a different case ending. The repaired set uses the verb, imperfect, derived inchoative form and passive participle.",
    related: related("ف ل ق", [
      [
        "فَلَقَ",
        "he split",
        "Form I perfect; completed splitting.",
        "Form I of the same root.",
      ],
      [
        "يَفْلِقُ",
        "he splits",
        "Form I imperfect; ongoing splitting.",
        "Form I imperfect of the same root.",
      ],
      [
        "اِنْفَلَقَ",
        "it split open",
        "Form VII perfect; inchoative/reflexive development.",
        "Form VII of the same root.",
      ],
      [
        "مَفْلُوقٌ",
        "split / cleft",
        "Passive participle; names what has been split.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of فَالِق and اِنْفَلَقَ were checked.",
      "Case variants of فَالِق were not counted twice.",
    ],
  },
  "lexical|فلق|فلق|noun/pronoun": {
    decision: "FULL",
    reason:
      "The root noun family was retained, but its related rows are now explicitly distinct from the current noun and teach the derived family.",
    related: related("ف ل ق", [
      [
        "فَالِقٌ",
        "one who splits",
        "Active participle; agent of splitting.",
        "Active participle of the same root.",
      ],
      ["فَلَقَ", "he split", "Form I perfect.", "Form I of the same root."],
      [
        "يَفْلِقُ",
        "he splits",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "اِنْفَلَقَ",
        "it split open",
        "Form VII; inchoative development.",
        "Form VII of the same root.",
      ],
      [
        "مَفْلُوقٌ",
        "split / cleft",
        "Passive participle; names what has been split.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical root-family evidence was inspected.",
      "The current noun was kept first and no bare root was used.",
    ],
  },
  "lexical|فأي|فئة|noun/pronoun": {
    decision: "CONFIRMED-LIMITED",
    reason:
      "The old full family padded singular occurrences with case-only فِئَةٌ rows. The defensible teaching set is the current singular plus the meaningful dual and plural forms.",
    related: related("ف أ ي", [
      [
        "فِئَتَانِ",
        "two groups",
        "Dual form; teaches number rather than case.",
        "Dual of فِئَةٌ.",
      ],
      [
        "فِئَاتٌ",
        "groups",
        "Sound plural; teaches plural formation.",
        "Plural of فِئَةٌ.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of singular, dual and plural forms were inspected.",
      "Nominative/accusative/genitive variants were not counted as separate Ṣarf members.",
    ],
  },
  "lexical|فأي|فئتان|noun/pronoun": {
    decision: "CONFIRMED-LIMITED",
    reason:
      "The former full family had only singular/dual/plural number contrasts; it did not have four genuinely distinct useful forms. Case variants were removed and the family is honestly limited.",
    related: related("ف أ ي", [
      [
        "فِئَةٌ",
        "a group",
        "Singular form; contrasts with the current dual.",
        "Singular of فِئَةٌ.",
      ],
      [
        "فِئَاتٌ",
        "groups",
        "Plural form; contrasts with the current dual.",
        "Plural of فِئَةٌ.",
      ],
    ]),
    evidence: [
      "Canonical singular, dual and plural occurrences were inspected.",
      "Case-only dual variants were rejected.",
    ],
  },
  "lexical|وجل|وجلة|noun/pronoun": {
    decision: "FULL",
    reason:
      "The former family’s adjective rows collapsed a gender/lexical form after shell normalization. The repaired set uses the verb, imperfect, abstract noun and active adjective.",
    related: related("و ج ل", [
      [
        "وَجِلَ",
        "he felt afraid",
        "Form I perfect; completed state.",
        "Form I of the same root.",
      ],
      [
        "يَوْجَلُ",
        "he feels afraid",
        "Form I imperfect; ongoing state.",
        "Form I imperfect of the same root.",
      ],
      [
        "وَجَلٌ",
        "fear / awe",
        "Abstract noun; names the state.",
        "Form I verbal noun.",
      ],
      [
        "وَاجِلٌ",
        "fearful / apprehensive",
        "Active adjective; describes the experiencer.",
        "Established adjective of the same root.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of وَجِلَ and وَجَلٌ were inspected.",
      "Case-only adjective variants were not counted twice.",
    ],
  },
  "lexical|سيل|سيل|noun/pronoun": {
    decision: "CONFIRMED-LIMITED",
    reason:
      "The former full family counted the current noun and a bare/case variant of the same noun as separate. Four useful forms are defensible here: the current noun, the verb, its imperfect and the active participle; no fifth row is needed for this historical repair.",
    related: related("س ي ل", [
      [
        "سَالَ",
        "he/it flowed",
        "Form I hollow perfect.",
        "Form I of the same weak root.",
      ],
      [
        "يَسِيلُ",
        "he/it flows",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "سَائِلٌ",
        "flowing / one who flows",
        "Active participle; describes the flowing agent or substance.",
        "Active participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of السيل and سالت were inspected.",
      "سَيْلٌ versus السَّيْلُ was not counted as an independent Ṣarf member.",
    ],
  },
  "lexical|طلب|مطلوب|noun/pronoun": {
    decision: "FULL",
    reason:
      "The old family repeated وَالْمَطْلُوبُ as الْمَطْلُوبُ. The replacement uses the active participle طالبٌ to teach the active/passive relationship.",
    related: related("ط ل ب", [
      [
        "طَلَبَ",
        "he sought / requested",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَطْلُبُ",
        "he seeks / requests",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["طَلَبٌ", "seeking / request", "Verbal noun.", "Form I verbal noun."],
      [
        "طَالِبٌ",
        "one who seeks / student",
        "Active participle; contrasts with the passive participle current form.",
        "Active participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical and existing reviewed ط ل ب family evidence was inspected.",
      "The conjunction/article shell was not counted twice.",
    ],
  },
  "lexical|موج|موج|noun/pronoun": {
    decision: "FULL",
    reason:
      "The former family counted الْمَوْجُ and مَوْجٌ as separate. تَمَوَّجَ replaces that noun-case duplicate and adds a genuinely derived Form V development.",
    related: related("م و ج", [
      [
        "مَاجَ",
        "it surged / moved",
        "Form I hollow perfect.",
        "Form I of the same root.",
      ],
      [
        "يَمُوجُ",
        "it surges / moves",
        "Form I hollow imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "مَائِجٌ",
        "surging / agitated",
        "Active participial adjective.",
        "Active participle of the same root.",
      ],
      [
        "تَمَوَّجَ",
        "it rippled / surged",
        "Form V; shows a derived movement pattern.",
        "Form V of the same root.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of موج and the reviewed project form catalogue were inspected.",
      "Article and case variants were rejected as padding.",
    ],
  },
  "lexical|ورق|ورق|noun/pronoun": {
    decision: "FULL",
    reason:
      "The historical family mixed paper and silver occurrences and counted case/article variants. The repaired set keeps the root branches explicit and replaces shell copies with plural, Form II and lexical silver forms.",
    related: related("و ر ق", [
      [
        "أَوْرَاقٌ",
        "leaves / sheets",
        "Broken plural; teaches number.",
        "Plural noun of the same root.",
      ],
      [
        "وَرَّقَ",
        "he covered with leaves / papered",
        "Form II perfect; derived action.",
        "Form II of the same root.",
      ],
      [
        "مُوَرَّقٌ",
        "leafy / covered with leaves",
        "Form II passive participle/adjective.",
        "Derived adjective of the same root.",
      ],
      [
        "وَرِقٌ",
        "silver / money",
        "Established semantic branch; meaning is kept distinct from paper/leaves.",
        "Same-root lexical branch recorded honestly.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of وَرَق and وَرِق were inspected.",
      "The semantic branch is explained rather than flattened, and case/article/attached-pronoun variants are excluded.",
    ],
  },
  "lexical|كمل|كاملة|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision was caused by failure to reuse the already reviewed same-root completion family. Genuine state, abstract noun, adjective and Form VIII forms are available.",
    related: related("ك م ل", [
      [
        "كَمُلَ",
        "became complete / perfect",
        "Form I state verb.",
        "Form I of the same root.",
      ],
      [
        "كَمَالٌ",
        "completeness / perfection",
        "Abstract noun.",
        "Established noun of the same root.",
      ],
      [
        "كَامِلٌ",
        "complete / perfect",
        "Established adjective; the current feminine form is kept distinct.",
        "Adjective of the same root.",
      ],
      [
        "اِكْتَمَلَ",
        "became complete",
        "Form VIII; becoming-complete development.",
        "Form VIII of the same root.",
      ],
    ]),
    evidence: [
      "The reviewed C1 ك م ل family specification and canonical أَكْمَلَ/كَامِلَةٌ evidence were checked.",
      "Gender/case variants were not used as the main teaching content.",
    ],
  },
  "lexical|رعد|رعد|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained only وَرَعْدٌ and الرعدُ, which differ by shell. The same root has an attested verb, imperfect, adjective and lexical noun رَعْدَةٌ.",
    related: related("ر ع د", [
      [
        "رَعَدَ",
        "it thundered / he trembled",
        "Form I perfect; the verb behind the noun.",
        "Form I of the same root.",
      ],
      [
        "يَرْعَدُ",
        "it thunders / he trembles",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "رَاعِدٌ",
        "thundering",
        "Active adjective; describes the thunder-bearing phenomenon.",
        "Active adjective of the same root.",
      ],
      [
        "رَعْدَةٌ",
        "thunderclap / tremor",
        "Lexical noun; a distinct countable development.",
        "Established noun of the same root.",
      ],
    ]),
    evidence: [
      "Canonical الرعد and reviewed Arabic root evidence were inspected.",
      "The article/conjunction difference was not counted as morphology.",
    ],
  },
  "lexical|خيط|خيط|noun/pronoun": {
    decision: "FULL",
    reason:
      "The former family counted الْخَيْطُ and خَيْطٌ as separate. The verb خَاطَ replaces the case/article duplicate and gives the learner a real root-family contrast.",
    related: related("خ ي ط", [
      [
        "خَاطَ",
        "he sewed",
        "Form I hollow perfect.",
        "Form I of the same root.",
      ],
      [
        "خُيُوطٌ",
        "threads",
        "Broken plural; teaches number.",
        "Plural noun of the same root.",
      ],
      [
        "خِيَاطَةٌ",
        "sewing",
        "Verbal noun.",
        "Established noun of the same root.",
      ],
      [
        "خَيَّاطٌ",
        "tailor",
        "Intensive/occupational noun; names the practitioner.",
        "Established derived noun of the same root.",
      ],
    ]),
    evidence: [
      "Canonical thread occurrences and reviewed project خ ي ط evidence were inspected.",
      "Article/case variants were rejected.",
    ],
  },
  "lexical|زهق|زهق|verb": {
    decision: "FULL",
    reason:
      "The current وَزَهَقَ and related زَهَقَ differed only by the conjunction. The causative أَزْهَقَ replaces that shell duplicate.",
    related: related("ز ه ق", [
      [
        "يَزْهَقُ",
        "it perishes / departs",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "زَهُوقٌ",
        "liable to perish",
        "Intensive adjective.",
        "Established adjective of the same root.",
      ],
      [
        "زَاهِقٌ",
        "perishing / departing",
        "Active participial adjective.",
        "Active adjective of the same root.",
      ],
      [
        "أَزْهَقَ",
        "he caused to perish / destroyed",
        "Form IV causative.",
        "Form IV of the same root.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of زَهَقَ and أَزْهَقَ were inspected.",
      "وَ was treated as conjunction shell only.",
    ],
  },
  "lexical|جذذ|جذاذ|noun/pronoun": {
    decision: "FULL",
    reason:
      "The one-row limited decision overlooked the attested verb, imperfect, verbal noun and passive participle of the same root.",
    related: related("ج ذ ذ", [
      ["جَذَّ", "he cut off", "Form I perfect.", "Form I of the same root."],
      [
        "يَجُذُّ",
        "he cuts off",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["جَذٌّ", "cutting off", "Verbal noun.", "Form I verbal noun."],
      [
        "مَجْذُوذٌ",
        "cut off",
        "Passive participle.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical جُذَاذًا and reviewed مَجْذُوذٍ evidence were inspected.",
      "No shared-root-only form was accepted without a real lexical relationship.",
    ],
  },
  "lexical|حرف|متحرف|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision treated the Form II branch and the noun branch as too semantically different. Under v1.3.9, the same-root development is useful when meanings are translated separately.",
    related: related("ح ر ف", [
      [
        "حَرَّفَ",
        "he distorted / altered",
        "Form II perfect.",
        "Form II of the same root.",
      ],
      [
        "يُحَرِّفُ",
        "he distorts / alters",
        "Form II imperfect.",
        "Form II imperfect of the same root.",
      ],
      [
        "تَحْرِيفٌ",
        "distortion / alteration",
        "Form II verbal noun.",
        "Maṣdar of حَرَّفَ.",
      ],
      [
        "حَرْفٌ",
        "letter / edge",
        "Established lexical branch; the semantic development is stated explicitly.",
        "Same-root lexical noun with its own meaning.",
      ],
    ]),
    evidence: [
      "Canonical occurrences of يُحَرِّفُونَ and مُتَحَرِّفًا were inspected.",
      "Semantic development was preserved rather than mistranslated as identical meaning.",
    ],
  },
  "lexical|حمم|يحموم|noun/pronoun": {
    decision: "FULL",
    reason:
      "The blocked decision rejected same-root heat/blackness development merely because the English meanings differ. The forms are attested and are translated individually.",
    related: related("ح م م", [
      [
        "حَمَّ",
        "he became hot / approached",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَحُمُّ",
        "he becomes hot / approaches",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["حُمُومٌ", "heat / hotness", "Verbal noun.", "Form I verbal noun."],
      [
        "حَمِيمٌ",
        "scalding water / intense heat",
        "Established lexical branch; meaning is not flattened to black smoke.",
        "Same-root lexical development.",
      ],
    ]),
    evidence: [
      "Canonical يَحْمُومٍ and reviewed حَمِيمٍ/حُمُومٍ evidence were inspected.",
      "The semantic branches are explicitly distinguished in the row meanings.",
    ],
  },
  "lexical|خذل|مخذول|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision overlooked a complete attested verb, imperfect, action noun and active adjective around the passive participle.",
    related: related("خ ذ ل", [
      [
        "خَذَلَ",
        "he abandoned / let down",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَخْذُلُ",
        "he abandons / lets down",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "خَذْلٌ",
        "abandonment / letting down",
        "Verbal noun.",
        "Form I verbal noun.",
      ],
      [
        "خَذُولٌ",
        "one who abandons / repeatedly lets down",
        "Intensive adjective.",
        "Established adjective of the same root.",
      ],
    ]),
    evidence: [
      "Canonical يَخْذُلْكُمْ and مَخْذُولًا evidence were inspected.",
      "Active/passive contrast is explicit.",
    ],
  },
  "lexical|خمد|خامد|noun/pronoun": {
    decision: "FULL",
    reason:
      "The former limited family contained only plural inflectional variants of خامد. The root supports an attested verb, imperfect, verbal noun and causative form.",
    related: related("خ م د", [
      [
        "خَمَدَ",
        "it died down / became extinguished",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَخْمُدُ",
        "it dies down / becomes extinguished",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "خُمُودٌ",
        "dying down / extinction",
        "Verbal noun.",
        "Form I verbal noun.",
      ],
      [
        "أَخْمَدَ",
        "he extinguished",
        "Form IV causative.",
        "Form IV of the same root.",
      ],
    ]),
    evidence: [
      "Canonical خَامِدِينَ/خَامِدُونَ and reviewed root evidence were inspected.",
      "Plural endings were not treated as separate lexical members.",
    ],
  },
  "lexical|دحر|دحور|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited family had the action noun but omitted its directly attested verb, imperfect and passive participle.",
    related: related("د ح ر", [
      [
        "دَحَرَ",
        "he drove away",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَدْحَرُ",
        "he drives away",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["دَحْرٌ", "driving away", "Verbal noun.", "Form I verbal noun."],
      [
        "مَدْحُورٌ",
        "driven away",
        "Passive participle.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical دُحُورًا and reviewed مَدْحُورًا evidence were inspected.",
    ],
  },
  "lexical|رذل|ارذل|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained plural and comparative forms but missed the established verb, imperfect and adjective of the same root.",
    related: related("ر ذ ل", [
      [
        "رَذُلَ",
        "he became base / inferior",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَرْذُلُ",
        "he becomes base / inferior",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "رَذِيلٌ",
        "base / inferior",
        "Established adjective.",
        "Adjective of the same root.",
      ],
      [
        "أَرْذَلُ",
        "more inferior / lowest",
        "Comparative/superlative adjective.",
        "Comparative form of the same root.",
      ],
      [
        "أَرَاذِلُ",
        "the lowliest / inferior people",
        "Broken plural; a lexical number development.",
        "Plural noun of the same root.",
      ],
    ]),
    evidence: [
      "Canonical أَرَاذِلُنَا and reviewed رَذُلَ/رَذِيلٌ evidence were inspected.",
    ],
  },
  "lexical|رفق|مرافق|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision treated مَرَافِق as isolated, despite the reviewed root catalogue containing the verb, imperfect, verbal noun and singular place/body-part noun.",
    related: related("ر ف ق", [
      [
        "رَفَقَ",
        "he treated gently / accompanied",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَرْفُقُ",
        "he treats gently",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "رِفْقٌ",
        "gentleness / kindness",
        "Verbal noun.",
        "Form I verbal noun.",
      ],
      [
        "مِرْفَقٌ",
        "elbow / facility",
        "Established noun; meaning is stated according to context.",
        "Same-root place/body-part noun.",
      ],
    ]),
    evidence: [
      "Canonical المرافق and reviewed رَفَقَ/رِفْقٌ evidence were inspected.",
      "The semantic development is explicit rather than flattened.",
    ],
  },
  "lexical|زخرف|زخرف|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained the noun only, although the reviewed root evidence establishes its verb, imperfect, verbal noun and passive participle.",
    related: related("ز خ ر ف", [
      [
        "زَخْرَفَ",
        "he adorned / ornamented",
        "Form II perfect.",
        "Form II of the same root.",
      ],
      [
        "يُزَخْرِفُ",
        "he adorns / ornaments",
        "Form II imperfect.",
        "Form II imperfect of the same root.",
      ],
      [
        "زَخْرَفَةٌ",
        "ornamentation / embellishment",
        "Form II verbal noun.",
        "Maṣdar of زَخْرَفَ.",
      ],
      [
        "مُزَخْرَفٌ",
        "ornamented / embellished",
        "Form II passive participle.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: ["Canonical زُخْرُف and reviewed derived forms were inspected."],
  },
  "lexical|ستر|ستر|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained only the noun, but the root has a complete attested verb, imperfect, passive participle and reflexive development.",
    related: related("س ت ر", [
      [
        "سَتَرَ",
        "he concealed / covered",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَسْتُرُ",
        "he conceals / covers",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "مَسْتُورٌ",
        "concealed / covered",
        "Passive participle.",
        "Passive participle of the same root.",
      ],
      [
        "تَسْتَتِرُونَ",
        "you conceal yourselves",
        "Form VIII/reflexive development; shows the root in a derived pattern.",
        "Derived same-root form.",
      ],
    ]),
    evidence: [
      "Canonical سِتْرًا and reviewed مَسْتُورًا/تَسْتَتِرُونَ evidence were inspected.",
    ],
  },
  "lexical|سدد|سدين|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision treated the dual noun as isolated, although the reviewed root contains the basic verb, imperfect, abstract noun and Form II verbal noun.",
    related: related("س د د", [
      [
        "سَدَّ",
        "he blocked / closed",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَسُدُّ",
        "he blocks / closes",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "سَدَادٌ",
        "soundness / rightness",
        "Lexical noun; a semantic development of the root.",
        "Established noun of the same root.",
      ],
      [
        "تَسْدِيدٌ",
        "blocking / directing correctly",
        "Form II verbal noun.",
        "Form II of the same root.",
      ],
    ]),
    evidence: [
      "Canonical السدين and reviewed سَدَّ/سَدَادٌ evidence were inspected.",
    ],
  },
  "lexical|طلب|طلب|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision omitted the established verb paradigm and active/passive participles even though the same root is already reviewed in adjacent families.",
    related: related("ط ل ب", [
      [
        "طَلَبَ",
        "he sought / requested",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَطْلُبُ",
        "he seeks / requests",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "طَالِبٌ",
        "one who seeks / student",
        "Active participle.",
        "Active participle of the same root.",
      ],
      [
        "مَطْلُوبٌ",
        "sought / requested",
        "Passive participle.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical and existing reviewed ط ل ب families were inspected.",
      "The action noun current form remains first.",
    ],
  },
  "lexical|عتب|معتبين|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained an inflected passive/derived form while overlooking the established basic verb, imperfect, verbal noun and active participle.",
    related: related("ع ت ب", [
      [
        "عَتَبَ",
        "he reproached",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَعْتِبُ",
        "he reproaches",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["عَتْبٌ", "reproach / blame", "Verbal noun.", "Form I verbal noun."],
      [
        "مُعْتِبٌ",
        "one who satisfies / makes amends",
        "Active participle; a distinct derived sense.",
        "Active participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical المُعْتَبِينَ and reviewed عَتَبَ/مُعْتِبٌ evidence were inspected.",
    ],
  },
  "lexical|عنت|عنت|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision omitted the established verb and causative branch. The same root supports a complete teaching family with honest semantic distinctions.",
    related: related("ع ن ت", [
      [
        "عَنِتَ",
        "he suffered hardship",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَعْنَتُ",
        "he suffers hardship",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["عَنَتٌ", "hardship / distress", "Verbal noun.", "Form I verbal noun."],
      [
        "أَعْنَتَ",
        "he caused hardship",
        "Form IV causative.",
        "Form IV of the same root.",
      ],
      [
        "مُعْنِتٌ",
        "causing hardship",
        "Form IV active participle.",
        "Active participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical العنت and reviewed أَعْنَتَ/عَنِتَ evidence were inspected.",
    ],
  },
  "lexical|قوت|اقوات|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained the plural noun but omitted the verb, verbal noun and adjective/participle forms already evidenced in the project.",
    related: related("ق و ت", [
      [
        "قَاتَ",
        "he nourished / sustained",
        "Form I hollow perfect.",
        "Form I of the same root.",
      ],
      [
        "يَقُوتُ",
        "he nourishes / sustains",
        "Form I hollow imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "قُوتٌ",
        "nourishment / sustenance",
        "Lexical noun.",
        "Established noun of the same root.",
      ],
      [
        "مَقِيتٌ",
        "sustaining / one who provides sustenance",
        "Derived adjective/active participle.",
        "Established same-root derivative.",
      ],
    ]),
    evidence: [
      "Canonical أَقْوَاتَهَا and reviewed مَقِيتًا evidence were inspected.",
    ],
  },
  "lexical|مضغ|مضغة|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained the developmental noun only, although the root has a genuine verb, imperfect, verbal noun and passive participle.",
    related: related("م ض غ", [
      ["مَضَغَ", "he chewed", "Form I perfect.", "Form I of the same root."],
      [
        "يَمْضَغُ",
        "he chews",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["مَضْغٌ", "chewing", "Verbal noun.", "Form I verbal noun."],
      [
        "مَمْضُوغٌ",
        "chewed",
        "Passive participle.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: [
      "Canonical مُضْغَةٍ and reviewed Arabic morphology evidence were inspected.",
    ],
  },
  "lexical|نبع|ينبوع|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision treated the spring noun and its plural as an isolated lexical item, overlooking the attested verb and place noun.",
    related: related("ن ب ع", [
      [
        "نَبَعَ",
        "it sprang forth",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَنْبُعُ",
        "it springs forth",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "نَبْعٌ",
        "springing forth / a spring",
        "Verbal/lexical noun.",
        "Established noun of the same root.",
      ],
      [
        "مَنْبَعٌ",
        "source / spring",
        "Place noun; names the source.",
        "Place noun of the same root.",
      ],
    ]),
    evidence: [
      "Canonical يَنۢبُوعًا and يَنَابِيعَ evidence were inspected.",
      "The singular/plural distinction remains explicit.",
    ],
  },
  "lexical|نسب|نسب|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained only the abstract noun and plural. The established verb, imperfect and passive participle provide useful same-root recognition.",
    related: related("ن س ب", [
      [
        "نَسَبَ",
        "he attributed / traced lineage",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَنْسُبُ",
        "he attributes / traces lineage",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "نَسَبٌ",
        "lineage / attribution",
        "Lexical noun.",
        "Established noun of the same root.",
      ],
      [
        "مَنْسُوبٌ",
        "attributed / ascribed",
        "Passive participle.",
        "Passive participle of the same root.",
      ],
    ]),
    evidence: ["Canonical أَنسَابَ and نَسَبًا evidence were inspected."],
  },
  "lexical|نقب|نقب|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained the action noun only, although the root has a verb, imperfect, agent noun and Form II development in the reviewed corpus.",
    related: related("ن ق ب", [
      [
        "نَقَبَ",
        "he pierced / explored",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَنْقُبُ",
        "he pierces / explores",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "نَقِيبٌ",
        "representative / chief",
        "Established agent noun.",
        "Agent noun of the same root.",
      ],
      [
        "فَنَقَّبُوا۟",
        "so they explored / searched",
        "Form II perfect; derived intensive action.",
        "Form II of the same root.",
      ],
    ]),
    evidence: ["Canonical نَقْبًا and فَنَقَّبُوا۟ evidence were inspected."],
  },
  "lexical|نكس|ناكسوا|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision did not use the existing basic, imperfect, verbal-noun and Form II relations around the current active participle.",
    related: related("ن ك س", [
      [
        "نَكَسَ",
        "he reversed / turned back",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَنْكُسُ",
        "he reverses / turns back",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      [
        "نَكْسٌ",
        "reversal / overturning",
        "Verbal noun.",
        "Form I verbal noun.",
      ],
      [
        "نَكَّسَ",
        "he reversed / turned back repeatedly",
        "Form II derived pattern.",
        "Form II of the same root.",
      ],
    ]),
    evidence: [
      "Canonical نَاكِسُوا۟ and نُكِسُوا۟ evidence were inspected.",
      "The active/passive and basic/derived relationships are translated separately.",
    ],
  },
  "lexical|وجل|وجل|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained the plural adjective only. The reviewed root supports verb, imperfect, abstract noun and active adjective forms.",
    related: related("و ج ل", [
      [
        "وَجِلَ",
        "he felt afraid",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَوْجَلُ",
        "he feels afraid",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["وَجَلٌ", "fear / awe", "Abstract noun.", "Form I verbal noun."],
      [
        "وَاجِلٌ",
        "fearful / apprehensive",
        "Active adjective.",
        "Established adjective of the same root.",
      ],
    ]),
    evidence: [
      "Canonical وَجِلُونَ and reviewed وَجِلَ/وَجَلٌ evidence were inspected.",
    ],
  },
  "lexical|وقف|موقوف|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained only the passive participle. The root supports the active verb, imperfect, verbal noun and passive finite form.",
    related: related("و ق ف", [
      [
        "وَقَفَ",
        "he stood / stopped",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَقِفُ",
        "he stands / stops",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["وُقُوفٌ", "standing / stopping", "Verbal noun.", "Form I verbal noun."],
      [
        "وُقِفُوا۟",
        "they were made to stand",
        "Passive Form I finite form.",
        "Passive finite form of the same root.",
      ],
    ]),
    evidence: ["Canonical وُقِفُوا۟ and مَوْقُوفُونَ evidence were inspected."],
  },
  "lexical|يبس|يابسة|noun/pronoun": {
    decision: "FULL",
    reason:
      "The limited decision retained only the plural adjective. The root supports basic verb, imperfect, abstract noun and the noun يبس.",
    related: related("ي ب س", [
      [
        "يَبِسَ",
        "it became dry",
        "Form I perfect.",
        "Form I of the same root.",
      ],
      [
        "يَيْبَسُ",
        "it becomes dry",
        "Form I imperfect.",
        "Form I imperfect of the same root.",
      ],
      ["يَبَسًا", "dryness", "Verbal noun.", "Form I verbal noun."],
      [
        "يُبْسٌ",
        "dryness / aridity",
        "Lexical abstract noun; distinct from the adjective.",
        "Established noun of the same root.",
      ],
    ]),
    evidence: [
      "Canonical يَابِسَاتٍ and reviewed يَبِسَ/يُبْسٌ evidence were inspected.",
    ],
  },
};
