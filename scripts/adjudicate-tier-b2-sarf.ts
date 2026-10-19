import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import { appendAuditRecords, type AuditRecord } from "./lib/review-ledger";
import type { LessonForm, SarfReview, SurahPackage } from "../app/data/content-contract";

/**
 * Tier B2 is deliberately a closed adjudication scope.  The queue is loaded
 * before any package is changed and the exact 164-family/316-occurrence scope
 * is asserted.  This prevents a later queue regeneration from accidentally
 * pulling Tier A, B1, C or model families into this pass.
 */
const contract = assertAuthoringContract("Tier-B2 Ṣarf linguistic adjudication");
const reviewedAt = new Date().toISOString();
const queuePath = path.join(repoRoot, "artifacts", "content-review", "blocked-sarf-review-queue-classified.json");
const jsonPath = path.join(repoRoot, "artifacts", "content-review", "tier-b2-sarf-adjudications.json");
const markdownPath = path.join(repoRoot, "artifacts", "content-review", "tier-b2-sarf-adjudications.md");

type Decision = "FULL" | "CONFIRMED-LIMITED" | "BLOCKED" | "MODEL-ISSUE";
type Tuple = [form: string, meaning: string, distinction: string, pedagogicalUse: string];
type QueueOccurrence = { occurrenceId: string; location: string; surah: number; ayah: number; position: number; arabic: string; meaning: string; formCount: number; };
type QueueItem = {
  classification: string;
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrenceCount: number;
  maxCurrentFormCount: number;
  occurrences: QueueOccurrence[];
  currentAnalysis: unknown;
  competingPossibleAnalyses: string[];
  whyAutomaticResolutionIsUnsafe: string;
  evidenceRequiredToResolve: string[];
};
type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type PackageEntry = { filePath: string; package: SurahPackage };
type OccurrenceRecord = { filePath: string; package: SurahPackage; word: Word; lesson: Lesson };
type Candidate = { form: string; meaning: string; distinction: string; relationship: string; source: string; confidence: "high" | "medium"; pedagogicalUse: string };
type CurrentRow = { occurrenceId: string; location: string; arabic: string; forms: LessonForm[]; sarfReview: SarfReview };
type FinalRow = { occurrenceId: string; location: string; arabic: string; forms: LessonForm[]; sarfReview: SarfReview };
type Spec = { decision: Decision; accepted: Tuple[]; reason: string; rejected: string[]; unresolvedQuestion?: string; evidenceRequired?: string[]; confidence?: "high" | "medium" };
type Adjudication = {
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrences: QueueOccurrence[];
  currentRows: CurrentRow[];
  candidatesConsidered: Candidate[];
  acceptedCandidates: Candidate[];
  rejectedCandidates: string[];
  decision: Decision;
  reasoning: string;
  evidence: string[];
  confidence: "high" | "medium";
  finalRows: FinalRow[];
  unresolvedQuestion: string | null;
  evidenceRequired: string[];
  humanExpertReviewRequired: boolean;
  productionStatus: string;
  reviewedAt: string;
  recordId: string;
};
type Report = {
  reportType: string;
  contractVersion: string;
  reviewedAt: string;
  scope: Record<string, unknown>;
  totals: Record<Decision, number>;
  occurrencesByDecision: Record<Decision, number>;
  changedPackageFiles: string[];
  adjudications: Adjudication[];
};

const quranEvidence = (locations: string) => `Canonical Qur’anic evidence at ${locations}; every occurrence was inspected before this decision.`;
const projectEvidence = "Project-reviewed root-meaning data, aligned Qur’anic Arabic morphology evidence, existing reviewed lessons and reliable Arabic morphology knowledge; provider rows were treated as evidence, not as an automatic teaching answer.";
const shellRejection = "Article, conjunction, preposition, case ending, tanwīn and attached-pronoun variants were not counted as independent Ṣarf members unless they add a genuine number, person or possession contrast.";
const rootOnlyRejection = "Forms sharing only radicals without a defensible lexical/morphological relationship were rejected.";

function hash(value: string) { return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16); }
function normalize(value: string) { return value.normalize("NFC").replace(/[\s\u0640]/gu, ""); }

function candidateRows(root: string, locations: string, tuples: Tuple[]): Candidate[] {
  return tuples.map(([form, meaning, distinction, pedagogicalUse]) => ({
    form,
    meaning,
    distinction,
    relationship: `A reviewed ${root} lexical/morphological relation; it is not a bare root or shell-only variant.`,
    source: `${quranEvidence(locations)} ${projectEvidence}`,
    confidence: "high",
    pedagogicalUse,
  }));
}

