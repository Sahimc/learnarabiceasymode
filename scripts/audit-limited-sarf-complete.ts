import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { appendAuditRecords, readAuditRecords, type AuditRecord } from "./lib/review-ledger";
import { pool } from "./lib/db";
import { assertAuthoringContract } from "./lib/authoring-contract";

type JsonObject = Record<string, unknown>;

type PackageWord = {
  id: string;
  position: number;
  arabic: string;
  gloss?: string;
  teachingId?: string;
  [key: string]: unknown;
};

type PackageAyah = {
  id: string;
  number: number;
  arabic?: string;
  words: PackageWord[];
  [key: string]: unknown;
};

type LessonForm = {
  form: string;
  meaning: string;
  difference: string;
  relationship?: string;
  provenance?: string;
};

type SarfReview = {
  status: "full" | "limited";
  limitedReason?: string;
  auditDecision?:
    | "confirmed-limited"
    | "upgraded-to-full"
    | "blocked-for-genuine-ambiguity";
  provenance: string[];
  reviewedBy: string;
  reviewedAt: string;
};

type TeachingLesson = {
  id: string;
  meaning: string;
  type: string;
  root: string;
  rootPicture: string;
  forms: LessonForm[];
  sarfReview: SarfReview;
  [key: string]: unknown;
};

type SourcePackage = {
  packageId: string;
  contentVersion: string;
  status: "source-only" | "custom-partial" | "custom-complete";
  surah: { number: number; name?: string };
  ayahs: PackageAyah[];
  teachingEntries: Record<string, TeachingLesson>;
  [key: string]: unknown;
};

type Feature = { key?: string; label?: string; value?: string };

type ProviderEvidence = {
  occurrenceId: string;
  recordKey: string;
  version: string;
  root: string;
  lemma: string;
  pattern: string;
  partOfSpeech: string;
  lexicalStem?: string;
  features: Feature[];
};

type ProviderRow = {
  occurrence_id: string;
  record_key: string | null;
  version: string | null;
  part_of_speech: string | null;
  features: unknown;
};

type Occurrence = {
  packagePath: string;
  pkg: SourcePackage;
  ayah: PackageAyah;
  word: PackageWord;
  lesson: TeachingLesson;
  provider?: ProviderEvidence;
};

type Candidate = LessonForm & {
  score: number;
  sourceOccurrence?: string;
  sourceKind:
    | "canonical-occurrence"
    | "existing-reviewed-row"
    | "codex-authored-lexicon";
  featureSignal: string[];
  baseDistinct: boolean;
  lexicalKey: string;
};

type Decision = "confirmed-limited" | "upgraded-to-full" | "blocked-for-genuine-ambiguity";

const repositoryRoot = process.cwd();
const packagesRoot = path.join(repositoryRoot, "content-import", "surahs");
const apply = process.argv.includes("--apply");
const auditSurahNumbers = new Set(
  (process.env.AUDIT_SURAH_NUMBERS ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0),
);
const reviewedAt = new Date().toISOString();
const auditBatchId = `limited-sarf-audit-${crypto.randomBytes(8).toString("hex")}`;
const contract = assertAuthoringContract("complete limited Ṣarf audit");
const TRUSTED_AUTHORED_LESSONS = new Set([
  "lesson:qul",
  "lesson:daybreak",
  "lesson:nas",
  "lesson:69:1:1",
  "lesson:103:tawasaw",
  "lesson:104:yunbadhanna",
]);

const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const DIACRITIC_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED]/gu;
const DIACRITIC_TEST_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED]/u;
const PLACEHOLDER_PATTERN =
  /root[- ]letter|root skeleton|dictionary form connected|lemma \/ dictionary|case or pattern used|(?:nominative|accusative|genitive) ending(?: pattern)?|related verbal ending|recognition variant|related grammatical (?:word|form)|the form used in this occurrence|^lexical stem$|^additional root|^base grammatical form$|^inflected form$|^basic (?:noun|verb|form)$|^base (?:noun|verb|form)$|^related (?:adjective|noun|verb|form)$|^common noun$|^definite expression$|^past verb$|^present verb$/iu;
const GENERIC_DESCRIPTION_PATTERN =
  /\b(?:past|present)\s+verb\b|common noun from the same|related verbal noun|intensified related noun|common base form|^a related form for\b/iu;

function trustedDifference(root: string, form: string, existing: string) {
  const key = `${rootKey(root)}|${normalized(form)}`;
  const replacements: Record<string, string> = {
    ["نبذ|يُنۢبَذُ"]:
      "Form I imperfect passive; the throwing-away action is received by the subject.",
    ["نبذ|يَنْبِذُ"]:
      "Form I imperfect active; the subject performs the action of casting away.",
    ["وصي|تَوَاصَىٰ"]:
      "Form VI perfect, third-person masculine singular reciprocal; he enjoined mutually.",
    ["وصي|يَتَوَاصَىٰ"]:
      "Form VI imperfect, third-person masculine singular reciprocal; he is mutually enjoining.",
    ["وصي|وَصِيَّةٌ"]:
      "Verbal noun/noun of instruction or bequest; it names the act or thing enjoined.",
    ["قول|قَالَ"]:
      "Form I perfect, third-person masculine singular; he said, a completed saying.",
    ["قول|يَقُولُ"]:
      "Form I imperfect, third-person masculine singular; he says or is saying.",
    ["قول|نَقُولُ"]:
      "Form I imperfect, first-person plural; the نـ prefix marks ‘we say’.",
    ["أنس|نَاس"]:
      "Indefinite plural noun; the group is mentioned without the definite article.",
    ["أنس|ٱلنَّاس"]:
      "Definite plural noun; the ال article marks the group as ‘the people/humankind’.",
  };
  if (replacements[key]) return replacements[key];
  if (GENERIC_DESCRIPTION_PATTERN.test(existing) || /^\s*(?:past tense|present tense|passive present|active present|singular reciprocal form|present reciprocal form|noun from the same root|[نن]َ points to we)\s*$/iu.test(existing))
    return undefined;
  return existing;
}

