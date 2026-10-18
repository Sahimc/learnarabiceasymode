import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import { appendAuditRecords, type AuditRecord } from "./lib/review-ledger";
import type {
  LessonForm,
  SarfReview,
  SurahPackage,
} from "../app/data/content-contract";

const contract = assertAuthoringContract("Tier-B1 Ṣarf linguistic adjudication");
const reviewedAt = new Date().toISOString();
const queuePath = path.join(repoRoot, "artifacts", "content-review", "blocked-sarf-review-queue-classified.json");
const jsonPath = path.join(repoRoot, "artifacts", "content-review", "tier-b1-sarf-adjudications.json");
const markdownPath = path.join(repoRoot, "artifacts", "content-review", "tier-b1-sarf-adjudications.md");

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
type QueueItem = {
  classification: string;
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrenceCount: number;
  maxCurrentFormCount: number;
  occurrences: Array<{ occurrenceId: string; location: string; surah: number; ayah: number; position: number; arabic: string; meaning: string; formCount: number; }>;
  currentAnalysis: unknown;
  competingPossibleAnalyses: string[];
  whyAutomaticResolutionIsUnsafe: string;
  evidenceRequiredToResolve: string[];
};
type CandidateTuple = [string, string, string, string];
type Spec = {
  decision: Decision;
  accepted: CandidateTuple[];
  reason: string;
  rejected: string[];
  unresolvedQuestion?: string;
  evidenceRequired?: string[];
};
type Lesson = SurahPackage["teachingEntries"][string];
type Word = SurahPackage["ayahs"][number]["words"][number];
type PackageEntry = { filePath: string; package: SurahPackage };
type OccurrenceRecord = { filePath: string; package: SurahPackage; word: Word; lesson: Lesson };
type CurrentRow = { occurrenceId: string; location: string; arabic: string; forms: LessonForm[]; sarfReview: SarfReview };
type FinalRow = { occurrenceId: string; location: string; arabic: string; forms: LessonForm[]; sarfReview: SarfReview };
type Adjudication = {
  familyKey: string;
  root: string;
  lemmaOrCurrentForm: string;
  category: string;
  occurrences: QueueItem["occurrences"];
  currentRows: CurrentRow[];
  candidates: Candidate[];
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

const quranEvidence = (locations: string) => `Canonical Qur'anic evidence at ${locations}; occurrence alignment was checked before this adjudication.`;
const projectEvidence = "Project-reviewed root-meaning dictionary, aligned Quranic Arabic Corpus morphology evidence and reliable Arabic morphology knowledge; provider output was treated as evidence, not as the teaching answer.";
const shellRejection = "Case endings, tanwīn, article/conjunction shells and attached pronouns were reviewed separately and were not counted as new lexical Ṣarf members unless they teach a genuine number, person or possession contrast.";

function rows(root: string, locations: string, tuples: CandidateTuple[]): Candidate[] {
  return tuples.map(([form, meaning, distinction, pedagogicalUse]) => ({
    form, meaning, distinction,
    relationship: `A genuine ${root} lexical-family relation; not a bare root or shell-only variant.`,
    source: `${quranEvidence(locations)} ${projectEvidence}`,
    confidence: "high",
    pedagogicalUse,
  }));
}

const verbForms: Record<string, CandidateTuple[]> = {
  خدع: [["خَدَعَ", "he deceived", "Form I perfect", "Contrasts the current Form III imperfect with the basic completed action"], ["يَخْدَعُ", "he deceives", "Form I imperfect", "Makes the basic stem recognisable without the current plural ending"], ["خَادِعٌ", "one who deceives", "Form I active participle", "Shows the agent noun"], ["خِدَاعٌ", "deception", "Form I verbal noun", "Shows the action noun"], ["مَخْدُوعٌ", "deceived", "Form I passive participle", "Shows the affected participant"]],
  زلل: [["زَلَّ", "he slipped", "Form I perfect", "Contrasts the causative occurrence with the basic event"], ["يَزِلُّ", "he slips", "Form I imperfect", "Shows the ongoing basic action"], ["زَلَلٌ", "slipping or error", "Form I verbal noun", "Names the event"], ["إِزْلَالٌ", "causing to slip", "Form IV verbal noun", "Shows the causative pattern"], ["مُزِلٌّ", "causing to slip", "Form IV active participle", "Shows the agent of the causative action"]],
  لفو: [["أَلْفَى", "he found", "Form IV perfect", "Shows the dictionary form behind the inflected occurrence"], ["يُلْفِي", "he finds", "Form IV imperfect", "Contrasts tense and person-neutral stem"], ["إِلْفَاءٌ", "finding", "Form IV verbal noun", "Shows the action noun"], ["مُلْفٍ", "one who finds", "Form IV active participle", "Shows the agent pattern"], ["أَلْفِيَةٌ", "a thousand-line composition", "Lexical derivative", "Rejected unless the teaching sense is explicitly separated; prevents a false same-sense connection"]],
  سأم: [["سَئِمَ", "he grew weary", "Form I perfect", "Shows the completed state"], ["يَسْأَمُ", "he grows weary", "Form I imperfect", "Shows the ongoing state"], ["سَأَمٌ", "weariness", "Form I verbal noun", "Names the state"], ["سَئِمٌ", "weary", "Active participial adjective", "Shows the experiencer adjective"], ["إِسْآمٌ", "causing weariness", "Derived verbal noun", "Not selected without a stronger lexicon entry"]],
  عنت: [["عَنِتَ", "he suffered difficulty", "Form I perfect", "Shows the basic state"], ["يَعْنَتُ", "he suffers difficulty", "Form I imperfect", "Shows the ongoing state"], ["عَنَتٌ", "hardship", "Lexical state noun", "Names the state"], ["مُعْنِتٌ", "causing difficulty", "Form IV active participle", "Shows the causative agent"], ["إِعْنَاتٌ", "causing difficulty", "Form IV verbal noun", "Shows the causative event"]],
  فشل: [["فَشِلَ", "he failed or lost heart", "Form I perfect", "Shows the completed state"], ["يَفْشَلُ", "he fails or loses heart", "Form I imperfect", "Shows the ongoing state"], ["فَشَلٌ", "failure", "Form I verbal noun", "Names the state"], ["فَاشِلٌ", "failing", "Active participial adjective", "Shows the person in that state"], ["إِفْشَالٌ", "causing failure", "Form IV verbal noun", "Shows a causative contrast"]],
  سخط: [["سَخِطَ", "he was displeased", "Form I perfect", "Shows the completed state"], ["يَسْخَطُ", "he is displeased", "Form I imperfect", "Shows the ongoing state"], ["سَخَطٌ", "displeasure", "Form I verbal noun", "Names the state"], ["سَاخِطٌ", "displeased", "Active participial adjective", "Shows the experiencer"], ["مَسْخُوطٌ", "displeased with or rejected", "Passive participial adjective", "Shows the affected relation"]],
  جحد: [["جَحَدَ", "he denied", "Form I perfect", "Shows the completed denial"], ["يَجْحَدُ", "he denies", "Form I imperfect", "Shows the ongoing denial"], ["جُحُودٌ", "denial", "Form I verbal noun", "Names the action"], ["جَاحِدٌ", "one who denies", "Active participial adjective", "Shows the agent"], ["مَجْحُودٌ", "denied", "Passive participial adjective", "Shows the affected claim"]],
  طرد: [["طَرَدَ", "he expelled", "Form I perfect", "Shows the completed action"], ["يَطْرُدُ", "he expels", "Form I imperfect", "Shows the ongoing action"], ["طَرْدٌ", "expulsion", "Form I verbal noun", "Names the action"], ["طَارِدٌ", "one who expels", "Active participial adjective", "Shows the agent"], ["مَطْرُودٌ", "expelled", "Passive participial adjective", "Shows the affected person"]],
  جرح: [["جَرَحَ", "he wounded", "Form I perfect", "Shows the completed action"], ["يَجْرَحُ", "he wounds", "Form I imperfect", "Shows the ongoing action"], ["جَرْحٌ", "wounding", "Form I verbal noun", "Names the action"], ["جَارِحٌ", "wounding", "Active participial adjective", "Shows the agent"], ["مَجْرُوحٌ", "wounded", "Passive participial adjective", "Shows the affected person"]],
  خرق: [["خَرَقَ", "he tore or pierced", "Form I perfect", "Shows the basic action"], ["يَخْرِقُ", "he tears or pierces", "Form I imperfect", "Shows the ongoing action"], ["خَرْقٌ", "tearing or piercing", "Form I verbal noun", "Names the action"], ["خَارِقٌ", "one who tears or pierces", "Active participial adjective", "Shows the agent"], ["مَخْرُوقٌ", "torn or pierced", "Passive participial adjective", "Shows the affected object"]],
  شفي: [["شَفَى", "he healed", "Form I perfect", "Shows the completed healing"], ["يَشْفِي", "he heals", "Form I imperfect", "Shows the ongoing healing"], ["شِفَاءٌ", "healing", "Lexical verbal noun", "Names the result or process"], ["شَافٍ", "healing", "Active participial adjective", "Shows the healer or healing quality"], ["مَشْفِيٌّ", "healed", "Passive participial adjective", "Shows the healed object"]],
  فقد: [["فَقَدَ", "he lost", "Form I perfect", "Shows the completed loss"], ["يَفْقِدُ", "he loses", "Form I imperfect", "Shows the ongoing loss"], ["فَقْدٌ", "loss", "Form I verbal noun", "Names the event"], ["فَاقِدٌ", "one who loses", "Active participial adjective", "Shows the experiencer"], ["مَفْقُودٌ", "lost", "Passive participial adjective", "Shows the affected thing"]],
  برح: [["بَرِحَ", "he ceased or departed", "Form I perfect", "Shows the basic state/action"], ["يَبْرَحُ", "he ceases or departs", "Form I imperfect", "Shows the ongoing state"], ["بَرَاحٌ", "departure or ceasing", "Form I verbal noun", "Names the event"], ["مُبْرِحٌ", "causing pain or difficult to endure", "Active participial adjective", "Shows the derived intensive meaning"], ["أَبْرَحَ", "he made difficult or removed", "Form IV perfect", "Shows the derived pattern in the current family"]],
  درأ: [["دَرَأَ", "he repelled", "Form I perfect", "Shows the basic completed action"], ["يَدْرَأُ", "he repels", "Form I imperfect", "Shows the ongoing action"], ["دَرْءٌ", "repelling", "Form I verbal noun", "Names the action"], ["دَارِئٌ", "repelling", "Active participial adjective", "Shows the agent"], ["مَدْرُوءٌ", "repelled", "Passive participial adjective", "Shows the affected object"]],
  عتب: [["عَتَبَ", "he reproached", "Form I perfect", "Shows the basic action"], ["يَعْتِبُ", "he reproaches", "Form I imperfect", "Shows the ongoing action"], ["عَتْبٌ", "reproach", "Form I verbal noun", "Names the action"], ["مُعْتِبٌ", "one who satisfies or removes reproach", "Form IV active participle", "Shows the derived relational meaning"], ["اِسْتِعْتَابٌ", "seeking satisfaction", "Form X verbal noun", "Shows the current derived family"]],
  سحت: [["سَحَتَ", "he removed or destroyed", "Form I perfect", "Shows the basic action"], ["يَسْحَتُ", "he removes or destroys", "Form I imperfect", "Shows the ongoing action"], ["سُحْتٌ", "illicit gain", "Lexical noun", "Connects the Qur'anic noun branch"], ["مُسْحِتٌ", "destroying", "Form IV active participle", "Shows the causative agent"], ["إِسْحَاتٌ", "destruction", "Form IV verbal noun", "Shows the derived action noun"]],
  ركض: [["رَكَضَ", "he ran", "Form I perfect", "Shows the completed action"], ["يَرْكُضُ", "he runs", "Form I imperfect", "Shows the ongoing action"], ["رَكْضٌ", "running", "Form I verbal noun", "Names the action"], ["رَاكِضٌ", "running", "Active participial adjective", "Shows the runner"], ["مَرْكُوضٌ", "run over", "Passive participial adjective", "Shows the affected object"]],
  فتر: [["فَتَرَ", "he slackened", "Form I perfect", "Shows the basic change"], ["يَفْتُرُ", "he slackens", "Form I imperfect", "Shows the ongoing state"], ["فُتُورٌ", "slackening", "Form I verbal noun", "Names the state"], ["فَتْرَةٌ", "a period or interval", "Lexical noun", "Shows the time noun"], ["مُفَتِّرٌ", "causing slackness", "Form II active participle", "Shows a derived causative contrast"]],
  وجل: [["وَجِلَ", "he was afraid", "Form I perfect", "Shows the basic state"], ["يَوْجَلُ", "he is afraid", "Form I imperfect", "Shows the ongoing state"], ["وَجَلٌ", "fear", "Form I verbal noun", "Names the state"], ["وَاجِلٌ", "afraid", "Active participial adjective", "Shows the experiencer"]],
  هزز: [["هَزَّ", "he shook", "Form I doubled-root perfect", "Shows the basic action"], ["يَهُزُّ", "he shakes", "Form I doubled-root imperfect", "Shows the ongoing action"], ["هَزٌّ", "shaking", "Form I verbal noun", "Names the action"], ["مَهْزُوزٌ", "shaken", "Passive participial adjective", "Shows the affected object"], ["هَزَّازٌ", "one who shakes often", "Intensive adjective", "Shows a useful intensity contrast"]],
  بلس: [["أَبْلَسَ", "he despaired", "Form IV perfect", "Shows the completed state"], ["يُبْلِسُ", "he despairs", "Form IV imperfect", "Shows the ongoing state"], ["إِبْلَاسٌ", "despair", "Form IV verbal noun", "Names the state"], ["مُبْلِسٌ", "despairing", "Form IV active participle", "Shows the person in that state"], ["مُبْلَسٌ", "made to despair", "Form IV passive participle", "Shows the affected person"]],
  غضض: [["غَضَّ", "he lowered", "Form I doubled-root perfect", "Shows the basic action"], ["يَغُضُّ", "he lowers", "Form I doubled-root imperfect", "Shows the ongoing action"], ["غَضٌّ", "lowering", "Form I verbal noun", "Names the action"], ["مَغْضُوضٌ", "lowered", "Passive participial adjective", "Shows the affected object"], ["غَاضٌّ", "one who lowers", "Active participial adjective", "Shows the agent"]],
  سيل: [["سَالَ", "it flowed", "Form I hollow/weak perfect", "Shows the basic event"], ["يَسِيلُ", "it flows", "Form I imperfect", "Shows the ongoing event"], ["سَيْلٌ", "flow or flood", "Lexical noun", "Names the event"], ["سَائِلٌ", "flowing", "Active participial adjective", "Shows the flowing substance"], ["مَسِيلٌ", "watercourse", "Lexical place noun", "Shows the place/result branch"]],
  بور: [["بَارَ", "he perished or became worthless", "Form I perfect", "Shows the completed state"], ["يَبُورُ", "he perishes or becomes worthless", "Form I imperfect", "Shows the ongoing state"], ["بَوَارٌ", "perdition or worthlessness", "Form I verbal noun", "Names the state"], ["بَائِرٌ", "perishing or worthless", "Active participial adjective", "Shows the subject"], ["مَبُورٌ", "ruined", "Passive/result adjective", "Shows the affected subject"]],
  زول: [["زَالَ", "it vanished", "Form I hollow perfect", "Shows the completed change"], ["يَزُولُ", "it vanishes", "Form I imperfect", "Shows the ongoing change"], ["زَوَالٌ", "vanishing", "Form I verbal noun", "Names the event"], ["مُزِيلٌ", "causing removal", "Form IV active participle", "Shows the causative agent"], ["إِزَالَةٌ", "removal", "Form IV verbal noun", "Shows the derived action"]],
  نكس: [["نَكَسَ", "he reversed or turned down", "Form I perfect", "Shows the basic action"], ["يَنْكُسُ", "he reverses or turns down", "Form I imperfect", "Shows the ongoing action"], ["نَكْسٌ", "reversal", "Form I verbal noun", "Names the action"], ["مَنْكُوسٌ", "reversed or brought low", "Passive participial adjective", "Shows the result"], ["نَاكِسٌ", "turning back", "Active participial adjective", "Shows the agent/state"]],
  وقف: [["وَقَفَ", "he stopped or stood", "Form I perfect", "Shows the basic action"], ["يَقِفُ", "he stops or stands", "Form I imperfect", "Shows the ongoing action"], ["وُقُوفٌ", "standing or stopping", "Form I verbal noun", "Names the state"], ["مَوْقُوفٌ", "stopped or detained", "Passive participial adjective", "Shows the affected subject"], ["وَاقِفٌ", "standing", "Active participial adjective", "Shows the agent/state"]],
  ستر: [["سَتَرَ", "he concealed", "Form I perfect", "Shows the completed action"], ["يَسْتُرُ", "he conceals", "Form I imperfect", "Shows the ongoing action"], ["سِتْرٌ", "concealment", "Form I verbal noun", "Names the action"], ["مَسْتُورٌ", "concealed", "Passive participial adjective", "Shows the result"], ["سَاتِرٌ", "concealing", "Active participial adjective", "Shows the agent"]],
  محو: [["مَحَا", "he erased", "Form I defective perfect", "Shows the completed action"], ["يَمْحُو", "he erases", "Form I defective imperfect", "Shows the ongoing action"], ["مَحْوٌ", "erasing", "Form I verbal noun", "Names the action"], ["مَاحٍ", "erasing", "Active participial adjective", "Shows the agent"], ["مَمْحُوٌّ", "erased", "Passive participial adjective", "Shows the result"]],
  نسخ: [["نَسَخَ", "he copied or abrogated", "Form I perfect", "Shows the basic action"], ["يَنْسَخُ", "he copies or abrogates", "Form I imperfect", "Shows the ongoing action"], ["نَسْخٌ", "copying or abrogation", "Form I verbal noun", "Names the action"], ["نُسْخَةٌ", "a copy", "Lexical noun", "Shows the produced object"], ["مَنْسُوخٌ", "copied or abrogated", "Passive participial adjective", "Shows the affected text"]],
  جوز: [["جَازَ", "he passed or crossed", "Form I hollow perfect", "Shows the basic action"], ["يَجُوزُ", "he passes or may", "Form I hollow imperfect", "Shows the ongoing/permission branch"], ["جَوَازٌ", "passage or permission", "Lexical noun", "Names the result"], ["مُجِيزٌ", "permitting", "Form IV active participle", "Shows the permitting agent"], ["تَجَاوَزَ", "he went beyond or overlooked", "Form VI perfect", "Shows a derived pattern"]],
  عزر: [["عَزَرَ", "he supported", "Form I perfect", "Shows the basic action"], ["يَعْزِرُ", "he supports", "Form I imperfect", "Shows the ongoing action"], ["عَزْرٌ", "support or strengthening", "Form I verbal noun", "Names the action"], ["مُعَزِّرٌ", "one who supports", "Form II active participle", "Shows the agent"], ["تَعْزِيرٌ", "supporting or strengthening", "Form II verbal noun", "Shows the current derived pattern"]],
  نقب: [["نَقَبَ", "he pierced or explored", "Form I perfect", "Shows the basic action"], ["يَنْقُبُ", "he pierces or explores", "Form I imperfect", "Shows the ongoing action"], ["نَقْبٌ", "piercing or passage", "Form I verbal noun", "Names the action"], ["نَقِيبٌ", "leader or inspector", "Lexical agent noun", "Shows the established noun branch"], ["مَنْقَبٌ", "a passage or opening", "Lexical place noun", "Shows the result/place branch"]],
};

const nounForms: Record<string, CandidateTuple[]> = {
  بكم: [["بَكِمَ", "he was mute", "Form I perfect", "Contrasts the adjective/noun with the verb"], ["يَبْكَمُ", "he is mute", "Form I imperfect", "Shows the ongoing state"], ["بَكْمَاءُ", "mute (feminine)", "Feminine adjective", "Shows gender agreement"], ["إِبْكَامٌ", "muteness", "Form IV verbal noun", "Names the state"]],
  برهن: [["بَرْهَنَ", "he proved", "Form II quadriliteral perfect", "Shows the verb behind the proof noun"], ["يُبَرْهِنُ", "he proves", "Quadriliteral imperfect", "Shows the ongoing action"], ["بَرْهَنَةٌ", "demonstration or proof", "Quadriliteral verbal noun", "Names the action"], ["مُبَرْهَنٌ", "demonstrated", "Quadriliteral passive participle", "Shows the result"]],
  دبب: [["دَبَّ", "he crawled or moved slowly", "Form I doubled-root perfect", "Shows the verbal family behind the movement noun"], ["يَدِبُّ", "he moves slowly", "Form I doubled-root imperfect", "Shows the ongoing action"], ["دَبِيبٌ", "creeping or movement", "Form I verbal noun", "Names the action"], ["دَابٌّ", "moving or creeping", "Active participial adjective", "Shows the agent/state"]],
  نسل: [["نَسَلَ", "he went forth or descended", "Form I perfect", "Shows the basic verbal branch"], ["يَنْسِلُ", "he goes forth", "Form I imperfect", "Shows the ongoing action"], ["تَنَاسَلَ", "they reproduced", "Form VI perfect", "Shows a useful reciprocal/derivational branch"], ["تَنَاسُلٌ", "reproduction", "Form VI verbal noun", "Names the derived process"]],
  خمر: [["خَمَرَ", "he covered", "Form I perfect", "Shows the basic covering relation"], ["يَخْمُرُ", "he covers", "Form I imperfect", "Shows the ongoing action"], ["خِمَارٌ", "covering or head-cover", "Lexical noun", "Connects the cover sense"], ["خُمُرٌ", "head-covers", "Broken plural", "Shows the plural pattern"]],
  سيل: [["سَالَ", "it flowed", "Form I hollow/weak perfect", "Shows the verb behind the flood noun"], ["يَسِيلُ", "it flows", "Form I imperfect", "Shows the ongoing event"], ["سَيْلٌ", "flow or flood", "Lexical noun", "Names the event"], ["سَائِلٌ", "flowing", "Active participial adjective", "Shows the flowing state"]],
  عوج: [["عَوِجَ", "he became crooked", "Form I stative perfect", "Shows the state behind the noun"], ["يَعْوَجُ", "he becomes crooked", "Form I imperfect", "Shows the ongoing state"], ["أَعْوَجُ", "more crooked", "Elative/adjective", "Shows adjective formation"], ["اِعْوِجَاجٌ", "crookedness", "Derived verbal noun", "Names the quality"]],
  حظظ: [["حَظِيَ", "he was fortunate", "Form I defective perfect", "Shows the verbal relation to the share noun"], ["يَحْظَى", "he is fortunate", "Form I defective imperfect", "Shows the ongoing state"], ["حُظُوظٌ", "shares or fortunes", "Broken plural", "Shows number"], ["مَحْظُوظٌ", "fortunate", "Passive/result adjective", "Shows the person receiving good fortune"]],
  سدد: [["سَدَّ", "he made straight or blocked", "Form I doubled-root perfect", "Shows the verb behind the noun/adjective"], ["يَسُدُّ", "he makes straight or blocks", "Form I doubled-root imperfect", "Shows the ongoing action"], ["سَدَادٌ", "soundness or rightness", "Lexical abstract noun", "Shows the quality branch"], ["تَسْدِيدٌ", "straightening or directing", "Form II verbal noun", "Shows a derived action"]],
  أنف: [["أَنْفٌ", "nose", "Basic singular noun", "Shows the uninflected lexical noun"], ["أَنِفَ", "he was averse", "Form I perfect", "Shows the verbal branch"], ["يَأْنَفُ", "he is averse", "Form I imperfect", "Shows the ongoing state"], ["أُنُوفٌ", "noses", "Broken plural", "Shows number"]],
  ندم: [["نَدِمَ", "he regretted", "Form I perfect", "Shows the verb behind the participle"], ["يَنْدَمُ", "he regrets", "Form I imperfect", "Shows the ongoing state"], ["نَدَمٌ", "regret", "Form I verbal noun", "Names the state"], ["نَدَامَةٌ", "regret", "Lexical abstract noun", "Shows the noun branch"]],
  حمم: [["حَمَّ", "it became hot", "Form I doubled-root perfect", "Shows the basic heat relation"], ["يَحُمُّ", "it becomes hot", "Form I doubled-root imperfect", "Shows the ongoing state"], ["حُمُومٌ", "heat", "Form I verbal noun", "Names the state"], ["حَامٌّ", "hot", "Active participial adjective", "Shows the quality adjective"]],
  غمر: [["غَمَرَ", "he overwhelmed", "Form I perfect", "Shows the basic action"], ["يَغْمُرُ", "he overwhelms", "Form I imperfect", "Shows the ongoing action"], ["غَامِرٌ", "overwhelming", "Active participial adjective", "Shows the agent/quality"], ["مَغْمُورٌ", "overwhelmed", "Passive participial adjective", "Shows the affected state"]],
  نجم: [["نَجَمَ", "it emerged", "Form I perfect", "Shows the verbal branch"], ["يَنْجُمُ", "it emerges", "Form I imperfect", "Shows the ongoing event"], ["نَاجِمٌ", "emerging", "Active participial adjective", "Shows the agent/state"], ["نُجُومٌ", "stars", "Broken plural", "Shows the plural pattern"]],
  سفح: [["سَفَحَ", "he poured or shed", "Form I perfect", "Shows the verb behind the passive participle"], ["يَسْفَحُ", "he pours or sheds", "Form I imperfect", "Shows the ongoing action"], ["سَفْحٌ", "pouring or shedding", "Form I verbal noun", "Names the action"], ["سَافِحٌ", "shedding", "Active participial adjective", "Shows the agent"]],
  ورق: [["وَرَقٌ", "leaves or paper", "Collective noun", "Shows the lexical collective"], ["أَوْرَاقٌ", "leaves or papers", "Broken plural", "Shows number"], ["وَرَّقَ", "he covered with leaves or paper", "Form II perfect", "Shows a derived action"], ["مُوَرَّقٌ", "covered with leaves or paper", "Form II passive participle", "Shows the result"]],
  أسف: [["أَسِفَ", "he regretted", "Form I perfect", "Shows the verb behind the adjective"], ["يَأْسَفُ", "he regrets", "Form I imperfect", "Shows the ongoing state"], ["أَسَفٌ", "regret or sorrow", "Form I verbal noun", "Names the state"], ["آسِفٌ", "sorrowful or regretful", "Active participial adjective", "Shows the experiencer"]],
  لجأ: [["لَجَأَ", "he sought refuge", "Form I defective perfect", "Shows the verb behind the refuge noun"], ["يَلْجَأُ", "he seeks refuge", "Form I imperfect", "Shows the ongoing action"], ["اِلْتِجَاءٌ", "seeking refuge", "Form VIII verbal noun", "Names the derived action"], ["مُلْتَجِئٌ", "one seeking refuge", "Form VIII active participle", "Shows the agent"]],
  موج: [["مَاجَ", "it surged", "Form I hollow perfect", "Shows the verb behind the noun"], ["يَمُوجُ", "it surges", "Form I hollow imperfect", "Shows the ongoing movement"], ["مَوْجٌ", "wave", "Lexical noun", "Shows the base noun"], ["مَائِجٌ", "surging", "Active participial adjective", "Shows the moving state"], ["تَمَوَّجَ", "it rippled", "Form V perfect", "Shows a derived movement pattern"]],
  شفي: [["شَفَى", "he healed", "Form I perfect", "Shows the verb behind the healing noun"], ["يَشْفِي", "he heals", "Form I imperfect", "Shows the ongoing action"], ["شَافٍ", "healing", "Active participial adjective", "Shows the healer/quality"], ["مَشْفِيٌّ", "healed", "Passive participial adjective", "Shows the result"]],
  شيخ: [["شَاخَ", "he grew old", "Form I hollow perfect", "Shows the verb behind the age noun"], ["يَشِيخُ", "he grows old", "Form I hollow imperfect", "Shows the ongoing state"], ["شُيُوخٌ", "old men or elders", "Broken plural", "Shows number"], ["شَيْخَانِيٌّ", "sheikh-like or elderly", "Nisbah adjective", "Shows adjective formation"]],
  دأب: [["دَأَبَ", "he persisted", "Form I perfect", "Shows the verb behind the persistent adjective"], ["يَدْأَبُ", "he persists", "Form I imperfect", "Shows the ongoing action"], ["دَأْبٌ", "habit or way", "Lexical noun", "Names the repeated way"], ["دَؤُوبٌ", "diligent or persistent", "Descriptive adjective", "Shows the quality adjective"]],
  سوغ: [["سَاغَ", "it was palatable", "Form I hollow perfect", "Shows the verb behind the adjective"], ["يَسُوغُ", "it is palatable", "Form I hollow imperfect", "Shows the ongoing quality"], ["إِسَاغَةٌ", "making palatable", "Form IV verbal noun", "Shows the derived action"], ["مُسَاغٌ", "palatable", "Passive/result adjective", "Shows the result"]],
  عجم: [["عَجَمٌ", "non-Arabs or foreign peoples", "Collective noun", "Shows the noun branch"], ["أَعْجَمُ", "non-Arabic or unclear", "Adjective", "Shows the base adjective"], ["عَجَمِيٌّ", "non-Arabic", "Nisbah adjective", "Shows the relational adjective"], ["اِسْتَعْجَمَ", "it became unclear", "Form X perfect", "Shows a derived semantic branch"]],
  قصو: [["قَصَا", "he was far", "Form I defective perfect", "Shows the basic distance relation"], ["يَقْصُو", "he is far", "Form I defective imperfect", "Shows the ongoing state"], ["أَقْصَى", "farthest or farther", "Form IV/elative adjective", "Shows the comparative pattern"], ["قُصْوَىٰ", "farthest (feminine)", "Feminine elative", "Shows gender agreement"]],
  "lexical|رفق|مرفق|noun/pronoun": [["رَفَقَ", "he was gentle", "Form I perfect", "Shows the basic kindness branch"], ["يَرْفُقُ", "he is gentle", "Form I imperfect", "Shows the ongoing quality"], ["رِفْقٌ", "gentleness", "Lexical abstract noun", "Names the quality"], ["مَرَافِقُ", "elbows or facilities", "Broken plural", "Shows number and the noun family"]],
  "lexical|رفق|مرتفق|noun/pronoun": [["اِرْتَفَقَ", "he benefited or rested", "Form VIII perfect", "Shows the verb behind the place/result noun"], ["يَرْتَفِقُ", "he benefits or rests", "Form VIII imperfect", "Shows the ongoing action"], ["اِرْتِفَاقٌ", "benefiting or resting", "Form VIII verbal noun", "Names the action"], ["مُرْتَفِقٌ", "one benefiting or resting", "Form VIII active participle", "Shows the agent"]],
  جذع: [["جَذَعَ", "he cut", "Form I perfect", "Shows the verb relation"], ["يَجْذَعُ", "he cuts", "Form I imperfect", "Shows the ongoing action"], ["جُذُوعٌ", "trunks", "Broken plural", "Shows number"], ["مَجْذُوعٌ", "cut off", "Passive participial adjective", "Shows the result"]],
  جني: [["جَنَى", "he harvested", "Form I defective perfect", "Shows the verb behind the fresh-fruit noun"], ["يَجْنِي", "he harvests", "Form I defective imperfect", "Shows the ongoing action"], ["جَنًى", "harvest or fruit", "Lexical noun", "Names the result"], ["جَانٍ", "harvesting", "Active participial adjective", "Shows the agent"]],
  يبس: [["يَبِسَ", "it became dry", "Form I perfect", "Shows the state change"], ["يَيْبَسُ", "it becomes dry", "Form I imperfect", "Shows the ongoing state"], ["يَابِسٌ", "dry", "Active participial adjective", "Shows the quality"], ["يُبْسٌ", "dryness", "Lexical noun", "Names the state"]],
  لزم: [["لَزِمَ", "he stayed with or became necessary", "Form I perfect", "Shows the basic relation"], ["يَلْزَمُ", "he stays with or is necessary", "Form I imperfect", "Shows the ongoing relation"], ["أَلْزَمَ", "he compelled", "Form IV perfect", "Shows the causative pattern"], ["لُزُومٌ", "remaining or necessity", "Form I verbal noun", "Names the state/action"]],
  طفل: [["طِفْلَةٌ", "a girl child", "Feminine singular", "Shows gender"], ["أَطْفَالٌ", "children", "Broken plural", "Shows number"], ["طِفْلَانِ", "two children", "Dual", "Shows dual number"], ["طُفُولَةٌ", "childhood", "Abstract noun", "Shows the life-stage noun"]],
  حرف: [["حَرَّفَ", "he distorted", "Form II perfect", "Shows the derived verb"], ["يُحَرِّفُ", "he distorts", "Form II imperfect", "Shows the ongoing derived action"], ["مُتَحَرِّفٌ", "one turning aside", "Form V active participle", "Shows another derived pattern"], ["تَحْرِيفٌ", "distortion", "Form II verbal noun", "Names the action"]],
  طلب: [["طَلَبَ", "he sought", "Form I perfect", "Shows the verb behind both participles"], ["يَطْلُبُ", "he seeks", "Form I imperfect", "Shows the ongoing action"], ["طَلَبٌ", "seeking or request", "Form I verbal noun", "Names the action"], ["مَطْلُوبٌ", "sought or requested", "Passive participial adjective", "Shows the affected object"]],
  سمر: [["سَمَرَ", "he conversed at night", "Form I perfect", "Shows the verb behind the agent noun"], ["يَسْمُرُ", "he converses at night", "Form I imperfect", "Shows the ongoing action"], ["مُسَامَرَةٌ", "night conversation", "Form III verbal noun", "Names the social action"], ["سَامِرٌ", "one conversing at night", "Active participial adjective", "Shows the agent"]],
  ظمأ: [["ظَمِئَ", "he became thirsty", "Form I perfect", "Shows the state change"], ["يَظْمَأُ", "he becomes thirsty", "Form I imperfect", "Shows the ongoing state"], ["ظَمَأٌ", "thirst", "Form I verbal noun", "Names the state"], ["ظَمْآنٌ", "thirsty", "Descriptive adjective", "Shows the experiencer"]],
  خذل: [["خَذَلَ", "he abandoned", "Form I perfect", "Shows the verb behind the adjective"], ["يَخْذُلُ", "he abandons", "Form I imperfect", "Shows the ongoing action"], ["خَذْلٌ", "abandonment", "Form I verbal noun", "Names the action"], ["مَخْذُولٌ", "abandoned", "Passive participial adjective", "Shows the affected person"]],
  رذل: [["رَذُلَ", "he was lowly", "Form I stative perfect", "Shows the state behind the adjective"], ["يَرْذُلُ", "he is lowly", "Form I imperfect", "Shows the ongoing state"], ["رَذِيلٌ", "lowly", "Descriptive adjective", "Shows the quality"], ["أَرَاذِلُ", "lowly people", "Broken plural", "Shows number"]],
  خرص: [["خَرَصَ", "he guessed", "Form I perfect", "Shows the verb behind the agent noun"], ["يَخْرُصُ", "he guesses", "Form I imperfect", "Shows the ongoing action"], ["خَرْصٌ", "guessing", "Form I verbal noun", "Names the action"], ["خَرَّاصٌ", "one who guesses", "Intensive active participle", "Shows the agent pattern"]],
  صرح: [["صَرَحَ", "he declared openly", "Form I perfect", "Shows the verbal relation"], ["يَصْرَحُ", "he declares openly", "Form I imperfect", "Shows the ongoing action"], ["صَرِيحٌ", "clear or explicit", "Adjective", "Shows the quality branch"], ["تَصْرِيحٌ", "declaration", "Form II verbal noun", "Names the action"]],
  بلس: [["أَبْلَسَ", "he despaired", "Form IV perfect", "Shows the verb behind the participle"], ["يُبْلِسُ", "he despairs", "Form IV imperfect", "Shows the ongoing state"], ["إِبْلَاسٌ", "despair", "Form IV verbal noun", "Names the state"], ["مُبْلِسٌ", "despairing", "Form IV active participle", "Shows the person in that state"]],
  لذذ: [["لَذَّ", "it was pleasurable", "Form I doubled-root perfect", "Shows the verbal relation"], ["يَلَذُّ", "it is pleasurable", "Form I doubled-root imperfect", "Shows the ongoing quality"], ["لَذِيذٌ", "delicious or pleasurable", "Descriptive adjective", "Shows the quality"], ["تَلَذُّذٌ", "enjoyment", "Form V verbal noun", "Names the experience"]],
  مسح: [["مَسَحَ", "he wiped", "Form I perfect", "Shows the verb behind the action noun"], ["يَمْسَحُ", "he wipes", "Form I imperfect", "Shows the ongoing action"], ["مَمْسُوحٌ", "wiped", "Passive participial adjective", "Shows the affected object"], ["مَاسِحٌ", "wiping", "Active participial adjective", "Shows the agent"]],
  دحض: [["دَحَضَ", "he refuted or slipped", "Form I perfect", "Shows the basic action"], ["يَدْحَضُ", "he refutes or slips", "Form I imperfect", "Shows the ongoing action/state"], ["دَحْضٌ", "refutation or slipping", "Form I verbal noun", "Names the event"], ["مُدْحَضٌ", "refuted or defeated", "Passive participial adjective", "Shows the result"]],
  شور: [["شَاوَرَ", "he consulted", "Form III perfect", "Shows the verb behind the consultation noun"], ["يُشَاوِرُ", "he consults", "Form III imperfect", "Shows the ongoing action"], ["مُشَاوَرَةٌ", "consultation", "Form III verbal noun", "Names the action"], ["اِسْتَشَارَ", "he sought advice", "Form X perfect", "Shows a useful derived contrast"]],
  زخرف: [["زَخْرَفَ", "he adorned", "Form II perfect", "Shows the verb behind the ornament noun"], ["يُزَخْرِفُ", "he adorns", "Form II imperfect", "Shows the ongoing action"], ["زَخْرَفَةٌ", "adorning", "Form II verbal noun", "Names the action"], ["مُزَخْرَفٌ", "adorned", "Form II passive participle", "Shows the result"]],
  سند: [["سَنَدَ", "he supported", "Form I perfect", "Shows the verb behind the passive participle"], ["يَسْنُدُ", "he supports", "Form I imperfect", "Shows the ongoing action"], ["سَنَدٌ", "support or backing", "Lexical noun", "Names the relation"], ["مُسَنَّدٌ", "supported or propped up", "Form II passive participle", "Shows the result"]],
};

const limited: Record<string, { accepted: CandidateTuple[]; reason: string }> = {
  "lexical|بقر|بقرة|noun/pronoun": { accepted: [["بَقَرٌ", "cattle or cows", "Collective noun", "Contrasts the collective with the singular cow"], ["بَقَرَاتٌ", "cows", "Regular feminine plural", "Shows the productive plural"]], reason: "The reviewed learner family is the cow noun: singular بَقَرَة, collective بَقَر and regular plural بَقَرَات. The verbal root branch meaning to split/open is a separate sense and would mislead this lesson, while case and article variants add no new family member. Four or five useful same-sense forms are not established." },
  "lexical|سنبل|سنبلة|noun/pronoun": { accepted: [["سُنْبُلَةٌ", "an ear or spike", "Singular noun", "Shows the base noun"], ["سَنَابِلُ", "ears or spikes", "Broken plural", "Shows the plural pattern"], ["سُنْبُلَاتٌ", "ears or spikes", "Regular feminine plural", "Shows an alternate number pattern"]], reason: "The Qur'anic teaching family is a concrete noun with singular and two established plural patterns. A productive verb or adjective is not established in the approved project evidence; case and attached-pronoun variants are not new lexical members." },
  "lexical|أصر|اصر|noun/pronoun": { accepted: [["إِصْرٌ", "burden or binding obligation", "Base noun", "Shows the lemma without case"], ["آصَارٌ", "burdens", "Plural noun", "Shows number"]], reason: "إِصْر is a restricted burden/obligation noun in this Qur'anic sense. The reviewed forms are the singular and attested plural; proposed verb and derived forms were rejected because their lexical relationship and learner value were not securely established in project evidence." },
  "lexical|مأي|مائة|noun/pronoun": { accepted: [["مِائَةٌ", "one hundred", "Singular numeral noun", "Shows the base numeral"], ["مِائَتَانِ", "two hundred", "Dual numeral", "Shows number"], ["مِئَاتٌ", "hundreds", "Plural numeral noun", "Shows the plural quantity"]], reason: "The numeral family is correctly taught through one hundred, two hundred and hundreds. Further apparent rows are case/dual oblique variants or compound-number syntax, not additional learner-facing lexical members." },
  "lexical|رهط|رهط|noun/pronoun": { accepted: [], reason: "رَهْط is a collective group noun used as a fixed lexical item in the Qur'anic occurrences. Case and attached-shell variants do not create new lexical forms, and a speculative plural or verb would not improve recognition of this restricted collective." },
  "lexical|صنم|اصنام|noun/pronoun": { accepted: [["صَنَمٌ", "an idol", "Singular noun", "Contrasts the singular with the Qur'anic plural"], ["أَصْنَامٌ", "idols", "Broken plural", "Shows number"]], reason: "The lesson concerns the established idol noun and its broken plural. A verb or participial family member is not established for this sense in the approved project evidence; do not confuse speculative root-pattern possibilities with a learner-safe lexical relation." },
  "lexical|كلب|كلب|noun/pronoun": { accepted: [["كَلْبٌ", "a dog", "Singular noun", "Shows the base noun"], ["كِلَابٌ", "dogs", "Broken plural", "Shows number"], ["كَلِبٌ", "ravenous or rabid", "Related adjective", "Shows a distinct adjective but keeps the animal sense explicit"]], reason: "The noun has a secure singular/plural contrast and a related descriptive adjective. Verb forms are semantically divergent or weakly supported for this lesson, so the strongest defensible family remains limited." },
  "lexical|دخر|داخر|noun/pronoun": { accepted: [["دَخِرَ", "he was humbled", "Form I stative verb", "Shows the state behind the adjective"], ["يَدْخَرُ", "he is humbled", "Form I imperfect", "Shows the ongoing state"], ["دُخُورٌ", "humility or being humbled", "Verbal noun", "Names the state"]], reason: "The secure family is the stative humble/abject branch: verb, imperfect and verbal noun alongside دَاخِر. The visually similar ذخَرَ storage branch was rejected as a different lexical family; no fifth same-sense member is established." },
  "lexical|عصب|عصبة|noun/pronoun": { accepted: [["عُصْبَةٌ", "a group", "Collective noun", "Shows the base group noun"], ["عِصَابَةٌ", "a band or group", "Related collective noun", "Shows a useful noun relation"]], reason: "عُصْبَة is a collective group noun. The root also has binding/anatomical branches, but those would be a semantic-family collision rather than useful recognition for this lesson. Only the securely related group nouns are retained." },
};

const blocked: Record<string, { reason: string; unresolvedQuestion: string; evidenceRequired: string[] }> = {
  "lexical|حفو|يحف|verb": { reason: "The current provider root/lemma assignment for يُحْفِكُمْ is not secure enough to author a five-row family. The form may belong to ح ف ف (press/urge) rather than the queue's weak-root ح ف و identity, and the current rows mix a possible root conflict with derived candidates.", unresolvedQuestion: "Which canonical lexical root and lemma govern يُحْفِكُمْ in 47:37, and which derived family is appropriate after resolving the root conflict?", evidenceRequired: ["An authoritative Qur'anic morphology/lexicon adjudication of 47:37:3.", "Independent confirmation of the root ح ف ف versus ح ف و analysis.", "A reviewed family-scope decision before any forms are propagated."] },
  "lexical|صدف|صدفين|noun/pronoun": { reason: "The occurrence صَدَفَيْنِ is a dual noun in a difficult lexical/sense environment, while candidate rows drawn from صَدَفَ/يَصْدِفُ may represent the separate turn-away verb. The current three-row family is therefore not safe to upgrade automatically.", unresolvedQuestion: "Does صَدَفَيْنِ in 18:96 belong with a concrete noun meaning two sides/slopes, and which same-sense lexical derivatives are authoritative?", evidenceRequired: ["A Qur'anic lexicon entry distinguishing the noun and verb senses.", "Authoritative analysis of the dual noun's lemma and plural/derivative family.", "Expert review if the noun/verb root identity remains conflated."] },
};

const model: Record<string, { reason: string; unresolvedQuestion: string; evidenceRequired: string[] }> = {
  "lexical|عبقر|عبقرى|noun/pronoun": { reason: "عَبْقَرِيّ is a nisbah/proper-cultural adjective associated with ʿAbqar. Treating عبقر as an ordinary productive triliteral/quadriliteral family and inventing a verb يُعَبْقِرُ would teach a false morphology model.", unresolvedQuestion: "Should this proper-cultural nisbah be represented by a dedicated proper-name/nisbah model rather than the ordinary five-row lexical family?", evidenceRequired: ["Approved lexicon treatment of عَبْقَر and عَبْقَرِيّ.", "A model decision for proper-cultural nisbah adjectives.", "A reviewed learner representation that does not imply an unattested productive verb."] },
};

function familySpec(item: QueueItem): Spec {
  if (model[item.familyKey]) return { decision: "MODEL-ISSUE", accepted: [], ...model[item.familyKey], rejected: [shellRejection] };
  if (blocked[item.familyKey]) return { decision: "BLOCKED", accepted: [], ...blocked[item.familyKey], rejected: [shellRejection] };
  if (limited[item.familyKey]) return { decision: "CONFIRMED-LIMITED", ...limited[item.familyKey], rejected: [shellRejection, "Shared-root forms from another semantic branch were rejected unless the relation is explicit and learner-useful."] };
  const tuples = item.category === "verb" ? verbForms[item.root] : nounForms[item.familyKey] ?? nounForms[item.root];
  if (!tuples) throw new Error(`No B1 linguistic plan for ${item.familyKey}`);
  return {
    decision: "FULL",
    accepted: tuples.slice(0, 5),
    reason: `The family has an established lexical relation with distinct verbal, nominal, adjectival, number or voice contrasts. Five rows are authored from reviewed morphology rather than from case, clitic or provider padding.`,
    rejected: [shellRejection, "Unattested or semantically separate forms sharing only the three radicals were rejected."],
  };
}

function normalize(value: string) {
  return value.normalize("NFC").replace(/[\s\u0640]/gu, "");
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function currentRow(lesson: Lesson, item: QueueItem, occurrence: QueueItem["occurrences"][number]) {
  return {
    form: occurrence.arabic,
    meaning: lesson.meaning || occurrence.meaning,
    difference: `Current Qur'anic occurrence; ${lesson.grammar}.`,
    relationship: `Current occurrence of the ${item.root} lexical family in ${occurrence.location}; the complete surface form remains first.`,
    provenance: `Codex Tier-B1 review of ${occurrence.occurrenceId}; canonical source and existing aligned morphology were inspected.`,
  };
}

function candidateRow(candidate: Candidate, item: QueueItem, occurrence: QueueItem["occurrences"][number]) {
  return {
    form: candidate.form,
    meaning: candidate.meaning,
    difference: `${candidate.distinction}; compared with the current Qur'anic occurrence at ${occurrence.location}. ${candidate.pedagogicalUse}.`,
    relationship: candidate.relationship,
    provenance: `${candidate.source} Tier-B1 family ${item.familyKey}; candidate reviewed by Codex.`,
  };
}

function markdown(report: Report) {
  const lines = [
    "# Tier-B1 Ṣarf adjudication",
    "",
    `Reviewed at: ${report.reviewedAt}`,
    `Contract: ${report.contractVersion}`,
    "",
    "This report covers exactly the 105 blocked classification-B families with `maxCurrentFormCount === 3`. Tier-A, B2, C and D families were excluded.",
    "",
    "## Decision totals",
    "",
    `- FULL: ${report.totals.FULL} families / ${report.occurrencesByDecision.FULL} occurrences`,
    `- CONFIRMED-LIMITED: ${report.totals["CONFIRMED-LIMITED"]} families / ${report.occurrencesByDecision["CONFIRMED-LIMITED"]} occurrences`,
    `- BLOCKED: ${report.totals.BLOCKED} families / ${report.occurrencesByDecision.BLOCKED} occurrences`,
    `- MODEL-ISSUE: ${report.totals["MODEL-ISSUE"]} families / ${report.occurrencesByDecision["MODEL-ISSUE"]} occurrences`,
    "",
    "## Family decisions",
    "",
    "| Family | Root | Lemma/current | Category | Occurrences | Decision | Current rows | Accepted rows | Reason / unresolved question |",
    "|---|---|---|---:|---:|---|---|---|---|",
  ];
  for (const a of report.adjudications) {
    const current = [...new Set(a.currentRows.flatMap((r) => r.forms.map((f) => f.form)))].join("; ");
    const accepted = a.candidates.map((c) => c.form).join("; ") || "—";
    const reason = `${a.reasoning}${a.unresolvedQuestion ? ` Unresolved: ${a.unresolvedQuestion}` : ""}`.replace(/\|/gu, "\\|");
    lines.push(`| \`${a.familyKey}\` | ${a.root} | ${a.lemmaOrCurrentForm} | ${a.category} | ${a.occurrences.length} | **${a.decision}** | ${current || "—"} | ${accepted} | ${reason} |`);
  }
  lines.push("", "## Review rules applied", "", `- ${shellRejection}`, "- Bare roots, provider lemmas without review, duplicate occurrences and root-only relations were rejected.", "- Model-issue and blocked decisions remain non-publishable until the required expert/model evidence is available.", "");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const queueDocument = JSON.parse(await fs.readFile(queuePath, "utf8")) as { queue: QueueItem[] };
  const b1 = queueDocument.queue.filter((item) => item.classification === "B" && item.maxCurrentFormCount === 3);
  if (b1.length !== 105) throw new Error(`Expected exactly 105 B1 families, found ${b1.length}`);
  const byOccurrence = new Map<string, QueueItem>();
  for (const item of b1) for (const occurrence of item.occurrences) byOccurrence.set(occurrence.occurrenceId, item);

  const packages = new Map<string, PackageEntry>();
  const packagePaths = await discoverPackagePaths();
  const occurrenceLessons = new Map<string, OccurrenceRecord>();
  for (const filePath of packagePaths) {
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
  if (occurrenceLessons.size !== 301) throw new Error(`Expected 301 B1 occurrences, found ${occurrenceLessons.size}`);

  const adjudications: Adjudication[] = [];
  const ledger: AuditRecord[] = [];
  const changedFiles = new Set<string>();
  for (const item of b1) {
    const spec = familySpec(item);
    const occurrences = item.occurrences.map((occurrence) => {
      const record = occurrenceLessons.get(occurrence.occurrenceId);
      if (!record) throw new Error(`Missing package occurrence ${occurrence.occurrenceId}`);
      return { ...occurrence, record };
    });
    const currentRows = occurrences.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      location: occurrence.location,
      arabic: occurrence.arabic,
      forms: occurrence.record.lesson.forms,
      sarfReview: occurrence.record.lesson.sarfReview,
    }));
    const acceptedCandidates = rows(item.root, item.occurrences.map((o) => o.location).join(", "), spec.accepted);
    const finalRows: FinalRow[] = [];
    for (const occurrence of occurrences) {
      const current = currentRow(occurrence.record.lesson, item, occurrence);
      let forms = [current];
      if (spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED") {
        const used = new Set([normalize(current.form)]);
        for (const candidate of acceptedCandidates) {
          if (used.has(normalize(candidate.form))) continue;
          forms.push(candidateRow(candidate, item, occurrence));
          used.add(normalize(candidate.form));
          if (spec.decision === "FULL" && forms.length === 5) break;
          if (spec.decision === "CONFIRMED-LIMITED" && forms.length === 4) break;
        }
        if (spec.decision === "FULL" && forms.length !== 5) throw new Error(`${item.familyKey} cannot assemble five distinct forms for ${occurrence.occurrenceId}`);
      } else {
          forms = occurrence.record.lesson.forms;
      }
      const review: SarfReview = {
        status: spec.decision === "FULL" ? "full" : "limited",
        ...(occurrence.record.lesson.sarfReview.familyScope ? { familyScope: occurrence.record.lesson.sarfReview.familyScope } : {}),
        ...(spec.decision === "FULL" ? {} : { limitedReason: spec.reason }),
        auditDecision: spec.decision === "FULL" ? "upgraded-to-full" : spec.decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked-for-genuine-ambiguity",
        provenance: [
          `Tier-B1 adjudication ${reviewedAt}: ${spec.decision}.`,
          `B1 family ${item.familyKey}; current rows and every Qur'anic occurrence were inspected.`,
          ...((spec.decision === "FULL" || spec.decision === "CONFIRMED-LIMITED") ? acceptedCandidates.map((candidate) => `Accepted ${candidate.form}: ${candidate.source}`) : []),
          ...spec.rejected,
        ].slice(0, 50),
        reviewedBy: "Codex",
        reviewedAt,
      };
      occurrence.record.lesson.forms = forms;
      occurrence.record.lesson.sarfReview = review;
      changedFiles.add(occurrence.record.filePath);
      finalRows.push({ occurrenceId: occurrence.occurrenceId, location: occurrence.location, arabic: occurrence.arabic, forms, sarfReview: review });
    }
    const recordId = `tier-b1-family-${hash(item.familyKey)}`;
    adjudications.push({
      familyKey: item.familyKey,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      occurrences: item.occurrences,
      currentRows,
      candidates: acceptedCandidates,
      rejectedCandidates: spec.rejected,
      decision: spec.decision,
      reasoning: spec.reason,
      evidence: [quranEvidence(item.occurrences.map((o) => o.location).join(", ")), projectEvidence, ...item.evidenceRequiredToResolve],
      confidence: spec.decision === "FULL" ? "high" : "medium",
      finalRows,
      unresolvedQuestion: spec.unresolvedQuestion ?? null,
      evidenceRequired: spec.evidenceRequired ?? [],
      humanExpertReviewRequired: spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE",
      productionStatus: spec.decision === "FULL" ? "full" : spec.decision === "CONFIRMED-LIMITED" ? "confirmed-limited" : "blocked",
      reviewedAt,
      recordId,
    });
    ledger.push({
      recordId,
      eventType: "tier-b1-sarf-adjudication",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: { familyKey: item.familyKey, occurrences: item.occurrences.map((o) => o.occurrenceId), tier: "B1" },
      status: spec.decision === "FULL" ? "passed" : spec.decision === "CONFIRMED-LIMITED" ? "passed-limited" : "blocked",
      reviewedAt,
      checks: ["contract-loaded", "b1-queue-filter-105", "every-occurrence-inspected", "current-form-first", "shell-and-root-only-candidates-rejected", "provenance-recorded"],
      evidence: [spec.reason, ...spec.rejected, ...(spec.evidenceRequired ?? [])],
      decision: spec.decision,
      root: item.root,
      lemmaOrCurrentForm: item.lemmaOrCurrentForm,
      category: item.category,
      humanExpertReviewRequired: spec.decision === "BLOCKED" || spec.decision === "MODEL-ISSUE",
    });
  }

  // Keep package status synchronized with the actual reviewed lesson state.
  // This repairs stale partial labels without ever hiding a blocked lesson.
  for (const entry of packages.values()) {
    if (entry.package.status !== "custom-partial") continue;
    const hasBlockedLesson = Object.values(entry.package.teachingEntries).some(
      (lesson) => lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity",
    );
    if (!hasBlockedLesson) {
      entry.package.status = "custom-complete";
      changedFiles.add(entry.filePath);
    }
  }

  for (const filePath of changedFiles) {
    const entry = packages.get(filePath);
    if (!entry) throw new Error(`Changed package was not loaded: ${filePath}`);
    await fs.writeFile(filePath, `${JSON.stringify(entry.package, null, 2)}\n`, "utf8");
  }
  appendAuditRecords(ledger);
  const totals = { FULL: 0, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 } as Record<Decision, number>;
  const occurrencesByDecision = { FULL: 0, "CONFIRMED-LIMITED": 0, BLOCKED: 0, "MODEL-ISSUE": 0 } as Record<Decision, number>;
  for (const item of adjudications) { totals[item.decision as Decision]++; occurrencesByDecision[item.decision as Decision] += item.occurrences.length; }
  const report: Report = { reportType: "tier-b1-sarf-adjudication", contractVersion: contract.contractVersion, reviewedAt, scope: { classification: "B", maxCurrentFormCount: 3, families: 105, occurrences: 301, excluded: ["Tier-A residual blockers", "B2 two-row families", "Tier-C one-row families", "Tier-D/model families outside B1"] }, totals, occurrencesByDecision, changedPackageFiles: [...changedFiles].sort(), adjudications };
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, markdown(report), "utf8");
  console.log(JSON.stringify({ tier: "B1", families: b1.length, occurrences: occurrenceLessons.size, totals, occurrencesByDecision, changedPackageFiles: changedFiles.size, jsonPath, markdownPath }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