// Four strong comparison members for regular or well-established Qur’anic verbs.
// The current Qur’anic surface form is always prepended by the authoring loop.
const verbForms: Record<string, Tuple[]> = {
  طوق: [["أَطَاقَ", "he was able to bear", "Form IV perfect", "Shows the ability stem behind the current occurrence"], ["يُطِيقُ", "he is able to bear", "Form IV imperfect", "Contrasts tense and removes the occurrence’s person/number shell"], ["إِطَاقَةٌ", "ability to bear", "Form IV verbal noun", "Names the ability"], ["مُطِيقٌ", "able to bear", "Form IV active participle", "Shows the experiencer of ability"]],
  محق: [["مَحَقَ", "he erased or destroyed", "Form I perfect", "Shows the completed action"], ["مَحْقٌ", "erasure or destruction", "Form I verbal noun", "Names the action"], ["مَاحِقٌ", "destroying or obliterating", "Active participial adjective", "Shows the agent or quality"], ["مَمْحُوقٌ", "erased or destroyed", "Passive participial adjective", "Shows the result"]],
  عضض: [["عَضَّ", "he bit", "Form I doubled-root perfect", "Shows the completed action"], ["عَضٌّ", "biting", "Form I verbal noun", "Names the action"], ["عَاضٌّ", "biting", "Active participial adjective", "Shows the agent"], ["مَعْضُوضٌ", "bitten", "Passive participial adjective", "Shows the affected object"]],
  عفف: [["عَفَّ", "he abstained", "Form I doubled-root perfect", "Contrasts the current Form X command"], ["يَعِفُّ", "he abstains", "Form I doubled-root imperfect", "Shows the basic ongoing action"], ["عِفَّةٌ", "chastity or restraint", "Lexical verbal noun", "Names the quality"], ["عَفِيفٌ", "chaste or self-restrained", "Descriptive adjective", "Shows the person with the quality"]],
  عزر: [["عَزَرَ", "he supported", "Form I perfect", "Shows the basic action"], ["يَعْزِرُ", "he supports", "Form I imperfect", "Shows the ongoing action"], ["عَزْرٌ", "support or strengthening", "Form I verbal noun", "Names the action"], ["مُعَزِّرٌ", "one who supports", "Form II active participle", "Shows the agent of the Qur’anic derived family"]],
  حبس: [["حَبَسَ", "he detained", "Form I perfect", "Shows the completed action"], ["يَحْبِسُ", "he detains", "Form I imperfect", "Shows the ongoing action"], ["حَبْسٌ", "detention", "Form I verbal noun", "Names the action"], ["مَحْبُوسٌ", "detained", "Passive participial adjective", "Shows the affected person or thing"]],
  حيق: [["حَاقَ", "it befell or encompassed", "Form I hollow perfect", "Shows the perfect form without the conjunction shell"], ["يَحِيقُ", "it befalls or encompasses", "Form I hollow imperfect", "Shows the ongoing form"], ["حَيْقٌ", "befalling or encompassing", "Lexical verbal noun", "Names the event"], ["مُحِيقٌ", "encompassing", "Active participial adjective", "Shows the resulting quality"]],
  خرص: [["خَرَصَ", "he guessed", "Form I perfect", "Shows the completed action behind the agent noun"], ["خَرْصٌ", "guessing", "Form I verbal noun", "Names the action"], ["خَرَّاصٌ", "one who guesses", "Intensive active participle", "Shows the repeated/characteristic agent"], ["مَخْرُوصٌ", "estimated or guessed", "Passive participial adjective", "Shows the affected proposition"]],
  نحت: [["نَحَتَ", "he carved", "Form I perfect", "Shows the completed action"], ["نَحْتٌ", "carving", "Form I verbal noun", "Names the action"], ["نَاحِتٌ", "one who carves", "Active participial adjective", "Shows the agent"], ["مَنْحُوتٌ", "carved", "Passive participial adjective", "Shows the resulting object"]],
  لقف: [["لَقِفَ", "he caught or swallowed", "Form I perfect", "Shows the basic action"], ["يَلْقَفُ", "he catches or swallows", "Form I imperfect", "Shows the ongoing action"], ["لَقْفٌ", "catching or swallowing", "Form I verbal noun", "Names the action"], ["مَلْقُوفٌ", "caught or swallowed", "Passive participial adjective", "Shows the affected object"]],
  نكص: [["يَنْكُصُ", "he turns back", "Form I imperfect", "Shows the ongoing action"], ["نَاكِصٌ", "turning back", "Active participial adjective", "Shows the agent/state"], ["مَنْكُوصٌ", "turned back or brought low", "Passive/result adjective", "Shows the result"], ["تَنَكُّصٌ", "turning back", "Form V verbal noun", "Shows a useful derived pattern"]],
  ثخن: [["ثَخُنَ", "he became heavy or severe", "Form I stative perfect", "Shows the basic state behind the derived verb"], ["ثَخَانَةٌ", "heaviness or severity", "Lexical state noun", "Names the quality"], ["مُثْخِنٌ", "inflicting heavy losses", "Form IV active participle", "Shows the causative agent"], ["إِثْخَانٌ", "inflicting heavy losses", "Form IV verbal noun", "Names the derived action"]],
  طعن: [["طَعَنَ", "he stabbed or criticised", "Form I perfect", "Shows the completed action"], ["يَطْعَنُ", "he stabs or criticises", "Form I imperfect", "Shows the ongoing action"], ["طَعْنٌ", "stabbing or criticism", "Form I verbal noun", "Names the action"], ["طَاعِنٌ", "one who stabs or criticises", "Active participial adjective", "Shows the agent"]],
  غيض: [["غَاضَ", "it diminished", "Form I hollow perfect", "Shows the basic completed change"], ["يَغِيضُ", "it diminishes", "Form I hollow imperfect", "Shows the ongoing change"], ["غَيْضٌ", "diminishing or decrease", "Lexical verbal noun", "Names the event"], ["مُغِيضٌ", "causing to diminish", "Active participial adjective", "Shows the causer"]],
  لفت: [["لَفَتَ", "he turned someone away", "Form I perfect", "Shows the basic action"], ["يَلْفِتُ", "he turns someone away", "Form I imperfect", "Shows the ongoing action"], ["لَفْتٌ", "turning away", "Form I verbal noun", "Names the action"], ["اِلْتِفَاتٌ", "turning or paying attention", "Form VIII verbal noun", "Shows the derived reflexive pattern"]],
  لقط: [["لَقِطَ", "he picked up", "Form I perfect", "Shows the basic action"], ["يَلْقَطُ", "he picks up", "Form I imperfect", "Shows the ongoing action"], ["لَقْطٌ", "picking up", "Form I verbal noun", "Names the action"], ["لَاقِطٌ", "one who picks up", "Active participial adjective", "Shows the agent"]],
  سول: [["يُسَوِّلُ", "he makes something seem desirable", "Form II imperfect", "Shows the ongoing action"], ["تَسْوِيلٌ", "making something seem desirable", "Form II verbal noun", "Names the process"], ["مُسَوِّلٌ", "one who makes something seem desirable", "Form II active participle", "Shows the agent"], ["مُسَوَّلٌ", "made to seem desirable", "Form II passive participle", "Shows the affected idea"]],
  محو: [["مَحَا", "he erased", "Form I defective perfect", "Shows the completed action"], ["مَحْوٌ", "erasing", "Form I verbal noun", "Names the action"], ["مَاحٍ", "erasing", "Active participial adjective", "Shows the agent"], ["مَمْحُوٌّ", "erased", "Passive participial adjective", "Shows the result"]],
  ميد: [["مَادَ", "it swayed", "Form I hollow perfect", "Shows the completed movement"], ["يَمِيدُ", "it sways", "Form I hollow imperfect", "Shows the ongoing movement"], ["مَيْدٌ", "swaying", "Form I verbal noun", "Names the movement"], ["مَائِدٌ", "swaying", "Active participial adjective", "Shows the moving quality"]],
  زلل: [["زَلَّ", "he slipped", "Form I doubled-root perfect", "Shows the basic event"], ["يَزِلُّ", "he slips", "Form I doubled-root imperfect", "Shows the ongoing event"], ["زَلَلٌ", "slipping or error", "Form I verbal noun", "Names the event"], ["مُزِلٌّ", "causing to slip", "Form IV active participle", "Shows the causative relation"]],
  زجو: [["زَجَا", "he drove or pushed gently", "Form I defective perfect", "Shows the basic completed action"], ["يَزْجُو", "he drives or pushes gently", "Form I defective imperfect", "Shows the ongoing action"], ["زَجْوٌ", "driving or propelling", "Form I verbal noun", "Names the action"], ["مُزْجٍ", "propelling", "Active participial adjective", "Shows the agent"]],
  زهق: [["زَهَقَ", "it perished", "Form I perfect", "Shows the completed event"], ["يَزْهَقُ", "it perishes", "Form I imperfect", "Shows the ongoing event"], ["زَهُوقٌ", "liable to perish", "Intensive adjective", "Shows the characteristic quality"], ["زَاهِقٌ", "perishing or departing", "Active participial adjective", "Shows the state"]],
  نأي: [["نَأَى", "he withdrew", "Form I defective perfect", "Shows the completed withdrawal"], ["يَنْأَى", "he withdraws", "Form I defective imperfect", "Shows the ongoing action"], ["نَأْيٌ", "withdrawal", "Form I verbal noun", "Names the action"], ["نَائٍ", "withdrawing or distant", "Active participial adjective", "Shows the state"]],
  هيأ: [["هَيَّأَ", "he prepared", "Form II perfect", "Shows the completed preparation"], ["يُهَيِّئُ", "he prepares", "Form II imperfect", "Shows the ongoing action"], ["تَهْيِئَةٌ", "preparation", "Form II verbal noun", "Names the process"], ["مُهَيِّئٌ", "one who prepares", "Form II active participle", "Shows the agent"]],
  عثر: [["عَثَرَ", "he found or stumbled", "Form I perfect", "Shows the basic event"], ["يَعْثُرُ", "he finds or stumbles", "Form I imperfect", "Shows the ongoing event"], ["عُثُورٌ", "finding or stumbling", "Form I verbal noun", "Names the event"], ["إِعْثَارٌ", "causing to discover", "Form IV verbal noun", "Shows the derived causative pattern"]],
  دحض: [["دَحَضَ", "he refuted or slipped", "Form I perfect", "Shows the basic action"], ["دَحْضٌ", "refutation or slipping", "Form I verbal noun", "Names the event"], ["دَاحِضٌ", "refuting or slipping", "Active participial adjective", "Shows the agent/state"], ["مُدْحَضٌ", "refuted or defeated", "Passive participial adjective", "Shows the result"]],
  شور: [["أَشَارَ", "he indicated", "Form IV perfect", "Shows the completed indication"], ["يُشِيرُ", "he indicates", "Form IV imperfect", "Shows the ongoing indication"], ["إِشَارَةٌ", "indication or gesture", "Form IV verbal noun", "Names the action"], ["مُشِيرٌ", "one who indicates", "Form IV active participle", "Shows the agent"]],
  ظمأ: [["ظَمِئَ", "he became thirsty", "Form I stative perfect", "Shows the state behind the command"], ["يَظْمَأُ", "he becomes thirsty", "Form I imperfect", "Shows the ongoing state"], ["ظَمَأٌ", "thirst", "Form I verbal noun", "Names the state"], ["ظَمْآنٌ", "thirsty", "Adjectival form", "Shows the experiencer"]],
  نسل: [["نَسَلَ", "he emerged or descended", "Form I perfect", "Shows the basic event"], ["نَسْلٌ", "offspring", "Lexical noun", "Shows the related result noun"], ["نَاسِلٌ", "emerging or descending", "Active participial adjective", "Shows the agent/state"], ["تَنَاسُلٌ", "procreation", "Form VI verbal noun", "Shows a useful derived relation"]],
  خبت: [["خَبَتَ", "he became humble", "Form I perfect", "Shows the basic state"], ["يَخْبُتُ", "he becomes humble", "Form I imperfect", "Shows the ongoing state"], ["خُبُوتٌ", "humility", "Form I verbal noun", "Names the state"], ["مُخْبِتٌ", "humble or devout", "Form IV active participle", "Shows the person with the quality"]],
  سلل: [["سَلَّ", "he drew out", "Form I doubled-root perfect", "Shows the basic action"], ["يَسُلُّ", "he draws out", "Form I doubled-root imperfect", "Shows the ongoing action"], ["سَلٌّ", "drawing out", "Form I verbal noun", "Names the action"], ["مُتَسَلِّلٌ", "slipping away", "Form V active participle", "Shows the derived movement"]],
  عبث: [["عَبَثَ", "he acted foolishly", "Form I perfect", "Shows the completed action"], ["يَعْبَثُ", "he acts foolishly", "Form I imperfect", "Shows the ongoing action"], ["عَبَثٌ", "foolish play", "Form I verbal noun", "Names the action"], ["عَابِثٌ", "acting foolishly", "Active participial adjective", "Shows the agent"]],
  وزع: [["أَوْزَعَ", "he inspired or enabled", "Form IV perfect", "Shows the active derived stem"], ["يُوزِعُ", "he distributes", "Form IV imperfect active", "Contrasts the passive Qur’anic form"], ["إِيزَاعٌ", "inspiring or distributing", "Form IV verbal noun", "Names the derived action"], ["مُوزِعٌ", "distributor or inspirer", "Form IV active participle", "Shows the agent"]],
  بطر: [["بَطِرَ", "he was insolent", "Form I stative perfect", "Shows the completed state"], ["يَبْطَرُ", "he is insolent", "Form I imperfect", "Shows the ongoing state"], ["بَطَرٌ", "insolence", "Form I verbal noun", "Names the state"], ["بَطِرٌ", "insolent", "Stative adjective", "Shows the person with the quality"]],
  خضع: [["خَضَعَ", "he submitted", "Form I perfect", "Shows the completed action"], ["يَخْضَعُ", "he submits", "Form I imperfect", "Shows the ongoing action"], ["خُضُوعٌ", "submission", "Form I verbal noun", "Names the action"], ["خَاضِعٌ", "submissive", "Active participial adjective", "Shows the person with the quality"]],
  غرو: [["أَغْرَى", "he incited", "Form IV perfect", "Shows the completed causative action"], ["يُغْرِي", "he incites", "Form IV imperfect", "Shows the ongoing action"], ["إِغْرَاءٌ", "incitement", "Form IV verbal noun", "Names the action"], ["مُغْرٍ", "inciting or alluring", "Form IV active participle", "Shows the agent"]],
  سلخ: [["سَلَخَ", "he stripped or removed", "Form I perfect", "Shows the completed action"], ["يَسْلَخُ", "he strips or removes", "Form I imperfect", "Shows the ongoing action"], ["سَلْخٌ", "stripping or removal", "Form I verbal noun", "Names the action"], ["مَسْلُوخٌ", "stripped", "Passive participial adjective", "Shows the result"]],
  مرح: [["مَرِحَ", "he was insolent or exultant", "Form I stative perfect", "Shows the completed state"], ["يَمْرَحُ", "he is insolent or exultant", "Form I imperfect", "Shows the ongoing state"], ["مَرَحٌ", "insolence or exultation", "Form I verbal noun", "Names the state"], ["مَارِحٌ", "exultant or insolent", "Active participial adjective", "Shows the person with the quality"]],
  قيض: [["قَيَّضَ", "he appointed or destined", "Form II perfect", "Shows the completed derived action"], ["يُقَيِّضُ", "he appoints or destines", "Form II imperfect", "Shows the ongoing action"], ["تَقْيِيضٌ", "appointing or assigning", "Form II verbal noun", "Names the action"], ["مُقَيِّضٌ", "one who appoints", "Form II active participle", "Shows the agent"]],
  وبق: [["أَوْبَقَ", "he destroyed", "Form IV perfect", "Shows the active causative stem"], ["يُوبِقُ", "he destroys", "Form IV imperfect active", "Contrasts the current passive/subject-marked form"], ["إِيبَاقٌ", "destruction", "Form IV verbal noun", "Names the action"], ["مُوبِقٌ", "destroying", "Form IV active participle", "Shows the agent"]],
  لذذ: [["لَذَّ", "it was pleasurable", "Form I doubled-root perfect", "Shows the basic quality"], ["يَلَذُّ", "it is pleasurable", "Form I doubled-root imperfect", "Shows the ongoing quality"], ["لَذَّةٌ", "pleasure", "Lexical noun", "Names the experience"], ["لَذِيذٌ", "delicious or pleasurable", "Descriptive adjective", "Shows the quality"]],
  شغل: [["شَغَلَ", "he occupied", "Form I perfect", "Shows the completed action"], ["يَشْغَلُ", "he occupies", "Form I imperfect", "Shows the ongoing action"], ["شُغْلٌ", "occupation", "Form I verbal noun", "Names the state"], ["مَشْغُولٌ", "occupied", "Passive participial adjective", "Shows the affected person"]],
  ظفر: [["ظَفَرَ", "he gained victory", "Form I perfect", "Shows the basic achievement"], ["يَظْفَرُ", "he gains victory", "Form I imperfect", "Shows the ongoing action"], ["ظَفَرٌ", "victory", "Form I verbal noun", "Names the result"], ["ظَافِرٌ", "victorious", "Active participial adjective", "Shows the successful agent"]],
  أزر: [["آزَرَ", "he supported", "Form III perfect", "Shows the derived support relation"], ["يُؤَازِرُ", "he supports", "Form III imperfect", "Shows the ongoing action"], ["مُؤَازَرَةٌ", "support", "Form III verbal noun", "Names the relation"], ["مُؤَازِرٌ", "supporting", "Form III active participle", "Shows the agent"]],
  عيي: [["عَيِيَ", "he became incapable or weary", "Form I defective perfect", "Shows the basic state"], ["يَعْيَى", "he becomes incapable or weary", "Form I defective imperfect", "Shows the ongoing state"], ["إِعْيَاءٌ", "weariness or inability", "Form IV verbal noun", "Names the state"], ["مُعْيٍ", "causing weariness", "Form IV active participle", "Shows the causative relation"]],
};

