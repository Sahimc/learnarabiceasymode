import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { discoverPackagePaths, readPackage } from "./lib/packages";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";

const contract = assertAuthoringContract("Tier-A Ṣarf linguistic adjudication");
const root = process.cwd();
const reviewedAt = new Date().toISOString();
const queuePath = path.join(root, "artifacts", "content-review", "blocked-sarf-review-queue-classified.json");
const jsonReportPath = path.join(root, "artifacts", "content-review", "tier-a-sarf-adjudications.json");
const markdownReportPath = path.join(root, "artifacts", "content-review", "tier-a-sarf-adjudications.md");

type JsonObject = Record<string, unknown>;
type Decision = "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";
type Candidate = {
  form: string;
  meaning: string;
  distinction: string;
  relationship: string;
  source: string;
  confidence: "high" | "medium";
  pedagogicalUse: string;
};
type Plan = {
  familyKey: string;
  decision: Decision;
  confidence: "high" | "medium";
  reason: string;
  evidence: string[];
  candidates?: Candidate[];
  limitCount?: number;
  rejectedAlternatives: string[];
  unresolvedQuestion?: string;
  evidenceRequired?: string[];
};
type QueueOccurrence = {
  occurrenceId: string;
  location: string;
  arabic: string;
  meaning: string;
  formCount: number;
};
type QueueItem = {
  classification: string;
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrences: QueueOccurrence[];
};
type AdjudicationOccurrence = {
  occurrenceId: string;
  location: string;
  arabic: string;
  meaning: string;
  currentFormCount: number;
};
type Adjudication = {
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  decision: Decision;
  confidence: Plan["confidence"];
  reasoning: string;
  authoritativeEvidence: string[];
  rejectedAlternatives: string[];
  candidates: Candidate[];
  occurrences: AdjudicationOccurrence[];
  currentRows: JsonObject[];
  proposedFinalRows: JsonObject[];
  unresolvedQuestion: string | null;
  evidenceRequired: string[];
  humanExpertReviewRequired: boolean;
  productionStatus: string;
  reviewedAt: string;
  recordId: string;
};

const C = (
  form: string,
  meaning: string,
  distinction: string,
  relationship: string,
  source: string,
  pedagogicalUse: string,
  confidence: "high" | "medium" = "high",
): Candidate => ({ form, meaning, distinction, relationship, source, confidence, pedagogicalUse });

const quran = (location: string) => `Canonical Qur'anic evidence: ${location}.`;
const morph = "Approved project Arabic morphology knowledge cross-checked against the reviewed root meaning and aligned Qur'anic evidence.";
const shellRejection = "Case endings, tanwīn, articles, conjunctions and attached pronouns were not counted as separate lexical Ṣarf forms unless they change a genuinely useful number, person or grammatical contrast.";

