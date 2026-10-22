export type C3C3Decision = "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";

export type C3C3Candidate = {
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

export type C3C3Spec = {
  canonicalRoot: string;
  rootRadicals: string[];
  quadriliteralSubtype: "genuine quadriliteral" | "reduplicated quadriliteral" | "lexicalised quadriliteral";
  rootEvidence: string;
  decision: C3C3Decision;
  reason: string;
  candidates: C3C3Candidate[];
  rejectedCandidates: string[];
  unresolvedQuestion?: string;
  evidenceRequired?: string[];
};

const academy = (root: string) =>
  `Cairo Arabic Language Academy, root entry: https://www.arabicacademy.gov.eg/ar/search_engine/roots/${encodeURIComponent(root)}.`;

const evidence = (root: string, extra = "") =>
  `${academy(root)} ${extra}`.trim();

const candidate = (
  root: string,
  form: string,
  morphology: string,
  meaning: string,
  relationship: string,
  semanticDevelopment: string,
  pedagogicalValue: string,
  extraEvidence = "",
): C3C3Candidate => ({
  form,
  root,
  morphology,
  meaning,
  relationship,
  semanticDevelopment,
  evidence: evidence(root, extraEvidence),
  confidence: "high",
  pedagogicalValue,
  accepted: true,
});

export const C3C3_FAMILY_KEYS = [
  "lexical|زحزح|زحزح|verb",
  "lexical|خردل|خردل|noun/pronoun",
  "lexical|سرمد|سرمد|noun/pronoun",
  "lexical|عنكب|عنكبوت|noun/pronoun",
  "lexical|قرطس|قرطاس|noun/pronoun",
  "lexical|قسطس|قسطاس|noun/pronoun",
  "lexical|سنبل|سنبل|noun/pronoun",
  "lexical|خنزر|خنازير|noun/pronoun",
  "lexical|قنطر|والقنطير|noun/pronoun",
  "lexical|حصحص|حصحص|verb",
  "lexical|درهم|دراهم|noun/pronoun",
  "lexical|ذبذب|مذبذب|noun/pronoun",
  "lexical|سردق|سرادق|noun/pronoun",
  "lexical|شرذم|شرذمة|noun/pronoun",
  "lexical|صفصف|صفصف|noun/pronoun",
  "lexical|ضفدع|ضفادع|noun/pronoun",
  "lexical|عرجن|عرجون|noun/pronoun",
  "lexical|قشعر|تقشعر|verb",
  "lexical|قطمر|قطمير|noun/pronoun",
  "lexical|قنطر|مقنطرة|noun/pronoun",
  "lexical|كبكب|كبكب|verb",
  "lexical|هدهد|هدهد|noun/pronoun",
] as const;

export const C3C3_SPECS: Record<string, C3C3Spec> = {
  "lexical|زحزح|زحزح|verb": {
    canonicalRoot: "زحزح",
    rootRadicals: ["ز", "ح", "ز", "ح"],
    quadriliteralSubtype: "reduplicated quadriliteral",
    rootEvidence: evidence("زحزح", "The root entry gives زَحْزَحَ and تَزَحْزَحَ; Qur’anic occurrence evidence also gives the aligned active, imperfect, maṣdar and passive-participle forms.") ,
    decision: "FULL",
    reason: "The passive Qur’anic form is supported by a genuine quadriliteral family in the Qur’anic evidence and the approved root entry. The four additional rows are not clitic, case or pronoun variants.",
    candidates: [
      candidate("زحزح", "زَحْزَحَ", "quadriliteral perfect verb", "he moved or removed", "Basic quadriliteral verb of the same root.", "The Qur’anic passive means that something is drawn away; the active verb names the act of moving it away.", "Contrasts active and passive voice while preserving the same lexical event.", "Aligned Qur’anic evidence at 2:96:17.") ,
      candidate("زحزح", "يُزَحْزِحُ", "quadriliteral imperfect verb", "he moves or removes", "Imperfect counterpart of زَحْزَحَ.", "The form shifts from completed action to ongoing action.", "Makes the repeated-root verb recognisable across tense.", "Aligned Qur’anic evidence at 2:96:17.") ,
      candidate("زحزح", "زَحْزَحَةٌ", "quadriliteral maṣdar", "moving or removing away", "Verbal noun of زَحْزَحَ.", "Names the action rather than an agent or patient.", "Shows the action noun behind the Qur’anic verb.", "Aligned Qur’anic evidence at 2:96:17.") ,
      candidate("زحزح", "مُزَحْزَحٌ", "passive participle", "moved or removed", "Passive participle of the same quadriliteral verb.", "Names the thing that has been moved away.", "Connects the Qur’anic passive event with an established participial form.", "Aligned Qur’anic evidence at 2:96:17.") ,
    ],
    rejectedCandidates: ["Removing بِـ or the attached pronoun from بِمُزَحْزِحِهِۦ is shell/prefix or pronoun manipulation, not a new row."],
  },

  "lexical|خردل|خردل|noun/pronoun": {
    canonicalRoot: "خردل",
    rootRadicals: ["خ", "ر", "د", "ل"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("خردل", "The Academy explicitly records خَرْدَلَ, مُخَرْدِل, مُخَرْدَل and the noun الخَرْدَل.") ,
    decision: "FULL",
    reason: "The current mustard noun belongs to a genuinely productive quadriliteral family. The verb and its two participles are independently recorded and have their own meanings; they are not invented from a template.",
    candidates: [
      candidate("خردل", "خَرْدَلَ", "quadriliteral perfect verb", "he fragmented or cut into small pieces", "Basic quadriliteral verb in the root entry.", "The noun mustard branch is joined to a verb branch meaning to break something into small pieces; the meanings are kept distinct.", "Demonstrates semantic development from a lexical noun to a real quadriliteral verb.") ,
      candidate("خردل", "يُخَرْدِلُ", "quadriliteral imperfect verb", "he fragments or cuts into small pieces", "Imperfect of the attested verb خَرْدَلَ.", "Changes completed fragmentation to ongoing fragmentation.", "Provides a useful tense contrast for the verified verb.") ,
      candidate("خردل", "مُخَرْدِلٌ", "active participle", "one who fragments or cuts into small pieces", "Agent noun from the attested quadriliteral verb.", "Names the agent rather than the action or object.", "Shows the productive participial pattern of a real quadriliteral verb.") ,
      candidate("خردل", "مُخَرْدَلٌ", "passive participle", "fragmented or cut into pieces", "Patient noun from the attested quadriliteral verb.", "Names what has undergone fragmentation; it is not the mustard meaning.", "Contrasts active and passive participation honestly.") ,
    ],
    rejectedCandidates: ["خَرْدَلَةٌ and خَرَادِلُ are recorded for another lexical branch (a piece of meat); they were not needed after four stronger rows and would add a less direct semantic detour."],
  },

  "lexical|سرمد|سرمد|noun/pronoun": {
    canonicalRoot: "سرمد",
    rootRadicals: ["س", "ر", "م", "د"],
    quadriliteralSubtype: "lexicalised quadriliteral",
    rootEvidence: evidence("سرمد", "The Academy records السَّرْمَد and the nisbah adjective السَّرْمَدِيّ, but no established productive verb paradigm in the root entry.") ,
    decision: "CONFIRMED-LIMITED",
    reason: "Only the continuous/perpetual noun and its established nisbah adjective are safely useful here. Article and case variants do not expand the family, and no additional productive forms are established by the approved evidence.",
    candidates: [
      candidate("سرمد", "سَرْمَدِيٌّ", "nisbah adjective", "perpetual or continuous", "Established adjective derived from السَّرْمَد.", "Moves from the noun ‘perpetuity’ to the adjective ‘perpetual’ without pretending there is a verb paradigm.", "Provides the only clear derivational contrast supported by the root entry.") ,
    ],
    rejectedCandidates: ["السَّرْمَدُ is the same noun with an article, not a new Ṣarf row.", "Case endings on سَرْمَدًا are not additional morphology.", "Generated quadriliteral verb and participle forms were rejected because the approved entry does not establish them."],
  },

  "lexical|عنكب|عنكبوت|noun/pronoun": {
    canonicalRoot: "عنكب",
    rootRadicals: ["ع", "ن", "ك", "ب"],
    quadriliteralSubtype: "lexicalised quadriliteral",
    rootEvidence: evidence("عنكب", "The Academy records العَنْكَب, العَنْكَبة, العَنْكَبوت and العَنْكَبوتيّة with their gender, species and relational meanings.") ,
    decision: "CONFIRMED-LIMITED",
    reason: "The root has several genuine lexical nouns and a relational adjective, but no safely established productive quadriliteral verb family. The three accepted derivatives teach lexical gender/species and relation; plural variants would add number rather than a stronger morphological contrast.",
    candidates: [
      candidate("عنكب", "عَنْكَبٌ", "lexical noun", "a male spider / spider genus", "Male/species counterpart recorded under the same root.", "The Qur’anic عنكبوت is the spider species; عنكب names the male or genus branch.", "Clarifies the lexical family without inventing a verb.") ,
      candidate("عنكب", "عَنْكَبَةٌ", "lexical feminine noun", "a female spider", "Feminine lexical counterpart recorded under the same root.", "Shows the gendered noun relationship explicitly.", "Useful recognition of a real lexical contrast.") ,
      candidate("عنكب", "عَنْكَبُوتِيَّةٌ", "nisbah/relational noun", "spider-related; the web/Internet context", "Established relational derivative of عنكبوت.", "Develops the animal noun into a relational term; it is not presented as another meaning of the Qur’anic spider.", "Shows lexical derivation beyond simple number variation.") ,
    ],
    rejectedCandidates: ["عَنَاكِبُ, عَنَاكِيبُ and عَنْكَبُوتَاتٌ are plural/number variants and do not provide four independent Ṣarf contrasts for this lesson.", "A verb paradigm was not accepted because the approved root entry does not establish one."],
  },

  "lexical|قرطس|قرطاس|noun/pronoun": {
    canonicalRoot: "قرطس",
    rootRadicals: ["ق", "ر", "ط", "س"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("قرطس", "The Academy records قَرْطَسَ, تَقَرْطَسَ, القِرْطَاس, قَراطيس and القِرْطاسيّة.") ,
    decision: "FULL",
    reason: "The parchment noun has an independently attested quadriliteral verb, derived verb, plural lexical form and nisbah-derived term. The semantic branches are reported honestly rather than flattened.",
    candidates: [
      candidate("قرطس", "قَرْطَسَ", "quadriliteral perfect verb", "he hit the paper target / put something in paper", "Basic quadriliteral verb derived from قِرْطَاس.", "The noun ‘paper/parchment’ develops into actions involving a paper target or placing something in paper.", "Adds a real verb-pattern contrast.") ,
      candidate("قرطس", "تَقَرْطَسَ", "derived quadriliteral verb", "he perished", "Attested derived verb under the same root.", "This is a distinct lexical branch; it is not mistranslated as ‘paper’.", "Demonstrates honest semantic development under the same four radicals.") ,
      candidate("قرطس", "قَرَاطِيسُ", "broken plural noun", "parchments or sheets", "Established plural of قِرْطَاس.", "Moves from one parchment to multiple sheets; it is a lexical plural, not a case ending.", "Helps recognition of the Qur’anic parchment noun across number.") ,
      candidate("قرطس", "قِرْطَاسِيَّةٌ", "nisbah-derived noun/adjective", "stationery or paper-related supplies", "Established relational derivative under the same root.", "Develops the paper noun into a paper-related lexical field.", "Provides a useful derivational contrast beyond the plural.") ,
    ],
    rejectedCandidates: ["Changing قِرْطَاسٍ only by case or article was rejected as shell/inflection variation."],
  },

  "lexical|قسطس|قسطاس|noun/pronoun": {
    canonicalRoot: "قسطس",
    rootRadicals: ["ق", "س", "ط", "س"],
    quadriliteralSubtype: "lexicalised quadriliteral",
    rootEvidence: evidence("قسطاس", "The Academy entry records القُسْطاس/القِسْطاس as the accurate balance; the project’s canonical radical label is قسطس.") ,
    decision: "MODEL-ISSUE",
    reason: "The item is an instrument noun with vowel variants, not a safely productive learner-facing quadriliteral family. The standard five-row Ṣarf representation would encourage treating two vocalisations as separate morphology or fabricating a verb paradigm.",
    candidates: [],
    rejectedCandidates: ["قُسْطَاسٌ and قِسْطَاسٌ are established vowel variants of the same instrument noun, not two Ṣarf rows.", "Generated quadriliteral perfect, imperfect, maṣdar and participles were rejected because no approved evidence establishes them."],
    unresolvedQuestion: "The product needs a dedicated fixed/lexicalised instrument-noun representation rather than a productive five-row family.",
    evidenceRequired: ["A reviewed model for lexicalised instrument nouns that preserves the root and meaning without implying unsupported morphology."],
  },

  "lexical|سنبل|سنبل|noun/pronoun": {
    canonicalRoot: "سنبل",
    rootRadicals: ["س", "ن", "ب", "ل"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("سنبل", "The Academy records سَنْبَلَ, السُّنْبُل, السُّنْبُلة, السُّنْبُول and سَنابِل.") ,
    decision: "FULL",
    reason: "The current possessive Qur’anic form belongs to a documented quadriliteral plant family. The attached pronoun is retained in the current row but not counted as a separate candidate; the accepted rows are the verb, singular noun and two independently recorded lexical plural/variant forms.",
    candidates: [
      candidate("سنبل", "سَنْبَلَ", "quadriliteral perfect verb", "the crop produced its ears", "Basic verb recorded under the same root.", "The plant noun develops into the action of producing ears.", "Connects the Qur’anic plant noun to a real verb.") ,
      candidate("سنبل", "سُنْبُلَةٌ", "singular lexical noun", "an ear or spike", "Singular counterpart of the collective/plant noun.", "Makes the part-to-whole lexical relationship visible.", "Directly supports recognition of the Qur’anic plant image.") ,
      candidate("سنبل", "سَنَابِلُ", "broken plural noun", "ears or spikes", "Established broken plural in the root entry.", "Shows the common broken plural used for multiple ears.", "Useful Qur’anic recognition across the root family.") ,
      candidate("سنبل", "سُنْبُولٌ", "lexical noun variant", "an ear or spike", "Established lexical variant recorded under the same root.", "This is a lexical variant, not an attached-pronoun or case change.", "Provides a genuine recognition contrast while keeping the plant meaning honest.") ,
    ],
    rejectedCandidates: ["Removing هِۦٓ from سُنۢبُلِهِۦٓ to create سُنْبُلٌ was not counted as a row because attached-pronoun removal is shell manipulation.", "سُنْبُلَاتٌ was not selected as a fifth candidate because it adds only a regular number contrast after the stronger documented family members are present."],
  },

  "lexical|خنزر|خنازير|noun/pronoun": {
    canonicalRoot: "خنزر",
    rootRadicals: ["خ", "ن", "ز", "ر"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("خنزر", "The Academy records خَنْزَرَ, الخَنْزَرة, الخِنْزير, الخَنازير and الخِنْزيريّة.") ,
    decision: "FULL",
    reason: "The swine plural is not a dead one-form item: the approved root entry supplies a real quadriliteral verb, a distinct lexical noun, a tool noun and a relational adjective. Each meaning is kept separate.",
    candidates: [
      candidate("خنزر", "خِنْزِيرٌ", "lexical singular noun", "a swine or pig", "Singular of the Qur’anic plural noun.", "The current plural is the animal category; the singular identifies one animal.", "Directly teaches the plural’s lexical base.") ,
      candidate("خنزر", "خَنْزَرَ", "quadriliteral perfect verb", "he acted like a pig / became thick", "Basic verb recorded under the same root.", "The verb branch is not translated as ‘pig’; it describes pig-like action or thickness.", "Shows semantic development from noun to verb.") ,
      candidate("خنزر", "خَنْزَرَةٌ", "lexical tool noun", "a thick axe for breaking stones", "Established noun in the same root entry.", "This is a separate tool branch and is translated independently.", "Provides a real noun contrast without pretending synonymy.") ,
      candidate("خنزر", "خِنْزِيرِيَّةٌ", "nisbah/family noun", "the porcine family", "Relational derivative of خِنْزِير.", "Develops the animal noun into a taxonomic family term.", "Adds a useful derivational relationship rather than another plural shell.") ,
    ],
    rejectedCandidates: ["وَٱلْخَنَازِيرَ → خَنَازِيرُ differs only by conjunction, article and case; it is not an additional row."],
  },

  "lexical|قنطر|والقنطير|noun/pronoun": {
    canonicalRoot: "قنطر",
    rootRadicals: ["ق", "ن", "ط", "ر"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("قنطر", "The Academy records قَنْطَرَ, القِنْطار, القَنْطَرة, القَناطير and القَناطير المُقَنْطَرة.") ,
    decision: "FULL",
    reason: "The Qur’anic plural has a documented quadriliteral verb and several lexical derivatives. The accepted rows are not merely the same plural with clitics removed; they show noun, verb, bridge and heaped/stacked branches.",
    candidates: [
      candidate("قنطر", "قِنْطَارٌ", "lexical singular noun", "a qintar; a large amount or weight of wealth", "Singular lexical counterpart of قَناطير.", "Moves from plural heaps/amounts to the singular measure or large amount.", "Directly supports the Qur’anic wealth image.") ,
      candidate("قنطر", "قَنْطَرَ", "quadriliteral perfect verb", "he amassed great wealth / built an arch", "Basic quadriliteral verb recorded under the root.", "The verb has wealth and arch-building branches; both are kept distinct from the noun.", "Shows genuine verbal development.") ,
      candidate("قنطر", "قَنْطَرَةٌ", "lexical noun", "an arched bridge", "Established noun from the same root.", "Represents the arch/bridge semantic branch honestly.", "Makes the root’s concrete development memorable.") ,
      candidate("قنطر", "مُقَنْطَرَةٌ", "quadriliteral passive participle/adjective", "heaped, stacked or amassed", "Established form in القَناطير المُقَنْطَرة.", "Describes wealth as heaped up rather than naming the heap itself.", "Connects the Qur’anic phrase’s adjective to the root family.") ,
    ],
    rejectedCandidates: ["وَٱلْقَنَـٰطِيرِ → قَنَاطِيرُ is only removal of و/ال and case; it is not counted separately."],
  },

  "lexical|حصحص|حصحص|verb": {
    canonicalRoot: "حصحص",
    rootRadicals: ["ح", "ص", "ح", "ص"],
    quadriliteralSubtype: "reduplicated quadriliteral",
    rootEvidence: evidence("حصحص", "The Academy records حَصْحَصَ, تَحَصْحَصَ, الحَصْحاص, الحُصْحُص and الحُصْحوص; the Qur’anic entry explicitly gives the ‘became manifest’ sense.") ,
    decision: "FULL",
    reason: "This is a real reduplicated quadriliteral family with an attested inchoative/derived verb and established nouns/adjectives. The non-Qur’anic semantic branches are presented honestly rather than collapsed into ‘became manifest’.",
    candidates: [
      candidate("حصحص", "تَحَصْحَصَ", "derived quadriliteral verb", "became clear or was brought into the open", "Derived counterpart recorded with the same root.", "Keeps the Qur’anic clarity branch while changing the derived pattern.", "Shows how the reduplicated root develops a related change-of-state form.") ,
      candidate("حصحص", "حَصْحَاصٌ", "lexical adjective/noun", "swift, persistent or without slackening", "Established lexical branch under the same root.", "The meaning develops from coming fully into view to energetic/persistent movement; it is not glossed as ‘manifest’.", "Teaches semantic range instead of false synonymy.") ,
      candidate("حصحص", "حُصْحُصٌ", "lexical noun/adjective", "a man who investigates details and knows them", "Established person noun under the same root.", "Names a person characterised by precise investigation rather than the act of becoming clear.", "Connects the root’s clarity/precision association to a learner-facing noun.") ,
      candidate("حصحص", "حُصْحُوصٌ", "lexical noun", "a man of the same precise, detail-tracking type", "Established lexical variant recorded under the same root.", "A variant person noun is retained as its own lexical form, not a generated participle.", "Shows an attested lexical variant without inventing a paradigm.") ,
    ],
    rejectedCandidates: ["مُحَصْحِصٌ and حَصْحَصَةٌ were not used because the strongest approved evidence for this pass records the lexical forms above; no generated participle or maṣdar was needed."],
  },

  "lexical|درهم|دراهم|noun/pronoun": {
    canonicalRoot: "درهم",
    rootRadicals: ["د", "ر", "ه", "م"],
    quadriliteralSubtype: "lexicalised quadriliteral",
    rootEvidence: evidence("درهم", "The Academy records دَرْهَمَ, اِدْرَهَمَّ, الدِّرْهَم, دَراهِم and المُدَرْهَم.") ,
    decision: "FULL",
    reason: "Although the Qur’anic word is a plural currency noun, the approved root entry records genuine quadriliteral verbal and adjectival derivatives. The foreign/coin lexical branch and the unrelated botanical/ageing branches are translated separately.",
    candidates: [
      candidate("درهم", "دِرْهَمٌ", "lexical singular noun", "a dirham coin", "Singular of the Qur’anic plural.", "Makes the currency noun’s lexical number relationship explicit.", "Directly supports recognition of دَراهِم.") ,
      candidate("درهم", "دَرْهَمَ", "quadriliteral perfect verb", "the mallow leaf became round like dirhams", "Attested verb under the same quadriliteral root.", "A botanical semantic branch is shown honestly and not confused with the coin.", "Demonstrates that the root has a real verb beyond the currency noun.") ,
      candidate("درهم", "اِدْرَهَمَّ", "derived quadriliteral verb", "he grew old and fell, or his sight became dim", "Attested doubled-derived verb in the same root entry.", "This is a distinct semantic branch and is not translated as money.", "Provides a genuinely different derived pattern.") ,
      candidate("درهم", "مُدَرْهَمٌ", "lexical adjective", "rich in dirhams", "Established adjective explicitly recorded under the same root.", "Develops the currency noun into a description of possession; the source notes it has no independent verb.", "Useful noun-to-adjective relationship.") ,
    ],
    rejectedCandidates: ["دَراهِمُ as a bare nominative plural is not an extra row beside current دَرَٰهِمَ; the difference is inflection/script.", "A fabricated regular quadriliteral paradigm was not used where the Academy marks the adjective as lexicalised."],
  },

  "lexical|ذبذب|مذبذب|noun/pronoun": {
    canonicalRoot: "ذبذب",
    rootRadicals: ["ذ", "ب", "ذ", "ب"],
    quadriliteralSubtype: "reduplicated quadriliteral",
    rootEvidence: evidence("ذبذب", "The Academy records ذَبْذَبَ, تَذَبْذَبَ, التَذَبْذُب and الذَّبْذَبة; the Qur’anic passive participle is aligned with this root.") ,
    decision: "FULL",
    reason: "The Qur’anic passive participle sits in a well-attested reduplicated quadriliteral family. The accepted rows cover active, derived, verbal-noun and event-noun relationships rather than duplicate persons or shells.",
    candidates: [
      candidate("ذبذب", "ذَبْذَبَ", "quadriliteral perfect verb", "he made something waver or left someone wavering", "Basic quadriliteral verb under the same root.", "The passive Qur’anic form describes people left wavering; the active verb names the cause.", "Clear active/passive and valency contrast.") ,
      candidate("ذبذب", "تَذَبْذَبَ", "derived quadriliteral verb", "he or it wavered and moved uncertainly", "Derived reflexive/inchoative form in the same root entry.", "Moves from causing wavering to undergoing it.", "Shows a useful derived pattern.") ,
      candidate("ذبذب", "تَذَبْذُبٌ", "verbal noun", "waver­ing or oscillation", "Maṣdar of تَذَبْذَبَ.", "Names the state/process rather than the person who is wavering.", "Connects the Qur’anic adjective to the abstract state.") ,
      candidate("ذبذب", "ذَبْذَبَةٌ", "lexical verbal noun", "wavering, oscillation or a dangling movement", "Established action noun under the same root.", "Keeps the physical and mental branches distinct.", "Adds a second attested noun pattern with useful recognition value.") ,
    ],
    rejectedCandidates: ["Changing مُّذَبْذَبِينَ only by gender, number or case was rejected as inflectional padding."],
  },

  "lexical|سردق|سرادق|noun/pronoun": {
    canonicalRoot: "سردق",
    rootRadicals: ["س", "ر", "د", "ق"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("سردق", "The Academy records سَرْدَقَ, السُّرادِق and سُرادِقات.") ,
    decision: "CONFIRMED-LIMITED",
    reason: "The lexical item has an attested quadriliteral verb and a plural enclosure noun, but no fourth additional learner-useful form is established without generating participles or treating possessive/article removal as morphology.",
    candidates: [
      candidate("سردق", "سَرْدَقَ", "quadriliteral perfect verb", "he made the tent’s top and bottom taut", "Basic quadriliteral verb recorded under the root.", "The Qur’anic enclosure noun develops into the action of enclosing/tensioning a tent.", "Adds a real verb relation.") ,
      candidate("سردق", "سُرَادِقَاتٌ", "lexical plural noun", "enclosures or tents", "Established plural recorded under the root.", "Moves from one enclosing structure to multiple structures; it is not a case-only variant.", "Provides the only useful noun-number contrast supported by the source.") ,
    ],
    rejectedCandidates: ["سُرَادِقٌ is the same lexical noun with the attached pronoun removed from سُرَادِقُهَا and is not counted.", "مُسَرْدِقٌ and سَرْدَقَةٌ were rejected as unverified generated participle/maṣdar candidates."],
  },

  "lexical|شرذم|شرذمة|noun/pronoun": {
    canonicalRoot: "شرذم",
    rootRadicals: ["ش", "ر", "ذ", "م"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("شرذم", "The Academy records تَشَرْذَمَ, الشِّرْذِمَة and the broken plurals شَراذِم and شَراذيم.") ,
    decision: "CONFIRMED-LIMITED",
    reason: "The current small-group noun has a secure derived verb and two attested broken plurals. The root entry does not establish a fourth independent learner-useful member without padding the family with unsupported forms.",
    candidates: [
      candidate("شرذم", "تَشَرْذَمَ", "derived quadriliteral verb", "became scattered or fragmented", "Derived verb in the same root entry.", "The Qur’anic noun is a small group; the verb describes the process of breaking into such fragments.", "Shows a genuine semantic and pattern relationship.") ,
      candidate("شرذم", "شَرَاذِمُ", "broken plural noun", "fragments or small groups", "Established plural of شِرْذِمَة.", "Expands the singular group into multiple fragments/groups.", "Useful recognition of the noun family.") ,
      candidate("شرذم", "شَرَاذِيمُ", "alternate broken plural noun", "tattered fragments or small groups", "Second established plural lexical form.", "Retains the fragment branch with its own lexical shape.", "Shows a real plural variant without calling it a new verb.") ,
    ],
    rejectedCandidates: ["لَشِرْذِمَةٌ → شِرْذِمَةٌ only removes لَـ and is not a new row.", "شَرْذَمَ and its participles were not accepted because the approved entry establishes تَشَرْذَمَ, not the unprefixed verb."],
  },

  "lexical|صفصف|صفصف|noun/pronoun": {
    canonicalRoot: "صفصف",
    rootRadicals: ["ص", "ف", "ص", "ف"],
    quadriliteralSubtype: "reduplicated quadriliteral",
    rootEvidence: evidence("صفصف", "The Academy records صَفْصَفَ, الصَّفْصَف and صَفاصِف, plus the related lexical noun الصُّفْصُف.") ,
    decision: "CONFIRMED-LIMITED",
    reason: "The Qur’anic level-plain adjective has a genuine reduplicated verb, plural noun and a documented lexical branch, but no further strong learner-facing member is established without speculative generation.",
    candidates: [
      candidate("صفصف", "صَفْصَفَ", "quadriliteral perfect verb", "he travelled alone in the open land / the place became empty", "Basic quadriliteral verb under the root.", "The plain noun develops into the state/action of being empty or traversing alone.", "Shows semantic development across the same reduplicated root.") ,
      candidate("صفصف", "صَفَاصِفُ", "broken plural noun", "level plains", "Established plural of the level-plain noun.", "Moves from one plain to multiple plains.", "Useful recognition of the Qur’anic landscape word.") ,
      candidate("صفصف", "صُفْصُفٌ", "lexical noun", "a sparrow", "Distinct lexical branch recorded under the same root.", "This bird meaning is displayed honestly and not flattened into ‘plain’.", "Demonstrates real same-root semantic development.") ,
    ],
    rejectedCandidates: ["Changing صَفْصَفًا only by case or article was rejected.", "مُصَفْصِفٌ and صَفْصَفَةٌ were rejected as generated forms not established by the approved root entry."],
  },

  "lexical|ضفدع|ضفادع|noun/pronoun": {
    canonicalRoot: "ضفدع",
    rootRadicals: ["ض", "ف", "د", "ع"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("ضفدع", "The Academy records ضَفْدَعَ (a place became full of frogs), the frog noun and the relational adjective الضفدعية.") ,
    decision: "CONFIRMED-LIMITED",
    reason: "The plural frog noun has a genuine quadriliteral verb, singular noun and relational family adjective. No fourth additional form is sufficiently strong without counting vowel variants or the bare plural as new morphology.",
    candidates: [
      candidate("ضفدع", "ضَفْدَعٌ", "lexical singular noun", "a frog", "Singular counterpart of the Qur’anic plural.", "Makes the animal noun’s number relationship clear.", "Directly supports recognition of الضفادع.") ,
      candidate("ضفدع", "ضَفْدَعَ", "quadriliteral perfect verb", "the water or place became full of frogs", "Basic verb recorded under the root.", "The animal noun develops into a real environmental verb.", "Provides a meaningful verb contrast.") ,
      candidate("ضفدع", "ضَفْدَعِيَّةٌ", "relational/family noun", "the frog family", "Established relational form recorded under the root.", "Develops the animal noun into a biological family term.", "Adds a derivational relationship without inventing a paradigm.") ,
    ],
    rejectedCandidates: ["ضُفْدُعٌ, ضِفْدَعٌ and ضِفْدِعٌ are vowel variants of the same noun, not independent Ṣarf rows.", "وَٱلضَّفَادِعَ → ضَفَادِعُ differs only by clitic/case and was rejected."],
  },

  "lexical|عرجن|عرجون|noun/pronoun": {
    canonicalRoot: "عرجن",
    rootRadicals: ["ع", "ر", "ج", "ن"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("عرجن", "The Academy records عَرْجَنَ and العُرْجُون with the plural عَراجِين.") ,
    decision: "CONFIRMED-LIMITED",
    reason: "The date-stalk noun has one attested quadriliteral verb and one established plural. The Qur’anic surface also carries كَـ and ال; removing those shells cannot create more rows, and participles/maṣdars were not independently established.",
    candidates: [
      candidate("عرجن", "عَرْجَنَ", "quadriliteral perfect verb", "he drew a date-stalk image on cloth or something similar", "Basic verb recorded under the same root.", "The plant noun develops into an action involving its characteristic shape.", "Shows a genuine lexical verb relation.") ,
      candidate("عرجن", "عَرَاجِينُ", "broken plural noun", "date-stalk clusters", "Established plural of العُرْجُون.", "Moves from one stalk/cluster to multiple clusters.", "Provides the only safe number contrast beyond the current form.") ,
    ],
    rejectedCandidates: ["Removing كَـ and ال from كَٱلْعُرْجُونِ is shell removal, not a new row.", "مُعَرْجِنٌ and عَرْجَنَةٌ were rejected as unverified generated forms."],
  },

  "lexical|قشعر|تقشعر|verb": {
    canonicalRoot: "قشعر",
    rootRadicals: ["ق", "ش", "ع", "ر"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("قشعر", "The Academy records اِقْشَعَرَّ, تَقَشْعَرَ, مُقْشَعِرّ, القُشاعِر and القُشَعْرِيرَة; the Qur’anic form is the imperfect تَقْشَعِرُّ.") ,
    decision: "FULL",
    reason: "The Qur’anic imperfect is part of a strongly attested quadriliteral family with derived verbs, a participle and a noun of shuddering. The accepted rows are genuine pattern contrasts, not surface variants.",
    candidates: [
      candidate("قشعر", "اِقْشَعَرَّ", "quadriliteral derived perfect", "his skin shuddered", "Basic derived verb recorded under the root.", "The Qur’anic imperfect is the ongoing form of the same shuddering event.", "Contrasts perfect and imperfect through an attested derived verb.") ,
      candidate("قشعر", "تَقَشْعَرَ", "derived quadriliteral perfect", "he shuddered", "Second attested derived verb in the root entry.", "Shifts the subject from skin to person while preserving the shuddering event.", "Shows a genuine derived pattern rather than person-only conjugation.") ,
      candidate("قشعر", "مُقْشَعِرٌّ", "active participle/adjective", "shuddering or bristling", "Established participial adjective in the root entry.", "Names the state or subject characterised by shuddering.", "Adds a useful adjective/verb relationship.") ,
      candidate("قشعر", "قُشَعْرِيرَةٌ", "lexical noun", "a shudder or tremor", "Established noun under the same root.", "Names the event rather than the person or skin undergoing it.", "Provides a clear verbal-nominal contrast.") ,
    ],
    rejectedCandidates: ["قَشاعِرُ and القُشاعِرُ were not selected because they are less direct lexical variants after the stronger noun and participle rows; no shell or case variants were counted."],
  },

  "lexical|قطمر|قطمير|noun/pronoun": {
    canonicalRoot: "قطمر",
    rootRadicals: ["ق", "ط", "م", "ر"],
    quadriliteralSubtype: "lexicalised quadriliteral",
    rootEvidence: "The project root dictionary and Qur’anic occurrence establish قِطْمِير as the thin membrane of a date seed; no approved productive quadriliteral paradigm was found for this lexical item.",
    decision: "MODEL-ISSUE",
    reason: "This is a highly lexicalised technical noun in the Qur’anic usage. The standard five-row family would require speculative verbs or participles; the correct product treatment is a dedicated lexicalised-noun representation.",
    candidates: [],
    rejectedCandidates: ["Generated قَطْمَرَ, يُقَطْمِرُ, قَطْمَرَةٌ and participles were rejected because no approved authoritative evidence established them for this root.", "Case variation in قِطْمِيرٍ is not morphology."],
    unresolvedQuestion: "The product needs a dedicated lexicalised-noun model for rare quadriliteral technical nouns.",
    evidenceRequired: ["A reviewed model for lexicalised quadriliteral nouns that displays the root and stable meaning without implying a productive paradigm."],
  },

  "lexical|قنطر|مقنطرة|noun/pronoun": {
    canonicalRoot: "قنطر",
    rootRadicals: ["ق", "ن", "ط", "ر"],
    quadriliteralSubtype: "genuine quadriliteral",
    rootEvidence: evidence("قنطر", "The Academy records قَنْطَرَ, القِنْطار, القَناطير, القَنْطَرة and المُقَنْطَرة.") ,
    decision: "FULL",
    reason: "The Qur’anic passive/lexical adjective is supported by a complete, evidence-backed quadriliteral family. The current form is followed by the noun, plural, verb and bridge noun, each translated according to its own meaning.",
    candidates: [
      candidate("قنطر", "قِنْطَارٌ", "lexical singular noun", "a qintar; a large amount or weight of wealth", "Root noun behind the adjective’s wealth branch.", "The adjective describes wealth heaped up; the noun names the amount/measure.", "Connects the Qur’anic adjective to the base lexical noun.") ,
      candidate("قنطر", "قَنَاطِيرُ", "broken plural noun", "large amounts or heaps", "Established plural of قِنْطَار.", "Moves from the singular wealth measure to multiple amounts/heaps.", "Shows the lexical plural used in the Qur’anic phrase.") ,
      candidate("قنطر", "قَنْطَرَ", "quadriliteral perfect verb", "he amassed wealth / built an arch", "Basic verb under the same root.", "The verb has both wealth and arch-building branches; the gloss preserves both without conflation.", "Adds the core verbal pattern.") ,
      candidate("قنطر", "قَنْطَرَةٌ", "lexical noun", "an arched bridge", "Established noun in the same root entry.", "Shows the concrete arch branch separately from wealth.", "Demonstrates honest same-root semantic development.") ,
    ],
    rejectedCandidates: ["The article in ٱلْمُقَنطَرَةِ is not a row; the current form itself remains first exactly as displayed."],
  },

  "lexical|كبكب|كبكب|verb": {
    canonicalRoot: "كبكب",
    rootRadicals: ["ك", "ب", "ك", "ب"],
    quadriliteralSubtype: "reduplicated quadriliteral",
    rootEvidence: evidence("كبكب", "The Academy records كَبْكَبَ, تَكَبْكَبَ, الكَبْكَب and الكَبْكَبة; the Qur’anic passive is the aligned form.") ,
    decision: "FULL",
    reason: "The passive Qur’anic verb belongs to a documented reduplicated quadriliteral family. The family includes active, derived, maṣdar and lexical noun rows; none is a case, clitic or generated shell.",
    candidates: [
      candidate("كبكب", "كَبْكَبَ", "quadriliteral perfect active verb", "he threw down or overturned", "Active counterpart of the Qur’anic passive.", "The Qur’anic form describes people being overturned; the active verb names the causer.", "Clear active/passive contrast.") ,
      candidate("كبكب", "تَكَبْكَبَ", "derived quadriliteral verb", "he tumbled or rolled down", "Derived form recorded under the root.", "Shifts from causing an overturn to undergoing a tumbling movement.", "Adds real derived morphology and semantic development.") ,
      candidate("كبكب", "كَبْكَبَةٌ", "quadriliteral maṣdar", "overturning or casting down", "Action noun recorded under the root.", "Names the event rather than its agent or patient.", "Makes the root’s action noun visible.") ,
      candidate("كبكب", "كَبْكَبٌ", "lexical noun", "a compact group of people", "Distinct lexical noun recorded under the same root.", "This social-group branch is translated independently from overturning.", "Shows a real same-root semantic branch without false synonymy.") ,
    ],
    rejectedCandidates: ["Removing فَـ from فَكُبْكِبُوا۟ was rejected as shell removal; the current full surface remains first."],
  },

  "lexical|هدهد|هدهد|noun/pronoun": {
    canonicalRoot: "هدهد",
    rootRadicals: ["ه", "د", "ه", "د"],
    quadriliteralSubtype: "reduplicated quadriliteral",
    rootEvidence: evidence("هدهد", "The Academy records هَدْهَدَ, الهُدْهُد, الهَدْهَدة and the broken plurals هَداهِد and هَداهِيد.") ,
    decision: "FULL",
    reason: "The bird noun is linked to a documented reduplicated quadriliteral verb and action noun, plus two established broken plurals. The verb’s meanings are translated honestly and are not presented as ‘hoopoe’.",
    candidates: [
      candidate("هدهد", "هَدْهَدَ", "quadriliteral perfect verb", "he repeated a bird’s sound or moved something gently", "Basic verb under the same root.", "The bird noun develops into vocal repetition and gentle rocking/movement.", "Shows clear semantic development across the same reduplicated root.") ,
      candidate("هدهد", "هَدْهَدَةٌ", "quadriliteral maṣdar", "repeated hoopoe-like sound or gentle rocking", "Action noun of هَدْهَدَ.", "Names the repeated sound or gentle movement rather than the bird itself.", "Connects the animal noun to the verb’s action noun.") ,
      candidate("هدهد", "هَدَاهِدُ", "broken plural noun", "hoopoes", "Established plural of الهُدْهُد.", "Moves from one bird to a group of birds.", "Useful recognition of a real broken plural.") ,
      candidate("هدهد", "هَدَاهِيدُ", "alternate broken plural noun", "hoopoes", "Second established plural form recorded under the root.", "An attested lexical plural variant, not a case or article change.", "Shows the learner that the bird noun has more than one established plural pattern.") ,
    ],
    rejectedCandidates: ["Removing ال from ٱلْهُدْهُدَ to create هُدْهُدٌ was not counted; it is article removal, not a new row."],
  },
};