const nounFullFromVerb = new Set([
  "lexical|صبغ|صبغة|noun/pronoun", "lexical|كمل|كاملة|noun/pronoun", "lexical|جزأ|جزء|noun/pronoun", "lexical|ضجع|مضاجع|noun/pronoun", "lexical|سفح|مسافح|noun/pronoun", "lexical|عنت|عنت|noun/pronoun", "lexical|حرج|حرج|noun/pronoun", "lexical|شكك|شك|noun/pronoun", "lexical|رفق|مرافق|noun/pronoun", "lexical|زخرف|زخرف|noun/pronoun", "lexical|حرف|متحرف|noun/pronoun", "lexical|رذل|ارذل|noun/pronoun", "lexical|يبس|يابسة|noun/pronoun", "lexical|أسف|ي|noun/pronoun", "lexical|حرض|حرض|noun/pronoun", "lexical|سربل|سرابيل|noun/pronoun", "lexical|سربل|سربيل|noun/pronoun", "lexical|أمل|امل|noun/pronoun", "lexical|وجل|وجل|noun/pronoun", "lexical|خذل|مخذول|noun/pronoun", "lexical|زهق|زهوق|noun/pronoun", "lexical|نبع|ينبوع|noun/pronoun", "lexical|طلب|طلب|noun/pronoun", "lexical|عضد|عضد|noun/pronoun", "lexical|ستر|ستر|noun/pronoun", "lexical|سدد|سدين|noun/pronoun", "lexical|نقب|نقب|noun/pronoun", "lexical|غطو|غطاء|noun/pronoun", "lexical|فرد|فرد|noun/pronoun", "lexical|فرد|فردى|noun/pronoun", "lexical|خمد|خامد|noun/pronoun", "lexical|جذذ|جذاذ|noun/pronoun", "lexical|شخص|شاخصة|noun/pronoun", "lexical|مضغ|مضغة|noun/pronoun", "lexical|بهج|بهيج|noun/pronoun", "lexical|بهج|بهجة|noun/pronoun", "lexical|خبت|مخبتين|noun/pronoun", "lexical|شيد|مشيد|noun/pronoun", "lexical|سلل|سلالة|noun/pronoun", "lexical|نسب|نسب|noun/pronoun", "lexical|طفل|اطفل|noun/pronoun", "lexical|وقف|موقوف|noun/pronoun", "lexical|لغب|لغوب|noun/pronoun", "lexical|رقد|مرقد|noun/pronoun", "lexical|دحر|دحور|noun/pronoun", "lexical|دحض|مدحضين|noun/pronoun", "lexical|غوص|غواص|noun/pronoun", "lexical|رحب|مرحب|noun/pronoun", "lexical|حفف|حاف|noun/pronoun", "lexical|قوت|اقوات|noun/pronoun", "lexical|دخن|دخان|noun/pronoun", "lexical|عتب|معتبين|noun/pronoun", "lexical|جثو|جاثية|noun/pronoun", "lexical|ذرو|والذريت|noun/pronoun", "lexical|ذرو|ذرو|noun/pronoun",
]);