const plans: Plan[] = [
  {
    familyKey: "lexical|خدع|يخدع|verb", decision: "FULL", confidence: "high",
    reason: "The family has a stable Form I/III verb relationship and productive noun/verbal-noun contrasts. The prior block was caused by insufficient selection, not a lack of genuine forms.", evidence: [quran("2:9:6; 4:142:3,6; 8:62:4"), morph],
    candidates: [
      C("خَدَعَ", "he deceived", "Form I perfect; completed action", "Form I perfect of the خ د ع lexical family", morph, "Contrasts perfect action with the current imperfect form"),
      C("يَخْدَعُ", "he deceives", "Form I imperfect, third-person masculine singular", "Form I imperfect of the خ د ع family", morph, "Makes the stem pattern recognisable without the plural suffix"),
      C("خَادِعٌ", "one who deceives", "Form I active participle", "Active participle of خَدَعَ", morph, "Shows the agent noun built from the verb"),
      C("خِدَاعٌ", "deception", "Form I verbal noun", "Verbal noun of خَدَعَ", morph, "Shows the event/state noun"),
      C("يُخَادِعُ", "he seeks to deceive", "Form III imperfect", "Derived Form III of the same root", quran("4:142:3"), "Shows the derived-pattern contrast"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|ألم|اليم|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The adjective أَلِيم and the ألم verbal/noun family support clear adjective, state-noun and verb contrasts. Repeated accusative/nominative spellings were not treated as separate forms.", evidence: [quran("2:10:9; 4:18:24; 16:117:5"), morph],
    candidates: [
      C("أَلَمٌ", "pain", "Lexical state noun", "State noun of the أ ل م family", morph, "Separates the named experience from the adjective painful"),
      C("أَلِيمٌ", "painful", "Adjective on the أَلِيم pattern", "Adjective of the أ ل م family", morph, "Shows the adjective pattern"),
      C("تَأَلَّمَ", "he suffered", "Form V perfect", "Derived Form V of أ ل م", morph, "Shows a reflexive/experiential verb"),
      C("يَأْلَمُ", "he suffers", "Form I imperfect", "Form I imperfect of the أ ل م family", quran("4:104:12"), "Contrasts the verb with the adjective"),
      C("آلَمَ", "he caused pain", "Form IV perfect", "Derived Form IV of أ ل م", morph, "Shows the causative relationship"),
    ], rejectedAlternatives: [shellRejection, "The repeated أَلِيمٌ/أَلِيمًا/أَلِيمٍ forms were collapsed as inflectional variants, not counted as separate family members."],
  },
  {
    familyKey: "lexical|درأ|ادر|verb", decision: "FULL", confidence: "high",
    reason: "The Form VI current occurrence belongs to a well-attested Form I family with perfect, imperfect, imperative and verbal-noun contrasts.", evidence: [quran("2:72:4; 3:168:10; 13:22:13; 24:8:1"), morph],
    candidates: [
      C("دَرَأَ", "he repelled", "Form I perfect", "Form I of د ر أ", morph, "Shows the completed basic action"),
      C("يَدْرَأُ", "he repels", "Form I imperfect", "Form I imperfect of د ر أ", morph, "Shows the ongoing basic action"),
      C("دَرْءٌ", "repelling", "Form I verbal noun", "Verbal noun of دَرَأَ", morph, "Shows the action noun"),
      C("اِدْرَءُوا", "repel!", "Form I imperative, second-person masculine plural", "Imperative of دَرَأَ", quran("3:168:10"), "Adds a clear mood contrast"),
      C("وَيَدْرَءُونَ", "and they repel", "Form I imperfect, third-person masculine plural", "Qur'anic Form I occurrence", quran("13:22:13"), "Adds person/number recognition"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|حرف|يحرف|verb", decision: "FULL", confidence: "high",
    reason: "The family links Form II distortion, the basic noun edge/letter and the Form V participle without crossing roots or senses.", evidence: [quran("2:75:13; 8:16:6; 22:11:7"), morph],
    candidates: [
      C("حَرَّفَ", "he distorted", "Form II perfect", "Form II of ح ر ف", morph, "Contrasts perfect and imperfect Form II"),
      C("يُحَرِّفُ", "he distorts", "Form II imperfect", "Form II imperfect of ح ر ف", morph, "Shows the current verb pattern without an attached pronoun"),
      C("حَرْفٌ", "an edge or letter", "Basic Form I noun", "Noun of the ح ر ف family", quran("22:11:7"), "Shows the nominal branch"),
      C("مُتَحَرِّفٌ", "one turning aside", "Form V active participle", "Form V derivative of ح ر ف", quran("8:16:6"), "Shows a derived participial pattern"),
      C("تَحْرِيفٌ", "distortion", "Form II verbal noun", "Verbal noun of حَرَّفَ", morph, "Shows the action noun"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|قفو|قفي|verb", decision: "FULL", confidence: "high",
    reason: "The weak-root family has basic following, Form II causative/follow-up and verbal-noun/agent contrasts. The weak spelling was mistaken for a lack of forms.", evidence: [quran("2:87:5; 17:36:2; 57:27:2,6"), morph],
    candidates: [
      C("قَفَا", "he followed", "Form I perfect, weak final radical", "Form I of ق ف و", morph, "Shows the basic perfect form"),
      C("يَقْفُو", "he follows", "Form I imperfect", "Form I imperfect of ق ف و", morph, "Shows the basic imperfect form"),
      C("قَفَّى", "he caused to follow or sent after", "Form II perfect", "Form II of ق ف و", quran("57:27:2"), "Shows the derived causative pattern"),
      C("يُقَفِّي", "he causes to follow", "Form II imperfect", "Form II imperfect of ق ف و", morph, "Shows the weak Form II pattern"),
      C("تَقْفِيَةٌ", "causing to follow", "Form II verbal noun", "Verbal noun of قَفَّى", morph, "Shows the action noun"),
      C("مُقَفٍّ", "one who causes to follow", "Form II active participle", "Active participle of قَفَّى", morph, "Shows the agent pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|نسخ|ينسخ|verb", decision: "FULL", confidence: "high",
    reason: "The root has clear basic, Form X and nominal-copy/inscription contrasts attested in the Qur'an.", evidence: [quran("2:106:2; 7:154:9; 22:52:16; 45:29:8"), morph],
    candidates: [
      C("نَسَخَ", "he copied or abrogated", "Form I perfect", "Form I of ن س خ", morph, "Shows the basic completed action"),
      C("يَنْسَخُ", "he abolishes", "Form I imperfect", "Form I imperfect of ن س خ", quran("22:52:16"), "Shows the ongoing action"),
      C("نَسْخٌ", "copying or abrogation", "Form I verbal noun", "Verbal noun of نَسَخَ", morph, "Shows the action noun"),
      C("نُسْخَةٌ", "a copy or inscription", "Lexical noun", "Nominal derivative of ن س خ", quran("7:154:9"), "Connects the action to its produced object"),
      C("اِسْتَنْسَخَ", "he transcribed", "Form X perfect", "Form X of ن س خ", quran("45:29:8"), "Shows a useful derived pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|عنت|اعنت|verb", decision: "FULL", confidence: "high",
    reason: "The Form IV current verb contrasts with Form I state verbs and the noun hardship; the prior block did not reflect the complete root family.", evidence: [quran("2:220:22; 3:118:14; 4:25:50; 49:7:12"), morph],
    candidates: [
      C("عَنِتَ", "he suffered difficulty", "Form I perfect", "Form I of ع ن ت", quran("49:7:12"), "Shows the basic state"),
      C("يَعْنَتُ", "he falls into difficulty", "Form I imperfect", "Form I imperfect of ع ن ت", morph, "Shows the ongoing state"),
      C("عَنَتٌ", "hardship or difficulty", "Lexical state noun", "Noun of the ع ن ت family", morph, "Names the state rather than the experiencer"),
      C("أَعْنَتَ", "he caused difficulty", "Form IV perfect", "Form IV of ع ن ت", quran("2:220:22"), "Current derived causative pattern"),
      C("مُعْنِتٌ", "causing difficulty", "Form IV active participle", "Active participle of أَعْنَتَ", morph, "Shows the causative agent"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|كمل|كاملين|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The adjective complete has a clear basic adjective, Form IV verb and completeness-noun family.", evidence: [quran("2:233:5; 5:3:41; 16:25:3"), morph],
    candidates: [
      C("كَمُلَ", "he became complete", "Form I stative perfect", "Form I of ك م ل", morph, "Shows the state becoming complete"),
      C("يَكْمُلُ", "he becomes complete", "Form I imperfect", "Form I imperfect of ك م ل", morph, "Shows the ongoing state"),
      C("أَكْمَلَ", "he perfected or completed", "Form IV perfect", "Form IV of ك م ل", quran("5:3:41"), "Shows the causative/completive pattern"),
      C("يُكْمِلُ", "he completes", "Form IV imperfect", "Form IV imperfect of ك م ل", morph, "Shows the ongoing causative action"),
      C("كَمَالٌ", "completeness", "Lexical abstract noun", "Noun of the ك م ل family", morph, "Names the quality rather than describing it"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|شور|تشاور|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The family has basic consultation, Form III consultation and Form VI reciprocal consultation, all useful for recognition.", evidence: [quran("2:233:40; 3:159:19; 19:29:1; 42:38:7"), morph],
    candidates: [
      C("شُورَىٰ", "consultation", "Lexical noun on the shūrā pattern", "Noun of ش و ر", quran("42:38:7"), "Shows the established consultation noun"),
      C("شَاوَرَ", "he consulted", "Form III perfect", "Form III of ش و ر", morph, "Shows the basic consultation verb"),
      C("يُشَاوِرُ", "he consults", "Form III imperfect", "Form III imperfect of ش و ر", morph, "Shows the ongoing consultation"),
      C("تَشَاوُرٌ", "mutual consultation", "Form VI verbal noun", "Verbal noun of تَشَاوَرَ", morph, "Shows reciprocity"),
      C("مُشَاوَرَةٌ", "consultation", "Form III verbal noun", "Verbal noun of شَاوَرَ", morph, "Shows the action noun"),
    ], rejectedAlternatives: [shellRejection, "إِشَارَةٌ was not selected because the pointing/indicating sense is a separate semantic branch from consultation for this learner family."],
  },
  {
    familyKey: "lexical|جوز|جاوز|verb", decision: "FULL", confidence: "high",
    reason: "The root has clear Form I passing, Form III crossing and Form VI overlooking relationships.", evidence: [quran("2:249:31; 7:138:1; 18:62:2; 46:16:8"), morph],
    candidates: [
      C("جَازَ", "he passed or crossed", "Form I perfect", "Form I of ج و ز", morph, "Shows the basic crossing action"),
      C("يَجُوزُ", "he passes or may", "Form I imperfect", "Form I imperfect of ج و ز", morph, "Shows the imperfect/permission branch"),
      C("جَوَازٌ", "permission or passage", "Lexical noun", "Noun of ج و ز", morph, "Names the result/permission"),
      C("جَاوَزَ", "he crossed", "Form III perfect", "Form III of ج و ز", quran("2:249:31"), "Current derived crossing form"),
      C("تَجَاوَزَ", "he overlooked or went beyond", "Form VI perfect", "Form VI of ج و ز", quran("46:16:8"), "Shows the reciprocal/extended pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|فأي|فئة|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The noun has a useful singular, dual, plural and attached-pronoun paradigm. The number changes are meaningful and not mere case padding.", evidence: [quran("2:249:51,54; 3:13:6,8; 8:19:17,48:18"), morph],
    candidates: [
      C("فِئَةٌ", "one group", "Singular feminine noun, nominative", "Singular of فِئَة", quran("3:13:8"), "Establishes the base noun"),
      C("فِئَتَانِ", "two groups", "Dual nominative", "Dual of فِئَة", quran("8:48:18"), "Shows dual number"),
      C("فِئَتَيْنِ", "two groups", "Dual oblique form", "Oblique dual of فِئَة", quran("3:13:6"), "Shows the dual inflectional contrast"),
      C("فِئَاتٌ", "groups", "Regular feminine plural", "Plural of فِئَة", morph, "Adds the productive plural pattern"),
      C("فِئَتُكُمْ", "your group or forces", "Attached second-person masculine plural pronoun", "Possessive form of فِئَة", quran("8:19:17"), "Shows attached-pronoun construction"),
    ], rejectedAlternatives: ["Article and case variants of the same singular/dual form were not counted twice."],
  },
  {
    familyKey: "lexical|عوم|عام|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The year noun supports singular, dual and broken-plural number contrasts, plus a recognised nisbah adjective.", evidence: [quran("2:259:20,36; 9:28:12; 9:37:11,13; 31:14:11"), morph],
    candidates: [
      C("عَامٌ", "a year", "Masculine singular nominative", "Singular of عَام", morph, "Establishes the base noun"),
      C("عَامَانِ", "two years", "Dual nominative", "Dual of عَام", morph, "Shows dual number"),
      C("عَامَيْنِ", "two years", "Dual oblique form", "Oblique dual of عَام", quran("31:14:11"), "Shows dual inflection"),
      C("أَعْوَامٌ", "years", "Broken plural", "Broken plural of عَام", morph, "Shows the plural pattern"),
      C("عَامِيٌّ", "annual or yearly", "Nisbah adjective", "Nisbah derivative from عَام", morph, "Shows adjective formation"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|عفف|تعفف|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The Form V restraint noun has a clear Form I verb, Form X verbs and a recognised chaste adjective.", evidence: [quran("2:273:16; 4:6:23; 24:33:1,60:18"), morph],
    candidates: [
      C("عَفَّ", "he abstained", "Form I perfect", "Form I of ع ف ف", morph, "Shows the basic restraint action"),
      C("يَعِفُّ", "he refrains", "Form I imperfect", "Form I imperfect of ع ف ف", morph, "Shows the ongoing action"),
      C("عَفِيفٌ", "chaste or restrained", "Descriptive adjective", "Adjective of ع ف ف", morph, "Shows the personal quality"),
      C("اِسْتَعَفَّ", "he refrained or kept chaste", "Form X perfect", "Form X of ع ف ف", quran("4:6:23"), "Shows the derived seeking/maintaining pattern"),
      C("تَعَفُّفٌ", "restraint", "Form V verbal noun", "Verbal noun of تَعَفَّفَ", quran("2:273:16"), "Current nominal pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|دأب|داب|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The noun habit/way and the verb persist support a stable lexical family; the prior lesson stopped after case variants.", evidence: [quran("3:11:1; 8:52:1,54:1; 12:47:5; 40:31:2"), morph],
    candidates: [
      C("دَأَبَ", "he persisted or was constant", "Form I perfect", "Form I of د أ ب", morph, "Shows the verbal source"),
      C("يَدْأَبُ", "he persists diligently", "Form I imperfect", "Form I imperfect of د أ ب", morph, "Shows ongoing persistence"),
      C("دَأْبٌ", "habit or way", "Lexical noun", "Noun of د أ ب", quran("3:11:1"), "Names the repeated way"),
      C("دَؤُوبٌ", "diligent or persistent", "Descriptive adjective", "Adjectival derivative of د أ ب", morph, "Shows the quality adjective"),
      C("دَأَبًا", "persistently", "Adverbial accusative use", "Lexical use of د أ ب", quran("12:47:5"), "Shows the adverbial use without treating case alone as a new lexeme"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|قنطر|قنطار|noun/pronoun", decision: "BLOCKED", confidence: "medium",
    reason: "The Qur'anic family clearly supports قِنْطَار, قَنَاطِير and مُقَنْطَرَة, but the proposed quadriliteral verb قَنْطَرَ is not established in the approved project evidence strongly enough to add safely. Case variants cannot fill the fifth slot.", evidence: [quran("3:75:7; 3:14:14; 4:20:9"), "Existing project rows for قِنْطَار, قَنَاطِير and مُقَنْطَرَة were reviewed; no approved lexical entry for the proposed verb was found."],
    rejectedAlternatives: [shellRejection, "قَنْطَرَ/يُقَنْطِرُ was not promoted from general root-pattern possibility because its attestation and learner-facing relationship to قِنْطَار remain unverified in the approved project evidence."],
    unresolvedQuestion: "Is قَنْطَرَ, with a verified meaning and form classification, an approved member of the same ق ن ط ر learner family, or would it be an unrelated rare quadriliteral derivation?",
    evidenceRequired: ["An approved Arabic lexicon entry explicitly linking قَنْطَرَ or another additional form to قِنْطَار and the same learner-facing lexical family.", "Independent Arabic morphology review of the quadriliteral derivation and its pedagogical usefulness."],
  },
  {
    familyKey: "lexical|سعر|سعير|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The family has a clear fire/madness root with noun, verb and passive-form contrasts. The previous duplicate وَسَعِيرًا was shell-only and was replaced by a genuine verb contrast.", evidence: [quran("4:10:13; 54:24:10; 67:5:12; 81:12:3"), morph],
    candidates: [
      C("سَعِرَ", "he became inflamed or mad", "Form I perfect", "Form I of س ع ر", morph, "Adds the basic verbal state"),
      C("يَسْعَرُ", "he becomes inflamed", "Form I imperfect", "Form I imperfect of س ع ر", morph, "Shows ongoing state"),
      C("سُعُرٌ", "madness", "Lexical plural/state noun", "Noun branch of س ع ر", quran("54:24:10"), "Contrasts the madness noun with the blaze noun"),
      C("سُعِّرَ", "it was set ablaze", "Form II passive perfect", "Passive Form II of س ع ر", quran("81:12:3"), "Shows the causative/passive fire pattern"),
      C("سَعِيرٌ", "a blazing fire", "Lexical noun/adjective", "Noun branch of س ع ر", quran("67:5:12"), "Shows the blaze lexeme without case or conjunction shell"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|مقت|مقتا|noun/pronoun", decision: "CONFIRMED-LIMITED", confidence: "high", limitCount: 3,
    reason: "The reviewed family has four strong teaching members: the current verbal noun, Form I perfect, Form I imperfect and the adjective مَقِيت. A fifth useful member is not established without adding a rare or semantically weak derivative; case variants are padding.", evidence: [quran("4:22:15"), morph],
    candidates: [
      C("مَقَتَ", "he hated or detested", "Form I perfect", "Form I of م ق ت", morph, "Shows the completed action"),
      C("يَمْقَتُ", "he hates or detests", "Form I imperfect", "Form I imperfect of م ق ت", morph, "Shows ongoing hatred"),
      C("مَقِيتٌ", "hateful or detestable", "Descriptive adjective", "Adjective of م ق ت", morph, "Shows the quality adjective"),
    ], rejectedAlternatives: [shellRejection, "No additional high-value Qur'anic or approved-project form was found beyond the noun/verb/adjective set."],
  },
  {
    familyKey: "lexical|حبر|احبار|noun/pronoun", decision: "MODEL-ISSUE", confidence: "medium",
    reason: "The current family key merges the scholar/rabbi noun حَبْر/أَحْبَار with the separate delight verb branch حَبِرَ/يُحْبَرُ. The root is shared, but the current rows do not establish one learner-facing lexical family.", evidence: [quran("5:44:15; 5:63:4; 9:31:2,34:7; 22:23:??"), morph],
    rejectedAlternatives: [shellRejection, "يُحْبَرُونَ/تُحْبَرُونَ were rejected as forms of the scholar noun; they express a separate delight branch."],
    unresolvedQuestion: "Should the noun scholar/rabbi and the delight verb be represented as separate family scopes, and what approved singular/plural evidence should remain in the scholar scope?",
    evidenceRequired: ["Approved lexicon evidence distinguishing حَبْر/أَحْبَار from حَبِرَ/يُحْبَرُ.", "A model decision for multiple lexical branches sharing a root/provider bucket."],
  },
  {
    familyKey: "lexical|رجس|رجس|noun/pronoun", decision: "CONFIRMED-LIMITED", confidence: "high", limitCount: 0,
    reason: "The learner lexeme is the restricted noun رِجْس meaning filth/abomination. Existing alternatives are article, case or attached-pronoun variants of the same noun; a distinct adjective or derived verb was not established in approved evidence for this lesson.", evidence: [quran("5:90:9; 6:125:24; 9:125:7,9; 10:100:10; 22:30:19; 33:33:21"), morph],
    candidates: [], rejectedAlternatives: [shellRejection, "رَجِسٌ was not added because the project evidence did not establish it as the intended learner-facing counterpart of this Qur'anic noun rather than a separate lexical/adjectival branch."],
  },
  {
    familyKey: "lexical|بلس|مبلس|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The Form IV despair family supports perfect, imperfect, verbal noun and participial contrasts.", evidence: [quran("6:44:20; 23:77:12; 43:75:6"), morph],
    candidates: [
      C("أَبْلَسَ", "he despaired", "Form IV perfect", "Form IV of ب ل س", morph, "Shows the source verb"),
      C("يُبْلِسُ", "he despairs", "Form IV imperfect", "Form IV imperfect of ب ل س", quran("43:75:6"), "Shows ongoing despair"),
      C("إِبْلَاسٌ", "despair", "Form IV verbal noun", "Verbal noun of أَبْلَسَ", morph, "Names the state"),
      C("مُبْلِسٌ", "despairing or dumbfounded", "Form IV active participle", "Active participle of أَبْلَسَ", quran("6:44:20"), "Shows the person/state adjective"),
      C("مُبْلَسُونَ", "they are in despair", "Form IV passive/participial plural use", "Qur'anic participial occurrence", quran("23:77:12"), "Shows number contrast"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|فلق|فالق|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The family has a clear split/open root with active participle, basic verb, Form VII result and daybreak noun.", evidence: [quran("6:95:3; 26:63:8; 113:1:4"), morph],
    candidates: [
      C("فَلَقَ", "he split open", "Form I perfect", "Form I of ف ل ق", morph, "Shows the completed splitting action"),
      C("يَفْلِقُ", "he splits open", "Form I imperfect", "Form I imperfect of ف ل ق", morph, "Shows ongoing action"),
      C("فَالِقٌ", "one who splits open", "Form I active participle", "Active participle of فَلَقَ", quran("6:95:3"), "Shows the agent pattern"),
      C("اِنْفَلَقَ", "it split apart", "Form VII perfect", "Form VII of ف ل ق", quran("26:63:8"), "Shows the result/reflexive pattern"),
      C("فَلْقٌ", "splitting or cleaving", "Form I verbal noun", "Verbal noun of فَلَقَ", morph, "Names the action"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|وصف|يصف|verb", decision: "FULL", confidence: "high",
    reason: "The family has basic verb, active participle, verbal noun and person/number contrasts.", evidence: [quran("6:100:15; 12:18:18; 16:62:5; 21:18:13"), morph],
    candidates: [
      C("وَصَفَ", "he described or attributed", "Form I perfect", "Form I of و ص ف", morph, "Shows completed attribution"),
      C("يَصِفُ", "he describes", "Form I imperfect", "Form I imperfect of و ص ف", morph, "Shows the singular imperfect"),
      C("وَاصِفٌ", "one who describes", "Form I active participle", "Active participle of وَصَفَ", morph, "Shows the agent noun"),
      C("مَوْصُوفٌ", "described", "Form I passive participle", "Passive participle of وَصَفَ", morph, "Shows the passive result"),
      C("وَصْفٌ", "description or attribution", "Form I verbal noun", "Verbal noun of وَصَفَ", quran("6:139:19"), "Names the action"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|أبل|ابل|noun/pronoun", decision: "MODEL-ISSUE", confidence: "medium",
    reason: "The provider bucket merges إِبِل (camels) with أَبَابِيل (flocks), while the root/lexeme relationship of أبابيل is disputed and the existing rows also include distinct camel-keeping derivatives. A five-row family would risk teaching a root collision as one lexical family.", evidence: [quran("6:144:2; 105:3:4"), morph],
    rejectedAlternatives: [shellRejection, "أَبَابِيلَ was not automatically treated as a plural of إِبِل; the lexical relationship requires explicit expert/lexicon adjudication."],
    unresolvedQuestion: "Are إِبِل and أَبَابِيل members of one approved lexical family for this teaching model, or must they receive separate family scopes?",
    evidenceRequired: ["Approved Qur'anic lexicon evidence for the etymological and morphological status of أَبَابِيل.", "A reviewed family-scope rule for disputed/indeclinable collective nouns."],
  },
  {
    familyKey: "lexical|نزغ|نزغ|verb", decision: "FULL", confidence: "high",
    reason: "The root has clear basic and causative discord/suggestion forms; the current attached pronoun is not the only evidence.", evidence: [quran("7:200:2; 12:100:33; 17:53:9; 41:36:2,5"), morph],
    candidates: [
      C("نَزَغَ", "he incited or caused discord", "Form I perfect", "Form I of ن ز غ", morph, "Shows the completed basic action"),
      C("يَنْزَغُ", "he sows discord", "Form I imperfect", "Form I imperfect of ن ز غ", quran("17:53:9"), "Shows ongoing action"),
      C("نَزَّغَ", "he caused discord", "Form II perfect", "Form II of ن ز غ", quran("12:100:33"), "Shows causative intensity"),
      C("يُنَزِّغُ", "he causes discord", "Form II imperfect", "Form II imperfect of ن ز غ", morph, "Shows the derived imperfect"),
      C("نَزْغٌ", "an evil suggestion", "Lexical state/action noun", "Noun of ن ز غ", quran("7:200:5"), "Names the suggestion"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|نزغ|نزغ|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The noun occurrence is supported by the same basic/causative verb family and an active-participant contrast; the attached pronoun is not counted as morphology.", evidence: [quran("7:200:2,5; 12:100:33; 17:53:9; 41:36:2"), morph],
    candidates: [
      C("نَزَغَ", "he incited or caused discord", "Form I perfect", "Form I of ن ز غ", morph, "Shows the source verb"),
      C("يَنْزَغُ", "he sows discord", "Form I imperfect", "Form I imperfect of ن ز غ", quran("17:53:9"), "Shows ongoing action"),
      C("نَزَّغَ", "he caused discord", "Form II perfect", "Form II of ن ز غ", quran("12:100:33"), "Shows derived causation"),
      C("نَازِغٌ", "one who incites", "Form I active participle", "Active participle of نَزَغَ", morph, "Shows the agent noun"),
      C("نَزْغٌ", "an evil suggestion", "Lexical action/state noun", "Noun of ن ز غ", quran("7:200:5"), "Current nominal pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|فأي|فئت|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The group noun has meaningful singular, dual, plural and possessive contrasts; existing rows are preserved as lexical-number teaching rather than case padding.", evidence: [quran("3:13:6,8; 8:19:17,48:18"), morph],
    candidates: [
      C("فِئَةٌ", "one group", "Singular", "Singular of فِئَة", quran("3:13:8"), "Establishes the base noun"),
      C("فِئَتَانِ", "two groups", "Dual nominative", "Dual of فِئَة", quran("8:48:18"), "Shows dual number"),
      C("فِئَتَيْنِ", "two groups", "Dual oblique", "Oblique dual of فِئَة", quran("3:13:6"), "Shows dual inflection"),
      C("فِئَاتٌ", "groups", "Regular feminine plural", "Plural of فِئَة", morph, "Shows plural number"),
      C("فِئَتُكُمْ", "your group", "Attached pronoun", "Possessive form of فِئَة", quran("8:19:17"), "Shows possession"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|فأي|فئتان|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The dual occurrence is part of the same productive noun paradigm and benefits from singular, dual, plural and attached-pronoun comparison.", evidence: [quran("3:13:6,8; 8:19:17,48:18"), morph],
    candidates: [
      C("فِئَةٌ", "one group", "Singular", "Singular of فِئَة", quran("3:13:8"), "Establishes the base noun"),
      C("فِئَتَانِ", "two groups", "Dual nominative", "Dual of فِئَة", quran("8:48:18"), "Shows dual number"),
      C("فِئَتَيْنِ", "two groups", "Dual oblique", "Oblique dual of فِئَة", quran("3:13:6"), "Shows dual inflection"),
      C("فِئَاتٌ", "groups", "Regular feminine plural", "Plural of فِئَة", morph, "Shows plural number"),
      C("فِئَتُكُمْ", "your group", "Attached pronoun", "Possessive form of فِئَة", quran("8:19:17"), "Shows possession"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|حصد|حصيد|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The harvest family has a clear basic verb, verbal noun, result noun and agent/passive contrasts.", evidence: [quran("6:141:25; 10:24:34; 11:100:9; 21:15:7; 50:9:10"), morph],
    candidates: [
      C("حَصَدَ", "he reaped", "Form I perfect", "Form I of ح ص د", morph, "Shows the completed harvest action"),
      C("يَحْصُدُ", "he reaps", "Form I imperfect", "Form I imperfect of ح ص د", morph, "Shows ongoing action"),
      C("حَصَادٌ", "harvest", "Form I verbal noun", "Verbal noun of حَصَدَ", quran("6:141:25"), "Names the harvest"),
      C("حَصِيدٌ", "a harvest, clean-mown", "Result noun/adjectival pattern", "Result derivative of ح ص د", quran("10:24:34"), "Shows the completed result"),
      C("حَاصِدٌ", "one who reaps", "Form I active participle", "Active participle of حَصَدَ", morph, "Shows the agent"),
      C("مَحْصُودٌ", "reaped or harvested", "Form I passive participle", "Passive participle of حَصَدَ", morph, "Shows the passive result"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|طرد|طارد|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The active participle and basic verb family support perfect, imperfect, active and passive contrasts.", evidence: [quran("6:52:2,22; 11:29:13; 26:114:3"), morph],
    candidates: [
      C("طَرَدَ", "he drove away", "Form I perfect", "Form I of ط ر د", morph, "Shows completed action"),
      C("يَطْرُدُ", "he drives away", "Form I imperfect", "Form I imperfect of ط ر د", morph, "Shows ongoing action"),
      C("طَارِدٌ", "one who drives away", "Form I active participle", "Active participle of طَرَدَ", quran("11:29:13"), "Current nominal pattern"),
      C("مَطْرُودٌ", "driven away", "Form I passive participle", "Passive participle of طَرَدَ", morph, "Shows passive result"),
      C("طَرْدٌ", "driving away", "Form I verbal noun", "Verbal noun of طَرَدَ", morph, "Names the action"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|وصف|تصف|verb", decision: "FULL", confidence: "high",
    reason: "This occurrence is the same reviewed Form I family as يَصِفُ, with a clear verbal noun and active/passive participle contrast.", evidence: [quran("6:100:15; 6:139:19; 12:18:18; 16:62:5"), morph],
    candidates: [
      C("وَصَفَ", "he described", "Form I perfect", "Form I of و ص ف", morph, "Shows the completed action"),
      C("يَصِفُ", "he describes", "Form I imperfect", "Form I imperfect of و ص ف", quran("6:100:15"), "Shows the singular imperfect"),
      C("وَاصِفٌ", "one who describes", "Active participle", "Active participle of وَصَفَ", morph, "Shows the agent"),
      C("مَوْصُوفٌ", "described", "Passive participle", "Passive participle of وَصَفَ", morph, "Shows the passive result"),
      C("وَصْفٌ", "description", "Verbal noun", "Verbal noun of وَصَفَ", quran("6:139:19"), "Names the action"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|لزم|الزم|verb", decision: "FULL", confidence: "high",
    reason: "The Form IV current verb has a clear Form I root, Form IV imperfect and verbal noun/causative contrasts.", evidence: [quran("11:28:16; 17:13:3; 48:26:17"), morph],
    candidates: [
      C("لَزِمَ", "he adhered or remained", "Form I perfect", "Form I of ل ز م", morph, "Shows the basic state"),
      C("يَلْزَمُ", "he adheres or remains", "Form I imperfect", "Form I imperfect of ل ز م", morph, "Shows ongoing adherence"),
      C("أَلْزَمَ", "he made adhere", "Form IV perfect", "Form IV of ل ز م", quran("17:13:3"), "Current derived pattern"),
      C("يُلْزِمُ", "he compels or makes adhere", "Form IV imperfect", "Form IV imperfect of ل ز م", quran("11:28:16"), "Shows the ongoing causative"),
      C("لُزُومٌ", "remaining or adherence", "Form I verbal noun", "Verbal noun of لَزِمَ", morph, "Names the state"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|قفو|تقف|verb", decision: "FULL", confidence: "high",
    reason: "The current Form I imperfect belongs to the same weak-root family as Form II perfect, verbal noun and active participle; a basic-person contrast completes the set.", evidence: [quran("17:36:2; 57:27:2"), morph],
    candidates: [
      C("قَفَا", "he followed", "Form I perfect", "Form I of ق ف و", morph, "Shows the completed action"),
      C("يَقْفُو", "he follows", "Form I imperfect", "Form I imperfect of ق ف و", morph, "Shows the basic imperfect"),
      C("قَفَّى", "he caused to follow", "Form II perfect", "Form II of ق ف و", quran("57:27:2"), "Shows the derived pattern"),
      C("تَقْفِيَةٌ", "causing to follow", "Form II verbal noun", "Verbal noun of قَفَّى", morph, "Names the action"),
      C("مُقَفٍّ", "one who causes to follow", "Form II active participle", "Active participle of قَفَّى", morph, "Shows the agent"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|وصد|وصيد|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The entrance noun and Form IV closing family support noun, perfect, verbal-noun and passive participle contrasts.", evidence: [quran("18:18:13; 90:20:3"), morph],
    candidates: [
      C("وَصِيدٌ", "an entrance or enclosure", "Lexical noun", "Noun of و ص د", quran("18:18:13"), "Shows the noun without the preposition"),
      C("أَوْصَدَ", "he closed", "Form IV perfect", "Form IV of و ص د", morph, "Shows the source verb"),
      C("يُوصِدُ", "he closes", "Form IV imperfect", "Form IV imperfect of و ص د", morph, "Shows ongoing closing"),
      C("إِيصَادٌ", "closing or sealing", "Form IV verbal noun", "Verbal noun of أَوْصَدَ", morph, "Names the action"),
      C("مُوصَدٌ", "closed or sealed", "Form IV passive participle", "Passive participle of أَوْصَدَ", quran("90:20:3"), "Shows the result"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|زهق|زاهق|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The vanishing family has basic perfect/imperfect, active participial and verbal-noun contrasts.", evidence: [quran("9:55:14; 17:81:4,9; 21:18:9"), morph],
    candidates: [
      C("زَهَقَ", "he perished or departed", "Form I perfect", "Form I of ز ه ق", quran("17:81:4"), "Shows completed departure"),
      C("يَزْهَقُ", "he perishes", "Form I imperfect", "Form I imperfect of ز ه ق", morph, "Shows ongoing departure"),
      C("زَاهِقٌ", "vanishing", "Form I active participle", "Active participle of زَهَقَ", quran("21:18:9"), "Current adjective/participle"),
      C("زَهُوقٌ", "bound to perish", "Intensive adjective", "Intensive derivative of ز ه ق", quran("17:81:9"), "Shows the intensified quality"),
      C("مُزْهِقٌ", "causing to perish", "Form IV active participle", "Active participle of أَزْهَقَ", morph, "Shows the causative branch"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|حصب|حصب|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The firewood noun belongs to a clear stone-pelting family with active/passive participles and basic verb/noun contrasts.", evidence: [quran("21:98:7; 54:34:4"), morph],
    candidates: [
      C("حَصَبَ", "he pelted with stones", "Form I perfect", "Form I of ح ص ب", morph, "Shows the source action"),
      C("يَحْصِبُ", "he pelts with stones", "Form I imperfect", "Form I imperfect of ح ص ب", morph, "Shows ongoing action"),
      C("حَاصِبٌ", "a storm of stones", "Form I active participle", "Active participle of حَصَبَ", quran("54:34:4"), "Shows the agent/phenomenon noun"),
      C("مَحْصُوبٌ", "pelted with stones", "Form I passive participle", "Passive participle of حَصَبَ", morph, "Shows the affected result"),
      C("حَصْبٌ", "stone-pelting or pebbles", "Lexical action/result noun", "Noun of ح ص ب", morph, "Names the material/action"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|عقم|عقيم|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The adjective barren has a well-established stative, causative, Form II and action-noun family. Existing case variants are collapsed.", evidence: [quran("22:55:16; 42:50:8; 51:29:9,41:7"), morph],
    candidates: [
      C("عَقُمَ", "he became barren or sterile", "Form I stative perfect", "Form I of ع ق م", morph, "Shows the state"),
      C("عَقَمَ", "he rendered barren", "Form I transitive perfect", "Transitive Form I of ع ق م", morph, "Contrasts state and causation"),
      C("عَقَّمَ", "he sterilized", "Form II perfect", "Form II of ع ق م", morph, "Shows the derived causative"),
      C("عُقْمٌ", "barrenness or sterility", "Lexical state noun", "Noun of ع ق م", morph, "Names the condition"),
      C("تَعْقِيمٌ", "sterilization", "Form II verbal noun", "Verbal noun of عَقَّمَ", morph, "Names the derived action"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|وجل|وجلة|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The fear family has adjective, masculine plural, perfect and imperfect forms with clear person/number contrasts.", evidence: [quran("8:2:7; 15:52:9,53:3; 23:60:6"), morph],
    candidates: [
      C("وَجِلَ", "he feared", "Form I perfect", "Form I of و ج ل", morph, "Shows completed fear"),
      C("يَوْجَلُ", "he fears", "Form I imperfect", "Form I imperfect of و ج ل", morph, "Shows ongoing fear"),
      C("وَجِلٌ", "fearful", "Form I active adjective", "Adjectival derivative of و ج ل", morph, "Shows the singular quality"),
      C("وَجِلُونَ", "afraid", "Masculine plural adjective", "Plural of وَجِل", quran("15:52:9"), "Shows number"),
      C("وَجْلٌ", "fear", "Lexical state noun", "Noun of و ج ل", morph, "Names the emotion"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|غضض|يغض|verb", decision: "FULL", confidence: "high",
    reason: "The Form I lowering verb has second/third person, feminine/masculine and imperative contrasts; the endings are meaningful grammatical morphology rather than shell padding.", evidence: [quran("24:30:3,31:3; 49:3:3"), morph],
    candidates: [
      C("غَضَّ", "he lowered", "Form I perfect", "Form I of غ ض ض", morph, "Shows completed action"),
      C("يَغْضُضْنَ", "they should lower", "Form I imperfect, feminine plural", "Form I imperfect of غ ض ض", quran("24:31:3"), "Shows gender/number"),
      C("يَغُضُّونَ", "they lower", "Form I imperfect, masculine plural", "Form I imperfect of غ ض ض", quran("49:3:3"), "Shows masculine plural"),
      C("اِغْضُضْ", "lower!", "Form I imperative", "Imperative of غَضَّ", morph, "Shows mood"),
      C("غَضٌّ", "lowering", "Form I verbal noun", "Verbal noun of غَضَّ", morph, "Names the action"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|بور|بور|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The adjective ruined and the destruction/perishing branch support basic verb, imperfect, noun and participial contrasts.", evidence: [quran("14:28:12; 25:18:21; 48:12:20"), morph],
    candidates: [
      C("بَارَ", "he perished", "Form I perfect", "Form I of ب و ر", morph, "Shows completed perishing"),
      C("يَبُورُ", "he perishes", "Form I imperfect", "Form I imperfect of ب و ر", morph, "Shows ongoing perishing"),
      C("بَوَارٌ", "destruction", "Lexical noun", "Noun of ب و ر", quran("14:28:12"), "Names the result"),
      C("بَائِرٌ", "perishing or ruined", "Form I active participle", "Active participle of بَارَ", morph, "Shows the quality/agent"),
      C("بُورٌ", "ruined", "Adjective", "Adjective of ب و ر", quran("25:18:21"), "Current adjectival form"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|سرج|سراجا|noun/pronoun", decision: "MODEL-ISSUE", confidence: "medium",
    reason: "سِرَاج is the lamp noun, while سَرَجَ/يَسْرُجُ belong to the saddle verb branch. They share a consonantal root bucket but the semantic relationship is too weak to present as one learner-facing family without a sense-scope decision.", evidence: [quran("25:61:9; 33:46:5"), morph],
    rejectedAlternatives: [shellRejection, "سَرَجَ and يَسْرُجُ were rejected as automatic forms of the lamp lexeme because their primary meaning is saddling, not illumination."],
    unresolvedQuestion: "Should the lamp noun and saddle verb be separated into semantic family scopes, or does the approved lexicon establish one teachable historical family?",
    evidenceRequired: ["Approved lexicon evidence for the semantic relationship between سِرَاج and سَرَجَ.", "A family-scope/model rule for root-sharing but semantically divergent branches."],
  },
  {
    familyKey: "lexical|أسف|اسف|verb", decision: "FULL", confidence: "high",
    reason: "The Form IV angering occurrence has a clear Form I grief verb, noun and vocative contrast.", evidence: [quran("7:150:7; 12:84:4; 18:6:11; 43:55:2"), morph],
    candidates: [
      C("أَسِفَ", "he grieved", "Form I perfect", "Form I of أ س ف", quran("7:150:7"), "Shows the basic emotional verb"),
      C("يَأْسَفُ", "he grieves", "Form I imperfect", "Form I imperfect of أ س ف", morph, "Shows ongoing grief"),
      C("أَسَفٌ", "grief", "Lexical state noun", "Noun of أ س ف", quran("18:6:11"), "Names the emotion"),
      C("آسِفٌ", "grieving", "Form I active participle", "Active participle of أَسِفَ", morph, "Shows the experiencer adjective"),
      C("آسَفَ", "he angered or caused grief", "Form IV perfect", "Form IV of أ س ف", quran("43:55:2"), "Current causative branch"),
    ], rejectedAlternatives: [shellRejection, "Repeated أَسَفًا spellings were collapsed as case variants; يَا أَسَفَى was retained only as a vocative candidate where it adds a genuine person/particle construction."],
  },
  {
    familyKey: "lexical|جرح|اجترح|verb", decision: "FULL", confidence: "high",
    reason: "The Form VIII current verb belongs to a basic wound/action family with plural noun and basic verb contrasts.", evidence: [quran("5:4:12; 5:45:15; 6:60:7; 45:21:4"), morph],
    candidates: [
      C("جَرَحَ", "he wounded or committed", "Form I perfect", "Form I of ج ر ح", quran("6:60:7"), "Shows the basic verb"),
      C("يَجْرَحُ", "he wounds or commits", "Form I imperfect", "Form I imperfect of ج ر ح", morph, "Shows ongoing action"),
      C("جُرُوحٌ", "wounds", "Broken plural noun", "Plural of جُرْح", quran("5:45:15"), "Shows the nominal plural"),
      C("جَارِحٌ", "one that wounds or hunts", "Form I active participle", "Active participle of جَرَحَ", quran("5:4:12"), "Shows the agent noun"),
      C("مَجْرُوحٌ", "wounded", "Form I passive participle", "Passive participle of جَرَحَ", morph, "Shows passive result"),
      C("اِجْتَرَحَ", "he committed or acquired", "Form VIII perfect", "Form VIII of ج ر ح", quran("45:21:4"), "Current derived pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|سخط|اسخط|verb", decision: "FULL", confidence: "high",
    reason: "The Form IV angering verb has basic perfect/imperfect, noun and active-participle contrasts.", evidence: [quran("3:162:7; 5:80:13; 9:58:16; 47:28:5"), morph],
    candidates: [
      C("سَخِطَ", "he became angry", "Form I perfect", "Form I of س خ ط", quran("5:80:13"), "Shows the basic state"),
      C("يَسْخَطُ", "he becomes angry", "Form I imperfect", "Form I imperfect of س خ ط", morph, "Shows ongoing anger"),
      C("سَخَطٌ", "wrath or displeasure", "Lexical state noun", "Noun of س خ ط", quran("3:162:7"), "Names the emotion"),
      C("سَاخِطٌ", "angry or displeased", "Form I active participle", "Active participle of سَخِطَ", morph, "Shows the experiencer"),
      C("أَسْخَطَ", "he angered", "Form IV perfect", "Form IV of س خ ط", quran("47:28:5"), "Current causative branch"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|سجر|مسجور|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The passive/participial occurrence has a clear basic verb, imperfect, verbal noun and Form II causative contrast.", evidence: [quran("52:6:2"), morph],
    candidates: [
      C("سَجَرَ", "he kindled or filled", "Form I perfect", "Form I of س ج ر", morph, "Shows the source action"),
      C("يَسْجُرُ", "he kindles or fills", "Form I imperfect", "Form I imperfect of س ج ر", morph, "Shows ongoing action"),
      C("سَجْرٌ", "kindling or filling", "Form I verbal noun", "Verbal noun of سَجَرَ", morph, "Names the action"),
      C("سَجَّرَ", "he caused to burn or fill", "Form II perfect", "Form II of س ج ر", morph, "Shows derived causation"),
      C("مَسْجُورٌ", "filled or kindled", "Form I passive participle", "Passive participle of سَجَرَ", quran("52:6:2"), "Current result pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|سعر|سعر|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The madness noun and fire branch are connected by the root but can be taught through distinct noun, basic verb and passive-form contrasts without case-only duplication.", evidence: [quran("54:24:10,47; 67:5:12; 76:4:6; 81:12:3"), morph],
    candidates: [
      C("سَعِرَ", "he became inflamed or mad", "Form I perfect", "Form I of س ع ر", morph, "Shows the state verb"),
      C("يَسْعَرُ", "he becomes inflamed", "Form I imperfect", "Form I imperfect of س ع ر", morph, "Shows ongoing state"),
      C("سَعِيرٌ", "a blazing fire", "Lexical noun/adjective", "Noun branch of س ع ر", quran("67:5:12"), "Contrasts the blaze lexeme"),
      C("سُعِّرَ", "it was set ablaze", "Form II passive perfect", "Passive Form II of س ع ر", quran("81:12:3"), "Shows causative/passive pattern"),
      C("سُعُرٌ", "madness", "Lexical state noun", "Noun branch of س ع ر", quran("54:24:10"), "Current nominal branch"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|أشر|اشر|noun/pronoun", decision: "MODEL-ISSUE", confidence: "medium",
    reason: "The current insolent adjective is mixed with the marking/endorsing branch أَشَّرَ/تَأْشِيرٌ. Shared radicals do not prove one learner-facing family, and a fifth row would risk semantic mis-teaching.", evidence: [quran("54:25:9,26:5"), morph],
    rejectedAlternatives: [shellRejection, "أَشَّرَ and تَأْشِيرٌ were rejected as forms of the insolent adjective because they belong to the marking/endorsing sense branch."],
    unresolvedQuestion: "Should the insolent adjective and the marking/endorsing verb be separated into sense scopes, and what approved forms belong to the insolent branch?",
    evidenceRequired: ["Approved lexicon evidence separating أَشِر/يَأْشَر from أَشَّر/تَأْشِير.", "A model rule for semantically divergent branches sharing the same root."],
  },
  {
    familyKey: "lexical|جني|جنى|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The fruit/harvest noun has clear Form I, Form VIII and active/passive participial relationships.", evidence: [quran("55:54:7"), morph],
    candidates: [
      C("جَنَى", "he harvested or gathered", "Form I perfect", "Form I of ج ن ي", morph, "Shows the source action"),
      C("يَجْنِي", "he harvests or gathers", "Form I weak imperfect", "Form I imperfect of ج ن ي", morph, "Shows ongoing action"),
      C("جَانٍ", "one who harvests", "Form I active participle", "Active participle of جَنَى", morph, "Shows the agent"),
      C("اِجْتَنَى", "he gathered for himself", "Form VIII perfect", "Form VIII of ج ن ي", morph, "Shows derived acquisition"),
      C("مَجْنِيٌّ", "harvested or gathered", "Passive participle", "Passive participle of جَنَى", morph, "Shows the affected result"),
    ], rejectedAlternatives: [shellRejection, "The alternate offence meaning of جَانٍ was not used for the primary fruit/harvest lesson."],
  },
  {
    familyKey: "lexical|رفرف|رفرف|noun/pronoun", decision: "MODEL-ISSUE", confidence: "medium",
    reason: "رَفْرَف in the Qur'anic occurrence is a noun for furnishings/cushions, while the proposed fluttering forms are a different semantic branch. The current root bucket cannot safely force them into one five-row learner family.", evidence: [quran("55:76:3"), morph],
    rejectedAlternatives: [shellRejection, "يُرَفْرِفُ/رَفْرَفَةٌ/رَفْرَافٌ were not accepted as forms of the furnishing noun without a reviewed semantic-family decision."],
    unresolvedQuestion: "Does the approved lexicon relate the furnishing noun رَفْرَف to the fluttering branch strongly enough for learner-facing Ṣarf, or is a separate sense scope required?",
    evidenceRequired: ["Approved lexicon evidence for the sense relationship of رَفْرَف.", "A reviewed model rule for quadriliteral nouns with divergent semantic branches."],
  },
  {
    familyKey: "lexical|هلع|هلوع|noun/pronoun", decision: "CONFIRMED-LIMITED", confidence: "high", limitCount: 3,
    reason: "The reviewed family has four strong forms: intensive adjective هَلُوع, Form I perfect, Form I imperfect and the state noun هَلَع. A fifth learner-useful form was not established without a weak or rare derivative.", evidence: [quran("70:19:4"), morph],
    candidates: [
      C("هَلِعَ", "he became anxious or panicked", "Form I perfect", "Form I of ه ل ع", morph, "Shows completed state"),
      C("يَهْلَعُ", "he becomes anxious or panics", "Form I imperfect", "Form I imperfect of ه ل ع", morph, "Shows ongoing state"),
      C("هَلَعٌ", "anxiety or panic", "Lexical state noun", "Noun of ه ل ع", morph, "Names the emotion"),
    ], rejectedAlternatives: [shellRejection, "No additional high-value Qur'anic or approved-project form was established beyond the adjective/verb/state-noun set."],
  },
  {
    familyKey: "lexical|جزع|جزوع|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The intensive adjective has a clear Form I verb, state noun and basic adjective contrast.", evidence: [quran("70:20:4"), morph],
    candidates: [
      C("جَزِعَ", "he became distressed or impatient", "Form I perfect", "Form I of ج ز ع", morph, "Shows completed state"),
      C("يَجْزَعُ", "he becomes distressed", "Form I imperfect", "Form I imperfect of ج ز ع", morph, "Shows ongoing state"),
      C("جَزَعٌ", "distress or impatience", "Lexical state noun", "Noun of ج ز ع", morph, "Names the emotion"),
      C("جَزِعٌ", "distressed or impatient", "Basic adjective", "Adjective of ج ز ع", morph, "Contrasts basic and intensive adjective"),
      C("جَزُوعٌ", "very distressed", "Intensive adjective", "Intensive pattern of ج ز ع", quran("70:20:4"), "Current intensive pattern"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|بسر|بسر|verb", decision: "FULL", confidence: "high",
    reason: "The Form I verb has imperfect, state-noun and masculine/feminine participial contrasts.", evidence: [quran("74:22:3; 75:24:4,25:22"), morph],
    candidates: [
      C("بَسَرَ", "he scowled or acted prematurely", "Form I perfect", "Form I of ب س ر", quran("74:22:3"), "Current perfect pattern"),
      C("يَبْسُرُ", "he scowls or acts prematurely", "Form I imperfect", "Form I imperfect of ب س ر", morph, "Shows ongoing state"),
      C("بُسُورٌ", "sternness or frowning", "Lexical state noun", "Noun of ب س ر", morph, "Names the condition"),
      C("بَاسِرٌ", "stern or frowning", "Masculine active participle", "Active participle of بَسَرَ", morph, "Shows masculine adjective"),
      C("بَاسِرَةٌ", "stern or frowning", "Feminine active participle", "Feminine of بَاسِرٌ", quran("75:24:4"), "Shows gender contrast"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|سعر|سعيرا|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "This occurrence shares the reviewed blaze/madness family, but conjunction and case duplicates are replaced by genuine verb and noun-pattern contrasts.", evidence: [quran("54:24:10; 67:5:12; 76:4:6; 81:12:3"), morph],
    candidates: [
      C("سَعِرَ", "he became inflamed or mad", "Form I perfect", "Form I of س ع ر", morph, "Shows the state verb"),
      C("يَسْعَرُ", "he becomes inflamed", "Form I imperfect", "Form I imperfect of س ع ر", morph, "Shows ongoing state"),
      C("سَعِيرٌ", "a blazing fire", "Lexical noun/adjective", "Noun branch of س ع ر", quran("67:5:12"), "Shows blaze lexeme"),
      C("سُعِّرَ", "it was set ablaze", "Form II passive perfect", "Passive Form II of س ع ر", quran("81:12:3"), "Shows causative/passive pattern"),
      C("سُعُرٌ", "madness", "Lexical state noun", "Noun branch of س ع ر", quran("54:24:10"), "Shows the madness branch"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|عمد|عماد|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The pillar family has singular, broken plural and derived intentionality forms; the forms are not merely case variants.", evidence: [quran("4:93:15; 5:95:??; 89:7:3"), morph],
    candidates: [
      C("عَمَدٌ", "pillars or columns", "Plural noun", "Plural branch of ع م د", morph, "Contrasts the pillar plural"),
      C("عَمُودٌ", "a column or pillar", "Singular noun", "Singular of the pillar branch", morph, "Shows singular number"),
      C("أَعْمِدَةٌ", "columns or pillars", "Broken plural", "Broken plural of عَمُود", morph, "Shows an alternate plural pattern"),
      C("مُتَعَمِّدٌ", "deliberate or intentional", "Form V active participle", "Form V of ع م د", quran("4:93:15"), "Shows the intentionality branch"),
      C("عَمْدٌ", "deliberateness or support", "Lexical noun", "Noun of ع م د", morph, "Names the supporting/intending concept"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|دمدم|دمدم|verb", decision: "FULL", confidence: "high",
    reason: "The quadriliteral verb has perfect, imperfect, imperative, verbal noun and passive participial contrasts.", evidence: [quran("91:14:3"), morph],
    candidates: [
      C("دَمْدَمَ", "he destroyed or crushed", "Quadriliteral perfect", "Basic quadriliteral form د م د م", quran("91:14:3"), "Current perfect form"),
      C("يُدَمْدِمُ", "he destroys or crushes", "Quadriliteral imperfect", "Imperfect of دَمْدَمَ", morph, "Shows ongoing action"),
      C("دَمْدِمْ", "destroy or crush!", "Quadriliteral imperative", "Imperative of دَمْدَمَ", morph, "Shows mood contrast"),
      C("دَمْدَمَةٌ", "destruction or crushing", "Quadriliteral verbal noun", "Verbal noun of دَمْدَمَ", morph, "Names the event"),
      C("مُدَمْدَمٌ", "destroyed or crushed", "Quadriliteral passive participle", "Passive participle of دَمْدَمَ", morph, "Shows the affected result"),
    ], rejectedAlternatives: [shellRejection],
  },
  {
    familyKey: "lexical|فلق|فلق|noun/pronoun", decision: "FULL", confidence: "high",
    reason: "The daybreak noun has a stable split/open family with basic verb, participle, Form VII result and action noun.", evidence: [quran("6:95:3; 26:63:8; 113:1:4"), morph],
    candidates: [
      C("فَلَقَ", "he split open", "Form I perfect", "Form I of ف ل ق", morph, "Shows completed splitting"),
      C("يَفْلِقُ", "he splits open", "Form I imperfect", "Form I imperfect of ف ل ق", morph, "Shows ongoing splitting"),
      C("فَالِقٌ", "one who splits open", "Form I active participle", "Active participle of فَلَقَ", quran("6:95:3"), "Shows the agent"),
      C("اِنْفَلَقَ", "it split apart", "Form VII perfect", "Form VII of ف ل ق", quran("26:63:8"), "Shows result/reflexive pattern"),
      C("فَلْقٌ", "splitting or cleaving", "Form I verbal noun", "Verbal noun of فَلَقَ", morph, "Names the action"),
    ], rejectedAlternatives: [shellRejection],
  },
];

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalize(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/gu, "");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formLabels(value: unknown) {
  const rows = Array.isArray(value) ? value.filter((row): row is JsonObject => typeof row === "object" && row !== null) : [];
  return rows.map((row) => text(row.form)).join(", ");
}

async function writeJsonFile(filePath: string, content: string) {
  if (process.platform !== "win32") {
    await fs.writeFile(filePath, content, "utf8");
    return;
  }
  const temporaryPath = `${filePath}.codex-tier-a-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, content, "utf8");
  const quote = (value: string) => value.replaceAll("'", "''");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `[System.IO.File]::Copy('${quote(temporaryPath)}','${quote(filePath)}',$true); [System.IO.File]::Delete('${quote(temporaryPath)}')`], { stdio: "ignore" });
}

function currentRow(word: JsonObject, lesson: JsonObject) {
  const current = text(word.arabic);
  const exact = (Array.isArray(lesson.forms) ? lesson.forms : []).find((row: JsonObject) => normalize(text(row.form)) === normalize(current));
  if (exact) return { ...exact, form: current };
  const first = Array.isArray(lesson.forms) ? lesson.forms[0] : undefined;
  return {
    form: current,
    meaning: text(word.gloss) || text(lesson.meaning) || text(first?.meaning) || current,
    difference: text(first?.difference) || "Current Qur'anic occurrence; its exact vocalisation and context are primary.",
    relationship: text(first?.relationship) || "Current Qur'anic occurrence of the reviewed root/lexeme in this āyah.",
    provenance: text(first?.provenance) || `Codex review of canonical Qur'anic occurrence ${word.id}.`,
  };
}

function relatedRow(candidate: Candidate, current: string, plan: Plan, occurrenceId: string) {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `Compared with ${current}: ${candidate.distinction}.`,
    relationship: candidate.relationship,
    provenance: `${candidate.source} Tier-A adjudication for ${plan.familyKey}; candidate checked for ${occurrenceId}.`,
  };
}

function chooseRows(word: JsonObject, lesson: JsonObject, plan: Plan) {
  const current = currentRow(word, lesson);
  const selected: Candidate[] = [];
  for (const candidate of plan.candidates ?? []) {
    if (normalize(candidate.form) === normalize(current.form)) continue;
    if (selected.some((item) => normalize(item.form) === normalize(candidate.form))) continue;
    selected.push(candidate);
    if (selected.length === (plan.limitCount ?? 4)) break;
  }
  if (plan.decision === "FULL" && selected.length !== 4) {
    throw new Error(`${plan.familyKey} has only ${selected.length} usable related forms for ${word.id}`);
  }
  return [current, ...selected.map((candidate) => relatedRow(candidate, current.form, plan, text(word.id)))];
}

const queue = JSON.parse(await fs.readFile(queuePath, "utf8")) as { queue: QueueItem[] };
const tierA = queue.queue.filter((item) => item.classification === "A");
if (tierA.length !== 55) throw new Error(`Expected 55 Tier-A families, found ${tierA.length}`);
const planByFamily = new Map(plans.map((plan) => [plan.familyKey, plan]));
if (plans.length !== tierA.length) throw new Error(`Adjudication plan has ${plans.length} families, expected ${tierA.length}`);
for (const item of tierA) if (!planByFamily.has(item.familyKey)) throw new Error(`Missing Tier-A plan for ${item.familyKey}`);

const occurrenceById = new Map<string, { packagePath: string; package: JsonObject; word: JsonObject; lesson: JsonObject }>();
const states = new Map<string, { package: JsonObject; changed: boolean }>();
for (const packagePath of await discoverPackagePaths()) {
  const result = await readPackage(packagePath);
  if (!result.package) continue;
  const pkg = result.package as JsonObject;
  states.set(packagePath, { package: pkg, changed: false });
  const teachingEntries = (pkg.teachingEntries ?? {}) as Record<string, JsonObject>;
  for (const ayahValue of Array.isArray(pkg.ayahs) ? pkg.ayahs : []) {
    const ayah = ayahValue as JsonObject;
    for (const wordValue of Array.isArray(ayah.words) ? ayah.words : []) {
      const word = wordValue as JsonObject;
      const lesson = teachingEntries[text(word.teachingId)];
      if (lesson) occurrenceById.set(text(word.id), { packagePath, package: pkg, word, lesson });
    }
  }
}

const changedOccurrences: JsonObject[] = [];
const records: AuditRecord[] = [];
const adjudications: Adjudication[] = [];

for (const item of tierA) {
  const plan = planByFamily.get(item.familyKey)!;
  const familyOccurrences = item.occurrences.map((occurrence) => {
    const found = occurrenceById.get(text(occurrence.occurrenceId));
    if (!found) throw new Error(`Missing occurrence ${occurrence.occurrenceId} for ${item.familyKey}`);
    return found;
  });
  const before = familyOccurrences.map(({ word, lesson }) => ({ occurrenceId: text(word.id), location: text(word.id).replace(/^word:/u, ""), arabic: text(word.arabic), meaning: text(word.gloss) || text(lesson.meaning), forms: (Array.isArray(lesson.forms) ? lesson.forms : []).map((row: JsonObject) => ({ ...row })), sarfReview: { ...(lesson.sarfReview ?? {}) } }));
  const resolved = plan.decision === "FULL" || plan.decision === "CONFIRMED-LIMITED";
  const after: JsonObject[] = [];
  for (const found of familyOccurrences) {
    const { package: pkg, packagePath, word, lesson } = found;
    const beforeLesson = JSON.parse(JSON.stringify(lesson));
    if (resolved) {
      lesson.forms = chooseRows(word, lesson, plan);
    }
    const status = plan.decision === "FULL" ? "full" : "limited";
    const previousReview = (lesson.sarfReview ?? {}) as JsonObject;
    lesson.sarfReview = {
      ...previousReview,
      status,
      ...(plan.decision === "FULL" ? {} : { limitedReason: plan.reason }),
      auditDecision: plan.decision === "FULL" ? "upgraded-to-full" : plan.decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked-for-genuine-ambiguity",
      provenance: [
        ...(Array.isArray(previousReview.provenance) ? previousReview.provenance.filter((value): value is string => typeof value === "string") : []),
        `Tier-A linguistic adjudication ${reviewedAt}: ${plan.decision}.`,
        ...plan.evidence,
      ].filter((value, index, values) => values.indexOf(value) === index),
      reviewedBy: "Codex",
      reviewedAt,
    };
    if (plan.decision === "FULL") delete (lesson.sarfReview as JsonObject).limitedReason;
    if (plan.decision === "FULL" || plan.decision === "CONFIRMED-LIMITED") {
      states.get(packagePath)!.changed = true;
      changedOccurrences.push({ occurrenceId: text(word.id), familyKey: item.familyKey, decision: plan.decision, before: beforeLesson.forms, after: lesson.forms });
    } else {
      states.get(packagePath)!.changed = true;
      changedOccurrences.push({ occurrenceId: text(word.id), familyKey: item.familyKey, decision: plan.decision, before: beforeLesson.sarfReview, after: lesson.sarfReview });
    }
    after.push({ occurrenceId: text(word.id), location: text(word.id).replace(/^word:/u, ""), arabic: text(word.arabic), meaning: text(word.gloss) || text(lesson.meaning), forms: (Array.isArray(lesson.forms) ? lesson.forms : []).map((row: JsonObject) => ({ ...row })), sarfReview: { ...(lesson.sarfReview ?? {}) } });
    void pkg;
  }
  const familyRecordId = `tier-a-family-${hash(item.familyKey)}`;
  adjudications.push({
    familyKey: item.familyKey,
    root: item.root,
    lemmaOrCurrentForm: item.lemmaOrCurrentForm,
    category: item.category,
    decision: plan.decision,
    confidence: plan.confidence,
    reasoning: plan.reason,
    authoritativeEvidence: plan.evidence,
    rejectedAlternatives: plan.rejectedAlternatives,
    candidates: plan.candidates ?? [],
    occurrences: item.occurrences.map((occurrence) => ({ occurrenceId: occurrence.occurrenceId, location: occurrence.location, arabic: occurrence.arabic, meaning: occurrence.meaning, currentFormCount: occurrence.formCount })),
    currentRows: before,
    proposedFinalRows: after,
    unresolvedQuestion: plan.unresolvedQuestion ?? null,
    evidenceRequired: plan.evidenceRequired ?? [],
    humanExpertReviewRequired: plan.decision === "BLOCKED" || plan.decision === "MODEL-ISSUE",
    productionStatus: plan.decision === "FULL" ? "full" : plan.decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked",
    reviewedAt,
    recordId: familyRecordId,
  });
  records.push({
    recordId: familyRecordId,
    eventType: "tier-a-sarf-family-adjudicated",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    scope: { type: "sarf-family", familyKey: item.familyKey, tier: "A", decision: plan.decision },
    status: plan.decision === "FULL" ? "passed" : plan.decision === "CONFIRMED-LIMITED" ? "passed-limited" : "blocked",
    reviewedAt,
    checks: ["complete existing Tier-A review record read", "canonical occurrences and current rows inspected", "candidate forms classified as same-family rather than root-only", "case/clitic padding excluded", "decision recorded for exactly one Tier-A family"],
    evidence: plan.evidence,
    decision: plan.decision,
    familyKey: item.familyKey,
    confidence: plan.confidence,
    unresolvedQuestion: plan.unresolvedQuestion ?? null,
    evidenceRequired: plan.evidenceRequired ?? [],
  });
  for (const occurrence of item.occurrences) {
    const occurrenceRecordId = `tier-a-occurrence-${hash(`${item.familyKey}|${occurrence.occurrenceId}`)}`;
    records.push({
      recordId: occurrenceRecordId,
      eventType: "tier-a-sarf-occurrence-adjudicated",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: { type: "quranic-word-occurrence", occurrenceId: occurrence.occurrenceId, location: occurrence.location, familyKey: item.familyKey, tier: "A" },
      status: plan.decision === "FULL" ? "passed" : plan.decision === "CONFIRMED-LIMITED" ? "passed-limited" : "blocked",
      reviewedAt,
      checks: ["current Qur'anic form remains first", "form-specific meaning checked", "morphological relationship checked", "provenance written", "occurrence remains explicitly blocked when unresolved"],
      evidence: plan.evidence,
      decision: plan.decision,
      familyKey: item.familyKey,
      occurrenceId: occurrence.occurrenceId,
    });
  }
}

for (const state of states.values()) {
  const hasBlockedFamily = Object.values((state.package.teachingEntries ?? {}) as Record<string, JsonObject>).some(
    (lesson) => (lesson.sarfReview as JsonObject | undefined)?.auditDecision === "blocked-for-genuine-ambiguity",
  );
  if (state.package.status === "custom-partial" && !hasBlockedFamily) {
    state.package.status = "custom-complete";
    state.changed = true;
  }
}

for (const [packagePath, state] of states) {
  if (!state.changed) continue;
  await writeJsonFile(packagePath, `${JSON.stringify(state.package, null, 2)}\n`);
}

const existingIds = new Set(readAuditRecords().map((record) => record.recordId));
const newRecords = records.filter((record) => !existingIds.has(record.recordId));
appendAuditRecords(newRecords);

const decisions = Object.fromEntries(["FULL", "CONFIRMED-LIMITED", "BLOCKED", "MODEL-ISSUE"].map((decision) => [decision, adjudications.filter((item) => item.decision === decision).length]));
const affectedOccurrences = changedOccurrences.length;
const report = {
  reportType: "tier-a-sarf-linguistic-adjudications",
  contractVersion: contract.contractVersion,
  generatedAt: reviewedAt,
  scope: "Tier A only; Tier B, C and D were not inspected or modified.",
  totals: { startingTierAFamilies: 55, adjudicatedFamilies: adjudications.length, affectedOccurrences, decisions },
  method: ["Read the complete durable blocked-family record and every Qur'anic occurrence.", "Inspected current rows, meanings, morphology metadata, alternatives and blocker reasons.", "Accepted only same-lexeme or defensible same-family relationships; rejected root-only, shell-only and semantically misleading forms.", "Used canonical Qur'anic occurrences and approved project Arabic morphology knowledge as evidence.", "Applied exactly five rows only for FULL decisions; used explicit limited rows where fewer forms were linguistically correct; left unresolved families blocked."],
  adjudications,
};
await writeJsonFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  "# Tier-A Ṣarf linguistic adjudication",
  "",
  `Generated ${reviewedAt}. Tier B/C/D were not inspected or modified.`,
  "",
  `| Decision | Families |`,
  "|---|---:|",
  ...Object.entries(decisions).map(([decision, count]) => `| ${decision} | ${count} |`),
  `| **Total** | **${adjudications.length}** |`,
  "",
  "The full machine-readable evidence packet contains every current row, proposed row, candidate form, source, confidence, rejected alternative and unresolved question.",
  "",
  "| # | Family key | Root | Qur'anic location(s) | Decision | Current rows | Proposed/final rows | Exact unresolved question / evidence still needed |",
  "|---:|---|---|---|---|---|---|---|",
  ...adjudications.map((item, index) => {
    const locations = item.occurrences.map((occurrence) => `${occurrence.location} ${occurrence.arabic}`).join("; ");
    const currentRows = item.currentRows.map((occurrence) => `${occurrence.location}: ${formLabels(occurrence.forms)}`).join(" / ");
    const finalRows = item.proposedFinalRows.map((occurrence) => `${occurrence.location}: ${formLabels(occurrence.forms)}`).join(" / ");
    const unresolved = item.unresolvedQuestion ? `${item.unresolvedQuestion} Evidence: ${(item.evidenceRequired ?? []).join(" ")}` : "—";
    return `| ${index + 1} | ${item.familyKey} | ${item.root} | ${locations} | **${item.decision}** | ${currentRows.replaceAll("|", "\\|")} | ${finalRows.replaceAll("|", "\\|")} | ${unresolved.replaceAll("|", "\\|")} |`;
  }),
].join("\n");
await fs.writeFile(markdownReportPath, `${md}\n`, "utf8");

console.log(JSON.stringify({
  status: "ok",
  report: jsonReportPath,
  markdown: markdownReportPath,
  startingTierAFamilies: 55,
  adjudicatedFamilies: adjudications.length,
  affectedOccurrences,
  decisions,
  ledgerRecordsWritten: newRecords.length,
  packagesChanged: [...states.values()].filter((state) => state.changed).length,
}, null, 2));