function curatedCandidates(root: string): Candidate[] {
  const families: Record<string, Array<Omit<Candidate, "score" | "sourceKind"> & { score?: number }>> = {
    ["وصي"]: [
      {
        form: "وَصَّىٰ",
        meaning: "he instructed or charged",
        difference:
          "Form II perfect; the doubled middle radical marks an intensive or causative act of instructing or charging.",
        relationship: "Form II of the و ص ي root; a genuine derived verb meaning to instruct or charge.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical و ص ي occurrences and standard Arabic Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "وصى",
      },
      {
        form: "يُوَصِّي",
        meaning: "he instructs or charges",
        difference:
          "Form II imperfect; the present/imperfect prefix and doubled middle radical show an ongoing act of instructing or charging.",
        relationship: "Form II imperfect of the و ص ي root; related to the Qur'anic instruction family.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical و ص ي occurrences and standard Arabic Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يوصي",
      },
      {
        form: "أَوْصَىٰ",
        meaning: "he instructed or bequeathed",
        difference:
          "Form IV perfect; the أَ prefix marks a derived causative/instructive form meaning he instructed or bequeathed.",
        relationship: "Form IV of the و ص ي root; a genuine derived verb used for instructing or bequeathing.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical و ص ي occurrences and standard Arabic Form IV morphology.",
        featureSignal: ["pattern:form-4", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "اوصى",
      },
      {
        form: "يُوصِي",
        meaning: "he instructs or bequeaths",
        difference:
          "Form IV imperfect; the derived imperfect form expresses an ongoing act of instructing or bequeathing.",
        relationship: "Form IV imperfect of the و ص ي root; related to the Qur'anic instruction family.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical و ص ي occurrences and standard Arabic Form IV morphology.",
        featureSignal: ["pattern:form-4", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يوصي",
      },
      {
        form: "وَصِيَّةٌ",
        meaning: "instruction or bequest",
        difference:
          "Verbal noun/noun; it names the instruction or bequest rather than expressing the act as a finite verb.",
        relationship: "A genuine noun of the و ص ي family meaning an instruction, charge or bequest.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical و ص ي occurrences and standard Arabic derivational morphology.",
        featureSignal: ["partofspeech:noun", "derivation:verbal-noun"],
        baseDistinct: true,
        lexicalKey: "وصية",
      },
    ],
    ["وسوس"]: [
      {
        form: "وَسْوَسَ",
        meaning: "he whispered",
        difference:
          "Form I perfect of the quadriliteral root; it describes a completed act of whispering or prompting inwardly.",
        relationship: "Form I perfect of the و س و س root; the finite verb names the completed whispering action.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical Qur'anic occurrences of و س و س and standard Arabic quadriliteral morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "وسوس",
      },
      {
        form: "يُوَسْوِسُ",
        meaning: "he whispers",
        difference:
          "Form I imperfect, third-person masculine singular; the imperfect prefix marks an ongoing or repeated whispering action.",
        relationship: "Form I imperfect of the و س و س root; it is the finite present/imperfect counterpart of وَسْوَسَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical Qur'anic occurrence word:114:5:2 and aligned morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يوسوس",
      },
      {
        form: "وَسْوَسَةٌ",
        meaning: "whispering or inward prompting",
        difference:
          "Verbal noun; it names the act or process of whispering rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of the و س و س root, expressing the whispering action as a noun.",
        provenance:
          "Codex-authored after review of the approved project root meaning and standard Arabic quadriliteral verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "وسوسة",
      },
      {
        form: "مُوَسْوِسٌ",
        meaning: "a whisperer or one who whispers",
        difference:
          "Active participle; it describes the agent characterized by performing the whispering action.",
        relationship: "A genuine active-participle form of the و س و س root, related to the agent noun ٱلْوَسْوَاسِ.",
        provenance:
          "Codex-authored after review of the approved project root meaning and standard Arabic quadriliteral active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "موسوس",
      },
    ],
    ["خنس"]: [
      {
        form: "خَنَسَ",
        meaning: "he withdrew or retreated",
        difference:
          "Form I perfect; it expresses a completed withdrawal or retreat.",
        relationship: "Form I perfect of the خ ن س root; the finite verb states the completed act underlying the retreating description.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical Qur'anic occurrences of خ ن س and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "خنس",
      },
      {
        form: "يَخْنِسُ",
        meaning: "he withdraws or retreats",
        difference:
          "Form I imperfect, third-person masculine singular; the imperfect form describes an ongoing or repeated retreat.",
        relationship: "Form I imperfect of the خ ن س root; it is the ongoing counterpart of خَنَسَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يخنس",
      },
      {
        form: "خُنُوسٌ",
        meaning: "withdrawal or retreat",
        difference:
          "Verbal noun; it names the act or state of withdrawing rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of the خ ن س root, naming the retreating action.",
        provenance:
          "Codex-authored after review of the approved project root meaning and standard Arabic Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "خنوس",
      },
      {
        form: "خَنَّسَ",
        meaning: "he caused to withdraw",
        difference:
          "Form II perfect; the doubled middle radical marks a causative/intensive derived action of making something retreat.",
        relationship: "Form II perfect of the خ ن س root; a genuine derived causative relationship to the retreating family.",
        provenance:
          "Codex-authored after review of the approved project root meaning and standard Arabic Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "خنس",
      },
    ],
    ["غسق"]: [
      {
        form: "غَسَقَ",
        meaning: "it became dark",
        difference: "Form I perfect; it states the completed onset or intensification of darkness.",
        relationship: "Form I perfect of the غ س ق root; the action from which غَاسِقٌ is derived.",
        provenance: "Codex-authored after review of the approved project root meaning, Qur'anic evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "غسق",
      },
      {
        form: "يَغْسِقُ",
        meaning: "it becomes dark",
        difference: "Form I imperfect, third-person masculine singular; it presents the darkening as ongoing or recurring.",
        relationship: "Form I imperfect of the غ س ق root; the ongoing counterpart of غَسَقَ.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يغسق",
      },
      {
        form: "غُسُوقٌ",
        meaning: "darkening or onset of darkness",
        difference: "Verbal noun; it names the process of becoming dark rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of the غ س ق root, naming the darkening action.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "غسوق",
      },
      {
        form: "غَسَّاقٌ",
        meaning: "an intensely cold or foul fluid",
        difference: "Intensive derived noun; the doubled middle radical conveys an intensified result associated with the root’s darkness and severity range.",
        relationship: "A genuine intensive derivative of the غ س ق root, attested in Qur'anic usage as غَسَّاقًا.",
        provenance: "Codex-authored after review of canonical Qur'anic evidence (78:25), the approved project root meaning and standard Arabic derivational morphology.",
        featureSignal: ["pattern:intensive", "partofspeech:noun", "source:canonical-quranic"],
        baseDistinct: true,
        lexicalKey: "غساق",
      },
    ],
    ["وقب"]: [
      {
        form: "يَقِبُ",
        meaning: "it settles or enters",
        difference: "Form I imperfect; the imperfect prefix presents the entering or settling as ongoing.",
        relationship: "Form I imperfect of the و ق ب root; the ongoing counterpart of وَقَبَ.",
        provenance: "Codex-authored after review of the approved project root meaning, the existing reviewed project lesson and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يقب",
      },
      {
        form: "وَقْبٌ",
        meaning: "an entering or deepening",
        difference: "Related noun; it names the event or result of entering or settling rather than expressing it as a finite verb.",
        relationship: "A genuine noun of the و ق ب root related to the action وَقَبَ.",
        provenance: "Codex-authored after review of the approved project root meaning and the existing reviewed project lesson.",
        featureSignal: ["partofspeech:noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "وقب",
      },
      {
        form: "وُقُوبٌ",
        meaning: "entering or settling",
        difference: "Verbal noun; it names the process of entering or settling as an event.",
        relationship: "A genuine verbal noun of the و ق ب root, related to وَقَبَ and يَقِبُ.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "وقوب",
      },
      {
        form: "وَاقِبٌ",
        meaning: "entering or settling",
        difference: "Active participle; it describes something characterized by entering or settling.",
        relationship: "A genuine active participle of the و ق ب root, related to the action وَقَبَ.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "واقب",
      },
    ],
    ["نفث"]: [
      {
        form: "نَفَثَ",
        meaning: "he blew lightly",
        difference: "Form I perfect; it describes a completed act of lightly blowing or releasing breath.",
        relationship: "Form I perfect of the ن ف ث root; the finite action underlying نَفَّاثٌ.",
        provenance: "Codex-authored after review of the approved project root meaning, canonical Qur'anic evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "نفث",
      },
      {
        form: "يَنْفُثُ",
        meaning: "he blows lightly",
        difference: "Form I imperfect; it presents the blowing as ongoing or repeated.",
        relationship: "Form I imperfect of the ن ف ث root; the ongoing counterpart of نَفَثَ.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "ينفث",
      },
      {
        form: "نَفْثٌ",
        meaning: "light blowing or breath",
        difference: "Verbal noun; it names the act of blowing rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of the ن ف ث root, naming the blowing action.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "نفث",
      },
      {
        form: "نَفَّاثٌ",
        meaning: "one who blows repeatedly",
        difference: "Intensive active participle; the doubled middle radical and agent pattern describe repeated blowing.",
        relationship: "A genuine intensive agent form of the ن ف ث root, related to ٱلنَّفَّاثَاتِ.",
        provenance: "Codex-authored after review of canonical Qur'anic evidence (113:4) and standard Arabic intensive-agent morphology.",
        featureSignal: ["pattern:intensive", "partofspeech:active-participle", "number:singular"],
        baseDistinct: true,
        lexicalKey: "نفاث",
      },
    ],
    ["عقد"]: [
      {
        form: "عَقَدَ",
        meaning: "he tied or bound",
        difference: "Form I perfect; it states the completed act of tying or binding.",
        relationship: "Form I perfect of the ع ق د root; the action underlying عُقْدَةٌ and ٱلْعُقَدِ.",
        provenance: "Codex-authored after review of the approved project root meaning, canonical Qur'anic evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "عقد",
      },
      {
        form: "يَعْقِدُ",
        meaning: "he ties or binds",
        difference: "Form I imperfect; it presents the tying or binding as ongoing or repeated.",
        relationship: "Form I imperfect of the ع ق د root; the ongoing counterpart of عَقَدَ.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يعقد",
      },
      {
        form: "عُقْدَةٌ",
        meaning: "a knot",
        difference: "Singular noun; it names one tied knot, while ٱلْعُقَدِ is the broken plural.",
        relationship: "The singular noun corresponding to the broken plural ٱلْعُقَدِ in the ع ق د family.",
        provenance: "Codex-authored after review of the approved project root meaning and canonical Qur'anic evidence (20:27 and 2:235).",
        featureSignal: ["partofspeech:noun", "number:singular"],
        baseDistinct: true,
        lexicalKey: "عقدة",
      },
      {
        form: "عَقْدٌ",
        meaning: "binding or a contract",
        difference: "Verbal noun/noun; it names the act or result of binding rather than the individual knot.",
        relationship: "A genuine verbal noun/noun of the ع ق د root, related to tying, binding and contracting.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic derivational morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:result-noun"],
        baseDistinct: true,
        lexicalKey: "عقد",
      },
    ],
    ["حسد"]: [
      {
        form: "حَسَدَ",
        meaning: "he envied",
        difference: "Form I perfect; it states the completed act of envying.",
        relationship: "Form I perfect of the ح س د root; the action underlying حَاسِدٌ.",
        provenance: "Codex-authored after review of the approved project root meaning, canonical Qur'anic evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حسد",
      },
      {
        form: "يَحْسُدُ",
        meaning: "he envies",
        difference: "Form I imperfect; it presents envying as ongoing or habitual.",
        relationship: "Form I imperfect of the ح س د root; the ongoing counterpart of حَسَدَ.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يحسد",
      },
      {
        form: "حَسَادَةٌ",
        meaning: "envy",
        difference: "Derived noun; it names the enduring quality or feeling of envy rather than the person who performs it.",
        relationship: "A genuine noun of the ح س د root, related to the verb حَسَدَ and the agent noun حَاسِدٌ.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic derivational morphology.",
        featureSignal: ["partofspeech:noun", "derivation:quality-noun"],
        baseDistinct: true,
        lexicalKey: "حسادة",
      },
      {
        form: "حَاسِدٌ",
        meaning: "an envier",
        difference: "Active participle; it describes the person who performs the action of envying.",
        relationship: "A genuine active-participle form of the ح س د root, contrasting the envier with the envied.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "حاسد",
      },
      {
        form: "مَحْسُودٌ",
        meaning: "envied",
        difference: "Passive participle; it describes the person or thing that is the object of envy.",
        relationship: "A genuine passive-participle relationship to the ح س د root, contrasting the envier with the envied.",
        provenance: "Codex-authored after review of the approved project root meaning and standard Arabic passive-participle morphology.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "role:object-of-action"],
        baseDistinct: true,
        lexicalKey: "محسود",
      },
    ],
    ["صمد"]: [
      {
        form: "صَمَدَ",
        meaning: "he stood firm or persisted",
        difference:
          "Form I perfect; it describes a completed act or state of standing firm, persisting or holding toward a goal.",
        relationship:
          "Form I perfect of the ص م د root; its firmness and deliberate orientation are part of the semantic range behind ٱلصَّمَدُ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "صمد",
      },
      {
        form: "يَصْمُدُ",
        meaning: "he stands firm or persists",
        difference:
          "Form I imperfect, third-person masculine singular; the imperfect form presents firmness or persistence as ongoing.",
        relationship:
          "Form I imperfect of the ص م د root; it is the ongoing counterpart of صَمَدَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يصمد",
      },
      {
        form: "صُمُودٌ",
        meaning: "steadfastness or persistence",
        difference:
          "Verbal noun; it names the quality or act of standing firm rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun of the ص م د root, naming the firmness and persistence associated with the family.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic derivational morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "صمود",
      },
      {
        form: "صَامِدٌ",
        meaning: "steadfast or one who stands firm",
        difference:
          "Active participle; it describes a person or thing characterized by standing firm or persisting.",
        relationship:
          "A genuine active-participle form of the ص م د root, connecting the root's firmness to a described agent or state.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "صامد",
      },
    ],
    ["كفأ"]: [
      {
        form: "كُفْءٌ",
        meaning: "an equal or match",
        difference:
          "Basic noun/adjective; it names someone or something equal or suitable as a counterpart, without the Qur'anic accusative ending.",
        relationship:
          "A genuine base noun/adjective of the ك ف أ family, directly related in meaning to كُفُوًا.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and the existing reviewed project row.",
        featureSignal: ["partofspeech:noun/adjective", "derivation:base-form"],
        baseDistinct: true,
        lexicalKey: "كفء",
      },
      {
        form: "أَكْفَاءُ",
        meaning: "equals or peers",
        difference:
          "Broken plural; it refers to multiple equals or peers rather than one equal in the current occurrence.",
        relationship:
          "The established broken plural of the ك ف أ noun/adjective family.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and the existing reviewed project row.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "اكفاء",
      },
      {
        form: "تَكَافَأَ",
        meaning: "they matched or were equal",
        difference:
          "Form VI perfect; the reciprocal pattern presents two or more sides as matching or being equal to one another.",
        relationship:
          "A genuine Form VI reciprocal verb of the ك ف أ root, extending the equality relationship into an action between counterparts.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form VI morphology.",
        featureSignal: ["pattern:form-6", "tense:perfect", "voice:reciprocal"],
        baseDistinct: true,
        lexicalKey: "تكافأ",
      },
      {
        form: "كَافَأَ",
        meaning: "he matched or rewarded in return",
        difference:
          "Form III perfect; the reciprocal-facing pattern expresses responding to another with an equivalent act, including matching or recompensing.",
        relationship:
          "A genuine Form III verb of the ك ف أ root, showing how the equality sense develops into reciprocal matching or recompense.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form III morphology.",
        featureSignal: ["pattern:form-3", "tense:perfect", "voice:reciprocal-facing"],
        baseDistinct: true,
        lexicalKey: "كافأ",
      },
      {
        form: "تَكَافُؤٌ",
        meaning: "equivalence or mutual equality",
        difference:
          "Verbal noun of the reciprocal pattern; it names the state or relationship of being equal rather than expressing a finite verb.",
        relationship:
          "The genuine Form VI verbal noun of تَكَافَأَ, retaining the ك ف أ meaning of equivalence and matching.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form VI verbal-noun morphology.",
        featureSignal: ["pattern:form-6", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تكافؤ",
      },
    ],
    ["تبب"]: [
      {
        form: "تَبَّ",
        meaning: "he perished or was ruined",
        difference:
          "Form I perfect, third-person masculine singular; it states the completed ruin without the feminine agreement ending in تَبَّتْ.",
        relationship:
          "Form I perfect of the ت ب ب root; it is the masculine counterpart of the current feminine-marked occurrence.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and canonical Qur'anic occurrences in Sūrah 111.",
        featureSignal: ["pattern:form-1", "tense:perfect", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "تب",
      },
      {
        form: "يَتِبُّ",
        meaning: "he perishes or is ruined",
        difference:
          "Form I imperfect, third-person masculine singular; the imperfect form presents ruin as ongoing or expected.",
        relationship:
          "Form I imperfect of the ت ب ب root, the ongoing counterpart of تَبَّ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يتب",
      },
      {
        form: "تَبَابٌ",
        meaning: "ruin or destruction",
        difference:
          "Verbal noun; it names the state or result of perishing rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun of the ت ب ب root, naming ruin and destruction as a concept.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy lexicon evidence.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تباب",
      },
      {
        form: "تَبَّبَ",
        meaning: "he destroyed or caused to perish",
        difference:
          "Form II perfect; the doubled middle radical presents a causative/intensive act of bringing about ruin.",
        relationship:
          "A genuine Form II derived verb of the ت ب ب root, related to the root's ruin meaning but showing an agent causing destruction.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "تبب",
      },
    ],
    ["فوج"]: [
      {
        form: "فَوْجٌ",
        meaning: "a group or troop",
        difference:
          "Singular noun; it names one group, while the current Qur'anic form is a plural meaning groups.",
        relationship:
          "The singular noun of the ف و ج family; it contrasts one group with the current plural أَفْوَاجًا.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical Qur'anic occurrences of فَوْجٌ and the Arabic Academy lexicon entry for الفَوْج.",
        featureSignal: ["partofspeech:noun", "number:singular", "derivation:base-form"],
        baseDistinct: true,
        lexicalKey: "فوج",
      },
      {
        form: "فُؤُوجٌ",
        meaning: "groups or troops",
        difference:
          "Alternate broken plural; it expresses the same group concept through a different established plural pattern from أَفْوَاجًا.",
        relationship:
          "An established broken plural of فَوْجٌ in the ف و ج family, listed with أَفْوَاجٌ in the Arabic Academy lexicon.",
        provenance:
          "Codex-authored after review of the Arabic Academy lexicon entry for الفَوْج, which lists فُؤُوجٌ as an established plural, and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "فؤوج",
      },
      {
        form: "أَفَاوِجُ",
        meaning: "groups or crowds",
        difference:
          "Plural-of-plural noun; it refers to multiple groups, giving a genuine number/derivation contrast beyond the current broken plural.",
        relationship:
          "An established plural-of-plural associated with فَوْجٌ in the Arabic Academy lexicon entry for الفَوْج.",
        provenance:
          "Codex-authored after review of the Arabic Academy lexicon entry for الفَوْج, which lists أَفَاوِجُ as a plural-of-plural, and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural-of-plural", "derivation:plural-of-plural"],
        baseDistinct: true,
        lexicalKey: "افاوج",
      },
      {
        form: "فَوَّجَ",
        meaning: "he sent or divided into groups",
        difference:
          "Form II perfect; the doubled middle radical turns the group noun into a derived action of sending or arranging people in groups.",
        relationship:
          "A genuine Form II verb of the ف و ج root; the Arabic Academy lexicon defines فَوَّجَ القومَ as أَفاجَهم and gives sending pilgrims in groups as an example.",
        provenance:
          "Codex-authored after review of the Arabic Academy lexicon entry for فَوَّجَ, the approved project root meaning and standard Arabic Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:perfect", "partofspeech:verb", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "فوج",
      },
    ],
    ["نحر"]: [
      {
        form: "نَحَرَ",
        meaning: "he sacrificed or slaughtered",
        difference:
          "Form I perfect; it states a completed act of sacrificing, slaughtering or striking at the throat, while the current occurrence is an imperative command.",
        relationship:
          "Form I perfect of the ن ح ر root; it is the completed-action counterpart of the current imperative ٱنْحَرْ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the Arabic Academy lexicon entry for نَحَرَ and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "نحر",
      },
      {
        form: "يَنْحَرُ",
        meaning: "he sacrifices or slaughters",
        difference:
          "Form I imperfect, third-person masculine singular; it presents sacrificing or slaughtering as ongoing or habitual.",
        relationship:
          "Form I imperfect of the ن ح ر root; it is the ongoing counterpart of نَحَرَ and the indicative counterpart of the command.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the Arabic Academy lexicon entry for نَحَرَ and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "ينحر",
      },
      {
        form: "نَحْرٌ",
        meaning: "sacrifice or slaughtering",
        difference:
          "Verbal noun; it names the act of sacrificing or slaughtering rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun of the ن ح ر root, naming the action expressed by نَحَرَ and ٱنْحَرْ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the Arabic Academy lexicon entry for نَحَرَ and standard Arabic Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "نحر",
      },
      {
        form: "نَحَّرَ",
        meaning: "he slaughtered many animals",
        difference:
          "Form II perfect; the doubled middle radical marks an intensified or repeated slaughtering action.",
        relationship:
          "A genuine Form II verb of the ن ح ر root; the Arabic Academy lexicon defines نَحَّرَ الإبلَ as slaughtering many camels or similar animals.",
        provenance:
          "Codex-authored after review of the Arabic Academy lexicon entry for نَحَّرَ and standard Arabic Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:perfect", "partofspeech:verb", "voice:intensive"],
        baseDistinct: true,
        lexicalKey: "نحر",
      },
    ],
    ["شنأ"]: [
      {
        form: "شَنَأَ",
        meaning: "he hated or detested",
        difference:
          "Form I perfect; it states a completed act or settled attitude of hating, while the current occurrence is the active participle naming the hater.",
        relationship:
          "Form I perfect of the ش ن أ root; it is the finite verb underlying شَانِئٌ and the current شَانِئَكَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the Quranic Arabic Corpus root entry for ش ن أ and reliable Arabic lexicon evidence for شَنَأَ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "شنأ",
      },
      {
        form: "يَشْنَأُ",
        meaning: "he hates or detests",
        difference:
          "Form I imperfect, third-person masculine singular; it presents hatred as ongoing or habitual rather than naming the hater as a noun.",
        relationship:
          "Form I imperfect of the ش ن أ root; it is the ongoing counterpart of شَنَأَ.",
        provenance:
          "Codex-authored after review of reliable Arabic conjugation and lexicon evidence for شَنَأَ / يَشْنَأُ, together with the Quranic Arabic Corpus root entry for ش ن أ.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يشنأ",
      },
      {
        form: "شَنَآنٌ",
        meaning: "hatred or hostility",
        difference:
          "Verbal noun; it names the hostility itself rather than the person who hates, and it is the Qur'anic form seen in 5:2 and 5:8.",
        relationship:
          "A genuine verbal noun of the ش ن أ root, attested in the Qur'an as شَنَآنُ قَوْمٍ and semantically connected to شَانِئَكَ.",
        provenance:
          "Codex-authored after review of canonical Qur'anic occurrences 5:2 and 5:8, the Quranic Arabic Corpus root entry for ش ن أ and reliable Arabic lexicon evidence.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun", "source:canonical-quranic"],
        baseDistinct: true,
        lexicalKey: "شنآن",
      },
      {
        form: "مَشْنُوءٌ",
        meaning: "hated or detested",
        difference:
          "Passive participle; it describes someone or something that is hated, contrasting the object of hatred with the active hater in شَانِئَكَ.",
        relationship:
          "A genuine passive-participle form of the ش ن أ root, recorded in Arabic lexicon evidence as مَشْنُوءٌ.",
        provenance:
          "Codex-authored after review of Lane's Lexicon and classical Arabic lexicon evidence for مَشْنُوءٌ, alongside the approved project root meaning.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "role:object-of-action"],
        baseDistinct: true,
        lexicalKey: "مشنوء",
      },
    ],
    ["بتر"]: [
      {
        form: "بَتَرَ",
        meaning: "he cut off or severed",
        difference:
          "Form I perfect; it states the completed act of cutting off, while the current occurrence is the resulting adjective describing one cut off.",
        relationship:
          "Form I perfect of the ب ت ر root; it is the action underlying أَبْتَرُ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the Arabic Academy lexicon entry for بَتَرَ and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "بتر",
      },
      {
        form: "يَبْتُرُ",
        meaning: "he cuts off or severs",
        difference:
          "Form I imperfect, third-person masculine singular; it presents severing as ongoing or habitual.",
        relationship:
          "Form I imperfect of the ب ت ر root; it is the ongoing counterpart of بَتَرَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the Arabic Academy lexicon entry for بَتَرَ and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يبتر",
      },
      {
        form: "بَتْرٌ",
        meaning: "cutting off or severance",
        difference:
          "Verbal noun; it names the act or result of severing rather than describing the person or thing left cut off.",
        relationship:
          "A genuine verbal noun of the ب ت ر root, naming the severing action behind أَبْتَرُ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the Arabic Academy lexicon entry for بَتَرَ and standard Arabic Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "بتر",
      },
      {
        form: "انْبَتَرَ",
        meaning: "it became severed or was cut off",
        difference:
          "Form VII perfect; the inchoative/intransitive pattern presents something as becoming severed or cut off rather than an agent cutting it.",
        relationship:
          "A genuine Form VII derived verb of the ب ت ر root, listed among the established related forms of بَتَرَ.",
        provenance:
          "Codex-authored after review of the Arabic Academy lexicon entry for بَتَرَ, which lists انْبَتَرَ, and standard Arabic Form VII morphology.",
        featureSignal: ["pattern:form-7", "tense:perfect", "partofspeech:verb", "voice:intransitive"],
        baseDistinct: true,
        lexicalKey: "انبتَر",
      },
    ],
    ["كسب"]: [
      {
        form: "يَكْسِبُ",
        meaning: "he earns or gains",
        difference:
          "Form I imperfect, third-person masculine singular; it presents earning or acquiring as ongoing or habitual.",
        relationship:
          "Form I imperfect of the ك س ب root, the ongoing counterpart of كَسَبَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and canonical Qur'anic occurrences.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يكسب",
      },
      {
        form: "كَسْبٌ",
        meaning: "earning or acquisition",
        difference:
          "Verbal noun; it names the act or result of earning rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun of the ك س ب root, naming earning, gaining or acquiring.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy lexicon evidence.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "كسب",
      },
      {
        form: "كَاسِبٌ",
        meaning: "one who earns or gains",
        difference:
          "Active participle; it describes the person or thing performing the earning or acquiring action.",
        relationship:
          "A genuine active participle of the ك س ب root, related to كَسَبَ and يَكْسِبُ.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy lexicon evidence.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "كاسب",
      },
      {
        form: "اكْتَسَبَ",
        meaning: "he acquired or earned",
        difference:
          "Form VIII perfect; the derived pattern presents acquiring or earning through one's effort.",
        relationship:
          "A genuine Form VIII derived verb of the ك س ب root, related to the basic earning family.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form VIII morphology.",
        featureSignal: ["pattern:form-8", "tense:perfect", "derivation:acquisition"],
        baseDistinct: true,
        lexicalKey: "اكتسب",
      },
    ],
    ["لهب"]: [
      {
        form: "أَلْهَبَ",
        meaning: "he ignited or inflamed",
        difference:
          "Form IV perfect; the derived pattern expresses causing a flame or heat to rise.",
        relationship:
          "A genuine Form IV derived verb of the ل ه ب root, related to the flame noun لَهَبٌ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form IV morphology.",
        featureSignal: ["pattern:form-4", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "ألهب",
      },
      {
        form: "يُلْهِبُ",
        meaning: "he ignites or inflames",
        difference:
          "Form IV imperfect, third-person masculine singular; it presents igniting or inflaming as ongoing.",
        relationship:
          "Form IV imperfect of the ل ه ب root, the ongoing counterpart of أَلْهَبَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form IV imperfect morphology.",
        featureSignal: ["pattern:form-4", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يلهب",
      },
      {
        form: "الْتَهَبَ",
        meaning: "it blazed or caught fire",
        difference:
          "Form VIII perfect; the derived pattern presents the fire as becoming intensely aflame.",
        relationship:
          "A genuine Form VIII derived verb of the ل ه ب root, related to the state of blazing.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form VIII morphology.",
        featureSignal: ["pattern:form-8", "tense:perfect", "voice:inchoative"],
        baseDistinct: true,
        lexicalKey: "التهاب",
      },
      {
        form: "لَهِيبٌ",
        meaning: "flame heat or blazing fire",
        difference:
          "Related noun; it focuses on the heat or blaze of the fire rather than the flame-tongue noun in the current occurrence.",
        relationship:
          "A genuine noun of the ل ه ب family, directly related to لَهَبٌ and the flame semantic range.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy lexicon evidence.",
        featureSignal: ["partofspeech:noun", "derivation:related-noun"],
        baseDistinct: true,
        lexicalKey: "لهيب",
      },
    ],
    ["حطب"]: [
      {
        form: "حَطَبَ",
        meaning: "he gathered firewood",
        difference:
          "Form I perfect; it states the completed act of gathering or collecting firewood.",
        relationship:
          "Form I perfect of the ح ط ب root, the action from which the firewood noun is understood.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حطب",
      },
      {
        form: "حَاطِبٌ",
        meaning: "one who gathers firewood",
        difference:
          "Active participle; it describes the person performing the gathering action.",
        relationship:
          "A genuine active participle of the ح ط ب root, related to the act of gathering firewood.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy lexicon evidence.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "حاطب",
      },
      {
        form: "حَطَّابٌ",
        meaning: "a woodcutter or firewood collector",
        difference:
          "Intensive occupational noun; the doubled middle radical identifies one habitually engaged in collecting or selling firewood.",
        relationship:
          "A genuine intensive/occupational derivative of the ح ط ب root, attested in Arabic lexicon evidence.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy lexicon evidence.",
        featureSignal: ["pattern:intensive", "partofspeech:occupational-noun", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "حطاب",
      },
      {
        form: "احْتَطَبَ",
        meaning: "he gathered firewood",
        difference:
          "Form VIII perfect; the derived pattern presents the act of going out and gathering firewood.",
        relationship:
          "A genuine Form VIII derived verb of the ح ط ب root, related to collecting the firewood named by الْحَطَبِ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form VIII morphology.",
        featureSignal: ["pattern:form-8", "tense:perfect", "derivation:acquisition"],
        baseDistinct: true,
        lexicalKey: "احتطب",
      },
    ],
    ["جيد"]: [
      {
        form: "جِيدٌ",
        meaning: "a neck",
        difference:
          "Basic singular noun; it gives the lexical form without the attached feminine pronoun in جِيدِهَا.",
        relationship:
          "The base noun of the ج ي د family, meaning a neck or nape.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and Arabic Academy entry for الجِيد.",
        featureSignal: ["partofspeech:noun", "number:singular", "derivation:base-form"],
        baseDistinct: true,
        lexicalKey: "جيد",
      },
      {
        form: "أَجْيَادٌ",
        meaning: "necks",
        difference:
          "Broken plural; it refers to more than one neck rather than the singular neck in the current occurrence.",
        relationship:
          "An established broken plural of جِيدٌ in the ج ي د lexical family.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy evidence listing أَجْيَادٌ as the plural of الجِيد.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "أجياد",
      },
      {
        form: "أَجْيَدُ",
        meaning: "long-necked or having a beautiful neck",
        difference:
          "Descriptive adjective; it describes a person by the quality of the neck rather than naming the neck itself.",
        relationship:
          "A genuine adjective associated with the ج ي د neck family and its classical descriptive range.",
        provenance:
          "Codex-authored after review of the approved project root meaning and classical Arabic lexicon evidence for أَجْيَدُ.",
        featureSignal: ["partofspeech:adjective", "derivation:descriptor", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "أجيد",
      },
      {
        form: "جَيْدَاءُ",
        meaning: "a woman with a long or beautiful neck",
        difference:
          "Feminine descriptive adjective; it applies the same neck-quality relationship to a feminine subject.",
        relationship:
          "The feminine counterpart of أَجْيَدُ in the classical ج ي د descriptive family.",
        provenance:
          "Codex-authored after review of the approved project root meaning and classical Arabic lexicon evidence for جَيْدَاءُ.",
        featureSignal: ["partofspeech:adjective", "derivation:descriptor", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "جيداء",
      },
    ],
    ["حبل"]: [
      {
        form: "أَحْبَالٌ",
        meaning: "ropes",
        difference:
          "Broken plural; it names multiple ropes rather than the singular rope in the current occurrence.",
        relationship:
          "An established broken plural of حَبْلٌ in the ح ب ل lexical family.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy evidence for حَبْلٌ and أَحْبَالٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "أحبال",
      },
      {
        form: "حَبَلَ",
        meaning: "he tied or trapped with a rope",
        difference:
          "Form I perfect; it expresses the completed act of tying or ensnaring with a rope.",
        relationship:
          "Form I perfect of the ح ب ل root, showing an action related to the rope noun.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حبل",
      },
      {
        form: "حَبَّلَ",
        meaning: "he braided or entangled",
        difference:
          "Form II perfect; the doubled middle radical presents an intensive or causative act of making something rope-like or entangled.",
        relationship:
          "A genuine Form II derived verb of the ح ب ل root, related to tying and entangling.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "حبل",
      },
      {
        form: "احْتَبَلَ",
        meaning: "he trapped or ensnared",
        difference:
          "Form VIII perfect; the derived pattern expresses using a snare or rope to catch something.",
        relationship:
          "A genuine Form VIII derived verb of the ح ب ل root, related to the rope and snare semantic family.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and standard Arabic Form VIII morphology.",
        featureSignal: ["pattern:form-8", "tense:perfect", "derivation:instrumental-action"],
        baseDistinct: true,
        lexicalKey: "احتبل",
      },
    ],
    ["مسد"]: [
      {
        form: "مَسَدَ",
        meaning: "he twisted or plaited",
        difference:
          "Form I perfect; it states the completed act of twisting or plaiting fibres into a rope.",
        relationship:
          "Form I perfect of the م س د root, the action underlying the palm-fibre noun مَسَدٌ.",
        provenance:
          "Codex-authored after review of the approved project root meaning and Arabic Academy evidence listing مَسَدَ in the مَسَد family.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "مسد",
      },
      {
        form: "مَسْدٌ",
        meaning: "twisting or plaiting",
        difference:
          "Verbal noun; it names the act of twisting or plaiting rather than the finished fibre or rope.",
        relationship:
          "A genuine verbal noun associated with the م س د twisting/plaiting family.",
        provenance:
          "Codex-authored after review of classical Arabic lexicon evidence for the م س د family and the approved project root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "مسد",
      },
      {
        form: "مِسَادٌ",
        meaning: "plaited ropes or fibres",
        difference:
          "Plural noun; it refers to multiple ropes or fibre strands rather than one palm-fibre rope.",
        relationship:
          "An established plural associated with مَسَدٌ, the palm-fibre and plaited-rope noun.",
        provenance:
          "Codex-authored after review of the Arabic Academy entry for المَسَد, which lists مِسَادٌ as a plural.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:plural"],
        baseDistinct: true,
        lexicalKey: "مساد",
      },
      {
        form: "مَمْسُودٌ",
        meaning: "twisted or plaited",
        difference:
          "Passive participle; it describes fibre or rope that has undergone the twisting or plaiting action.",
        relationship:
          "A genuine passive-participle relationship in the م س د family, contrasting the action with its finished result.",
        provenance:
          "Codex-authored after review of the Arabic Academy entry for المَسَد, which lists المَمْسُودُ, and the approved project root meaning.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "ممسود",
      },
    ],
  };
  return (families[root] ?? []).map((candidate) => ({
    ...candidate,
    score: candidate.score ?? 96,
    sourceKind: "codex-authored-lexicon",
    sourceOccurrence: `curated-root-family:${root}`,
  }));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalized(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/gu, "");
}

function inflectionalKey(value: string) {
  return normalized(value).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]+$/gu, "");
}

function base(value: string) {
  return normalized(value).replace(DIACRITIC_PATTERN, "");
}

function comparableBase(value: string) {
  return base(value).replace(/[\u0622\u0623\u0625\u0671]/gu, "ا");
}

function lexicalBase(provider: ProviderEvidence | undefined, fallback: string) {
  return comparableBase(provider?.lexicalStem ?? fallback);
}

function rootKey(value: string | undefined) {
  return (value ?? "").replace(/\s+/gu, "").trim();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function featureText(provider: ProviderEvidence | undefined) {
  if (!provider) return "";
  const values = provider.features
    .map((feature) => `${feature.label ?? feature.key ?? "feature"}: ${feature.value ?? ""}`.trim())
    .filter((item) => !item.endsWith(":"));
  return [provider.pattern ? `pattern: ${provider.pattern}` : "", ...values]
    .filter(Boolean)
    .join("; ");
}

function featureMap(provider: ProviderEvidence | undefined) {
  const map = new Map<string, string>();
  for (const feature of provider?.features ?? []) {
    const key = (feature.key ?? feature.label ?? "feature").toLowerCase();
    if (feature.value) map.set(key, feature.value);
  }
  if (provider?.pattern) map.set("pattern", provider.pattern);
  if (provider?.partOfSpeech) map.set("partofspeech", provider.partOfSpeech);
  return map;
}

function changedFeatures(current: ProviderEvidence | undefined, candidate: ProviderEvidence | undefined) {
  const currentMap = featureMap(current);
  const candidateMap = featureMap(candidate);
  const keys = new Set([...currentMap.keys(), ...candidateMap.keys()]);
  return [...keys]
    .filter((key) => currentMap.get(key) !== candidateMap.get(key))
    .map((key) => `${key}: ${currentMap.get(key) ?? "not marked"} → ${candidateMap.get(key) ?? "not marked"}`);
}

function signalFor(changes: string[], candidate: ProviderEvidence | undefined) {
  const signals = new Set<string>();
  for (const change of changes) {
    const key = change.split(":", 1)[0];
    if (/tense|person|gender|number|voice|verbform|pattern|mood|partofspeech|state/iu.test(key))
      signals.add(key);
  }
  if (candidate?.partOfSpeech) signals.add(`pos:${candidate.partOfSpeech}`);
  return [...signals];
}

function safeForm(form: LessonForm | undefined, root: string) {
  if (!form) return false;
  if (!form.form.trim() || !ARABIC_PATTERN.test(form.form)) return false;
  if (/\s/u.test(form.form)) return false;
  if (!form.meaning.trim() || !form.difference.trim() || !form.relationship?.trim() || !form.provenance?.trim())
    return false;
  if (
    PLACEHOLDER_PATTERN.test(form.meaning) ||
    PLACEHOLDER_PATTERN.test(form.difference) ||
    PLACEHOLDER_PATTERN.test(form.relationship ?? "") ||
    GENERIC_DESCRIPTION_PATTERN.test(form.meaning) ||
    GENERIC_DESCRIPTION_PATTERN.test(form.difference) ||
    GENERIC_DESCRIPTION_PATTERN.test(form.relationship ?? "")
  )
    return false;
  if (root && base(form.form) === base(root) && !DIACRITIC_TEST_PATTERN.test(form.form)) return false;
  return true;
}

function classify(
  lesson: TeachingLesson,
  provider: ProviderEvidence | undefined,
  word: PackageWord,
) {
  const providerProperName =
    provider?.features.some(
      (feature) =>
        (feature.key ?? feature.label ?? "").toLowerCase() === "partofspeech" &&
        feature.value?.toLowerCase() === "proper name" &&
        comparableBase(provider.lemma) === comparableBase(word.arabic),
    ) ?? false;
  const reviewedProperName = /proper\s*(?:name|noun)/iu.test(
    `${lesson.type} ${lesson.grammar} ${lesson.forms[0]?.difference ?? ""}`,
  );
  const text = [
    lesson.type,
    // The imported provider POS is supporting evidence only.  In particular,
    // the current derived QAC import can expose a misleading PN feature for a
    // regular noun, so it must not override the reviewed lesson category.
    lesson.type.trim() ? "" : provider?.partOfSpeech,
    ...((lesson.components as Array<JsonObject> | undefined) ?? []).map((part) =>
      `${String(part.kind ?? "")} ${String(part.rootExplanation ?? "")}`,
    ),
  ]
    .join(" ")
    .toLowerCase();
  if (/proper\s*(?:name|noun)/.test(text) || providerProperName || reviewedProperName)
    return "proper noun";
  if (!lesson.root.trim()) {
    if (/preposition/.test(text)) return "preposition";
    if (/pronoun/.test(text)) return "pronoun";
    if (/relative/.test(text)) return "relative word";
    if (/demonstrative/.test(text)) return "demonstrative";
    if (/conjunction|connector/.test(text)) return "connector/conjunction";
    if (/vocative/.test(text)) return "vocative";
    if (/article/.test(text)) return "article";
    if (/particle/.test(text)) return "particle";
    return "rootless grammatical/other";
  }
  // Once a lexical root is present, an aligned provider part of speech is
  // stronger evidence than a stale lesson-type label.  This matters for
  // occurrence-specific lessons whose old label says “noun” even though the
  // Arabic occurrence is a finite verb (for example تَوَاصَوْا۟).  The
  // provider's known misleading proper-name flag is handled above and is not
  // allowed to override the lexical lesson.
  const providerPos = provider?.partOfSpeech.toLowerCase() ?? "";
  if (/verb/.test(providerPos)) return "verb";
  if (/participle/.test(providerPos)) return "participle";
  if (/adjective/.test(providerPos)) return "adjective";
  if (/noun/.test(providerPos)) return "noun";
  if (/verb/.test(text)) return "verb";
  if (/noun\s*\/\s*adjective/.test(text)) return "noun/adjective";
  if (/adjective/.test(text)) return "adjective";
  if (/noun/.test(text)) return "noun";
  if (/participle/.test(text)) return "participle";
  return "lexical other";
}

function providerEvidence(row: ProviderRow): ProviderEvidence {
  const details = parseJson<JsonObject>(row.features, {});
  const segmentation = parseJson<Array<JsonObject>>(details.segmentation, []);
  const stem = segmentation.find((part) => part.kind === "stem" || part.kind === "whole");
  return {
    occurrenceId: row.occurrence_id,
    recordKey: row.record_key ?? String(details.recordKey ?? row.occurrence_id),
    version: row.version ?? String(details.version ?? "unknown"),
    root: String(details.root ?? ""),
    lemma: String(details.lemma ?? ""),
    pattern: String(details.pattern ?? ""),
    partOfSpeech: row.part_of_speech ?? String(details.partOfSpeech ?? ""),
    lexicalStem: typeof stem?.sourceText === "string" ? stem.sourceText : undefined,
    features: parseJson<Feature[]>(details.features, []).filter(
      (feature): feature is Feature => typeof feature === "object" && feature !== null,
    ),
  };
}

function currentRow(occurrence: Occurrence): LessonForm {
  const root = rootKey(occurrence.lesson.root);
  const featureDetails = featureText(occurrence.provider);
  return {
    form: occurrence.word.arabic,
    meaning: occurrence.word.gloss?.trim() || occurrence.lesson.meaning.trim(),
    difference: featureDetails
      ? `Current Qur'anic occurrence; ${featureDetails}.`
      : "Current Qur'anic occurrence in this āyah; its exact vocalisation and context are primary.",
    relationship: root
      ? `Current Qur'anic occurrence of the ${root} lexical family in this āyah.`
      : "Current Qur'anic occurrence of this rootless grammatical item.",
    provenance: `Codex review of canonical Qur'anic occurrence ${occurrence.word.id}.${
      occurrence.provider
        ? ` Aligned Quranic Arabic Corpus morphology ${occurrence.provider.version} (${occurrence.provider.recordKey}) was checked as evidence.`
        : " No aligned provider morphology was available; the canonical occurrence was checked directly."
    }`,
  };
}

function occurrenceCandidate(
  current: Occurrence,
  source: Occurrence,
  existingRow?: LessonForm,
): Candidate | undefined {
  const root = rootKey(current.lesson.root);
  const changes = changedFeatures(current.provider, source.provider);
  const currentBase = lexicalBase(current.provider, current.word.arabic);
  const sourceBase = lexicalBase(source.provider, source.word.arabic);
  const sourceSurface = comparableBase(source.word.arabic);
  const sourceStem = comparableBase(sourceBase);
  const hasOnlyConjunctionPrefix =
    (sourceSurface.startsWith("و") || sourceSurface.startsWith("ف")) &&
    (sourceSurface.slice(1) === sourceStem || sourceSurface.slice(1) === currentBase);
  if (hasOnlyConjunctionPrefix && sourceBase === currentBase) return undefined;
  const distinct = normalized(current.word.arabic) !== normalized(source.word.arabic);
  const signals = signalFor(changes, source.provider);
  const difference = changes.length
      ? `Compared with ${current.word.arabic}, this form changes ${changes.slice(0, 4).join("; ")}.`
      : sourceBase !== currentBase
        ? `A distinct vocalised form in the ${root} root family with its own form-specific meaning.`
        : `This form preserves the ${root} root while changing its reviewed grammatical or morphological realisation.`;
  const candidate: Candidate = {
    form: source.word.arabic,
    meaning: existingRow?.meaning?.trim() || source.word.gloss?.trim() || source.lesson.meaning.trim(),
    difference,
    relationship:
      existingRow?.relationship?.trim() ||
      `Related to the ${root} root/lexeme; canonical Qur'anic evidence is ${source.word.id}.`,
    provenance:
      existingRow?.provenance?.trim() ||
      `Codex-reviewed form from canonical Qur'anic occurrence ${source.word.id}; aligned Quranic Arabic Corpus morphology ${source.provider?.version ?? "not available"} was checked as evidence.`,
    score: 60 + (distinct ? 20 : 0) + signals.length * 12 + (existingRow ? 18 : 0),
    sourceOccurrence: source.word.id,
    sourceKind: existingRow ? "existing-reviewed-row" : "canonical-occurrence",
    featureSignal: signals,
    baseDistinct: sourceBase !== currentBase,
    lexicalKey: sourceBase,
  };
  if (!safeForm(candidate, root) || !distinct) return undefined;
  return candidate;
}

function existingCandidate(
  current: Occurrence,
  source: TeachingLesson,
  row: LessonForm,
  observedRootsByBase: Map<string, Set<string>>,
  observedStemsByBase: Map<string, Set<string>>,
): Candidate | undefined {
  const root = rootKey(current.lesson.root);
  if (normalized(row.form) === normalized(current.word.arabic)) return undefined;
  const rowSurface = comparableBase(row.form);
  const currentStem = lexicalBase(current.provider, current.word.arabic);
  if (
    (rowSurface.startsWith("و") || rowSurface.startsWith("ف")) &&
    rowSurface.slice(1) === currentStem
  )
    return undefined;
  if (!safeForm(row, root)) return undefined;
  const observedRoots = observedRootsByBase.get(base(row.form));
  if (!observedRoots?.has(root) && !TRUSTED_AUTHORED_LESSONS.has(source.id)) return undefined;
  const signals = signalFor(
    row.difference
      .split(/;|→/u)
      .filter(Boolean)
      .map((value) => `${value}: changed`),
    undefined,
  );
  const candidateStems = observedStemsByBase.get(base(row.form)) ?? new Set([base(row.form)]);
  const baseDistinct = [...candidateStems].some((stem) => stem !== currentStem);
  const difference = trustedDifference(root, row.form, row.difference);
  if (!difference) return undefined;
  return {
    ...clone(row),
    difference,
    relationship: row.relationship ?? `Reviewed relationship to the ${root} root/lexeme.`,
    provenance: row.provenance ?? "Existing project-authored row retained after the limited-family audit.",
    score: 78 + (baseDistinct ? 20 : 0) + signals.length * 5,
    sourceKind: "existing-reviewed-row",
    featureSignal: signals,
    baseDistinct,
    lexicalKey: [...candidateStems][0] ?? base(row.form),
    sourceOccurrence: source.id,
  };
}

function dedupeCandidates(candidates: Candidate[]) {
  const byForm = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = inflectionalKey(candidate.form);
    const previous = byForm.get(key);
    if (!previous || candidate.score > previous.score) byForm.set(key, candidate);
  }
  return [...byForm.values()];
}

function chooseFour(candidates: Candidate[]) {
  const deduped = dedupeCandidates(candidates);
  const sorted = deduped
    .filter((candidate) => {
      const key = inflectionalKey(candidate.form);
      if (!key.startsWith("و") && !key.startsWith("ف")) return true;
      const stemKey = key.replace(/^[وف][\u064B-\u065F\u0670\u06D6-\u06ED]*/u, "");
      return !deduped.some((other) => other !== candidate && inflectionalKey(other.form) === stemKey);
    })
    .sort((left, right) => right.score - left.score);
  const selected: Candidate[] = [];
  const covered = new Set<string>();
  for (const candidate of sorted) {
    if (selected.length >= 4) break;
    const newSignal = candidate.featureSignal.some((signal) => !covered.has(signal));
    if (selected.length < 3 && newSignal) {
      selected.push(candidate);
      candidate.featureSignal.forEach((signal) => covered.add(signal));
    }
  }
  for (const candidate of sorted) {
    if (selected.length >= 4) break;
    if (!selected.some((item) => normalized(item.form) === normalized(candidate.form)))
      selected.push(candidate);
  }
  const distinctBaseCount = new Set(
    selected.filter((item) => item.baseDistinct).map((item) => item.lexicalKey),
  ).size;
  const usefulSignalCount = new Set(
    selected
      .flatMap((item) => item.featureSignal)
      .filter((signal) => !/^case$|^state$/iu.test(signal)),
  ).size;
  const meaningful = selected.length === 4 && (distinctBaseCount >= 2 || usefulSignalCount >= 2);
  return { selected, meaningful, distinctBaseCount, usefulSignalCount };
}

function limitedReason(
  occurrence: Occurrence,
  category: string,
  forms: LessonForm[],
  decision: "confirmed-limited" | "blocked-for-genuine-ambiguity",
  candidateCount: number,
) {
  const word = occurrence.word.arabic;
  const root = rootKey(occurrence.lesson.root);
  if (decision === "confirmed-limited") {
    if (category === "proper noun")
      return `${word} is a proper noun${root ? ` associated with ${root}` : ""}; the reviewed evidence supports only its attested name/inflectional usage, and additional lexical rows would be unrelated or misleading. The family retains ${forms.length} genuine reviewed form${forms.length === 1 ? "" : "s"}.`;
    return `${word} is a rootless ${category} rather than a lexical root family. The reviewed alternatives are grammatical or attached variants, not additional lexical Ṣarf forms; adding lexical rows would mislead the learner. The family retains ${forms.length} genuine reviewed form${forms.length === 1 ? "" : "s"}.`;
  }
  return `${word} is a rootful ${category} with root ${occurrence.lesson.root}. The audit found ${candidateCount} safe related form${candidateCount === 1 ? "" : "s"}, but did not establish four additional high-value contrasts from canonical evidence, approved project meanings and aligned morphology without an unverified claim. The family is blocked for genuine linguistic ambiguity rather than accepted as limited; further lexicon-led authoring is required.`;
}

async function packageFiles() {
  const entries = await fs.readdir(packagesRoot, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const file = path.join(packagesRoot, entry.name, "surah.json");
    try {
      await fs.access(file);
      files.push(file);
    } catch {
      /* ignore stale empty package directories */
    }
  }
  return files.sort();
}

const files = await packageFiles();
const packages = new Map<string, { path: string; pkg: SourcePackage }>();
const occurrences: Occurrence[] = [];
for (const packagePath of files) {
  const pkg = JSON.parse(await fs.readFile(packagePath, "utf8")) as SourcePackage;
  if (auditSurahNumbers.size && !auditSurahNumbers.has(pkg.surah.number)) continue;
  packages.set(pkg.packageId, { path: packagePath, pkg });
  for (const ayah of pkg.ayahs) {
    for (const word of ayah.words) {
      if (!word.teachingId) continue;
      const lesson = pkg.teachingEntries[word.teachingId];
      if (lesson) occurrences.push({ packagePath, pkg, ayah, word, lesson });
    }
  }
}

const providerResult = await pool.query<ProviderRow>(
  `select distinct on (occurrence_id)
      occurrence_id,
      features->>'recordKey' as record_key,
      features->>'version' as version,
      part_of_speech,
      features
   from morphology_records
   where provider='quranic-arabic-corpus'
     and occurrence_id = any($1::text[])
   order by occurrence_id, id`,
  [occurrences.map((item) => item.word.id)],
);
const providerByOccurrence = new Map(
  providerResult.rows.map((row) => [row.occurrence_id, providerEvidence(row)]),
);
for (const occurrence of occurrences) occurrence.provider = providerByOccurrence.get(occurrence.word.id);

const fullRowsByRoot = new Map<string, Array<{ lesson: TeachingLesson; row: LessonForm }>>();
for (const occurrence of occurrences) {
  const root = rootKey(occurrence.lesson.root);
  if (!root || occurrence.lesson.sarfReview.status !== "full") continue;
  for (const row of occurrence.lesson.forms ?? [])
    fullRowsByRoot.set(root, [
      ...(fullRowsByRoot.get(root) ?? []),
      { lesson: occurrence.lesson, row },
    ]);
}

const occurrencesByRoot = new Map<string, Occurrence[]>();
const observedRootsByBase = new Map<string, Set<string>>();
const observedStemsByBase = new Map<string, Set<string>>();
for (const occurrence of occurrences) {
  const root = rootKey(occurrence.lesson.root);
  if (root)
    occurrencesByRoot.set(root, [...(occurrencesByRoot.get(root) ?? []), occurrence]);
  const providerRoot = rootKey(occurrence.provider?.root) || root;
  if (providerRoot) {
    const key = base(occurrence.word.arabic);
    observedRootsByBase.set(key, new Set([...(observedRootsByBase.get(key) ?? []), providerRoot]));
    const stemKey = lexicalBase(occurrence.provider, occurrence.word.arabic);
    observedStemsByBase.set(key, new Set([...(observedStemsByBase.get(key) ?? []), stemKey]));
  }
}

const limited = occurrences.filter((occurrence) => occurrence.lesson.sarfReview.status === "limited");
const beforeCounts = {
  limitedOccurrences: limited.length,
  limitedTeachingEntries: new Set(limited.map((item) => `${item.pkg.packageId}:${item.word.teachingId}`)).size,
  forms: Object.fromEntries(
    [...limited.reduce((map, item) => map.set(item.lesson.forms.length, (map.get(item.lesson.forms.length) ?? 0) + 1), new Map<number, number>())]
      .sort((left, right) => left[0] - right[0])
      .map(([key, value]) => [String(key), value]),
  ),
};

const latestByOccurrence = new Map<string, string>();
for (const record of readAuditRecords()) {
  const occurrenceId = (record.scope as JsonObject | undefined)?.occurrenceId;
  if (typeof occurrenceId === "string") latestByOccurrence.set(occurrenceId, record.recordId);
}

const decisions = {
  confirmedLimited: 0,
  upgradedToFull: 0,
  blocked: 0,
};
const byCategory: Record<string, { before: number; confirmedLimited: number; upgradedToFull: number; blocked: number }> = {};
const byReason: Record<string, number> = {};
const packageChanges = new Map<string, { path: string; pkg: SourcePackage; changed: boolean; demoted: boolean }>();
const auditRecords: AuditRecord[] = [];
const auditItems: JsonObject[] = [];

for (const occurrence of limited) {
  const packageState = packageChanges.get(occurrence.pkg.packageId) ?? {
    path: occurrence.packagePath,
    pkg: occurrence.pkg,
    changed: false,
    demoted: false,
  };
  packageChanges.set(occurrence.pkg.packageId, packageState);
  const lesson = occurrence.lesson;
  const beforeLesson = clone(lesson);
  const category = classify(lesson, occurrence.provider, occurrence.word);
  const root = rootKey(lesson.root);
  const oldSafeRows = (lesson.forms ?? []).filter((row) => safeForm(row, root));
  const rebuiltCurrent = currentRow(occurrence);
  const existingForms: LessonForm[] = [];
  const seen = new Set([normalized(rebuiltCurrent.form)]);
  for (const row of oldSafeRows) {
    if (normalized(row.form) === normalized(rebuiltCurrent.form)) continue;
    if (seen.has(normalized(row.form))) continue;
    seen.add(normalized(row.form));
    existingForms.push({
      ...row,
      relationship: row.relationship ?? `Reviewed relationship to the ${root || "grammatical"} family.`,
      provenance: row.provenance ?? "Existing project-authored row retained after independent Codex review.",
    });
  }

  const candidatePool: Candidate[] = [];
  if (root) {
    candidatePool.push(...curatedCandidates(root).filter((candidate) => safeForm(candidate, root)));
    for (const source of occurrencesByRoot.get(root) ?? []) {
      if (source.word.id === occurrence.word.id) continue;
      if (source.provider?.root && rootKey(source.provider.root) !== root) continue;
      const existingRow = source.lesson.forms?.find(
        (row) => normalized(row.form) === normalized(source.word.arabic) && safeForm(row, root),
      );
      const candidate = occurrenceCandidate(occurrence, source, existingRow);
      if (candidate) candidatePool.push(candidate);
    }
    for (const entry of fullRowsByRoot.get(root) ?? []) {
      const candidate = existingCandidate(
        occurrence,
        entry.lesson,
        entry.row,
        observedRootsByBase,
        observedStemsByBase,
      );
      if (candidate) candidatePool.push(candidate);
    }
    for (const row of existingForms) {
      const candidate = existingCandidate(
        occurrence,
        lesson,
        row,
        observedRootsByBase,
        observedStemsByBase,
      );
      if (candidate) candidatePool.push(candidate);
    }
  }

  const chosen = root
    ? chooseFour(
        candidatePool.filter(
          (candidate) => inflectionalKey(candidate.form) !== inflectionalKey(occurrence.word.arabic),
        ),
      )
    : { selected: [], meaningful: false, distinctBaseCount: 0, usefulSignalCount: 0 };
  let decision: Decision;
  let afterForms: LessonForm[];
  let afterReview: SarfReview;

  if (root && category !== "proper noun" && chosen.meaningful) {
    decision = "upgraded-to-full";
    afterForms = [rebuiltCurrent, ...chosen.selected.map((candidate) => ({
      form: candidate.form,
      meaning: candidate.meaning,
      difference: candidate.difference,
      relationship: candidate.relationship ?? `Related to the ${root} root/lexeme.`,
      provenance: candidate.provenance ?? "Codex-reviewed canonical evidence.",
    }))];
    afterReview = {
      status: "full",
      auditDecision: "upgraded-to-full",
      provenance: [
        `Limited-family audit ${auditBatchId} reviewed ${occurrence.word.id}.`,
        `Canonical evidence and aligned Quranic Arabic Corpus morphology were checked for the ${root} root family.`,
      ],
      reviewedBy: "Codex",
      reviewedAt,
    };
    decisions.upgradedToFull += 1;
  } else if (!root || category === "proper noun") {
    decision = "confirmed-limited";
    afterForms = [rebuiltCurrent, ...existingForms].slice(0, 4);
    afterReview = {
      status: "limited",
      auditDecision: "confirmed-limited",
      limitedReason: limitedReason(occurrence, category, afterForms, decision, candidatePool.length),
      provenance: [
        `Limited-family audit ${auditBatchId} reviewed ${occurrence.word.id}.`,
        `The item was checked as ${category}; rootless/grammatical or proper-name status was not treated as an automatic pass without examining its real rows.`,
        occurrence.provider
          ? `Aligned Quranic Arabic Corpus evidence ${occurrence.provider.version} (${occurrence.provider.recordKey}) was checked.`
          : "No aligned provider morphology was available; canonical Arabic was checked directly.",
      ],
      reviewedBy: "Codex",
      reviewedAt,
    };
    decisions.confirmedLimited += 1;
    const reasonKey = !root ? `rootless:${category}` : "proper-noun-restricted";
    byReason[reasonKey] = (byReason[reasonKey] ?? 0) + 1;
  } else {
    decision = "blocked-for-genuine-ambiguity";
    afterForms = [rebuiltCurrent, ...existingForms].slice(0, 4);
    afterReview = {
      status: "limited",
      auditDecision: "blocked-for-genuine-ambiguity",
      limitedReason: limitedReason(occurrence, category, afterForms, decision, candidatePool.length),
      provenance: [
        `Limited-family audit ${auditBatchId} reviewed ${occurrence.word.id}.`,
        `Rootful ${category} family checked against canonical Qur'anic forms, project root meanings, existing reviewed families and aligned provider morphology.`,
        "No unverified form was added merely to reach five rows; further lexicon-led authoring is required.",
      ],
      reviewedBy: "Codex",
      reviewedAt,
    };
    decisions.blocked += 1;
    packageState.demoted = true;
  }

  const afterLesson = lesson;
  afterLesson.forms = afterForms;
  afterLesson.sarfReview = afterReview;
  packageState.changed = true;
  const beforeSnapshot = { word: occurrence.word, lesson: beforeLesson };
  const afterSnapshot = { word: occurrence.word, lesson: afterLesson };
  const sourceHash = hash(beforeSnapshot);
  const contentHash = hash(afterSnapshot);
  const categoryStats = (byCategory[category] ??= { before: 0, confirmedLimited: 0, upgradedToFull: 0, blocked: 0 });
  categoryStats.before += 1;
  if (decision === "confirmed-limited") categoryStats.confirmedLimited += 1;
  if (decision === "upgraded-to-full") categoryStats.upgradedToFull += 1;
  if (decision === "blocked-for-genuine-ambiguity") categoryStats.blocked += 1;

  const recordId = `limited-sarf-${occurrence.word.id.replaceAll(":", "-")}-${contentHash.slice(0, 12)}`;
  auditRecords.push({
    recordId,
    eventType: "limited-family-linguistic-audit",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    scope: {
      type: "limited-sarf-family",
      packageId: occurrence.pkg.packageId,
      surah: occurrence.pkg.surah.number,
      ayah: occurrence.ayah.number,
      position: occurrence.word.position,
      occurrenceId: occurrence.word.id,
      teachingId: occurrence.word.teachingId,
      category,
    },
    status: decision === "upgraded-to-full" ? "passed" : decision === "confirmed-limited" ? "passed-limited" : "blocked",
    sarfStatus: decision === "upgraded-to-full" ? "full" : decision === "confirmed-limited" ? "limited" : "blocked",
    auditDecision: decision,
    reviewedAt,
    checks: [
      "existing-limited-classification-independently-reviewed",
      "current-quranic-form-first",
      "real-vocalised-arabic-forms",
      "form-specific-meanings-and-differences",
      "lexeme-root-or-rootless-category-relationship",
      "specific-limitation-or-blocking-reason",
      "review-provenance",
      decision === "upgraded-to-full" ? "exactly-five-strong-reviewed-forms" : decision,
    ],
    evidence: [
      `source:${occurrence.word.id}`,
      `category:${category}`,
      `root:${root || "no-lexical-root"}`,
      `candidate-pool:${candidatePool.length}`,
      `selected-additional:${Math.max(0, afterForms.length - 1)}`,
      ...afterReview.provenance,
    ],
    sourceHash,
    contentHash,
    contentChanged: sourceHash !== contentHash,
    beforeSarfStatus: beforeLesson.sarfReview.status,
    afterSarfStatus: afterReview.status,
    beforeFormCount: beforeLesson.forms.length,
    afterFormCount: afterForms.length,
    beforeLimitedReason: beforeLesson.sarfReview.limitedReason,
    afterLimitedReason: afterReview.limitedReason,
    supersedes: latestByOccurrence.get(occurrence.word.id),
  });
  auditItems.push({
    occurrenceId: occurrence.word.id,
    packageId: occurrence.pkg.packageId,
    surah: occurrence.pkg.surah.number,
    ayah: occurrence.ayah.number,
    position: occurrence.word.position,
    teachingId: occurrence.word.teachingId,
    word: occurrence.word.arabic,
    category,
    root: occurrence.lesson.root,
    decision,
    candidatePool: candidatePool.length,
    candidateEvidence: candidatePool.map((candidate) => ({
      form: candidate.form,
      meaning: candidate.meaning,
      difference: candidate.difference,
      sourceKind: candidate.sourceKind,
      sourceOccurrence: candidate.sourceOccurrence,
      score: candidate.score,
      featureSignal: candidate.featureSignal,
      baseDistinct: candidate.baseDistinct,
      lexicalKey: candidate.lexicalKey,
    })),
    selectedForms: afterForms,
    before: {
      status: beforeLesson.sarfReview.status,
      formCount: beforeLesson.forms.length,
      forms: beforeLesson.forms,
      limitedReason: beforeLesson.sarfReview.limitedReason,
    },
    after: {
      status: afterReview.status,
      formCount: afterForms.length,
      forms: afterForms,
      limitedReason: afterReview.limitedReason,
      auditDecision: afterReview.auditDecision,
    },
    sourceHash,
    contentHash,
  });
}

for (const state of packageChanges.values()) {
  if (!state.changed) continue;
  if (state.demoted && state.pkg.status === "custom-complete") state.pkg.status = "custom-partial";
  if (!state.demoted && state.pkg.status === "custom-partial") {
    const everyWordHasTeaching = state.pkg.ayahs.every((ayah) =>
      ayah.words.every((word) => {
        const lesson = word.teachingId
          ? state.pkg.teachingEntries?.[word.teachingId]
          : undefined;
        return Boolean(
          word.teachingId &&
            lesson &&
            (word.breakdown || word.breakdownOverride),
        );
      }),
    );
    const hasBlockedFamily = Object.values(state.pkg.teachingEntries ?? {}).some(
      (lesson) =>
        Boolean(
          (lesson as TeachingLesson).sarfReview?.auditDecision ===
            "blocked-for-genuine-ambiguity",
        ),
    );
    if (everyWordHasTeaching && !hasBlockedFamily)
      state.pkg.status = "custom-complete";
  }
  state.pkg.contentVersion = `${state.pkg.contentVersion.replace(/-sarf-[^\s]+$/u, "")}-sarf-1.2-limited-audit`;
}

const afterCounts = {
  confirmedLimited: decisions.confirmedLimited,
  upgradedToFull: decisions.upgradedToFull,
  blocked: decisions.blocked,
  fullFamiliesAfter: limited.filter((item) => {
    const id = item.word.teachingId;
    const latest = auditItems.find((audit) => audit.teachingId === id && audit.occurrenceId === item.word.id);
    return latest?.decision === "upgraded-to-full";
  }).length,
};
const report = {
  auditBatchId,
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  reviewedAt,
  mode: apply ? "apply" : "dry-run",
  scope: {
    authoredPackages: packages.size,
    limitedOccurrences: limited.length,
    distinctLimitedTeachingEntries: beforeCounts.limitedTeachingEntries,
  },
  before: beforeCounts,
  decisions,
  after: afterCounts,
  byCategory,
  byReason,
  packageChanges: [...packageChanges.values()].filter((state) => state.changed).map((state) => ({
    packageId: state.pkg.packageId,
    surah: state.pkg.surah.number,
    statusAfter: state.pkg.status,
    demotedFromCustomComplete: state.demoted,
  })),
  items: auditItems,
};

const reportPath = path.join(
  repositoryRoot,
  "artifacts",
  "content-review",
  `${auditBatchId}.json`,
);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (apply) {
  for (const state of packageChanges.values()) {
    if (!state.changed) continue;
    await fs.writeFile(state.path, `${JSON.stringify(state.pkg, null, 2)}\n`, "utf8");
    const manifestPath = path.join(path.dirname(state.path), "manifest.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as JsonObject;
      manifest.contentVersion = state.pkg.contentVersion;
      manifest.status = state.pkg.status;
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    } catch {
      /* Older source-only folders may not have a manifest. */
    }
  }
  const batchHash = hash({ auditBatchId, decisions, byCategory });
  auditRecords.push({
    recordId: `${auditBatchId}-batch-${batchHash.slice(0, 16)}`,
    eventType: "limited-family-linguistic-audit-batch",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    scope: {
      type: "repository-limited-sarf-population",
      packages: packages.size,
      limitedOccurrences: limited.length,
      distinctLimitedTeachingEntries: beforeCounts.limitedTeachingEntries,
    },
    status: decisions.blocked ? "blocked" : "passed",
    reviewedAt,
    checks: [
      "every-live-limited-occurrence-received-a-decision",
      "lexical-families-not-confirmed-limited-from-candidate-count-alone",
      "rootless-and-proper-categories-received-specific-reasons",
      "upgrades-have-exactly-five-reviewed-forms",
      "before-after-ledger-records-written",
      "blocked-families-excluded-from-custom-complete-packages",
    ],
    evidence: [
      "docs/content-authoring/quranic-word-tree-contract.json",
      "docs/content-authoring/common-problems.json",
      reportPath,
      `limited-occurrences-reviewed:${limited.length}`,
      `confirmed-limited:${decisions.confirmedLimited}`,
      `upgraded-to-full:${decisions.upgradedToFull}`,
      `blocked:${decisions.blocked}`,
    ],
    contentChanged: true,
    auditBatchId,
    counts: { before: beforeCounts, decisions, after: afterCounts },
    byCategory,
  });
  appendAuditRecords(auditRecords);
}

console.log(JSON.stringify({
  auditBatchId,
  mode: apply ? "apply" : "dry-run",
  reportPath,
  scope: report.scope,
  before: beforeCounts,
  decisions,
  after: afterCounts,
  byCategory,
  byReason,
}, null, 2));

await pool.end();