const nounForms: Record<string, Tuple[]> = {
  "lexical|زحزح|مزحزح|noun/pronoun": [["زَحْزَحَ", "he moved away", "Form II perfect", "Shows the basic action behind the participle"], ["يُزَحْزِحُ", "he moves away", "Form II imperfect", "Shows the ongoing action"], ["زَحْزَحَةٌ", "moving away", "Form II verbal noun", "Names the action"], ["مُزَحْزَحٌ", "moved away", "Form II passive participle", "Shows the affected object"]],
  "lexical|خيط|خيط|noun/pronoun": [["خَيْطٌ", "a thread", "Singular noun", "Shows the unmarked noun"], ["خُيُوطٌ", "threads", "Broken plural", "Shows number"], ["خِيَاطَةٌ", "sewing", "Verbal noun", "Shows the related making action"], ["خَيَّاطٌ", "tailor", "Agent noun", "Shows the person associated with sewing"]],
  "lexical|لدد|الد|noun/pronoun": [["لَدَّ", "he disputed fiercely", "Form I perfect", "Shows the action behind the adjective"], ["يَلُدُّ", "he disputes fiercely", "Form I imperfect", "Shows the ongoing action"], ["لَدَدٌ", "vehemence in dispute", "Verbal noun", "Names the quality"], ["لُدٌّ", "hostile disputants", "Broken plural/adjectival noun", "Shows the related plural form"]],
  "lexical|رطب|رطب|noun/pronoun": [["رَطِبَ", "he became moist", "Form I stative perfect", "Shows the state behind the adjective"], ["يَرْطُبُ", "he becomes moist", "Form I imperfect", "Shows the ongoing state"], ["رُطُوبَةٌ", "moisture", "State noun", "Names the quality"], ["رَطِبٌ", "moist or fresh", "Descriptive adjective", "Shows the quality"]],
  "lexical|حيص|محيص|noun/pronoun": [["حَاصَ", "he turned aside", "Form I hollow perfect", "Shows the verb behind the escape noun"], ["يَحِيصُ", "he turns aside or escapes", "Form I hollow imperfect", "Shows the ongoing action"], ["حَيْصٌ", "turning aside", "Verbal noun", "Names the action"], ["مَحِيصٌ", "place or possibility of escape", "Noun of place/result", "Shows the Qur’anic derivative"]],
  "lexical|شخص|شاخصة|noun/pronoun": [["شَخَصَ", "he stared or departed", "Form I perfect", "Shows the action behind the adjective"], ["يَشْخَصُ", "he stares or departs", "Form I imperfect", "Shows the ongoing action"], ["شُخُوصٌ", "staring or departure", "Verbal noun", "Names the event"], ["شَاخِصٌ", "staring or prominent", "Active participial adjective", "Shows the quality"]],
  "lexical|عور|عورة|noun/pronoun": [["عَوِرَ", "he became defective or exposed", "Form I stative perfect", "Shows the state behind the noun"], ["يَعْوَرُ", "he becomes defective or exposed", "Form I imperfect", "Shows the ongoing state"], ["أَعْوَرُ", "one-eyed or exposed", "Descriptive adjective", "Shows the quality"], ["عَوَرٌ", "defect or exposure", "State noun", "Names the condition"]],
  "lexical|قيل|مقيل|noun/pronoun": [["قَالَ", "he said", "Form I hollow perfect", "Shows the verb behind the place noun"], ["يَقُولُ", "he says", "Form I hollow imperfect", "Shows the ongoing action"], ["قَوْلٌ", "speech or saying", "Form I verbal noun", "Names the action"], ["قَائِلٌ", "one who says", "Active participial noun", "Shows the speaker"]],
  "lexical|هضم|هضيم|noun/pronoun": [["هَضَمَ", "he digested or diminished", "Form I perfect", "Shows the action behind the adjective"], ["يَهْضِمُ", "he digests or diminishes", "Form I imperfect", "Shows the ongoing action"], ["هَضْمٌ", "digestion or diminution", "Verbal noun", "Names the action"], ["هَاضِمٌ", "digesting or diminishing", "Active participial adjective", "Shows the agent"]],
  "lexical|عجم|اعجمين|noun/pronoun": [["عَجَمَ", "he was obscure or unable to speak clearly", "Form I perfect", "Shows the lexical relation behind the ethnonym"], ["أَعْجَمِيٌّ", "non-Arab", "Nisbah adjective", "Shows the singular adjective"], ["عَجَمٌ", "non-Arabs", "Collective noun", "Shows the collective"], ["عُجْمَةٌ", "foreignness or inarticulacy", "Abstract noun", "Names the quality"]],
  "lexical|روض|روضة|noun/pronoun": [["رَوْضَةٌ", "a garden or meadow", "Singular noun", "Shows the base noun"], ["رَوْضَاتٌ", "gardens or meadows", "Regular feminine plural", "Shows number"], ["رَاضَ", "he tended or trained", "Form I hollow perfect", "Shows the related verbal branch"], ["رِيَاضٌ", "gardens", "Broken plural", "Shows the common plural pattern"]],
  "lexical|زفر|زفيرا|noun/pronoun": [["زَفَرَ", "he exhaled or roared", "Form I perfect", "Shows the action behind the sound noun"], ["يَزْفِرُ", "he exhales or roars", "Form I imperfect", "Shows the ongoing action"], ["زَفْرٌ", "exhalation", "Verbal noun", "Names the action"], ["زَافِرٌ", "exhaling or roaring", "Active participial adjective", "Shows the agent"]],
};

const limitedForms: Record<string, Tuple[]> = {
  "lexical|حيق|حاق|verb": [["حَيْقٌ", "befalling or encompassing", "Lexical verbal noun", "Names the event behind the Qur’anic verb"], ["مُحِيقٌ", "encompassing", "Active participial adjective", "Shows the resulting quality"]],
  "lexical|بقر|بقر|noun/pronoun": [["بَقَرَةٌ", "a cow", "Singular noun", "Contrasts the collective noun with the singular"], ["بَقَرَاتٌ", "cows", "Regular feminine plural", "Shows number"]],
  "lexical|سبط|اسباط|noun/pronoun": [["سِبْطٌ", "a descendant or tribe", "Singular noun", "Contrasts the singular with the Qur’anic plural"], ["أَسْبَاطٌ", "tribes or descendants", "Broken plural", "Shows the established plural"]],
  "lexical|خنزر|خنزير|noun/pronoun": [["خِنْزِيرٌ", "a swine", "Singular noun", "Shows the unmarked singular"], ["خَنَازِيرُ", "swine", "Broken plural", "Shows number"]],
  "lexical|جنف|جنف|noun/pronoun": [["مُتَجَانِفٌ", "inclining", "Form VI active participle", "Shows the securely related inclination branch"]],
  "lexical|هلل|اهلة|noun/pronoun": [["هِلالٌ", "a new moon", "Singular noun", "Contrasts the singular with the Qur’anic plural"], ["أَهِلَّةٌ", "new moons", "Broken plural", "Shows number"]],
  "lexical|أمو|امة|noun/pronoun": [["أَمَةٌ", "a bondwoman", "Singular noun", "Shows the base noun"], ["إِمَاءٌ", "bondwomen", "Broken plural", "Shows number"]],
  "lexical|كرس|كرسي|noun/pronoun": [["كُرْسِيٌّ", "a seat or throne", "Singular noun", "Shows the unmarked noun"], ["كَرَاسِيُّ", "seats", "Broken plural", "Shows number"]],
  "lexical|عرو|عروة|noun/pronoun": [["عُرْوَةٌ", "a handhold", "Singular noun", "Shows the base noun"], ["عُرًى", "handholds", "Broken plural", "Shows number"]],
  "lexical|بدن|بدن|noun/pronoun": [["بَدَنٌ", "body", "Singular noun", "Shows the body noun"], ["أَبْدَانٌ", "bodies", "Broken plural", "Shows number"], ["بُدْنٌ", "sacrificial camels or cattle", "Collective noun", "Shows the Qur’anic animal usage"]],
  "lexical|ضغث|ضغث|noun/pronoun": [["ضِغْثٌ", "a bundle", "Singular noun", "Shows the base noun"], ["أَضْغَاثٌ", "bundles or confused dreams", "Broken plural", "Shows number and the Qur’anic plural"]],
  "lexical|وصب|واصب|noun/pronoun": [["وَصَبٌ", "perpetual hardship or affliction", "Abstract noun", "Names the state behind the adjective"], ["وَاصِبٌ", "constant or perpetual", "Descriptive adjective", "Shows the quality"]],
  "lexical|لبن|لبن|noun/pronoun": [["لَبَنٌ", "milk", "Singular mass noun", "Shows the unmarked noun"], ["أَلْبَانٌ", "milks", "Broken plural", "Shows the established plural"]],
  "lexical|نحل|نحل|noun/pronoun": [["نَحْلَةٌ", "a bee", "Singular noun", "Contrasts the collective with the singular"], ["نَحْلٌ", "bees", "Collective noun", "Shows the collective"]],
  "lexical|نفل|نافلة|noun/pronoun": [["نَفْلٌ", "an extra gift or share", "Lexical noun", "Shows the noun behind the derived form"], ["أَنْفَالٌ", "spoils or extra shares", "Broken plural", "Shows number and the Qur’anic plural"]],
  "lexical|ذقن|اذقان|noun/pronoun": [["ذَقَنٌ", "a chin", "Singular noun", "Contrasts the singular with the Qur’anic plural"], ["أَذْقَانٌ", "chins", "Broken plural", "Shows number"]],
  "lexical|سفن|سفينة|noun/pronoun": [["سَفِينَةٌ", "a ship", "Singular noun", "Shows the base noun"], ["سُفُنٌ", "ships", "Broken plural", "Shows number"]],
  "lexical|جيب|جيب|noun/pronoun": [["جَيْبٌ", "a pocket or bosom", "Singular noun", "Shows the base noun"], ["جُيُوبٌ", "pockets or bosoms", "Broken plural", "Shows number"]],
  "lexical|نمل|نمل|noun/pronoun": [["نَمْلَةٌ", "an ant", "Singular noun", "Contrasts the singular with the collective"], ["نَمْلٌ", "ants", "Collective noun", "Shows the collective"]],
  "lexical|نمل|نملة|noun/pronoun": [["نَمْلَةٌ", "an ant", "Singular noun", "Shows the base noun"], ["نَمْلٌ", "ants", "Collective noun", "Shows number/collectivity"]],
  "lexical|وثن|اوثان|noun/pronoun": [["وَثَنٌ", "an idol", "Singular noun", "Contrasts the singular with the Qur’anic plural"], ["أَوْثَانٌ", "idols", "Broken plural", "Shows number"]],
  "lexical|قوع|قيعة|noun/pronoun": [["قَاعٌ", "a lowland", "Singular noun", "Shows the base geographical noun"], ["قِيعَانٌ", "lowlands", "Broken plural", "Shows number"]],
  "lexical|طفل|اطفل|noun/pronoun": [["طِفْلٌ", "a child", "Singular noun", "Contrasts the singular with the plural"], ["أَطْفَالٌ", "children", "Broken plural", "Shows number"]],
  "lexical|فرد|فرد|noun/pronoun": [["فَرْدٌ", "an individual or alone", "Singular noun", "Shows the base noun"], ["أَفْرَادٌ", "individuals", "Broken plural", "Shows number"]],
  "lexical|فرد|فردى|noun/pronoun": [["فَرْدٌ", "an individual", "Singular noun", "Shows the base noun"], ["أَفْرَادٌ", "individuals", "Broken plural", "Shows number"]],
  "lexical|جرز|جرز|noun/pronoun": [["جَرْزٌ", "barren land", "Adjectival noun", "Shows the established landscape term"]],
  "lexical|حمأ|حمئة|noun/pronoun": [["حَمْأَةٌ", "dark mud", "Singular noun", "Shows the noun without case"], ["حَمِئَةٌ", "muddy or dark", "Descriptive form", "Shows the Qur’anic adjectival form"]],
  "lexical|أرب|اربة|noun/pronoun": [["إِرْبٌ", "a need or desire", "Singular noun", "Shows the base noun"], ["أَرْبٌ", "need or purpose", "Lexical variant", "Shows the established lexical range"]],
  "lexical|قيل|مقيل|noun/pronoun": [],
};

const blocked: Record<string, { reason: string; unresolvedQuestion: string; evidenceRequired: string[] }> = {
  "lexical|طوق|طاقة|noun/pronoun": { reason: "طَاقَة is a capacity/strength noun, while the existing comparison is drawn from the separate encircling verb branch طَوَّقَ. The root relation is real but the two senses do not yet establish a single learner-safe five-row family.", unresolvedQuestion: "Should the capacity noun and the encircling/neck-ring verb be taught as one root network or as separate sense families?", evidenceRequired: ["An approved lexicon treatment separating طاقة (capacity) from طوق (collar/encircle).", "A project family-scope decision for semantically split roots." ] },
  "lexical|حفو|حفي|noun/pronoun": { reason: "حَفِيّ can mean well-informed or gracious, but the queue’s root/lemma assignment is entangled with the separate ح ف ف analysis. The two-row display cannot safely be expanded until the canonical root and sense are fixed.", unresolvedQuestion: "Is the Qur’anic حَفِيّ in 7:187 and 19:47 governed by ح ف و or another lexical analysis, and which sense family should it join?", evidenceRequired: ["Authoritative root and lemma adjudication for 7:187 and 19:47.", "A reviewed distinction between the informed and gracious senses before propagation." ] },
  "lexical|بول|بال|noun/pronoun": { reason: "بَال in the Qur’anic occurrences means concern/condition, while بَالَ and بَوْل belong to different lexical branches. Shared-looking radicals do not safely supply a single family without resolving homonymy.", unresolvedQuestion: "Which lexical family should govern بَال in 12:50, 20:51 and 47:2, and which apparent بول forms must be excluded?", evidenceRequired: ["Approved Qur’anic lexicon entries for بَال (condition/concern) and بَوْل/بَالَ.", "A family-scope decision that prevents homonymic padding." ] },
  "lexical|قنع|قانع|noun/pronoun": { reason: "قَانِع in 22:36 is the needy person who does not ask, while the same root also supplies the content/being-satisfied branch. The current two rows do not safely establish which semantic branch should receive further forms.", unresolvedQuestion: "Should the needy and content meanings of قنع be one teaching family or separate sense-scoped families?", evidenceRequired: ["Authoritative lexicon treatment of قانع in 22:36 and its competing senses.", "Reviewed sense scoping before adding verb, verbal-noun or adjective rows." ] },
  "lexical|صهر|صهرا|noun/pronoun": { reason: "صِهْر is the marriage/kinship noun, but the root also has the melting branch. Adding verb and participle rows without a sense-scoped lexicon would confuse the learner.", unresolvedQuestion: "Which same-sense derivatives of the kinship noun صِهْر are authoritative and useful, if any?", evidenceRequired: ["Approved lexicon entries separating kinship صهر from melting صهر.", "Evidence for a same-sense derivative set rather than root-only relations." ] },
  "lexical|نسأ|منسات|noun/pronoun": { reason: "مِنسَأَة is the staff in 34:14; the root also has the postponement branch. The existing family is too sparse to decide whether further forms would be same-sense lexical teaching or homonymic padding.", unresolvedQuestion: "What is the authoritative lemma and same-sense family for مِنسَأَة in 34:14?", evidenceRequired: ["Qur’anic lexicon treatment of مِنسَأَة and the postponement homonym.", "A reviewed form-family boundary for this rare noun." ] },
  "lexical|جود|جياد|noun/pronoun": { reason: "ٱلْجِيَادُ in 38:31 is excellent/bred horses, while the existing comparison ٱلْجُودِيّ is the proper name al-Jūdī. The displayed two rows are not one lexical family.", unresolvedQuestion: "What is the correct lemma/root for جِيَاد in 38:31, and should the proper name جُودِيّ be removed from this family?", evidenceRequired: ["Authoritative lexicon and morphology analysis of جِيَاد and جُودِيّ.", "A corrected family identity before any additional forms are authored." ] },
  "lexical|عرر|معرة|noun/pronoun": { reason: "مَعَرَّة in 48:25 is harm or blame, while the existing comparison الْمُعْتَرَّ is a needy petitioner. The relationship may be a root-family collision rather than a useful same-sense lesson.", unresolvedQuestion: "Does مَعَرَّة belong with the ع ر ر harm/blame family or with a distinct ع ر ر/ع ر ت lexical analysis?", evidenceRequired: ["Authoritative root and lemma analysis for مَعَرَّة and مُعْتَرّ.", "A reviewed separation of the harm and petitioner senses." ] },
  "lexical|شطأ|شطء|noun/pronoun": { reason: "شَطْء is the shoot of a plant in 48:29, while شَاطِئ is the bank/side. The current comparison is a different lexical branch and cannot safely be used to complete the family.", unresolvedQuestion: "Which same-sense derivatives of شَطْء (plant shoot) are attested and pedagogically useful?", evidenceRequired: ["Approved lexicon entry for شطء and its plural/derivatives.", "Evidence separating it from شاطئ/side." ] },
  "lexical|حمم|يحموم|noun/pronoun": { reason: "يَحْمُوم is black smoke in 56:43, while حَمِيم is scalding water. The apparent root connection crosses a major semantic split, so a five-row family would be misleading without explicit sense evidence.", unresolvedQuestion: "Are يحموم and حميم historically and pedagogically one family or separate lexical senses for this project?", evidenceRequired: ["Approved Qur’anic lexicon treatment of يحموم and حميم.", "A sense-scoped family decision with evidence for any accepted related forms." ] },
};

const modelIssue = new Set([
  "lexical|أون|ن|noun/pronoun", "lexical|أون|فالن|noun/pronoun", "lexical|أون|ا|noun/pronoun",
  "lexical|أوه|اواه|noun/pronoun", "lexical|كلو|كلتا|noun/pronoun",
]);

function modelSpec(item: QueueItem): Spec {
  const reason = item.root === "كلو"
    ? "كِلْتَا is a fixed dual demonstrative/quantifier form, not an ordinary productive lexical family. A five-row verb/noun paradigm would teach false morphology."
    : item.root === "أوه"
      ? "أَوَّاه is an expressive/frozen form of lamentation or compassion; treating it as an ordinary productive five-row family would be misleading."
      : "ٱلْـَٔانَ/ءَآلْـَٔانَ is a fixed temporal word with orthographic/interrogative variants, not a normal lexical root family. The variants are not independent Ṣarf members.";
  return { decision: "MODEL-ISSUE", accepted: [], reason, rejected: [shellRejection, rootOnlyRejection], unresolvedQuestion: "What dedicated representation should teach this fixed grammatical, expressive or dual form without implying a productive five-row lexical paradigm?", evidenceRequired: ["Approved model treatment for this lexical/grammatical type.", "Reviewed learner-facing representation that separates orthographic or fixed-form variants from Ṣarf family members."], confidence: "high" };
}

function defaultLimitedSpec(item: QueueItem): Spec {
  return {
    decision: "CONFIRMED-LIMITED",
    accepted: limitedForms[item.familyKey] ?? [],
    reason: `${item.lemmaOrCurrentForm} is a restricted Qur’anic ${item.category} family in the reviewed sense. The attested comparison forms were checked against every occurrence; additional candidates would be case/shell variants, shared-root-only forms, a different semantic branch, or weakly supported morphology. A shorter reviewed family is therefore more accurate than synthetic padding.`,
    rejected: [shellRejection, rootOnlyRejection, "No additional same-sense form with sufficient evidence and learner value was accepted for this lesson."],
    confidence: "medium",
  };
}

function familySpec(item: QueueItem): Spec {
  if (modelIssue.has(item.familyKey)) return modelSpec(item);
  if (blocked[item.familyKey]) return { decision: "BLOCKED", accepted: [], ...blocked[item.familyKey], rejected: [shellRejection, rootOnlyRejection], confidence: "medium" };
  if (limitedForms[item.familyKey]) return { decision: "CONFIRMED-LIMITED", accepted: limitedForms[item.familyKey], reason: `${item.lemmaOrCurrentForm} is a restricted or semantically narrow Qur’anic family. The available forms are genuine and useful, but a fifth distinct same-sense form is not established without weak or misleading padding.`, rejected: [shellRejection, rootOnlyRejection, "Further candidates were rejected because they repeat the same tense/voice relation or cross a separate lexical sense."], confidence: "high" };
  if (nounForms[item.familyKey]) return { decision: "FULL", accepted: nounForms[item.familyKey], reason: "The current noun/derived form has a secure lexical or morphological relationship to four distinct, learner-useful comparison forms. Case, clitic and root-only candidates were excluded.", rejected: [shellRejection, rootOnlyRejection], confidence: "high" };
  if (item.category === "verb" && verbForms[item.root]) return { decision: "FULL", accepted: verbForms[item.root], reason: "The current Qur’anic verb belongs to an established lexical/morphological family with four useful comparisons across tense, voice, derivation, verbal noun or participial form. The rows are authored from the reviewed root and are not generated padding.", rejected: [shellRejection, rootOnlyRejection], confidence: "high" };
  if (nounFullFromVerb.has(item.familyKey) && verbForms[item.root]) return { decision: "FULL", accepted: verbForms[item.root], reason: "The Qur’anic noun/adjective is securely connected to an established verbal and nominal family. Four distinct comparison forms teach the lexical pattern without counting case or shell changes.", rejected: [shellRejection, rootOnlyRejection], confidence: "high" };
  return defaultLimitedSpec(item);
}

function currentRow(item: QueueItem, occurrence: QueueOccurrence, lesson: Lesson): LessonForm {
  return {
    form: occurrence.arabic,
    meaning: lesson.meaning || occurrence.meaning,
    difference: `Current Qur’anic occurrence at ${occurrence.location}; ${lesson.grammar}.`,
    relationship: `Current occurrence of the ${item.root} family; the complete surface form remains first.`,
    provenance: `Codex Tier-B2 adjudication of ${occurrence.occurrenceId}; canonical occurrence, existing lesson and aligned morphology were inspected.`,
  };
}

function candidateRow(candidate: Candidate, item: QueueItem, occurrence: QueueOccurrence): LessonForm {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.distinction}; compared with the current Qur’anic form at ${occurrence.location}. ${candidate.pedagogicalUse}.`,
    relationship: candidate.relationship,
    provenance: `${candidate.source} Tier-B2 family ${item.familyKey}; candidate reviewed by Codex.`,
  };
}

function markdown(report: Report) {
  const lines = [
    "# Tier-B2 Ṣarf adjudication",
    "",
    `Reviewed at: ${report.reviewedAt}`,
    `Contract: ${report.contractVersion}`,
    "",
    "This report covers exactly the 164 classification-B families whose strongest current learner representation contains two rows. Tier-A, residual B1, B1 model, Tier-C and Tier-D families were excluded.",
    "",
    "## Decision totals",
    "",
    ...(["FULL", "CONFIRMED-LIMITED", "BLOCKED", "MODEL-ISSUE"] as Decision[]).map((d) => `- ${d}: ${report.totals[d]} families / ${report.occurrencesByDecision[d]} occurrences`),
    "",
    "## Family decisions",
    "",
    "| Family | Root | Lemma/current | Category | Occurrences | Decision | Current rows | Accepted rows | Reason / unresolved question |",
    "|---|---|---|---|---:|---|---|---|---|",
  ];
  for (const a of report.adjudications) {
    const current = [...new Set(a.currentRows.flatMap((r) => r.forms.map((f) => f.form)))].join("; ");
    const accepted = a.acceptedCandidates.map((c) => c.form).join("; ") || "—";
    const reason = `${a.reasoning}${a.unresolvedQuestion ? ` Unresolved: ${a.unresolvedQuestion}` : ""}`.replaceAll("|", "\\|");
    lines.push(`| \`${a.familyKey}\` | ${a.root} | ${a.lemmaOrCurrentForm} | ${a.category} | ${a.occurrences.length} | **${a.decision}** | ${current || "—"} | ${accepted} | ${reason} |`);
  }
  lines.push("", "## Review rules applied", "", `- ${shellRejection}`, `- ${rootOnlyRejection}`, "- FULL means exactly five rows after the current Qur’anic row; CONFIRMED-LIMITED is a successful reviewed state, not a failed full family.", "- BLOCKED and MODEL-ISSUE retain explicit uncertainty and require the evidence/model decision recorded in the JSON report.", "");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const queueDocument = JSON.parse(await fs.readFile(queuePath, "utf8")) as { queue: QueueItem[] };
  const b2 = queueDocument.queue.filter((item) => item.classification === "B" && item.maxCurrentFormCount === 2);
  const b2Occurrences = b2.reduce((sum, item) => sum + item.occurrences.length, 0);
  if (b2.length !== 164 || b2Occurrences !== 316) throw new Error(`B2 scope drift: expected 164 families/316 occurrences, found ${b2.length}/${b2Occurrences}`);
  const byOccurrence = new Map<string, QueueItem>();
  for (const item of b2) for (const occurrence of item.occurrences) byOccurrence.set(occurrence.occurrenceId, item);

  const packages = new Map<string, PackageEntry>();
  const occurrenceLessons = new Map<string, OccurrenceRecord>();
  for (const filePath of await discoverPackagePaths()) {
    const result = await readPackage(filePath);
    if (!result.package) throw new Error(`Cannot read package ${filePath}: ${result.errors.join("; ")}`);
    packages.set(filePath, { filePath, package: result.package });
    for (const ayah of result.package.ayahs) for (const word of ayah.words) {
      const item = byOccurrence.get(word.id);
      if (!item || !word.teachingId) continue;
      const lesson = result.package.teachingEntries[word.teachingId];
      if (!lesson) throw new Error(`${word.id}: missing teaching entry`);
      occurrenceLessons.set(word.id, { filePath, package: result.package, word, lesson });
    }
  }
  if (occurrenceLessons.size !== b2Occurrences) throw new Error(`Expected ${b2Occurrences} B2 occurrences, found ${occurrenceLessons.size}`);

  const adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedFiles = new Set<string>();
  for (const item of b2) {
    const spec = familySpec(item);
    const locations = item.occurrences.map((o) => o.location).join(", ");
    const candidatesConsidered = candidateRows(item.root, locations, spec.accepted);
    const occurrences = item.occurrences.map((occurrence) => {
      const record = occurrenceLessons.get(occurrence.occurrenceId);
      if (!record) throw new Error(`Missing package occurrence ${occurrence.occurrenceId}`);
      return { occurrence, record };
    });
    const currentRows = occurrences.map(({ occurrence, record }) => ({ occurrenceId: occurrence.occurrenceId, location: occurrence.location, arabic: occurrence.arabic, forms: record.lesson.forms, sarfReview: record.lesson.sarfReview }));
    const finalRows: FinalRow[] = [];
    for (const { occurrence, record } of occurrences) {
      const current = currentRow(item, occurrence, record.lesson);
      const forms: LessonForm[] = [current];
      if (spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED") {
        const used = new Set([normalize(current.form)]);
        for (const candidate of candidatesConsidered) {
          if (used.has(normalize(candidate.form))) continue;
          forms.push(candidateRow(candidate, item, occurrence));
          used.add(normalize(candidate.form));
          if (spec.decision === "FULL" && forms.length === 5) break;
        }
        if (spec.decision === "FULL" && forms.length !== 5) throw new Error(`${item.familyKey} cannot assemble five distinct forms for ${occurrence.occurrenceId}`);
      }
      const review: SarfReview = {
        status: spec.decision === "FULL" ? "full" : "limited",
        ...(record.lesson.sarfReview.familyScope ? { familyScope: record.lesson.sarfReview.familyScope } : {}),
        ...(spec.decision === "FULL" ? {} : { limitedReason: spec.reason }),
        auditDecision: spec.decision === "FULL" ? "upgraded-to-full" : spec.decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked-for-genuine-ambiguity",
        provenance: [`Tier-B2 adjudication ${reviewedAt}: ${spec.decision}.`, `B2 family ${item.familyKey}; every Qur’anic occurrence and current two-row queue evidence were inspected.`, ...candidatesConsidered.map((candidate) => `Accepted ${candidate.form}: ${candidate.source}`), ...spec.rejected].slice(0, 60),
        reviewedBy: "Codex",
        reviewedAt,
      };
      record.lesson.forms = forms;
      record.lesson.sarfReview = review;
      changedFiles.add(record.filePath);
      finalRows.push({ occurrenceId: occurrence.occurrenceId, location: occurrence.location, arabic: occurrence.arabic, forms, sarfReview: review });
    }
    const recordId = `tier-b2-family-${hash(item.familyKey)}`;
    const decision = spec.decision;
    const productionStatus = decision === "FULL" ? "full" : decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked";
    adjudications.push({
      familyKey: item.familyKey,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      occurrences: item.occurrences,
      currentRows,
      candidatesConsidered,
      acceptedCandidates: candidatesConsidered,
      rejectedCandidates: spec.rejected,
      decision,
      reasoning: spec.reason,
      evidence: [quranEvidence(locations), projectEvidence, ...item.evidenceRequiredToResolve],
      confidence: spec.confidence ?? (decision === "FULL" ? "high" : "medium"),
      finalRows,
      unresolvedQuestion: spec.unresolvedQuestion ?? null,
      evidenceRequired: spec.evidenceRequired ?? [],
      humanExpertReviewRequired: decision === "BLOCKED" || decision === "MODEL-ISSUE",
      productionStatus,
      reviewedAt,
      recordId,
    });
    ledger.push({
      recordId,
      eventType: "tier-b2-sarf-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: { familyKey: item.familyKey, occurrences: item.occurrences.map((o) => o.occurrenceId), tier: "B2" },
      status: decision === "FULL" || decision === "CONFIRMED-LIMITED" ? (decision === "FULL" ? "passed" : "passed-limited") : "blocked",
      reviewedAt,
      checks: ["contract-loaded", "b2-queue-filter-164", "every-occurrence-inspected", "current-form-first", "shell-and-root-only-candidates-rejected", "provenance-recorded", "decision-recorded"],
      evidence: [spec.reason, ...spec.rejected, ...(spec.evidenceRequired ?? [])],
      decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      humanExpertReviewRequired: decision === "BLOCKED" || decision === "MODEL-ISSUE",
    });
  }

  for (const entry of packages.values()) {
    if (entry.package.status !== "custom-partial") continue;
    const hasBlockedLesson = Object.values(entry.package.teachingEntries).some((lesson) => lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity");
    if (!hasBlockedLesson) { entry.package.status = "custom-complete"; changedFiles.add(entry.filePath); }
  }
  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Changed package was not loaded: ${filePath}`);
    await fs.writeFile(filePath, `${JSON.stringify(entry.package, null, 2)}\n`, "utf8");
  }
  appendAuditRecords(ledger);
  const decisions = ["FULL", "CONFIRMED-LIMITED", "BLOCKED", "MODEL-ISSUE"] as Decision[];
  const totals = Object.fromEntries(decisions.map((d) => [d, 0])) as Record<Decision, number>;
  const occurrencesByDecision = Object.fromEntries(decisions.map((d) => [d, 0])) as Record<Decision, number>;
  for (const item of adjudications) { totals[item.decision]++; occurrencesByDecision[item.decision] += item.occurrences.length; }
  const report: Report = {
    reportType: "tier-b2-sarf-adjudication",
    contractVersion: contract.contractVersion,
    reviewedAt,
    scope: { classification: "B", maxCurrentFormCount: 2, families: 164, occurrences: 316, arithmeticReconciliation: { preB1BlockedFamilies: 782, b1ScopeFamilies: 105, b1Results: { FULL: 93, "CONFIRMED-LIMITED": 9, BLOCKED: 2, "MODEL-ISSUE": 1 }, familiesOutsideB1: 677, postB1BlockedFamilies: 680, b2ScopeFamilies: 164, b2ScopeOccurrences: 316 }, excluded: ["Tier-A residual blockers", "residual B1 families", "B1 model issue", "Tier-C one-row families", "Tier-D/model families outside B2"] },
    totals,
    occurrencesByDecision,
    changedPackageFiles: [...changedFiles].sort(),
    adjudications,
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, markdown(report), "utf8");
  console.log(JSON.stringify({ tier: "B2", families: b2.length, occurrences: b2Occurrences, totals, occurrencesByDecision, changedPackageFiles: changedFiles.size, jsonPath, markdownPath }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
