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

// Rows in this map were found to be structurally plausible but linguistically
// assigned to the wrong root. They must never be reused as evidence for the
// named family until an explicit reviewed correction replaces them.
const KNOWN_WRONG_ROOT_FORMS: Record<string, Set<string>> = {
  ويل: new Set(["وائل"]),
};

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
    ["فيل"]: [
      {
        form: "فِيلَةٌ",
        meaning: "elephants",
        difference:
          "Plural noun with the feminine ending used as an established plural of فِيل; it contrasts with the singular current occurrence.",
        relationship: "A genuine plural of فِيل within the ف ي ل lexical family, listed by the Arabic Academy.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ف ي ل entry and Arabic Academy evidence listing أَفْيَالٌ، فِيلَةٌ، وفُيُولٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:plural"],
        baseDistinct: true,
        lexicalKey: "فيلة",
      },
      {
        form: "أَفْيَالٌ",
        meaning: "elephants",
        difference:
          "Broken plural pattern; it shows an alternate plural formation for the singular noun فِيل.",
        relationship: "An established broken plural of فِيل in the ف ي ل lexical family.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ف ي ل entry and Arabic Academy evidence listing أَفْيَالٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "أفيال",
      },
      {
        form: "فُيُولٌ",
        meaning: "elephants",
        difference:
          "A second established broken plural pattern; its distinct vowel pattern gives the learner a real plural-form contrast rather than case-ending padding.",
        relationship: "An established alternate broken plural of فِيل in the ف ي ل lexical family.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ف ي ل entry and Arabic Academy evidence listing فُيُولٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:alternate-broken-plural"],
        baseDistinct: true,
        lexicalKey: "فيول",
      },
      {
        form: "فَيَّالٌ",
        meaning: "elephant trainer",
        difference:
          "Agent noun; it names a person who trains or handles elephants rather than the animal itself.",
        relationship: "A genuine agent noun derived from فِيل within the ف ي ل lexical family.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence defining الفَيَّالُ as مُرَوِّضُ الفيل.",
        featureSignal: ["partofspeech:agent-noun", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "فيال",
      },
    ],
    ["أبل"]: [
      {
        form: "إِبِلٌ",
        meaning: "camels or a herd of camels",
        difference:
          "Collective noun; it names camels as a herd, contrasting with the current adjective/noun أَبَابِيلَ meaning flocks.",
        relationship: "A genuine noun of the أ ب ل root, attested in Qur'anic occurrences 6:144 and 88:17.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus canonical occurrences 6:144 and 88:17 and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:collective", "derivation:base-form"],
        baseDistinct: true,
        lexicalKey: "إبل",
      },
      {
        form: "أَبَلَ",
        meaning: "he kept or tended camels",
        difference:
          "Form I perfect; it presents the completed action of keeping, tending or managing camels.",
        relationship: "Form I perfect of the أ ب ل root, listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for أَبَلَ and the approved project root meaning.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "أبل",
      },
      {
        form: "أَبَّلَ",
        meaning: "he acquired or fattened camels",
        difference:
          "Form II perfect; the doubled middle radical marks the derived action of acquiring or fattening camels.",
        relationship: "Form II of the أ ب ل root, explicitly listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for أَبَّلَ and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "أبل",
      },
      {
        form: "آبِلٌ",
        meaning: "a camel herder or one skilled with camels",
        difference:
          "Agent noun; it describes a person associated with tending or managing camels rather than naming a flock.",
        relationship: "A genuine agent noun of the أ ب ل family, listed among the established related forms of the root.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing آبَلَ and related أ ب ل forms and the approved project root meaning.",
        featureSignal: ["partofspeech:agent-noun", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "آبل",
      },
    ],
    ["رمي"]: [
      {
        form: "رَمَى",
        meaning: "he threw or cast",
        difference:
          "Form I perfect; it states the completed act of throwing, contrasting with the current imperfect form with an attached object pronoun.",
        relationship: "Form I perfect of the ر م ي root; the completed counterpart of تَرْمِيهِم.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences including 8:17 and 105:4 and Arabic Academy evidence for رَمَى.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "رمى",
      },
      {
        form: "يَرْمِي",
        meaning: "he throws or casts",
        difference:
          "Form I imperfect, third-person masculine singular; it removes the attached object and shows the ongoing action.",
        relationship: "Form I imperfect of the ر م ي root; the unelided counterpart of the current verb stem.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 4:112:7 and aligned Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يرمي",
      },
      {
        form: "رَامٍ",
        meaning: "one who throws or shoots",
        difference:
          "Active participle; it describes the agent performing the throwing rather than expressing the action as a finite verb.",
        relationship: "A genuine active participle of the ر م ي root, listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing الرّامي and standard weak-verb active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "رام",
      },
      {
        form: "رَمْيٌ",
        meaning: "throwing or casting",
        difference:
          "Verbal noun; it names the act of throwing rather than the current inflected verb with its attached object.",
        relationship: "A genuine verbal noun of the ر م ي root, listed in Arabic Academy evidence as الرَّمْي.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing الرَّمْي and the approved project root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "رمي",
      },
    ],
    ["سجل"]: [
      {
        form: "سِجِلٌّ",
        meaning: "a scroll or register",
        difference:
          "A distinct lexical noun in the same reviewed root entry; it contrasts with سِجِّيلٍ, whose Qur'anic sense is baked or hardened clay.",
        relationship: "A genuine Qur'anic noun of the س ج ل entry, attested in 21:104; the semantic sense differs from the current baked-clay noun.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 21:104 and 105:4 and Arabic Academy evidence distinguishing السِّجِلّ from السِّجِّيل.",
        featureSignal: ["partofspeech:noun", "derivation:distinct-lexical-sense"],
        baseDistinct: true,
        lexicalKey: "سجل",
      },
      {
        form: "سَجَّلَ",
        meaning: "he recorded or registered",
        difference:
          "Form II perfect; the doubled middle radical marks the action of writing or entering something in a register, distinct from the baked-clay noun.",
        relationship: "Form II perfect of the س ج ل root, defined by the Arabic Academy as writing or recording in a register.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for سَجَّلَ and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "سجل",
      },
      {
        form: "يُسَجِّلُ",
        meaning: "he records or registers",
        difference:
          "Form II imperfect; it presents the recording action as ongoing and makes the semantic contrast with baked clay explicit.",
        relationship: "Form II imperfect of the س ج ل root; the ongoing counterpart of سَجَّلَ.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for يُسَجِّلُ and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يسجل",
      },
      {
        form: "مُسَجَّلٌ",
        meaning: "recorded or registered",
        difference:
          "Form II passive participle; it describes something entered in a register, contrasting with the current material noun.",
        relationship: "A genuine passive participle of the س ج ل root, defined by the Arabic Academy as formally registered.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for المُسَجَّلُ and standard Form II passive-participle morphology.",
        featureSignal: ["pattern:form-2", "partofspeech:passive-participle", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "مسجل",
      },
    ],
    ["عصف"]: [
      {
        form: "عَصَفَ",
        meaning: "it blew violently or moved forcefully",
        difference:
          "Form I perfect; it states the completed action of wind blowing violently, contrasting with the current noun عَصْفٍ.",
        relationship: "Form I perfect of the ع ص ف root, defined by the Arabic Academy as wind blowing strongly.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for عَصَفَ and Quranic Arabic Corpus occurrences of the ع ص ف family.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "عصف",
      },
      {
        form: "يَعْصِفُ",
        meaning: "it blows violently or moves forcefully",
        difference:
          "Form I imperfect; it presents the forceful blowing as ongoing or habitual rather than naming the current noun.",
        relationship: "Form I imperfect of the ع ص ف root; the ongoing counterpart of عَصَفَ.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for عَصَفَ and regular Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يعصف",
      },
      {
        form: "عَاصِفٌ",
        meaning: "stormy or blowing violently",
        difference:
          "Active participle/adjective; it describes a stormy or forcefully blowing thing rather than naming the action as a noun.",
        relationship: "A genuine active participle/adjective of the ع ص ف root, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 10:22 and 14:18 and Arabic Academy evidence for عَاصِفٌ.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "عاصف",
      },
      {
        form: "عَاصِفَةٌ",
        meaning: "a storm or a stormy force",
        difference:
          "Feminine active participle/noun; it shows the feminine counterpart and the noun use for a storm, distinct from the current husk/straw sense.",
        relationship: "A genuine feminine active participle/noun of the ع ص ف root, attested in Qur'an 21:81.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 21:81 and Arabic Academy evidence for العاصفة.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "عاصفة",
      },
    ],
    ["ألف"]: [
      {
        form: "أَلِفَ",
        meaning: "he became familiar or accustomed",
        difference:
          "Form I perfect; it presents becoming familiar as a completed state, contrasting with the current Form IV verbal noun of familiarising and securing.",
        relationship: "Form I perfect of the أ ل ف root; the basic verb related to familiarity and becoming accustomed.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus أ ل ف root entry, the approved project root meaning and Arabic Academy lexicon evidence.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "ألف",
      },
      {
        form: "يَأْلَفُ",
        meaning: "he becomes familiar or is accustomed",
        difference:
          "Form I imperfect; it presents familiarity as ongoing or habitual rather than naming the current Form IV verbal noun.",
        relationship: "Form I imperfect of the أ ل ف root; the ongoing counterpart of أَلِفَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, Arabic Academy lexicon evidence and regular Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يألف",
      },
      {
        form: "أَلَّفَ",
        meaning: "he joined or reconciled",
        difference:
          "Form II perfect; the doubled middle radical marks the derived act of joining or bringing together, distinct from the Form IV verbal noun.",
        relationship: "Form II perfect of the أ ل ف root, attested in the Qur'an for joining hearts and things together.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus canonical occurrences 3:103, 8:63 and 24:43 and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "ألف",
      },
      {
        form: "تَآلَفَ",
        meaning: "he became mutually familiar or formed an affinity",
        difference:
          "Form VI perfect; the reciprocal pattern shows mutual familiarity or affinity rather than the current Form IV verbal noun naming familiarising or security.",
        relationship: "Form VI derived verb of the أ ل ف root; a genuine reciprocal relationship within the familiarity family.",
        provenance:
          "Codex-authored after review of Arabic Academy lexicon evidence listing تآلف and the approved project root meaning.",
        featureSignal: ["pattern:form-6", "tense:perfect", "voice:reciprocal"],
        baseDistinct: true,
        lexicalKey: "تآلف",
      },
    ],
    ["رحل"]: [
      {
        form: "رَحَلَ",
        meaning: "he departed or traveled",
        difference:
          "Form I perfect; it states the completed act of departing or traveling, while the current form is the related journey noun.",
        relationship: "Form I perfect of the ر ح ل root; the verb underlying travel and departure.",
        provenance:
          "Codex-authored after review of Arabic Academy lexicon evidence for رَحَلَ and the approved project root meaning.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "رحل",
      },
      {
        form: "يَرْحَلُ",
        meaning: "he departs or travels",
        difference:
          "Form I imperfect; it presents departing or traveling as ongoing or expected rather than naming the current journey noun.",
        relationship: "Form I imperfect of the ر ح ل root; the ongoing counterpart of رَحَلَ.",
        provenance:
          "Codex-authored after review of Arabic Academy lexicon evidence for رَحَلَ and regular Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يرحل",
      },
      {
        form: "رَحِيلٌ",
        meaning: "departure or traveling",
        difference:
          "Verbal noun; it names the act of departing or traveling rather than the concrete journey noun رِحْلَةَ.",
        relationship: "A genuine verbal noun of the ر ح ل root, listed with رَحَلَ and رِحْلَةٌ in Arabic lexicon evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy lexicon evidence listing الرَّحِيل and the approved project root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "رحيل",
      },
      {
        form: "رَاحِلٌ",
        meaning: "departing or traveling",
        difference:
          "Active participle; it describes a person or thing that departs, contrasting with the current noun naming a journey.",
        relationship: "A genuine active participle related to the Form I verb رَحَلَ within the ر ح ل family.",
        provenance:
          "Codex-authored after review of Arabic Academy lexicon evidence listing الرّاحلة and related رحل forms and the approved project root meaning.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "راحل",
      },
    ],
    ["شتو"]: [
      {
        form: "شَتَا",
        meaning: "he spent the winter",
        difference:
          "Form I perfect; it presents wintering as an action, contrasting with the current noun naming the winter season.",
        relationship: "Form I perfect of the ش ت و root; a genuine verb listed in Arabic Academy evidence for the winter family.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for الشتاء and الشتوي and the approved project root meaning.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "شتا",
      },
      {
        form: "شَتْوَةٌ",
        meaning: "a winter season or winter period",
        difference:
          "Feminine seasonal noun; it names a winter period rather than the unmodified season noun in the current occurrence.",
        relationship: "A genuine related noun of the ش ت و family, listed as الشَّتْوةُ in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing الشَّتْوةُ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "derivation:related-noun"],
        baseDistinct: true,
        lexicalKey: "شتوة",
      },
      {
        form: "شَتَوِيٌّ",
        meaning: "wintry or of winter",
        difference:
          "Relational adjective; it describes something belonging to or associated with winter rather than naming the season itself.",
        relationship: "A genuine relational adjective of the ش ت و root, listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of the Arabic Academy entry for الشَّتَوِيّ and the approved project root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:relational-adjective"],
        baseDistinct: true,
        lexicalKey: "شتوي",
      },
      {
        form: "مَشْتًى",
        meaning: "a winter resort or place for wintering",
        difference:
          "Place noun; it names a place associated with spending winter, contrasting with the season noun الشِّتَاء.",
        relationship: "A genuine place noun of the ش ت و family, listed as المَشْتَى in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing المَشْتَى and the approved project root meaning.",
        featureSignal: ["partofspeech:place-noun", "derivation:place"],
        baseDistinct: true,
        lexicalKey: "مشتى",
      },
    ],
    ["صيف"]: [
      {
        form: "صَيَّفَ",
        meaning: "he spent the summer or stayed for summer",
        difference:
          "Form II perfect; the doubled middle radical marks the derived act of spending or providing for a summer period.",
        relationship: "Form II perfect of the ص ي ف root, listed in Arabic Academy evidence for the summer family.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for صَيَّفَ and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "صيف",
      },
      {
        form: "اصْطَافَ",
        meaning: "he spent the summer",
        difference:
          "Form VIII perfect; the derived pattern presents taking up a summer stay, contrasting with the current season noun.",
        relationship: "A genuine Form VIII verb of the ص ي ف family, listed as اصْطافَ in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing اصْطافَ and the approved project root meaning.",
        featureSignal: ["pattern:form-8", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "اصطاف",
      },
      {
        form: "صَيْفِيٌّ",
        meaning: "summery or of summer",
        difference:
          "Relational adjective; it describes something associated with summer rather than naming the season itself.",
        relationship: "A genuine relational adjective of the ص ي ف root, listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing الصَّيْفِيّ and the approved project root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:relational-adjective"],
        baseDistinct: true,
        lexicalKey: "صيفي",
      },
      {
        form: "مَصِيفٌ",
        meaning: "a summer resort or summer residence",
        difference:
          "Place noun; it names a place where one spends the summer, contrasting with the current noun naming the season.",
        relationship: "A genuine place noun of the ص ي ف root, listed as المَصِيف in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing المَصِيف and the approved project root meaning.",
        featureSignal: ["partofspeech:place-noun", "derivation:place"],
        baseDistinct: true,
        lexicalKey: "مصيف",
      },
    ],
    ["جوع"]: [
      {
        form: "جَاعَ",
        meaning: "he became hungry",
        difference:
          "Form I perfect; it presents becoming hungry as a completed state, contrasting with the current noun جُوعٍ.",
        relationship: "Form I perfect of the ج و ع root; the finite verb underlying hunger.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for جَاعَ and the approved project root meaning.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "جاع",
      },
      {
        form: "يَجُوعُ",
        meaning: "he is hungry or becomes hungry",
        difference:
          "Form I imperfect; it presents hunger as ongoing or expected rather than naming the current noun.",
        relationship: "Form I imperfect of the ج و ع root and the ongoing counterpart of جَاعَ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 20:118:4 and regular Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يجوع",
      },
      {
        form: "جَائِعٌ",
        meaning: "hungry",
        difference:
          "Active participle/adjective; it describes a person experiencing hunger rather than naming hunger as a state or noun.",
        relationship: "A genuine active-participle adjective of the ج و ع root, listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for جَائِعٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "جائع",
      },
      {
        form: "جَوَّعَ",
        meaning: "he made someone hungry",
        difference:
          "Form II perfect; the doubled middle radical marks causing or making someone hungry, contrasting with the intransitive state noun جُوعٍ.",
        relationship: "Form II causative verb of the ج و ع root, explicitly listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for جَوَّعَ and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "جوع",
      },
    ],
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
    ["حضض"]: [
      {
        form: "حَضَّ",
        meaning: "he urged or encouraged",
        difference:
          "Form I perfect; it states a completed act of urging or encouraging, while the current occurrence is the imperfect form.",
        relationship:
          "Form I perfect of the ح ض ض root; it is the completed counterpart of يَحُضُّ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical Qur'anic evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حضض",
      },
      {
        form: "حَضٌّ",
        meaning: "urging or encouragement",
        difference:
          "Verbal noun; it names the act of urging rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun of the ح ض ض root, naming the encouragement expressed by حَضَّ and يَحُضُّ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical Qur'anic evidence and standard Arabic Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "حضض",
      },
      {
        form: "حَاضٌّ",
        meaning: "one who urges or encourages",
        difference:
          "Active participle; it describes the agent who performs the urging, contrasting with the finite imperfect يَحُضُّ.",
        relationship:
          "A genuine active participle of the ح ض ض root, corresponding to the project’s reviewed حَاضّ form.",
        provenance:
          "Codex-authored after review of the approved project root meaning, the existing reviewed project form and standard Arabic active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "حاضض",
      },
      {
        form: "تَحَاضُّونَ",
        meaning: "you urge one another",
        difference:
          "Form VI imperfect, second-person masculine plural; the reciprocal pattern shows people mutually urging one another, as in the Qur'anic occurrence 89:18.",
        relationship:
          "A genuine Qur'anic Form VI reciprocal form of the ح ض ض root, contrasting the singular imperfect يَحُضُّ with mutual urging.",
        provenance:
          "Codex-authored after review of canonical Qur'anic occurrence word:89:18:2 and aligned Quranic Arabic Corpus morphology.",
        featureSignal: ["pattern:form-6", "tense:imperfect", "person:second-person", "number:plural", "voice:reciprocal"],
        baseDistinct: true,
        lexicalKey: "تحاضض",
      },
    ],
    ["عصر"]: [
      {
        form: "عَصَرَ",
        meaning: "he pressed or squeezed",
        difference:
          "Form I perfect; it presents the completed act of pressing or squeezing, contrasting with the current time noun.",
        relationship:
          "Form I perfect of the ع ص ر root, the basic verb behind the pressing and time-related lexical family.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ع ص ر entry and Arabic Academy evidence for عَصَرَ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "عصر",
      },
      {
        form: "يَعْصِرُ",
        meaning: "he presses or squeezes",
        difference:
          "Form I imperfect, third-person masculine singular; it presents pressing or squeezing as ongoing or expected.",
        relationship:
          "Form I imperfect of the ع ص ر root, attested in Qur'an 12:36 and 12:49.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 12:36:9 and 12:49:11 and aligned morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "يعصر",
      },
      {
        form: "إِعْصَارٌ",
        meaning: "a whirlwind",
        difference:
          "Form IV verbal noun; it names a powerful swirling wind, showing a derived pattern rather than the current time noun.",
        relationship:
          "A genuine Form IV verbal noun of the ع ص ر root, attested in Qur'an 2:266.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 2:266:25 and Arabic Academy evidence for الإعصار.",
        featureSignal: ["pattern:form-4", "partofspeech:verbal-noun", "derivation:derived-noun"],
        baseDistinct: true,
        lexicalKey: "اعصار",
      },
      {
        form: "مُعْصِرَةٌ",
        meaning: "a rain cloud",
        difference:
          "Form IV feminine active participle; it names a cloud associated with producing rain, contrasting with the current masculine time noun.",
        relationship:
          "The singular feminine counterpart of the Qur'anic Form IV active participle مُعْصِرَات, the rain clouds in 78:14.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 78:14:3 and Arabic Academy evidence defining المُعْصِرات as rain-bearing clouds.",
        featureSignal: ["pattern:form-4", "partofspeech:active-participle", "gender:feminine", "number:singular"],
        baseDistinct: true,
        lexicalKey: "معصرة",
      },
    ],
    ["زلزل"]: [
      {
        form: "زَلْزَلَ",
        meaning: "he shook or convulsed",
        difference: "Active quadriliteral perfect; it presents the completed shaking action, contrasting with the current passive form.",
        relationship: "The active quadriliteral verb of the ز ل ز ل family underlying زُلْزِلَتْ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ز ل ز ل entry, which identifies the Form I verb as ‘to shake,’ and aligned quadriliteral morphology.",
        featureSignal: ["pattern:quadriliteral", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "زلزل",
      },
      {
        form: "يُزَلْزِلُ",
        meaning: "he shakes or convulses",
        difference: "Active quadriliteral imperfect; it presents shaking as ongoing or repeated.",
        relationship: "The imperfect counterpart of زَلْزَلَ in the ز ل ز ل family.",
        provenance: "Codex-authored after review of standard Arabic quadriliteral conjugation for زَلْزَلَ and the canonical Quranic forms listed by the Quranic Arabic Corpus.",
        featureSignal: ["pattern:quadriliteral", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يزلزل",
      },
      {
        form: "زَلْزَلَةٌ",
        meaning: "a shaking or convulsion",
        difference: "Quadriliteral verbal noun; it names the convulsion as an event rather than expressing it as a verb.",
        relationship: "A genuine verbal noun of زَلْزَلَ, attested canonically in 22:1 and listed by the Quranic Arabic Corpus.",
        provenance: "Codex-authored after review of canonical Qur'anic occurrence word:22:1:6 and the Quranic Arabic Corpus ز ل ز ل entry.",
        featureSignal: ["pattern:quadriliteral", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "زلزلة",
      },
      {
        form: "مُزَلْزِلٌ",
        meaning: "shaking or causing convulsion",
        difference: "Active participle; it describes an agent or force that shakes, contrasting with the current passive verb.",
        relationship: "The active participle of زَلْزَلَ in the ز ل ز ل family, formed by the regular quadriliteral active-participle pattern.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ز ل ز ل family and standard Arabic quadriliteral active-participle morphology.",
        featureSignal: ["pattern:quadriliteral", "partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "مزلزل",
      },
    ],
    ["ضبح"]: [
      {
        form: "ضَبَحَ",
        meaning: "he panted or made a deep breathing sound",
        difference: "Form I perfect; it states the completed panting action named by the current verbal noun.",
        relationship: "Form I perfect of the ض ب ح root, the verb underlying ضَبْحٌ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ض ب ح entry and Arabic Academy evidence defining ضَبَحَ as the breathing sound of running horses.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "ضبح",
      },
      {
        form: "يَضْبَحُ",
        meaning: "he pants or makes a deep breathing sound",
        difference: "Form I imperfect, third-person masculine singular; it presents panting as ongoing or habitual.",
        relationship: "Form I imperfect of the ض ب ح root, the ongoing counterpart of ضَبَحَ.",
        provenance: "Codex-authored after review of the Arabic Academy ض ب ح entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يضح",
      },
      {
        form: "مَضْبُوحٌ",
        meaning: "scorched or lightly blackened",
        difference: "Passive participle; it describes something affected by the root action of scorching, giving a result-state contrast.",
        relationship: "A genuine passive participle of the ض ب ح root, listed in the Arabic Academy entry.",
        provenance: "Codex-authored after review of the Arabic Academy ض ب ح entry, which lists المَضْبُوحَ as an affected/result form.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مضبوح",
      },
      {
        form: "ضَبِيحٌ",
        meaning: "scorched or roasted",
        difference: "Adjectival result form; it describes the scorched state rather than naming the panting action.",
        relationship: "A genuine result adjective of the ض ب ح root, recorded in the Arabic Academy entry alongside مَضْبُوحٍ.",
        provenance: "Codex-authored after review of the Arabic Academy ض ب ح entry, which lists ضَبِيحٌ as a result form.",
        featureSignal: ["partofspeech:adjective", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "ضبيح",
      },
    ],
    ["قدح"]: [
      {
        form: "قَدَحَ",
        meaning: "he struck or kindled",
        difference: "Form I perfect; it presents the completed striking or fire-kindling action named by قَدْحًا.",
        relationship: "Form I perfect of the ق د ح root, the verb underlying the current verbal noun.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ق د ح entry and Arabic Academy evidence defining قَدَحَ as striking a firestone or producing fire.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "قدح",
      },
      {
        form: "يَقْدَحُ",
        meaning: "he strikes or kindles",
        difference: "Form I imperfect, third-person masculine singular; it presents striking or kindling as ongoing.",
        relationship: "Form I imperfect of the ق د ح root, the ongoing counterpart of قَدَحَ.",
        provenance: "Codex-authored after review of the Arabic Academy ق د ح root entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يقدح",
      },
      {
        form: "قَادِحٌ",
        meaning: "one who strikes or kindles",
        difference: "Active participle; it names the agent that performs the striking or kindling action.",
        relationship: "A genuine active participle of the ق د ح root, listed among the established family forms by the Arabic Academy.",
        provenance: "Codex-authored after review of the Arabic Academy ق د ح entry and standard Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "قادح",
      },
      {
        form: "مِقْدَاحٌ",
        meaning: "a fire striker or fire-making tool",
        difference: "Instrument noun; it names the tool used for the root action rather than the action itself.",
        relationship: "A genuine instrument noun of the ق د ح root, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of the Arabic Academy ق د ح entry listing المِقْدَاحُ among the established family forms.",
        featureSignal: ["partofspeech:instrument-noun", "derivation:instrument"],
        baseDistinct: true,
        lexicalKey: "مقداح",
      },
    ],
    ["غير"]: [
      {
        form: "أَغَارَ",
        meaning: "he raided or attacked",
        difference: "Form IV perfect; it states a completed raid or attack, contrasting with the current feminine plural active participle.",
        relationship: "Form IV perfect of the غ ي ر root in the raid/attack family behind مُغِيرَاتٍ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus غ ي ر evidence and Arabic Academy evidence defining أَغَارَ عَلَى القوم as attacking them.",
        featureSignal: ["pattern:form-4", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "اغار",
      },
      {
        form: "يُغِيرُ",
        meaning: "he raids or attacks",
        difference: "Form IV imperfect, third-person masculine singular; it presents raiding as ongoing or expected.",
        relationship: "Form IV imperfect of the غ ي ر root, the ongoing counterpart of أَغَارَ.",
        provenance: "Codex-authored after review of the Arabic Academy غ ي ر evidence and standard Form IV imperfect morphology.",
        featureSignal: ["pattern:form-4", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يغير",
      },
      {
        form: "إِغَارَةٌ",
        meaning: "a raid or attack",
        difference: "Form IV verbal noun; it names the raid as an event rather than describing the raiders.",
        relationship: "The genuine Form IV verbal noun of أَغَارَ in the غ ي ر raid/attack family.",
        provenance: "Codex-authored after review of the Arabic Academy entry for أَغَارَ and standard Form IV verbal-noun morphology.",
        featureSignal: ["pattern:form-4", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "اغارة",
      },
      {
        form: "مُغِيرٌ",
        meaning: "a raider or attacker",
        difference: "Form IV active participle; it names one who performs the raid, contrasting with the current feminine plural form.",
        relationship: "A genuine Form IV active participle of أَغَارَ, the singular counterpart of مُغِيرَاتٍ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus occurrence and Arabic Academy evidence for مُغِيرٌ.",
        featureSignal: ["pattern:form-4", "partofspeech:active-participle", "number:singular"],
        baseDistinct: true,
        lexicalKey: "مغير",
      },
    ],
    ["ثور"]: [
      {
        form: "ثَارَ",
        meaning: "he rose or erupted",
        difference: "Form I perfect; it presents a completed rising or erupting, contrasting with the current causative verb.",
        relationship: "Form I perfect of the ث و ر root, the intransitive base related to أَثَارَ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ث و ر entry and Arabic Academy evidence for ثَارَ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "ثار",
      },
      {
        form: "يَثُورُ",
        meaning: "he rises or erupts",
        difference: "Form I imperfect, third-person masculine singular; it presents rising or erupting as ongoing.",
        relationship: "Form I imperfect of the ث و ر root, the ongoing counterpart of ثَارَ.",
        provenance: "Codex-authored after review of the Arabic Academy ث و ر evidence and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يثور",
      },
      {
        form: "أَثَارَ",
        meaning: "he stirred up or raised",
        difference: "Form IV perfect; it presents causing something to rise, matching the causative relationship in فَأَثَرْنَ.",
        relationship: "Form IV perfect of the ث و ر root, the completed causative action behind the current form.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ث و ر evidence and Arabic Academy evidence defining أَثَارَ as stirring or raising.",
        featureSignal: ["pattern:form-4", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "اثار",
      },
      {
        form: "مُثِيرٌ",
        meaning: "one who stirs up or raises",
        difference: "Form IV active participle; it names the agent causing something to rise rather than expressing the action as a finite verb.",
        relationship: "A genuine Form IV active participle of أَثَارَ in the ث و ر family.",
        provenance: "Codex-authored after review of the Arabic Academy entry for أَثَارَ and standard Form IV active-participle morphology.",
        featureSignal: ["pattern:form-4", "partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "مثير",
      },
    ],
    ["نقع"]: [
      {
        form: "نَقَعَ",
        meaning: "he soaked or quenched",
        difference: "Form I perfect; it presents the completed soaking or quenching action, contrasting with the dust noun in the current āyah.",
        relationship: "Form I perfect of the ن ق ع root, the verbal base of the reviewed family.",
        provenance: "Codex-authored after review of the Arabic Academy ن ق ع entry defining نَقَعَ as soaking or quenching.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "نقع",
      },
      {
        form: "يَنْقَعُ",
        meaning: "he soaks or quenches",
        difference: "Form I imperfect, third-person masculine singular; it presents soaking or quenching as ongoing.",
        relationship: "Form I imperfect of the ن ق ع root, the ongoing counterpart of نَقَعَ.",
        provenance: "Codex-authored after review of the Arabic Academy ن ق ع entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "ينقع",
      },
      {
        form: "أَنْقَعَ",
        meaning: "he made something soak or quenched it",
        difference: "Form IV perfect; the derived pattern presents causing something to soak or relieving thirst.",
        relationship: "A genuine Form IV derived verb of the ن ق ع root, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of the Arabic Academy ن ق ع entry defining أَنْقَعَ as making something soak or quenching it.",
        featureSignal: ["pattern:form-4", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "انقع",
      },
      {
        form: "مُسْتَنْقَعٌ",
        meaning: "a pool or stagnant-water place",
        difference: "Derived noun; it names a place where water collects, showing a concrete location built from the root rather than the dust noun.",
        relationship: "A genuine derived noun of the ن ق ع family, listed by the Arabic Academy among the established forms.",
        provenance: "Codex-authored after review of the Arabic Academy ن ق ع entry listing المُسْتَنْقَعُ.",
        featureSignal: ["pattern:form-10", "partofspeech:noun", "derivation:place-noun"],
        baseDistinct: true,
        lexicalKey: "مستنقع",
      },
    ],
    ["وسط"]: [
      {
        form: "وَسَطَ",
        meaning: "he entered or went into the middle",
        difference: "Form I perfect; it presents the completed entering into the middle, contrasting with the current feminine plural form.",
        relationship: "Form I perfect of the و س ط root, the base verb underlying فَوَسَطْنَ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus و س ط evidence and Arabic Academy evidence defining وَسَطَ as entering the middle.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "وسط",
      },
      {
        form: "يَسِطُ",
        meaning: "he enters or goes into the middle",
        difference: "Form I imperfect, third-person masculine singular; it presents entering the middle as ongoing or expected.",
        relationship: "Form I imperfect of the و س ط root, explicitly given by the Arabic Academy alongside وَسَطَ.",
        provenance: "Codex-authored after review of the Arabic Academy و س ط entry, which gives وَسَطَ الشيءَ يَسِطُهُ.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يسط",
      },
      {
        form: "وَسَّطَ",
        meaning: "he placed in the middle",
        difference: "Form II perfect; the doubled middle radical marks causing or placing something in the middle.",
        relationship: "A genuine Form II derived verb of the و س ط root, defined by the Arabic Academy as putting something in the middle.",
        provenance: "Codex-authored after review of the Arabic Academy و س ط entry defining وَسَّطَ.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "وسط",
      },
      {
        form: "تَوَسَّطَ",
        meaning: "he positioned himself in the middle",
        difference: "Form V derived verb; it presents taking a middle position rather than entering the middle as a simple Form I action.",
        relationship: "A genuine derived verb of the و س ط root, listed by the Arabic Academy among the established family forms.",
        provenance: "Codex-authored after review of the Arabic Academy و س ط entry listing تَوَسَّطَ.",
        featureSignal: ["pattern:form-5", "tense:perfect", "voice:reflexive"],
        baseDistinct: true,
        lexicalKey: "توسط",
      },
    ],
    ["كند"]: [
      {
        form: "كَنَدَ",
        meaning: "he denied or was ungrateful for a blessing",
        difference: "Form I perfect; it presents the completed act or attitude underlying the adjective كَنُودٌ.",
        relationship: "Form I perfect of the ك ن د root, defined by the Arabic Academy as denying or rejecting a blessing.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ك ن د entry and Arabic Academy evidence for كَنَدَ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "كند",
      },
      {
        form: "يَكْنُدُ",
        meaning: "he denies or is ungrateful for a blessing",
        difference: "Form I imperfect, third-person masculine singular; it presents ingratitude as ongoing or habitual.",
        relationship: "Form I imperfect of the ك ن د root, the ongoing counterpart of كَنَدَ.",
        provenance: "Codex-authored after review of the Arabic Academy ك ن د entry, which gives the Form I past vowel and present pattern.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يكند",
      },
      {
        form: "كُنُودٌ",
        meaning: "ingratitude or denial of a blessing",
        difference: "Verbal noun; it names the attitude or action of denying a blessing rather than describing the ungrateful person.",
        relationship: "A genuine verbal noun of the ك ن د root, attested in the Arabic Academy definition of كَنَدَ and related to كَنُودٌ.",
        provenance: "Codex-authored after review of the Arabic Academy ك ن د root entry, which uses كُنُودًا for denying a blessing.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "كنود",
      },
      {
        form: "كَانِدٌ",
        meaning: "ungrateful or denying a blessing",
        difference: "Active participle; it describes the person performing the denial or ingratitude, contrasting with the current quality adjective.",
        relationship: "A genuine active participle of the ك ن د root, recorded in established Arabic dictionary evidence alongside كَنُودٌ.",
        provenance: "Codex-authored after review of established Arabic dictionary evidence for كَانِدٌ and the Arabic Academy definition of كَنَدَ.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "كاند",
      },
    ],
    ["بعثر"]: [
      {
        form: "بَعْثَرَ",
        meaning: "he scattered or turned over",
        difference: "Quadriliteral perfect verb; it presents the completed scattering or turning-over action, contrasting with the current passive form.",
        relationship: "The active quadriliteral verb of the ب ع ث ر family underlying بُعْثِرَ.",
        provenance: "Codex-authored after review of the canonical Qur'anic occurrences 100:9 and 82:4 and reliable Arabic lexicon evidence defining بَعْثَرَ.",
        featureSignal: ["pattern:quadriliteral", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "بعثر",
      },
      {
        form: "يُبَعْثِرُ",
        meaning: "he scatters or turns over",
        difference: "Quadriliteral imperfect; it presents scattering or turning over as ongoing or repeated.",
        relationship: "The imperfect counterpart of بَعْثَرَ in the ب ع ث ر family.",
        provenance: "Codex-authored after review of reliable Arabic conjugation evidence for بَعْثَرَ يُبَعْثِرُ and the canonical passive occurrences.",
        featureSignal: ["pattern:quadriliteral", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يبعثر",
      },
      {
        form: "بَعْثَرَةٌ",
        meaning: "scattering or turning over",
        difference: "Quadriliteral verbal noun; it names the action rather than describing its active or passive participants.",
        relationship: "The established action noun of بَعْثَرَ, attested in Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic lexicon evidence defining بَعْثَرَةً as scattering, turning over or exposing what is inside.",
        featureSignal: ["pattern:quadriliteral", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "بعثرة",
      },
      {
        form: "مُبَعْثِرٌ",
        meaning: "one who scatters or turns over",
        difference: "Active participle; it names the agent performing the quadriliteral action, contrasting with the current passive verb.",
        relationship: "The active participle of بَعْثَرَ in the ب ع ث ر family.",
        provenance: "Codex-authored after review of reliable Arabic morphology for the active participle of بَعْثَرَ and the canonical Qur'anic passive forms.",
        featureSignal: ["pattern:quadriliteral", "partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "مبعثر",
      },
    ],
    ["حصل"]: [
      {
        form: "حَصَلَ",
        meaning: "he obtained or it occurred",
        difference: "Form I perfect; it presents obtaining or occurring as a completed event, contrasting with the current Form II passive.",
        relationship: "Form I perfect of the ح ص ل root, the base verb related to حُصِّلَ.",
        provenance: "Codex-authored after review of the Arabic Academy ح ص ل entry defining حَصَلَ as occurring, remaining or being obtained.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حصل",
      },
      {
        form: "يَحْصُلُ",
        meaning: "he obtains or it occurs",
        difference: "Form I imperfect, third-person masculine singular; it presents obtaining or occurring as ongoing or expected.",
        relationship: "Form I imperfect of the ح ص ل root, the ongoing counterpart of حَصَلَ.",
        provenance: "Codex-authored after review of the Arabic Academy ح ص ل entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يحصل",
      },
      {
        form: "حَصَّلَ",
        meaning: "he collected or obtained",
        difference: "Form II perfect; the doubled middle radical marks gathering, extracting or obtaining something deliberately.",
        relationship: "Form II perfect of the ح ص ل root, explicitly defined by the Arabic Academy as collecting or extracting.",
        provenance: "Codex-authored after review of the Arabic Academy ح ص ل entry defining حَصَّلَ.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "حصل",
      },
      {
        form: "مُحَصَّلٌ",
        meaning: "collected or obtained",
        difference: "Form II passive participle; it describes something that has been collected or extracted, contrasting with the current passive finite verb.",
        relationship: "The passive participle of حَصَّلَ in the ح ص ل family, built from the reviewed Form II verb.",
        provenance: "Codex-authored after review of the Arabic Academy ح ص ل entry and standard Form II passive-participle morphology.",
        featureSignal: ["pattern:form-2", "partofspeech:passive-participle", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "محصل",
      },
    ],
    ["قرع"]: [
      {
        form: "قَرَعَ",
        meaning: "he struck or knocked",
        difference:
          "Form I perfect; it presents the completed act of striking or knocking, while the current occurrence is the noun naming a striking calamity.",
        relationship:
          "Form I perfect of the ق ر ع root, the verbal base behind قَارِعَةٌ.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ق ر ع entry and Arabic Academy evidence defining قَرَعَ as striking or knocking.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "قرع",
      },
      {
        form: "يَقْرَعُ",
        meaning: "he strikes or knocks",
        difference:
          "Form I imperfect, third-person masculine singular; it presents striking or knocking as ongoing or expected.",
        relationship:
          "Form I imperfect of the ق ر ع root, the ongoing counterpart of قَرَعَ.",
        provenance:
          "Codex-authored after review of the Arabic Academy ق ر ع root entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يقرع",
      },
      {
        form: "قَرْعٌ",
        meaning: "striking or knocking",
        difference:
          "Verbal noun; it names the act of striking or knocking rather than the calamity noun or a finite verb.",
        relationship:
          "A genuine verbal noun of the ق ر ع root, listed in the Arabic Academy root entry.",
        provenance:
          "Codex-authored after review of the Arabic Academy ق ر ع root entry, which lists القَرْعُ among the established family forms.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "قرع",
      },
      {
        form: "قَارِعٌ",
        meaning: "striking or one who strikes",
        difference:
          "Active participle/adjective; it describes a striking agent or quality, contrasting with the feminine noun naming the calamity.",
        relationship:
          "A genuine active-participle form of the ق ر ع root, related to قَارِعَةٌ by the same root and participial pattern.",
        provenance:
          "Codex-authored after review of the Arabic Academy ق ر ع root entry and standard Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "قارع",
      },
    ],
    ["فرش"]: [
      {
        form: "فَرَشَ",
        meaning: "he spread or laid out",
        difference:
          "Form I perfect; it presents the completed act of spreading or laying something out, contrasting with the current moth noun.",
        relationship:
          "Form I perfect of the ف ر ش root, the verbal base behind the فرش lexical family.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ف ر ش entry and Arabic Academy evidence defining فَرَشَ as spreading or laying out.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "فرش",
      },
      {
        form: "يَفْرُشُ",
        meaning: "he spreads or lays out",
        difference:
          "Form I imperfect, third-person masculine singular; it presents spreading or laying out as ongoing or habitual.",
        relationship:
          "Form I imperfect of the ف ر ش root, the ongoing counterpart of فَرَشَ.",
        provenance:
          "Codex-authored after review of the Arabic Academy ف ر ش root entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يفرش",
      },
      {
        form: "فِرَاشٌ",
        meaning: "bedding or a bed",
        difference:
          "Noun with the same root but a different established lexical sense; it shows how ف ر ش names something spread out for resting.",
        relationship:
          "A genuine noun of the ف ر ش family, listed by the Arabic Academy as household bedding or a bed.",
        provenance:
          "Codex-authored after review of the Arabic Academy ف ر ش entry, which distinguishes الفِراشُ (bedding) from الفَراشُ (the insect).",
        featureSignal: ["partofspeech:noun", "derivation:related-noun", "semantic:lexical-sense"],
        baseDistinct: true,
        lexicalKey: "فراش",
      },
      {
        form: "فَرَّاشٌ",
        meaning: "a bedding attendant",
        difference:
          "Form II-derived agent noun; it names a person who attends to bedding, showing a derived occupation noun from the same root.",
        relationship:
          "A genuine derived agent noun of the ف ر ش family, defined by the Arabic Academy as the worker responsible for bedding.",
        provenance:
          "Codex-authored after review of the Arabic Academy ف ر ش entry defining الفَرّاشُ and the standard Form II-derived agent pattern.",
        featureSignal: ["pattern:form-2", "partofspeech:agent-noun", "derivation:occupation"],
        baseDistinct: true,
        lexicalKey: "فراش",
      },
    ],
    ["عهن"]: [
      {
        form: "عِهْنٌ",
        meaning: "dyed wool",
        difference:
          "Bare indefinite singular noun; it presents the wool lexeme without the current attached preposition and definite article.",
        relationship:
          "The base noun of the ع ه ن wool family, corresponding to the current كَالْعِهْنِ construction.",
        provenance:
          "Codex-authored after review of the Arabic Academy ع ه ن entry defining العِهْنُ as wool dyed in colours.",
        featureSignal: ["partofspeech:noun", "state:indefinite", "derivation:base-form"],
        baseDistinct: true,
        lexicalKey: "عهن",
      },
      {
        form: "عِهْنَةٌ",
        meaning: "a piece of dyed wool",
        difference:
          "Feminine unit noun; it names one piece of the wool rather than the collective material noun.",
        relationship:
          "An established feminine derivative of عِهْنٌ, explicitly given in the Arabic Academy entry.",
        provenance:
          "Codex-authored after review of the Arabic Academy ع ه ن entry, which defines عِهْنَةٌ as a piece of عِهْن.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "derivation:unit-noun"],
        baseDistinct: true,
        lexicalKey: "عهنة",
      },
      {
        form: "عُهُونٌ",
        meaning: "pieces or kinds of dyed wool",
        difference:
          "Broken plural; it marks multiple pieces or kinds of the wool noun rather than one material noun.",
        relationship:
          "An established plural of عِهْنٌ, listed in the Arabic Academy entry.",
        provenance:
          "Codex-authored after review of the Arabic Academy ع ه ن entry, which lists عُهُونٌ as the plural of العِهْنُ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "عهون",
      },
      {
        form: "عِهْنِيٌّ",
        meaning: "woollen or related to wool",
        difference:
          "Relational adjective; it describes something made of or associated with wool rather than naming the material itself.",
        relationship:
          "A genuine nisbah adjective built from the ع ه ن wool noun, retained from the project-reviewed family evidence.",
        provenance:
          "Codex-authored after review of the project-reviewed عِهْنِيٌّ row and the Arabic Academy definition of عِهْنٌ as wool.",
        featureSignal: ["partofspeech:relational-adjective", "derivation:nisbah", "semantic:material"],
        baseDistinct: true,
        lexicalKey: "عهني",
      },
    ],
    ["نفش"]: [
      {
        form: "نَفَشَ",
        meaning: "he spread or pastured at night",
        difference:
          "Form I perfect; it presents the completed spreading/fluffing or nocturnal pasturing action, contrasting with the current passive participle.",
        relationship:
          "Form I perfect of the ن ف ش root, the verbal base behind مَنْفُوشٌ.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ن ف ش entry and Arabic Academy evidence defining نَفَشَ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "نفش",
      },
      {
        form: "يَنْفُشُ",
        meaning: "he spreads or pastures at night",
        difference:
          "Form I imperfect, third-person masculine singular; it presents the spreading or pasturing action as ongoing or habitual.",
        relationship:
          "Form I imperfect of the ن ف ش root, the ongoing counterpart of نَفَشَ.",
        provenance:
          "Codex-authored after review of the Arabic Academy ن ف ش root entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "ينفش",
      },
      {
        form: "نَفْشٌ",
        meaning: "spreading or fluffing",
        difference:
          "Verbal noun; it names the action of spreading or fluffing wool rather than describing the wool after the action.",
        relationship:
          "A genuine verbal noun of the ن ف ش root, listed in the Arabic Academy entry.",
        provenance:
          "Codex-authored after review of the Arabic Academy ن ف ش entry, which lists النَّفْشُ and defines the underlying action.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "نفش",
      },
      {
        form: "نَافِشٌ",
        meaning: "one who spreads or pastures at night",
        difference:
          "Active participle; it names the agent or animal performing the spreading or nocturnal pasturing action, contrasting with the passive result مَنْفُوشٌ.",
        relationship:
          "A genuine active participle of the ن ف ش root, explicitly defined by the Arabic Academy entry.",
        provenance:
          "Codex-authored after review of the Arabic Academy ن ف ش entry defining نافِشٌ and the standard Form I active-participle pattern.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "نافش",
      },
    ],
    ["خفف"]: [
      {
        form: "خَفَّ",
        meaning: "he or it became light",
        difference:
          "Form I perfect; it presents the completed change to a lighter state, contrasting with the current feminine-marked verb خَفَّتْ.",
        relationship:
          "Form I perfect of the خ ف ف root, the masculine/base counterpart of the current form.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus خ ف ف entry and Arabic Academy evidence for خَفَّ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "خف",
      },
      {
        form: "يَخِفُّ",
        meaning: "he or it becomes light",
        difference:
          "Form I imperfect, third-person masculine singular; it presents becoming light as ongoing or expected.",
        relationship:
          "Form I imperfect of the خ ف ف root, the ongoing counterpart of خَفَّ.",
        provenance:
          "Codex-authored after review of the Arabic Academy خ ف ف root entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يخف",
      },
      {
        form: "خَفَّفَ",
        meaning: "he lightened or eased",
        difference:
          "Form II perfect; the doubled middle radical presents causing something to become lighter or easier.",
        relationship:
          "A genuine Form II derived verb of the خ ف ف root, contrasting a causative action with the intransitive current verb.",
        provenance:
          "Codex-authored after review of the Arabic Academy خ ف ف root entry defining خَفَّفَ as making something light or easing it.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "خفف",
      },
      {
        form: "خَفِيفٌ",
        meaning: "light or slight",
        difference:
          "Adjective; it describes a light state or quality rather than expressing the change as a finite verb.",
        relationship:
          "A genuine adjective of the خ ف ف root, listed in the Arabic Academy entry.",
        provenance:
          "Codex-authored after review of the Arabic Academy خ ف ف entry defining الخَفِيفُ and the approved project root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:quality-adjective"],
        baseDistinct: true,
        lexicalKey: "خفيف",
      },
    ],
    ["حمي"]: [
      {
        form: "حَمِيَ",
        meaning: "he or it became hot",
        difference:
          "Form I perfect; it presents the completed becoming-hot state that underlies the current adjective-like participle.",
        relationship:
          "Form I perfect of the ح م ي root in its heat/intensity sense, the verbal base related to حَامِيَةٌ.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ح م ي entry and Arabic Academy evidence defining حَمِيَ as becoming hot.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حمي",
      },
      {
        form: "يَحْمَىٰ",
        meaning: "he or it becomes hot",
        difference:
          "Form I imperfect, third-person masculine singular; it presents becoming hot as ongoing or expected.",
        relationship:
          "Form I imperfect of حَمِيَ in the heat/intensity sense, showing the ongoing counterpart of the current form.",
        provenance:
          "Codex-authored after review of the Arabic Academy ح م ي root entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يحمى",
      },
      {
        form: "حُمُوٌّ",
        meaning: "heat or intensity",
        difference:
          "Verbal noun; it names the heat or intensity itself rather than describing a hot thing as an adjective.",
        relationship:
          "A genuine verbal noun of the ح م ي heat family, listed in the Arabic Academy entry alongside حَمْيٌ and حَمِيٌّ.",
        provenance:
          "Codex-authored after review of the Arabic Academy ح م ي entry, which lists حُمُوٌّ as a verbal noun of becoming hot.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "حمو",
      },
      {
        form: "حَمِيٌّ",
        meaning: "hot or ardent",
        difference:
          "Adjective; it describes a hot or intense state, giving a direct quality contrast with the feminine current form حَامِيَةٌ.",
        relationship:
          "A genuine adjective of the ح م ي heat/intensity family, explicitly listed by the Arabic Academy.",
        provenance:
          "Codex-authored after review of the Arabic Academy ح م ي entry defining الحَمِيُّ as hot/ardent and the approved project root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:quality-adjective"],
        baseDistinct: true,
        lexicalKey: "حمي",
      },
    ],
    ["ويل"]: [
      {
        form: "وَيْلٌ",
        meaning: "woe or ruin",
        difference:
          "Bare lexical noun; it gives the core woe expression without the current فَ connector.",
        relationship:
          "The core noun of the و ي ل family, directly underlying the current فَوَيْلٌ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, canonical Qur'anic occurrences of وَيْلٌ and Arabic lexicon evidence for the و ي ل noun.",
        featureSignal: ["partofspeech:noun", "derivation:base-form"],
        baseDistinct: true,
        lexicalKey: "ويل",
      },
      {
        form: "وَيْلَةٌ",
        meaning: "a calamity or misfortune",
        difference:
          "Feminine derivative noun; it expresses an individual calamity or misfortune rather than the fixed woe expression وَيْلٌ.",
        relationship:
          "A genuine feminine derivative of the و ي ل family, attested in Qur'anic exclamations such as يَا وَيْلَتَنَا.",
        provenance:
          "Codex-authored after review of canonical Qur'anic evidence for وَيْلَةٌ and Arabic lexicon evidence defining وَيْلَةٌ as calamity or misfortune.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "derivation:related-noun"],
        baseDistinct: true,
        lexicalKey: "ويلة",
      },
      {
        form: "وَيْلَاتٌ",
        meaning: "calamities or misfortunes",
        difference:
          "Sound plural of وَيْلَةٌ; it marks multiple calamities rather than the singular woe noun in the current occurrence.",
        relationship:
          "The established plural of وَيْلَةٌ within the و ي ل lexical family.",
        provenance:
          "Codex-authored after review of Arabic lexicon evidence listing وَيْلَاتٌ as the plural of وَيْلَةٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:plural"],
        baseDistinct: true,
        lexicalKey: "ويلات",
      },
      {
        form: "وَيْلَكَ",
        meaning: "woe to you",
        difference:
          "The woe noun with an attached second-person masculine pronoun; it teaches how the fixed expression addresses a specific person.",
        relationship:
          "A genuine attached-pronoun construction of وَيْلٌ in the و ي ل family, distinct from the current فَ + وَيْلٌ construction.",
        provenance:
          "Codex-authored after review of canonical Arabic usage and lexicon evidence recording وَيْلَكَ as ‘woe to you’; the attached pronoun is taught as grammar, not a new root.",
        featureSignal: ["partofspeech:noun-plus-pronoun", "attachment:second-person-masculine", "derivation:attached-expression"],
        baseDistinct: true,
        lexicalKey: "ويلك",
      },
      {
        form: "وَيَّلَ",
        meaning: "he invoked woe upon or caused woe",
        difference:
          "Form II perfect; the doubled middle radical presents causing or invoking woe rather than naming the woe itself.",
        relationship:
          "A genuine Form II derived verb of the و ي ل family, listed with وَيْلٌ and وَيْلَةٌ in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of the Arabic Academy entry for ويل, which lists وَيَّلَ and related forms, and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "ويل",
      },
    ],
    ["همز"]: [
      {
        form: "هَمَزَ",
        meaning: "he taunted or insulted",
        difference:
          "Form I perfect; it presents the completed act of taunting or insulting, contrasting with the current noun naming the person who does it.",
        relationship:
          "Form I perfect of the ه م ز root, the verbal base related to هُمَزَةٌ and هَمَّازٌ.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ه م ز entry and Arabic Academy evidence listing هَمَزَ and its related forms.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "همز",
      },
      {
        form: "يَهْمِزُ",
        meaning: "he taunts or insults",
        difference:
          "Form I imperfect, third-person masculine singular; it shows the taunting action as ongoing or habitual.",
        relationship:
          "Form I imperfect of the ه م ز root; the ongoing counterpart of هَمَزَ.",
        provenance:
          "Codex-authored after review of the ه م ز root evidence and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "يهمز",
      },
      {
        form: "هَامِزٌ",
        meaning: "one who taunts",
        difference:
          "Active participle; it describes the agent performing the taunting rather than naming the action as a finite verb.",
        relationship:
          "A genuine active participle of the ه م ز root, listed in Arabic lexical evidence alongside هُمَزَةٌ.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing الهامز and the approved project root meaning.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "هامز",
      },
      {
        form: "هَمَّازٌ",
        meaning: "a habitual defamer",
        difference:
          "Intensive adjective/noun; the doubled middle radical marks a habitual or emphatic defamer, contrasting with the ordinary agent form.",
        relationship:
          "A genuine intensive form of the ه م ز root, attested in Qur'an 68:11 as هَمَّازٍ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 68:11:1 and Arabic Academy evidence for الهَمّاز.",
        featureSignal: ["pattern:form-2", "partofspeech:adjective", "derivation:intensive"],
        baseDistinct: true,
        lexicalKey: "هماز",
      },
    ],
    ["لمز"]: [
      {
        form: "لَمَزَ",
        meaning: "he found fault with or criticized",
        difference:
          "Form I perfect; it presents the completed act of criticizing or finding fault, contrasting with the current noun naming the fault-finder.",
        relationship:
          "Form I perfect of the ل م ز root, the verbal base related to لُمَزَةٌ and لَامِزٌ.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ل م ز entry and Arabic Academy evidence for لَمَزَ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "لمز",
      },
      {
        form: "يَلْمِزُ",
        meaning: "he finds fault with or criticizes",
        difference:
          "Form I imperfect, third-person masculine singular; it presents criticism as ongoing or habitual.",
        relationship:
          "Form I imperfect of the ل م ز root, attested repeatedly in the Qur'an as يَلْمِزُ and its inflected forms.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 9:58, 9:79 and 49:11 and aligned morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "يلمز",
      },
      {
        form: "لَامِزٌ",
        meaning: "one who criticizes or finds fault",
        difference:
          "Active participle; it describes the agent who performs the criticism rather than expressing it as a finite verb.",
        relationship:
          "A genuine active participle of the ل م ز root, related to the Qur'anic noun لُّمَزَةٍ.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for اللامز and the approved project root meaning.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "لامز",
      },
      {
        form: "لَمَّازٌ",
        meaning: "a habitual fault-finder",
        difference:
          "Intensive adjective/noun; the doubled middle radical marks a habitual or emphatic fault-finder, contrasting with the ordinary agent form.",
        relationship:
          "A genuine intensive form of the ل م ز root, listed in Arabic Academy evidence as اللَّمّاز.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for اللَّمّاز and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "partofspeech:adjective", "derivation:intensive"],
        baseDistinct: true,
        lexicalKey: "لماز",
      },
    ],
    ["حطم"]: [
      {
        form: "حَطَمَ",
        meaning: "he crushed or broke",
        difference:
          "Form I perfect; it presents the completed act of crushing, contrasting with the current noun naming the Crusher.",
        relationship:
          "Form I perfect of the ح ط م root, the verbal base related to حُطَمَةٌ and حُطَامٌ.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ح ط م entry and Arabic Academy evidence for حَطَمَ.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حطم",
      },
      {
        form: "يَحْطِمُ",
        meaning: "he crushes or breaks",
        difference:
          "Form I imperfect; it presents the crushing action as ongoing or expected.",
        relationship:
          "Form I imperfect of the ح ط م root, attested in Qur'an 27:18 as يَحْطِمَنَّكُمْ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 27:18:14 and aligned Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "يحطم",
      },
      {
        form: "حُطَامٌ",
        meaning: "broken debris",
        difference:
          "Result noun; it names what has been crushed or broken rather than the force that crushes it.",
        relationship:
          "A genuine Qur'anic noun of the ح ط م root, attested in 39:21, 56:65 and 57:20.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus canonical occurrences 39:21, 56:65 and 57:20.",
        featureSignal: ["partofspeech:noun", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "حطام",
      },
      {
        form: "حَطَّمَ",
        meaning: "he shattered or crushed intensely",
        difference:
          "Form II perfect; the doubled middle radical marks an intensified or causative crushing action beyond the basic Form I verb.",
        relationship:
          "A genuine Form II derived verb of the ح ط م root, listed in Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for حَطَّمَ and the approved project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "حطم",
      },
    ],
    ["طلع"]: [
      {
        form: "طَلَعَ",
        meaning: "he or it rose or appeared",
        difference:
          "Form I perfect; it presents the completed rising or appearing action, contrasting with the current derived verb.",
        relationship:
          "Form I perfect of the ط ل ع root, the basic verb underlying طلوع and مطلع.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ط ل ع entry and its Form I occurrences.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "طلع",
      },
      {
        form: "يَطْلُعُ",
        meaning: "he or it rises or appears",
        difference:
          "Form I imperfect; it presents rising or appearing as ongoing or expected.",
        relationship:
          "Form I imperfect of the ط ل ع root, contrasting the basic imperfect with the current derived occurrence.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ط ل ع entry and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "يطلع",
      },
      {
        form: "طُلُوعٌ",
        meaning: "rising or appearance",
        difference:
          "Verbal noun; it names the process of rising or appearing rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun of the ط ل ع root, attested in the Qur'an and related to the current verb.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of طُلُوعٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "طلوع",
      },
      {
        form: "مَطْلَعٌ",
        meaning: "place or time of rising",
        difference:
          "Noun of place or time; it identifies where or when rising occurs rather than naming the action itself.",
        relationship:
          "A genuine place/time noun of the ط ل ع root, attested in the Qur'an as مَطْلَع and مَطْلِع.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of مَطْلَع and مَطْلِع and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:place-or-time"],
        baseDistinct: true,
        lexicalKey: "مطلع",
      },
      {
        form: "مَطْلِعٌ",
        meaning: "place of rising or sunrise",
        difference:
          "Noun of place with the مَفْعِل pattern; it contrasts with مَطْلَعٌ and the current مَطْلَعِ by the internal vowel and is attested for the rising-place sense.",
        relationship:
          "A genuine Qur'anic noun of the ط ل ع family, attested as مَطْلِعَ الشَّمْسِ in Qur'an 18:90.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 18:90:4, which distinguishes مَطْلِع from the current مَطْلَعِ.",
        featureSignal: ["partofspeech:noun", "derivation:place-noun", "pattern:maf-il"],
        baseDistinct: true,
        lexicalKey: "مطلع-i",
      },
    ],
    ["وصد"]: [
      {
        form: "أَوْصَدَ",
        meaning: "he closed or shut firmly",
        difference:
          "Form IV perfect; the derived pattern expresses the completed act of closing or sealing, underlying the current passive participle.",
        relationship:
          "Form IV of the و ص د root, the verb from which مُؤْصَدَةٌ is derived.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus root و ص د, Arabic lexical evidence for أَوْصَدَ and the project root meaning.",
        featureSignal: ["pattern:form-4", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "اوصَد",
      },
      {
        form: "يُوصِدُ",
        meaning: "he closes or shuts firmly",
        difference:
          "Form IV imperfect; it presents the closing or sealing action as ongoing.",
        relationship:
          "Form IV imperfect of أَوْصَدَ in the و ص د root family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for أَوْصَدَ يُوصِدُ and the approved project root meaning.",
        featureSignal: ["pattern:form-4", "tense:imperfect", "person:third-person", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "يوصد",
      },
      {
        form: "إِيصَادٌ",
        meaning: "closing or sealing",
        difference:
          "Form IV verbal noun; it names the act of closing or sealing rather than describing the closed result.",
        relationship:
          "The verbal noun of أَوْصَدَ within the و ص د root family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence listing أَوْصَدَ يُوصِدُ إِيصَادًا and the approved project root meaning.",
        featureSignal: ["pattern:form-4", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "ايصاد",
      },
      {
        form: "وَصِيدٌ",
        meaning: "an entrance or enclosure",
        difference:
          "Noun; it names an entrance or stone enclosure, contrasting the closed-state participle in the current āyah.",
        relationship:
          "A genuine Qur'anic noun of the و ص د root, attested in 18:18 as بِالْوَصِيدِ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 18:18:13 and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:related-noun"],
        baseDistinct: true,
        lexicalKey: "وصيد",
      },
    ],
    ["عمد"]: [
      {
        form: "عَمُودٌ",
        meaning: "a column or pillar",
        difference:
          "Singular noun; it contrasts with the current broken plural عَمَدٍ naming multiple columns.",
        relationship:
          "The singular noun corresponding to the current plural within the ع م د family, attested in Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of عَمَد and Arabic Academy evidence for عَمُودٌ.",
        featureSignal: ["partofspeech:noun", "number:singular", "derivation:base-form"],
        baseDistinct: true,
        lexicalKey: "عمود",
      },
      {
        form: "أَعْمِدَةٌ",
        meaning: "columns or pillars",
        difference:
          "Broken plural pattern; it gives another established plural of عَمُودٌ and contrasts with the current plural عَمَدٍ.",
        relationship:
          "An established broken plural of عَمُودٌ in the ع م د family, listed by the Arabic Academy.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing أَعْمِدَةٌ، عُمُدٌ and عَمَدٌ as plurals of عَمُودٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "اعمدة",
      },
      {
        form: "عِمَادٌ",
        meaning: "support or a pillar",
        difference:
          "Related noun; it focuses on the supporting function of a pillar rather than simply counting physical columns.",
        relationship:
          "A genuine Qur'anic noun of the ع م د family, attested in ذَاتِ الْعِمَادِ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 89:7:3 and Arabic Academy root evidence.",
        featureSignal: ["partofspeech:noun", "derivation:related-noun"],
        baseDistinct: true,
        lexicalKey: "عماد",
      },
      {
        form: "مُتَعَمِّدٌ",
        meaning: "deliberate or intentional",
        difference:
          "Form V active participle; the derived pattern describes someone acting deliberately, showing the intention sense of the same root.",
        relationship:
          "A genuine Form V active participle of the ع م د root, attested in Qur'an 4:93 and 5:95.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 4:93:4 and 5:95:12 and aligned morphology.",
        featureSignal: ["pattern:form-5", "partofspeech:active-participle", "derivation:agent", "meaning:intention"],
        baseDistinct: true,
        lexicalKey: "متعمد",
      },
    ],
    ["سهو"]: [
      {
        form: "سَهَا",
        meaning: "he was heedless or forgot",
        difference:
          "Form I perfect; it states a completed act or state of heedlessness, while the current occurrence is an active participle plural.",
        relationship:
          "Form I perfect of the س ه و root; it is the finite verb underlying سَاهٍ and سَاهُونَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning, classical Arabic lexicon evidence and standard Arabic Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "سها",
      },
      {
        form: "يَسْهُو",
        meaning: "he is heedless or forgets",
        difference:
          "Form I imperfect, third-person masculine singular; it presents heedlessness as ongoing or habitual.",
        relationship:
          "Form I imperfect of the س ه و root; it is the ongoing counterpart of سَهَا.",
        provenance:
          "Codex-authored after review of the approved project root meaning, classical Arabic lexicon evidence and standard Arabic Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يسهو",
      },
      {
        form: "سَهْوٌ",
        meaning: "heedlessness or forgetfulness",
        difference:
          "Verbal noun; it names the state or act of heedlessness rather than describing a heedless person.",
        relationship:
          "A genuine verbal noun of the س ه و root, naming the state behind سَاهُونَ.",
        provenance:
          "Codex-authored after review of the approved project root meaning and classical Arabic lexicon evidence for سَهْوٌ.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "سهو",
      },
      {
        form: "سَاهٍ",
        meaning: "heedless or inattentive",
        difference:
          "Singular active participle; it describes one heedless person, contrasting with the current masculine plural سَاهُونَ.",
        relationship:
          "The singular active participle corresponding to the current plural سَاهُونَ in the س ه و family.",
        provenance:
          "Codex-authored after review of the approved project root meaning, classical Arabic lexicon evidence and the singular/plural relationship سَاهٍ → سَاهُونَ.",
        featureSignal: ["partofspeech:active-participle", "number:singular", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "ساه",
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
    ["خلص"]: [
      {
        form: "أَخْلَصَ",
        meaning: "he made sincere or devoted",
        difference:
          "Form IV perfect; it presents the completed act of making something sincere or devoting it, while the current form describes sincere people.",
        relationship:
          "Form IV perfect of the خ ل ص root, the verbal base behind مُخْلِصِينَ.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus خ ل ص entry, including أَخْلَصُوا and أَخْلَصْنَا, and standard Form IV morphology.",
        featureSignal: ["pattern:form-4", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "اخلص",
      },
      {
        form: "إِخْلَاصٌ",
        meaning: "sincerity or devotion",
        difference:
          "Form IV verbal noun; it names sincerity or devotion as a quality or action rather than describing a person.",
        relationship:
          "The genuine verbal noun of أَخْلَصَ in the خ ل ص family.",
        provenance:
          "Codex-authored after review of the خ ل ص Form IV family and standard Arabic verbal-noun morphology.",
        featureSignal: ["pattern:form-4", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "اخلاص",
      },
      {
        form: "مُخْلِصٌ",
        meaning: "a sincere or devoted person",
        difference:
          "Form IV active participle, masculine singular; it is the singular counterpart of the current masculine plural مُخْلِصِينَ.",
        relationship:
          "The singular active participle corresponding to the current plural form in the خ ل ص family.",
        provenance:
          "Codex-authored after review of canonical Qur'anic occurrences of مُخْلِصٌ and مُخْلِصِينَ and aligned morphology.",
        featureSignal: ["pattern:form-4", "partofspeech:active-participle", "number:singular"],
        baseDistinct: true,
        lexicalKey: "مخلص",
      },
      {
        form: "مُخْلَصٌ",
        meaning: "chosen or purified",
        difference:
          "Form IV passive participle; it describes someone chosen or purified, contrasting with the active sense of the current form.",
        relationship:
          "The Form IV passive participle of أَخْلَصَ, a real Qur'anic counterpart in the خ ل ص family.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus passive-participle occurrences of مُخْلَصًا and مُخْلَصِينَ.",
        featureSignal: ["pattern:form-4", "partofspeech:passive-participle", "voice:passive", "meaning:chosen"],
        baseDistinct: true,
        lexicalKey: "مخلص",
      },
    ],
    ["حنف"]: [
      {
        form: "حَنِيفٌ",
        meaning: "an upright person",
        difference:
          "Masculine singular adjective/noun; it is the singular counterpart of the current masculine plural حُنَفَاءَ.",
        relationship:
          "The singular form of the حَنِيف / حُنَفَاءَ lexical family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of حَنِيفٌ and حُنَفَاءَ and standard Arabic number morphology.",
        featureSignal: ["partofspeech:adjective", "number:singular", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "حنيف",
      },
      {
        form: "حَنِيفَةٌ",
        meaning: "an upright woman",
        difference:
          "Feminine singular adjective/noun; the feminine ending identifies one female member of the same lexical family.",
        relationship:
          "The regular feminine singular counterpart of حَنِيفٌ in the ح ن ف family.",
        provenance:
          "Codex-authored after review of the attested حَنِيفٌ / حُنَفَاءَ family and standard Arabic feminine derivation.",
        featureSignal: ["partofspeech:adjective", "number:singular", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "حنيفة",
      },
      {
        form: "حَنِيفَانِ",
        meaning: "two upright persons",
        difference:
          "Masculine dual; it shows the number contrast between one, two and the current masculine plural.",
        relationship:
          "The regular masculine dual of حَنِيفٌ in the ح ن ف family.",
        provenance:
          "Codex-authored after review of the attested حَنِيفٌ / حُنَفَاءَ family and standard Arabic dual morphology.",
        featureSignal: ["partofspeech:adjective", "number:dual", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "حنيفان",
      },
      {
        form: "حَنِيفَاتٌ",
        meaning: "upright women",
        difference:
          "Feminine sound plural; it shows gender and number together, contrasting with the current masculine broken plural.",
        relationship:
          "The regular feminine plural of حَنِيفَةٌ in the ح ن ف family.",
        provenance:
          "Codex-authored after review of the attested حَنِيفٌ / حُنَفَاءَ family and standard Arabic feminine-plural morphology.",
        featureSignal: ["partofspeech:adjective", "number:plural", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "حنيفات",
      },
    ],
    ["تحت"]: [
      {
        form: "تَحْتَ",
        meaning: "under or below",
        difference:
          "The bare lexical form without an attached pronoun; it exposes the stem before the current feminine-singular attachment.",
        relationship:
          "The unattached nominal form of the ت ح ت family, attested in Qur'an 41:29.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ت ح ت entry and canonical occurrence word:41:29:12.",
        featureSignal: ["attachment:none", "partofspeech:noun", "pronoun:none"],
        baseDistinct: true,
        lexicalKey: "تحت",
      },
      {
        form: "تَحْتَهُ",
        meaning: "under him or it",
        difference:
          "Third-person masculine singular attachment; هُ changes the reference of the base noun to him or it.",
        relationship:
          "A canonical attached-pronoun form of تَحْتُ, attested in Qur'an 18:82.",
        provenance:
          "Codex-authored after review of canonical occurrence word:18:82:9 and the Quranic Arabic Corpus ت ح ت entry.",
        featureSignal: ["attachment:pronoun", "person:third-person", "gender:masculine", "number:singular"],
        baseDistinct: true,
        lexicalKey: "تحته",
      },
      {
        form: "تَحْتِي",
        meaning: "under me",
        difference:
          "First-person singular attachment; ي changes the reference to the speaker.",
        relationship:
          "A canonical attached-pronoun form of تَحْتُ, attested in Qur'an 43:51.",
        provenance:
          "Codex-authored after review of canonical occurrence word:43:51:15 and the Quranic Arabic Corpus ت ح ت entry.",
        featureSignal: ["attachment:pronoun", "person:first-person", "number:singular"],
        baseDistinct: true,
        lexicalKey: "تحتي",
      },
      {
        form: "تَحْتَهُمْ",
        meaning: "under them",
        difference:
          "Third-person masculine plural attachment; هُمْ changes the reference to a group.",
        relationship:
          "A canonical attached-pronoun form of تَحْتُ, attested in Qur'an 6:6 and 39:16.",
        provenance:
          "Codex-authored after review of canonical occurrences word:6:6:24 and word:39:16:8 and the Quranic Arabic Corpus ت ح ت entry.",
        featureSignal: ["attachment:pronoun", "person:third-person", "number:plural"],
        baseDistinct: true,
        lexicalKey: "تحتهم",
      },
    ],
    ["علق"]: [
      {
        form: "عَلَقَةٌ",
        meaning: "a clinging substance",
        difference:
          "Feminine singular noun; it is the singular counterpart of the current عَلَقٍ form naming clinging substances.",
        relationship:
          "The singular noun of the عَلَق / عَلَقَة family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ع ل ق entry, which distinguishes عَلَق and عَلَقَة.",
        featureSignal: ["partofspeech:noun", "number:singular", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "علقة",
      },
      {
        form: "عَلَقَاتٌ",
        meaning: "clinging substances",
        difference:
          "Feminine sound plural; it makes the number contrast explicit rather than repeating the current plural pattern.",
        relationship:
          "A regular feminine plural built from the attested عَلَقَة noun in the ع ل ق family.",
        provenance:
          "Codex-authored after review of the canonical عَلَقَة family and standard Arabic feminine-plural morphology.",
        featureSignal: ["partofspeech:noun", "number:plural", "gender:feminine", "derivation:plural"],
        baseDistinct: true,
        lexicalKey: "علقات",
      },
      {
        form: "مُعَلَّقٌ",
        meaning: "suspended or hanging",
        difference:
          "Form II passive participle, masculine singular; it shows the result of causing something to hang rather than naming the clinging substance.",
        relationship:
          "The masculine passive participle corresponding to the canonical feminine مُعَلَّقَةٌ in the ع ل ق family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 4:129:14 مُعَلَّقَةِ and standard Form II passive-participle morphology.",
        featureSignal: ["pattern:form-2", "partofspeech:passive-participle", "voice:passive", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "معلق",
      },
      {
        form: "مُعَلَّقَةٌ",
        meaning: "suspended or hanging",
        difference:
          "Form II passive participle, feminine singular; it is the feminine counterpart of مُعَلَّقٌ and a clear derived-pattern contrast.",
        relationship:
          "A canonical Form II passive participle of the ع ل ق root, attested in Qur'an 4:129.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 4:129:14 and aligned Form II morphology.",
        featureSignal: ["pattern:form-2", "partofspeech:passive-participle", "voice:passive", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "معلقة",
      },
    ],
    ["قلم"]: [
      {
        form: "قَلَمٌ",
        meaning: "a pen",
        difference:
          "Bare masculine singular noun; it exposes the lexical base beneath the current preposition-plus-definite-noun form.",
        relationship:
          "The singular noun corresponding to the current بِٱلْقَلَمِ, attested in the Quranic Arabic Corpus.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus ق ل م entry and canonical occurrences of قَلَمٌ.",
        featureSignal: ["partofspeech:noun", "number:singular", "attachment:none"],
        baseDistinct: true,
        lexicalKey: "قلم",
      },
      {
        form: "أَقْلَامٌ",
        meaning: "pens",
        difference:
          "Broken plural; it changes the noun from one pen to multiple pens.",
        relationship:
          "A canonical broken plural of قَلَمٌ, attested in Qur'an 3:44 and 31:27.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 3:44:12 and 31:27:7.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "اقلام",
      },
      {
        form: "مَقْلَمَةٌ",
        meaning: "a pen case",
        difference:
          "Derived noun; it names a container or place associated with pens rather than a pen itself.",
        relationship:
          "A genuine derived noun of the ق ل م root in the established Arabic lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for مَقْلَمَةٌ and the project root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:place-or-container"],
        baseDistinct: true,
        lexicalKey: "مقلمة",
      },
      {
        form: "قَلَّمَ",
        meaning: "he trimmed or pruned",
        difference:
          "Form II perfect; the doubled middle radical creates a derived action of trimming or shaping, distinct from the pen noun.",
        relationship:
          "A genuine Form II verb of the ق ل م root, showing a derived action from the same root.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for قَلَّمَ and standard Form II morphology.",
        featureSignal: ["pattern:form-2", "tense:perfect", "partofspeech:verb", "meaning:trim"],
        baseDistinct: true,
        lexicalKey: "قلم-form-2",
      },
      {
        form: "تَقْلِيمٌ",
        meaning: "trimming or pruning",
        difference:
          "Form II verbal noun; it names the trimming action produced by قَلَّمَ.",
        relationship:
          "The genuine verbal noun of قَلَّمَ in the ق ل م family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for تَقْلِيمٌ and standard Form II verbal-noun morphology.",
        featureSignal: ["pattern:form-2", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تقليم",
      },
    ],
    ["سفع"]: [
      {
        form: "سَفَعَ",
        meaning: "he dragged or seized",
        difference:
          "Form I perfect; it presents the completed dragging or seizing action behind the current future-imperfect threat.",
        relationship:
          "Form I perfect of the س ف ع root, the verbal base of لَنَسْفَعًا.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus س ف ع entry and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "سفع",
      },
      {
        form: "يَسْفَعُ",
        meaning: "he drags or seizes",
        difference:
          "Form I imperfect, third-person masculine singular; it contrasts with the current first-person plural form.",
        relationship:
          "The singular imperfect counterpart of the canonical لَنَسْفَعًا.",
        provenance:
          "Codex-authored after review of canonical occurrence word:96:15:5 and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person", "number:singular"],
        baseDistinct: true,
        lexicalKey: "يسفع",
      },
      {
        form: "سَافِعٌ",
        meaning: "dragging or seizing",
        difference:
          "Form I active participle; it describes an agent performing the dragging rather than expressing a finite verb.",
        relationship:
          "The active participle of سَفَعَ in the س ف ع family.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus س ف ع root entry and standard Form I active-participle morphology.",
        featureSignal: ["pattern:form-1", "partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "سافع",
      },
      {
        form: "مَسْفُوعٌ",
        meaning: "dragged or seized",
        difference:
          "Form I passive participle; it describes the person or thing affected by the dragging action.",
        relationship:
          "The passive participle of سَفَعَ, giving the affected-state contrast within the same root family.",
        provenance:
          "Codex-authored after review of the Quranic Arabic Corpus س ف ع entry and standard Form I passive-participle morphology.",
        featureSignal: ["pattern:form-1", "partofspeech:passive-participle", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مسفوع",
      },
    ],
    ["زبن"]: [
      {
        form: "زَبَنَ",
        meaning: "he drove or pushed away",
        difference:
          "Form I perfect; it presents the completed driving-away action associated with the angels’ role in the current noun.",
        relationship:
          "Form I perfect of the ز ب ن root, the action underlying زَبَانِيَةٌ.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for زَبَنَ and the Quranic Arabic Corpus ز ب ن entry.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "زَبَن",
      },
      {
        form: "يَزْبِنُ",
        meaning: "he drives or pushes away",
        difference:
          "Form I imperfect, third-person masculine singular; it presents the driving-away action as ongoing.",
        relationship:
          "The imperfect counterpart of زَبَنَ in the ز ب ن family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for يَزْبِنُ and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يزبن",
      },
      {
        form: "زَبْنٌ",
        meaning: "driving or pushing away",
        difference:
          "Verbal noun; it names the driving-away action rather than the beings associated with it.",
        relationship:
          "The verbal noun of زَبَنَ in the ز ب ن family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for زَبْنٌ and standard Form I verbal-noun morphology.",
        featureSignal: ["pattern:form-1", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "زَبْن",
      },
      {
        form: "زَابِنٌ",
        meaning: "one who drives or pushes away",
        difference:
          "Active participle; it names an agent performing the driving-away action.",
        relationship:
          "The active participle of زَبَنَ in the ز ب ن family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for زَابِنٌ and standard Form I active-participle morphology.",
        featureSignal: ["pattern:form-1", "partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "زابن",
      },
    ],
    ["زيت"]: [
      {
        form: "زَيْتٌ",
        meaning: "oil",
        difference:
          "Basic mass noun; it names oil, contrasting with the current collective noun for the olive tree or olives.",
        relationship:
          "A genuine noun of the ز ي ت family, attested in Qur'anic usage for oil.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for the ز ي ت family and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:base-form", "meaning:oil"],
        baseDistinct: true,
        lexicalKey: "زيت",
      },
      {
        form: "زَيْتُونَةٌ",
        meaning: "an olive",
        difference:
          "Feminine singular noun; it names one olive, contrasting with the current collective/uncountable form.",
        relationship:
          "The feminine singular noun in the ز ي ت family, listed among the established related Qur'anic forms.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for زَيْتُونَةٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "number:singular"],
        baseDistinct: true,
        lexicalKey: "زيتونة",
      },
      {
        form: "زَيْتُونَاتٌ",
        meaning: "olives",
        difference:
          "Sound feminine plural; it shows the countable plural of زَيْتُونَةٌ rather than the current collective form.",
        relationship:
          "A genuine plural of زَيْتُونَةٌ within the ز ي ت lexical family.",
        provenance:
          "Codex-authored after review of standard Arabic plural formation for زَيْتُونَةٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "number:plural"],
        baseDistinct: true,
        lexicalKey: "زيتونات",
      },
      {
        form: "زَيَّتَ",
        meaning: "he oiled",
        difference:
          "Form II perfect; the doubled middle radical marks the action of applying or supplying oil, contrasting with the noun forms.",
        relationship:
          "A genuine Form II verb of the ز ي ت root in the oil family.",
        provenance:
          "Codex-authored after review of standard Arabic Form II morphology, approved lexical evidence and the project root meaning.",
        featureSignal: ["pattern:form-2", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "زيت",
      },
    ],
    ["بلد"]: [
      {
        form: "بَلَدٌ",
        meaning: "a city or land",
        difference:
          "Indefinite masculine singular; it shows the unmarked singular behind the current definite genitive form.",
        relationship:
          "The basic masculine singular noun of the ب ل د family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for بَلَدٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:singular", "state:indefinite"],
        baseDistinct: true,
        lexicalKey: "بلد",
      },
      {
        form: "بَلْدَةٌ",
        meaning: "a town or locality",
        difference:
          "Feminine singular noun; the feminine ending marks a related locality noun distinct from the masculine singular.",
        relationship:
          "A genuine feminine noun in the ب ل د family, attested in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for بَلْدَةٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "number:singular"],
        baseDistinct: true,
        lexicalKey: "بلدة",
      },
      {
        form: "بِلَادٌ",
        meaning: "lands or countries",
        difference:
          "Broken plural; it changes the singular noun into the established plural form used for multiple lands or countries.",
        relationship:
          "A genuine broken plural of بَلَدٌ in the ب ل د family, attested in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for بِلَادٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "بلاد",
      },
      {
        form: "بَلَدَانِ",
        meaning: "two cities or lands",
        difference:
          "Dual noun; it marks exactly two cities or lands, giving a clear number contrast with the singular and plural forms.",
        relationship:
          "A regular dual of بَلَدٌ within the ب ل د lexical family.",
        provenance:
          "Codex-authored after review of standard Arabic dual formation for بَلَدٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:dual"],
        baseDistinct: true,
        lexicalKey: "بلدان",
      },
    ],
    ["سفل"]: [
      {
        form: "سَافِلٌ",
        meaning: "low or lowly",
        difference:
          "Masculine singular active participle/adjective; it contrasts with the current superlative/degree form and plural form.",
        relationship:
          "A genuine active participle/adjective of the س ف ل root.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for سَافِلٌ and standard Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "number:singular", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "سافل",
      },
      {
        form: "سَافِلَةٌ",
        meaning: "low or lowly (feminine)",
        difference:
          "Feminine singular active participle/adjective; the feminine ending provides a genuine gender contrast.",
        relationship:
          "The feminine counterpart of سَافِلٌ in the س ف ل lexical family.",
        provenance:
          "Codex-authored after review of standard Arabic feminine formation for سَافِلٌ and the approved project root meaning.",
        featureSignal: ["partofspeech:active-participle", "number:singular", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "سافلة",
      },
      {
        form: "سُفْلَىٰ",
        meaning: "lower or lowest (feminine)",
        difference:
          "Feminine elative/adjective form; it expresses the lower or lowest degree rather than the active-participle meaning.",
        relationship:
          "A genuine feminine degree form in the س ف ل family, attested in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for سُفْلَىٰ and the approved project root meaning.",
        featureSignal: ["partofspeech:adjective", "gender:feminine", "derivation:elative"],
        baseDistinct: true,
        lexicalKey: "سفلى",
      },
      {
        form: "أَسْفَلِينَ",
        meaning: "the lowest ones",
        difference:
          "Masculine plural degree form; it contrasts with the current plural active participle سَافِلِينَ by showing the elative pattern.",
        relationship:
          "A genuine plural degree form of أَسْفَل in the س ف ل family, attested in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of الْأَسْفَلِينَ and the approved project root meaning.",
        featureSignal: ["partofspeech:adjective", "number:plural", "derivation:elative"],
        baseDistinct: true,
        lexicalKey: "أسفلين",
      },
    ],
    ["شرح"]: [
      {
        form: "شَرَحَ",
        meaning: "he expanded or opened",
        difference:
          "Form I perfect; it states the completed action behind the current first-person plural jussive form.",
        relationship:
          "Form I perfect of the ش ر ح root, attested in Qur'anic occurrences for expanding or opening the chest.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ش ر ح evidence and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "شرح",
      },
      {
        form: "يَشْرَحُ",
        meaning: "he expands or opens",
        difference:
          "Form I imperfect, third-person masculine singular; it presents the expansion as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of شَرَحَ in the ش ر ح family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 6:125:6 and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يشرح",
      },
      {
        form: "اِشْرَحْ",
        meaning: "expand or open!",
        difference:
          "Form I imperative, second-person masculine singular; it turns the root into a direct command.",
        relationship:
          "The imperative of شَرَحَ in the ش ر ح family, attested in Qur'an 20:25.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 20:25:3 and standard Form I imperative morphology.",
        featureSignal: ["pattern:form-1", "mood:imperative", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "اشرح",
      },
      {
        form: "شَرْحٌ",
        meaning: "expansion or explanation",
        difference:
          "Verbal noun; it names the action or result of expanding and explaining rather than expressing it as a verb.",
        relationship:
          "The standard verbal noun of شَرَحَ in the ش ر ح lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for شَرْحٌ and the Quranic root range.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "شرح",
      },
    ],
    ["نقض"]: [
      {
        form: "نَقَضَ",
        meaning: "he broke or untwisted",
        difference:
          "Form I perfect; it states the completed breaking action, contrasting with the current Form IV verb meaning weighed down.",
        relationship:
          "Form I perfect of the ن ق ض root, attested for breaking a covenant or untwisting yarn.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ن ق ض evidence and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "نقض",
      },
      {
        form: "يَنْقُضُ",
        meaning: "he breaks or untwists",
        difference:
          "Form I imperfect; it presents the breaking action as ongoing, contrasting with the current Form IV perfect.",
        relationship:
          "The imperfect counterpart of نَقَضَ in the ن ق ض family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of يَنْقُضُ and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "ينقض",
      },
      {
        form: "نَقْضٌ",
        meaning: "breaking or undoing",
        difference:
          "Verbal noun; it names the act of breaking or undoing rather than expressing it as a finite verb.",
        relationship:
          "The verbal noun of نَقَضَ, attested in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 4:155 and 5:13 and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "نقض",
      },
      {
        form: "مَنْقُوضٌ",
        meaning: "broken or undone",
        difference:
          "Passive participle; it describes something that has undergone the breaking action rather than the agent who performs it.",
        relationship:
          "A genuine passive participle of نَقَضَ in the ن ق ض lexical family.",
        provenance:
          "Codex-authored after review of standard Form I passive-participle morphology and the Quranic ن ق ض root range.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "منقوض",
      },
    ],
    ["فرغ"]: [
      {
        form: "فَرَغَ",
        meaning: "he finished or became free",
        difference:
          "Form I perfect, third-person masculine singular; it contrasts with the current second-person perfect form.",
        relationship:
          "Form I perfect of the ف ر غ root, the basic verb of finishing or becoming free.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ف ر غ evidence and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "فرغ",
      },
      {
        form: "يَفْرُغُ",
        meaning: "he finishes or becomes free",
        difference:
          "Form I imperfect; it presents finishing as ongoing or expected rather than completed.",
        relationship:
          "The imperfect counterpart of فَرَغَ in the ف ر غ family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 55:31:1 and standard Form I imperfect morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يفرغ",
      },
      {
        form: "فَرَاغٌ",
        meaning: "finishing or free time",
        difference:
          "Verbal noun; it names the state or action of finishing and being free rather than expressing it as a verb.",
        relationship:
          "A genuine verbal noun of فَرَغَ in the ف ر غ lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for فَرَاغٌ and the Quranic root range.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "فراغ",
      },
      {
        form: "فَارِغٌ",
        meaning: "empty or free",
        difference:
          "Active participle/adjective; it describes a person or thing that is empty or free, contrasting with the finite verb.",
        relationship:
          "The active participle of فَرَغَ, attested in Qur'an 28:10.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 28:10:5 and standard Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent-or-descriptor"],
        baseDistinct: true,
        lexicalKey: "فارغ",
      },
    ],
    ["نصب"]: [
      {
        form: "نُصِبَتْ",
        meaning: "it was set up",
        difference:
          "Form I passive perfect, third-person feminine singular; it shows the affected state in contrast with the current imperative.",
        relationship:
          "A canonical passive Form I form of the ن ص ب root, attested in Qur'an 88:19.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 88:19:4 and standard Form I passive morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "نصبت",
      },
      {
        form: "نَصَبٌ",
        meaning: "fatigue or hardship",
        difference:
          "Noun; it names the fatigue or hardship associated with exertion rather than expressing the action as a command.",
        relationship:
          "A Qur'anic noun of the ن ص ب family, repeatedly glossed as fatigue.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 9:120, 15:48, 18:62 and 35:35.",
        featureSignal: ["partofspeech:noun", "derivation:related-noun", "meaning:fatigue"],
        baseDistinct: true,
        lexicalKey: "نصب",
      },
      {
        form: "نَاصِبٌ",
        meaning: "laboring or exhausting",
        difference:
          "Active participle/adjective, masculine singular; it describes one who labors or causes exertion rather than giving a command.",
        relationship:
          "The masculine counterpart of the Qur'anic active participle نَّاصِبَةٌ in the ن ص ب family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 88:3:2 and standard Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "gender:masculine", "number:singular"],
        baseDistinct: true,
        lexicalKey: "ناصب",
      },
      {
        form: "مَنْصُوبٌ",
        meaning: "set up or erected",
        difference:
          "Passive participle; it describes something placed or erected, giving a result-state contrast with the active command.",
        relationship:
          "A genuine passive participle of نَصَبَ in the ن ص ب lexical family.",
        provenance:
          "Codex-authored after review of standard Form I passive-participle morphology and the canonical ن ص ب root range.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "منصوب",
      },
    ],
    ["رغب"]: [
      {
        form: "رَغِبَ",
        meaning: "he desired or preferred",
        difference:
          "Form I perfect; it states the completed act of desiring or preferring, contrasting with the current imperative.",
        relationship:
          "Form I perfect of the ر غ ب root, the verbal base of the current command.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ر غ ب evidence and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "رغب",
      },
      {
        form: "يَرْغَبُ",
        meaning: "he desires or prefers",
        difference:
          "Form I imperfect; it presents desire or preference as ongoing rather than as a direct command.",
        relationship:
          "The imperfect counterpart of رَغِبَ in the ر غ ب family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 2:130, 4:127 and 9:120.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يرغب",
      },
      {
        form: "رَغْبَةٌ",
        meaning: "desire or hope",
        difference:
          "Verbal noun/related noun; it names the desire or hope rather than expressing it as a verb.",
        relationship:
          "A genuine noun in the ر غ ب family, related to the Qur'anic رَغَبًا.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 21:90:15 and approved Arabic lexical evidence.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "رغبة",
      },
      {
        form: "رَاغِبٌ",
        meaning: "desiring or turning devoutly",
        difference:
          "Active participle, masculine singular; it names one who desires or turns toward something rather than issuing the command.",
        relationship:
          "The active participle of رَغِبَ, attested in Qur'anic usage as رَاغِبُونَ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 9:59, 19:46 and 68:32 and standard Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "number:singular", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "راغب",
      },
    ],
    ["سجو"]: [
      {
        form: "سَجَا",
        meaning: "it became still or covered",
        difference:
          "Form I perfect; it states the completed stillness or covering behind the current weak-final form.",
        relationship:
          "A regularised Form I perfect of سَجَىٰ in the س ج و family, whose Qur'anic occurrence describes night covering with darkness.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 93:2:3 and standard weak-final Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "سجا",
      },
      {
        form: "يَسْجُو",
        meaning: "it becomes still or covers",
        difference:
          "Form I imperfect; it presents the covering or stillness as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of سَجَا in the س ج و lexical family.",
        provenance:
          "Codex-authored after review of standard weak-final Form I imperfect morphology and the Quranic root meaning.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يسجو",
      },
      {
        form: "اُسْجُ",
        meaning: "become still or cover!",
        difference:
          "Form I imperative; it turns the root into a direct command and contrasts with the current indicative-like occurrence.",
        relationship:
          "The imperative of يَسْجُو in the س ج و family, formed by regular weak-final morphology.",
        provenance:
          "Codex-authored after review of standard Form I imperative morphology for the س ج و root.",
        featureSignal: ["pattern:form-1", "mood:imperative", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "اسجو",
      },
      {
        form: "سُجُوٌّ",
        meaning: "stillness or covering",
        difference:
          "Verbal noun; it names the state or action of becoming still or covering rather than expressing it as a verb.",
        relationship:
          "The verbal noun of سَجَا/سَجَىٰ in the س ج و lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for سُجُوٌّ and the Quranic root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "سجو",
      },
    ],
    ["ودع"]: [
      {
        form: "وَدَّعَ",
        meaning: "he bade farewell or forsook",
        difference:
          "Form II perfect without the attached object pronoun; it isolates the verb from the current form وَدَّعَكَ.",
        relationship:
          "The base Form II perfect behind the current Qur'anic occurrence in the و د ع family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 93:3:2 and the Form II verb وَدَّعَ.",
        featureSignal: ["pattern:form-2", "tense:perfect", "attached-pronoun:removed"],
        baseDistinct: true,
        lexicalKey: "ودع",
      },
      {
        form: "يُوَدِّعُ",
        meaning: "he bids farewell or forsakes",
        difference:
          "Form II imperfect; it presents bidding farewell as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of وَدَّعَ in the و د ع family.",
        provenance:
          "Codex-authored after review of standard Form II imperfect morphology and the Quranic root meaning.",
        featureSignal: ["pattern:form-2", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يودع",
      },
      {
        form: "تَوْدِيعٌ",
        meaning: "bidding farewell",
        difference:
          "Form II verbal noun; it names the act of bidding farewell rather than expressing it as a finite verb.",
        relationship:
          "The verbal noun of وَدَّعَ in the و د ع lexical family.",
        provenance:
          "Codex-authored after review of standard Form II verbal-noun morphology and Quranic Arabic Corpus root evidence.",
        featureSignal: ["pattern:form-2", "partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "توديع",
      },
      {
        form: "مُوَدِّعٌ",
        meaning: "one who bids farewell",
        difference:
          "Form II active participle; it names the agent performing the farewell action rather than the action itself.",
        relationship:
          "The active participle of وَدَّعَ in the و د ع family.",
        provenance:
          "Codex-authored after review of standard Form II active-participle morphology and the Quranic root evidence.",
        featureSignal: ["pattern:form-2", "partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "مودع",
      },
    ],
    ["قلي"]: [
      {
        form: "قَلَيْنَا",
        meaning: "we detested",
        difference:
          "Form I perfect, first-person plural; it gives a real person-and-number contrast with the current third-person perfect form.",
        relationship:
          "A genuine inflected Form I perfect of قَلَىٰ in the ق ل ي family.",
        provenance:
          "Codex-authored after review of standard weak-final Form I perfect inflection and the Quranic ق ل ي root evidence.",
        featureSignal: ["pattern:form-1", "tense:perfect", "person:first-person", "number:plural"],
        baseDistinct: true,
        lexicalKey: "قلينا",
      },
      {
        form: "يَقْلَى",
        meaning: "he detests",
        difference:
          "Form I imperfect, third-person masculine singular; it presents detestation as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of قَلَىٰ, from the same ق ل ي lexical family.",
        provenance:
          "Codex-authored after review of standard weak-final Form I imperfect morphology and the approved root meaning.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يقلى",
      },
      {
        form: "قِلًى",
        meaning: "detestation",
        difference:
          "Verbal noun; it names the feeling or act of detesting rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun related to قَلَىٰ, attested in the reviewed lesson evidence.",
        provenance:
          "Codex-authored after review of the existing reviewed row and approved Arabic lexical evidence for قِلًى.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "قلى",
      },
      {
        form: "قَالٍ",
        meaning: "detesting",
        difference:
          "Active participle; it names one who detests, contrasting with the current finite verb.",
        relationship:
          "The active participle of قَلَىٰ, attested in Qur'an 26:168 as الْقَالِينَ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 26:168:5 and standard weak-final active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "قال",
      },
    ],
    ["عيل"]: [
      {
        form: "عَالَ",
        meaning: "he became needy",
        difference:
          "Form I perfect; it states becoming needy as a completed event, contrasting with the current active participle.",
        relationship:
          "A genuine Form I verb of the ع ي ل family related to need and poverty.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for عَالَ and the Quranic root entry.",
        featureSignal: ["pattern:form-1", "tense:perfect", "partofspeech:verb"],
        baseDistinct: true,
        lexicalKey: "عال",
      },
      {
        form: "يَعِيلُ",
        meaning: "he is needy",
        difference:
          "Form I imperfect; it presents need as an ongoing state rather than as a completed event.",
        relationship:
          "The imperfect counterpart of عَالَ in the ع ي ل family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for يَعِيلُ and standard weak-verb morphology.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يعيل",
      },
      {
        form: "عَيْلَةٌ",
        meaning: "poverty or need",
        difference:
          "Noun; it names the state of poverty or need rather than describing the needy person.",
        relationship:
          "A Qur'anic noun in the ع ي ل family, attested in Qur'an 9:28.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 9:28:16 and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:state-noun", "meaning:poverty"],
        baseDistinct: true,
        lexicalKey: "عيلة",
      },
      {
        form: "عَائِلُونَ",
        meaning: "needy people",
        difference:
          "Masculine plural active participle; it contrasts with the current masculine singular active participle.",
        relationship:
          "A regular plural of عَائِلٌ within the ع ي ل lexical family.",
        provenance:
          "Codex-authored after review of the canonical active-participle form عَائِلٌ and standard Arabic plural formation.",
        featureSignal: ["partofspeech:active-participle", "number:plural", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "عائلون",
      },
    ],
    ["قهر"]: [
      {
        form: "قَهَرَ",
        meaning: "he subdued or oppressed",
        difference:
          "Form I perfect; it states the completed act of subduing, contrasting with the current jussive/command form.",
        relationship:
          "Form I perfect of the ق ه ر root behind تَقْهَرْ.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ق ه ر evidence and standard Form I morphology.",
        featureSignal: ["pattern:form-1", "tense:perfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "قهر",
      },
      {
        form: "يَقْهَرُ",
        meaning: "he subdues or oppresses",
        difference:
          "Form I imperfect; it presents oppression as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of قَهَرَ in the ق ه ر family.",
        provenance:
          "Codex-authored after review of standard Form I imperfect morphology and the Quranic root evidence.",
        featureSignal: ["pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يقهر",
      },
      {
        form: "قَهْرٌ",
        meaning: "subduing or oppression",
        difference:
          "Verbal noun; it names the act of subduing rather than expressing it as a finite verb.",
        relationship:
          "The standard verbal noun of قَهَرَ in the ق ه ر lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for قَهْرٌ and the Quranic root range.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "قهر",
      },
      {
        form: "قَاهِرٌ",
        meaning: "subduing or dominant",
        difference:
          "Active participle; it names one who subdues or dominates, contrasting with the finite verb.",
        relationship:
          "The active participle of قَهَرَ, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 6:18, 6:61 and 7:127.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "قاهر",
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
    ["كبد"]: [
      {
        form: "تَكَبَّدَ",
        meaning: "he endured or underwent hardship",
        difference:
          "Form V perfect; it presents taking on or enduring a hardship, developing the current hardship noun into a completed action.",
        relationship:
          "A genuine Form V verb in the ك ب د family, supported by approved Arabic lexical evidence for تَكَبَّدَ الأمرَ.",
        provenance:
          "Codex-authored after review of Arabic Academy and classical lexicon evidence for تَكَبَّدَ and the approved ك ب د root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:perfect"],
        baseDistinct: true,
        lexicalKey: "تكبد",
      },
      {
        form: "يَتَكَبَّدُ",
        meaning: "he endures or undergoes hardship",
        difference:
          "Form V imperfect; it presents enduring hardship as ongoing rather than completed.",
        relationship: "The imperfect counterpart of تَكَبَّدَ in the ك ب د lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for يَتَكَبَّدُ and standard Form V morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يتكبد",
      },
      {
        form: "تَكَبُّدٌ",
        meaning: "enduring or undergoing hardship",
        difference:
          "Form V verbal noun; it names the process of enduring hardship rather than expressing it as a finite verb.",
        relationship: "The verbal noun of تَكَبَّدَ in the ك ب د family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for تَكَبُّدٌ and the approved ك ب د root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-5", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تكبد-noun",
      },
      {
        form: "مَكْبُودٌ",
        meaning: "afflicted or distressed",
        difference:
          "Passive participle/adjectival form; it describes one affected by hardship rather than naming hardship itself.",
        relationship: "A genuine affected-state form in the ك ب د lexical family, supported by approved Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for مَكْبُودٌ and the approved ك ب د root meaning.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "derivation:affected-state"],
        baseDistinct: true,
        lexicalKey: "مكبود",
      },
    ],
    ["لبد"]: [
      {
        form: "لَبِدَ",
        meaning: "he stayed or clung",
        difference:
          "Form I perfect; it presents the completed act of remaining attached or staying in one place, behind the current compacted/abundant adjective.",
        relationship: "A genuine Form I verb of the ل ب د root, supported by Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of the Arabic Academy and classical ل ب د entries for لَبِدَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect"],
        baseDistinct: true,
        lexicalKey: "لبد-perfect",
      },
      {
        form: "يَلْبَدُ",
        meaning: "he stays or clings",
        difference:
          "Form I imperfect; it presents remaining attached or staying as ongoing.",
        relationship: "The imperfect counterpart of لَبِدَ in the ل ب د family.",
        provenance:
          "Codex-authored after review of classical Arabic evidence for يَلْبَدُ and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يلبد",
      },
      {
        form: "لَابِدٌ",
        meaning: "clinging or remaining",
        difference:
          "Active participle; it describes one that stays attached or does not depart, rather than the completed act.",
        relationship: "The active participle of لَبِدَ in the ل ب د lexical family.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing اللَّابِدُ and the approved root meaning.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "لابد",
      },
      {
        form: "تَلَبَّدَ",
        meaning: "it became matted or compacted",
        difference:
          "Form V perfect; it describes material becoming clumped or matted, a concrete development of the current compacted-mass meaning.",
        relationship: "A genuine Form V verb in the ل ب د family, supported by approved Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of the Arabic Academy and classical ل ب د entries for تَلَبَّدَ.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:perfect", "derivation:change-of-state"],
        baseDistinct: true,
        lexicalKey: "تلبد",
      },
      {
        form: "مُلَبَّدٌ",
        meaning: "matted or compacted",
        difference:
          "Passive participle; it describes something made compact or matted, contrasting with the current adjective of abundance.",
        relationship: "A genuine Form II passive participle in the ل ب د family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for مُلَبَّدٌ and the approved root meaning.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-2", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "ملبد",
      },
    ],
    ["لسن"]: [
      {
        form: "لِسَانٌ",
        meaning: "a tongue or language",
        difference:
          "Indefinite singular noun; it shows the lexical base behind the current conjunction and accusative form.",
        relationship: "The basic noun of the ل س ن family, attested throughout the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ل س ن evidence and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "number:singular", "state:indefinite"],
        baseDistinct: true,
        lexicalKey: "لسان",
      },
      {
        form: "أَلْسِنَةٌ",
        meaning: "tongues or languages",
        difference:
          "Established broken plural; it changes the singular tongue/language into the plural form used for multiple tongues or languages.",
        relationship: "The canonical broken plural of لِسَانٌ in the ل س ن family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of أَلْسِنَةٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "ألسنة",
      },
      {
        form: "لِسَانِيٌّ",
        meaning: "linguistic or language-related",
        difference:
          "Nisbah adjective; the ـيّ ending derives a descriptive form meaning ‘related to language’ rather than naming a tongue itself.",
        relationship: "A genuine nisbah adjective derived from لِسَانٌ in the ل س ن family.",
        provenance:
          "Codex-authored after review of the established Arabic nisbah pattern applied to لِسَانٌ and the approved root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:nisbah", "meaning:related-adjective"],
        baseDistinct: true,
        lexicalKey: "لساني",
      },
      {
        form: "لَسِنٌ",
        meaning: "eloquent",
        difference:
          "Adjective; it derives a quality of eloquence from the tongue/language noun, giving a genuine lexical contrast rather than another attached-pronoun form.",
        relationship: "A genuine adjective in the ل س ن family, supported by Arabic Academy evidence for لَسِنَ and لَسِنٌ.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for لَسِنٌ and the approved ل س ن root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:quality-adjective"],
        baseDistinct: true,
        lexicalKey: "لسن-adjective",
      },
    ],
    ["شفه"]: [
      {
        form: "شَفَةٌ",
        meaning: "a lip",
        difference:
          "Feminine singular noun; it shows one lip behind the current dual form.",
        relationship: "The basic noun of the ش ف ه family, supported by the Arabic Language Academy entry for الشفة.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for شَفَةٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "number:singular", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "شفة",
      },
      {
        form: "شِفَاهٌ",
        meaning: "lips",
        difference:
          "Established broken plural; it contrasts with the current regular dual by naming lips generally rather than exactly two.",
        relationship: "The established plural of شَفَةٌ in the ش ف ه family.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence listing شِفَاهٌ as the plural of شَفَةٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "شفاه",
      },
      {
        form: "شَفَوَاتٌ",
        meaning: "lips",
        difference:
          "An attested alternate plural pattern; it gives a real number/form contrast with both the current dual and the broken plural شِفَاهٌ.",
        relationship: "An established alternate plural associated with شَفَةٌ in classical Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of classical Arabic evidence recording شَفَوَاتٌ as an alternate plural of شَفَةٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:alternate-plural"],
        baseDistinct: true,
        lexicalKey: "شفوات",
      },
      {
        form: "شَفَهِيٌّ",
        meaning: "oral or labial",
        difference:
          "Nisbah adjective; it derives a descriptive form meaning ‘of the lip/mouth’ from the noun.",
        relationship: "A standard nisbah adjective of شَفَةٌ in the ش ف ه family.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for شَفَهِيٌّ and the approved root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:nisbah", "meaning:related-adjective"],
        baseDistinct: true,
        lexicalKey: "شفهي",
      },
    ],
    ["نجد"]: [
      {
        form: "نَجْدٌ",
        meaning: "a highland or elevated path",
        difference:
          "Basic singular noun; it shows the lexical base behind the current dual noun ‘the two ways/highlands.’",
        relationship: "The basic noun of the ن ج د family, supported by Arabic Language Academy evidence for النَّجْد.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for نَجْدٌ and the approved root range.",
        featureSignal: ["partofspeech:noun", "number:singular"],
        baseDistinct: true,
        lexicalKey: "نجد",
      },
      {
        form: "نُجُودٌ",
        meaning: "highlands or elevated places",
        difference:
          "Broken plural; it expands the singular elevated place into a plural form.",
        relationship: "An established plural associated with نَجْدٌ in Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence listing نُجُودٌ in the ن ج د family.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "نجود",
      },
      {
        form: "نَجَدَ",
        meaning: "he helped or assisted",
        difference:
          "Form I perfect in another established lexical sense of the root; it changes the place noun into a completed act of giving aid.",
        relationship: "A genuine Form I verb of the ن ج د root, supported by Arabic Language Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for نَجَدَ and the approved root range.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "meaning:help"],
        baseDistinct: true,
        lexicalKey: "نجد-perfect",
      },
      {
        form: "يَنْجُدُ",
        meaning: "he helps or assists",
        difference:
          "Form I imperfect; it presents the helping action as ongoing rather than completed.",
        relationship: "The imperfect counterpart of نَجَدَ in the ن ج د family.",
        provenance:
          "Codex-authored after review of standard Form I morphology and Arabic lexical evidence for the ن ج د root.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person", "meaning:help"],
        baseDistinct: true,
        lexicalKey: "ينجد",
      },
      {
        form: "نَجْدَةٌ",
        meaning: "help or assistance",
        difference:
          "Verbal/state noun; it names the aid supplied rather than the elevated path or the finite helping action.",
        relationship: "A genuine noun in the ن ج د family, supported by Arabic Language Academy evidence for النَّجْدَة.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for نَجْدَةٌ and the approved root range.",
        featureSignal: ["partofspeech:noun", "derivation:state-noun", "meaning:help"],
        baseDistinct: true,
        lexicalKey: "نجدة",
      },
    ],
    ["قحم"]: [
      {
        form: "يَقْتَحِمُ",
        meaning: "he attempts or plunges into",
        difference:
          "Form VIII imperfect; it presents attempting or plunging into the obstacle as ongoing.",
        relationship: "The imperfect counterpart of ٱقْتَحَمَ in the ق ح م family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for the ق ح م Form VIII family and standard Form VIII morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-8", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يقتحم",
      },
      {
        form: "اِقْتَحِمْ",
        meaning: "attempt or plunge into!",
        difference:
          "Form VIII imperative; it turns the root into a direct command to attempt or enter forcefully.",
        relationship: "The imperative of اِقْتَحَمَ in the ق ح م lexical family.",
        provenance:
          "Codex-authored after review of standard Form VIII imperative morphology and the Quranic ق ح م evidence.",
        featureSignal: ["partofspeech:verb", "pattern:form-8", "mood:imperative", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "اقتحم-imperative",
      },
      {
        form: "اِقْتِحَامٌ",
        meaning: "attempting or plunging into",
        difference:
          "Form VIII verbal noun; it names the act of attempting or entering forcefully rather than expressing it as a finite verb.",
        relationship: "The verbal noun of اِقْتَحَمَ in the ق ح م family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for اِقْتِحَامٌ and the Quranic Arabic Corpus root range.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-8", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "اقتحام",
      },
      {
        form: "مُقْتَحِمٌ",
        meaning: "one who plunges into or bursts in",
        difference:
          "Form VIII active participle; it names the agent performing the plunging or entering action.",
        relationship: "The canonical Form VIII active participle of اِقْتَحَمَ, attested in Qur'an 38:59.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 38:59:3 and standard Form VIII active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-8", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "مقتحم",
      },
    ],
    ["فكك"]: [
      {
        form: "فَكَّ",
        meaning: "he loosened or freed",
        difference:
          "Form I perfect; it expresses the completed act underlying the current noun and Form VII participle.",
        relationship: "Form I perfect of the ف ك ك root, attested in the reviewed lexical family.",
        provenance:
          "Codex-authored after review of Arabic Language Academy and classical lexical evidence for فَكَّ.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect"],
        baseDistinct: true,
        lexicalKey: "فك-perfect",
      },
      {
        form: "يَفُكُّ",
        meaning: "he loosens or frees",
        difference:
          "Form I imperfect; it presents loosening or freeing as ongoing.",
        relationship: "The imperfect counterpart of فَكَّ in the ف ك ك family.",
        provenance:
          "Codex-authored after review of standard Form I morphology and Arabic lexical evidence for يَفُكُّ.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يفك",
      },
      {
        form: "مَفْكُوكٌ",
        meaning: "loosened or freed",
        difference:
          "Form I passive participle; it describes something released or separated by the freeing action.",
        relationship: "The passive participle of فَكَّ in the ف ك ك lexical family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for مَفْكُوكٌ and the approved root meaning.",
        featureSignal: ["partofspeech:passive-participle", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مفكوك",
      },
      {
        form: "فِكَاكٌ",
        meaning: "release or ransom",
        difference:
          "Verbal noun/noun; it names the release or ransom obtained by freeing someone rather than the act as a finite verb.",
        relationship: "A genuine noun in the ف ك ك family, supported by approved Arabic lexical evidence for فِكَاكٌ.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence listing فِكَاكٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:result-noun", "meaning:release"],
        baseDistinct: true,
        lexicalKey: "فكاك",
      },
    ],
    ["رقب"]: [
      {
        form: "رَقَبَ",
        meaning: "he watched or respected",
        difference:
          "Form I perfect; it expresses a completed act of watching, guarding or respecting, contrasting with the current neck noun.",
        relationship: "Form I perfect of the ر ق ب root, attested in the Quranic Arabic Corpus.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ر ق ب evidence and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect"],
        baseDistinct: true,
        lexicalKey: "رقب-perfect",
      },
      {
        form: "يَرْقُبُ",
        meaning: "he watches or respects",
        difference:
          "Form I imperfect; it presents watching or respecting as ongoing.",
        relationship: "The imperfect counterpart of رَقَبَ in the ر ق ب family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of يَرْقُبُ and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يرقب",
      },
      {
        form: "رَقِيبٌ",
        meaning: "watchful guardian",
        difference:
          "Noun/adjective; it names the one who watches or guards rather than the neck noun or finite verb.",
        relationship: "A genuine intensive/agent noun in the ر ق ب family, attested in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ر ق ب occurrences and approved lexical evidence for رَقِيبٌ.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent", "meaning:guardian"],
        baseDistinct: true,
        lexicalKey: "رقيب",
      },
      {
        form: "اِرْتِقَابٌ",
        meaning: "watching or awaiting",
        difference:
          "Form VIII verbal noun; it names the act of watching for or awaiting something rather than expressing it as a command.",
        relationship: "The verbal noun of اِرْتَقَبَ in the ر ق ب family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for اِرْتِقَابٌ and the Quranic Arabic Corpus Form VIII evidence.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-8", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "ارتقاب",
      },
    ],
    ["سغب"]: [
      {
        form: "سَغِبَ",
        meaning: "he was hungry or exhausted from hunger",
        difference:
          "Form I perfect; it expresses the completed state behind the current noun for severe hunger.",
        relationship: "Form I perfect of the س غ ب root, supported by Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic Language Academy and classical lexical evidence for سَغِبَ.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect"],
        baseDistinct: true,
        lexicalKey: "سغب-perfect",
      },
      {
        form: "يَسْغَبُ",
        meaning: "he is hungry or exhausted from hunger",
        difference:
          "Form I imperfect; it presents the hunger as ongoing.",
        relationship: "The imperfect counterpart of سَغِبَ in the س غ ب family.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for يَسْغَبُ and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يسغب",
      },
      {
        form: "سَغْبَانُ",
        meaning: "hungry",
        difference:
          "Adjective; it describes a hungry person rather than naming hunger as a state noun.",
        relationship: "A genuine adjective in the س غ ب family, listed in approved Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for سَغْبَانُ.",
        featureSignal: ["partofspeech:adjective", "derivation:state-adjective"],
        baseDistinct: true,
        lexicalKey: "سغبانا",
      },
      {
        form: "سَاغِبٌ",
        meaning: "hungry",
        difference:
          "Active participle/adjective; it describes one experiencing hunger, contrasting with the current abstract noun.",
        relationship: "A genuine active participle in the س غ ب family, supported by approved Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of classical Arabic evidence for سَاغِبٌ.",
        featureSignal: ["partofspeech:active-participle", "derivation:descriptor"],
        baseDistinct: true,
        lexicalKey: "ساغب",
      },
    ],
    ["شأم"]: [
      {
        form: "شَأَمَ",
        meaning: "he brought misfortune",
        difference:
          "Form I perfect; it expresses the completed act of bringing ill fortune, developing the current left-side/ill-omen noun.",
        relationship: "A genuine Form I verb of the ش أ م root, supported by Arabic Language Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Language Academy and classical lexical evidence for شَأَمَ.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect"],
        baseDistinct: true,
        lexicalKey: "شأم-perfect",
      },
      {
        form: "يَشْأَمُ",
        meaning: "he brings misfortune",
        difference:
          "Form I imperfect; it presents bringing ill fortune as ongoing.",
        relationship: "The imperfect counterpart of شَأَمَ in the ش أ م family.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for يَشْأَمُ and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يشأم",
      },
      {
        form: "شُؤْمٌ",
        meaning: "ill fortune or bad omen",
        difference:
          "Abstract noun; it names misfortune itself rather than the directional or group noun in the current occurrence.",
        relationship: "A genuine noun in the ش أ م family, supported by Arabic Language Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for شُؤْمٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:state-noun", "meaning:misfortune"],
        baseDistinct: true,
        lexicalKey: "شؤم",
      },
      {
        form: "مَشْؤُومٌ",
        meaning: "ill-omened or unlucky",
        difference:
          "Passive/result adjective; it describes a person or thing affected by misfortune rather than naming misfortune itself.",
        relationship: "A genuine affected-state adjective in the ش أ م family, supported by Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic Language Academy evidence for مَشْؤُومٌ.",
        featureSignal: ["partofspeech:adjective", "voice:passive", "derivation:affected-state"],
        baseDistinct: true,
        lexicalKey: "مشؤوم",
      },
    ],
    ["ضحو"]: [
      {
        form: "ضُحًى",
        meaning: "daylight or morning brightness",
        difference:
          "Bare nominal form; it removes the conjunction, attached pronoun and case context from the current occurrence and shows the lexical time/brightness noun.",
        relationship:
          "The basic noun of the ض ح و family, attested repeatedly in the Qur'an for daylight or morning brightness.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ض ح و occurrences and Arabic Academy lexical evidence for الضُّحَى والضَّحْو.",
        featureSignal: ["partofspeech:noun", "attached-pronoun:removed", "state:indefinite"],
        baseDistinct: true,
        lexicalKey: "ضحى",
      },
      {
        form: "تَضْحَىٰ",
        meaning: "you are exposed to the sun's heat",
        difference:
          "Form I imperfect, second-person masculine singular; it changes the brightness noun into an ongoing exposure-to-sun action.",
        relationship:
          "A canonical Form I verb of the ض ح و family, attested in Qur'an 20:119.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 20:119 and the approved ض ح و root range.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "تضحى",
      },
      {
        form: "ضَاحٍ",
        meaning: "exposed to sunlight or in the open",
        difference:
          "Form I active participle; it describes a person or thing exposed to the sun rather than naming the daylight period.",
        relationship:
          "A genuine active participle of ضَحَا in the ض ح و lexical family, supported by Arabic Academy lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing ضَاحٍ and standard weak-final Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-1", "derivation:descriptor"],
        baseDistinct: true,
        lexicalKey: "ضاح",
      },
      {
        form: "ضُحُوٌّ",
        meaning: "exposure to sunlight or the forenoon",
        difference:
          "Verbal noun; it names the state or action associated with appearing in sunlight rather than the current time noun.",
        relationship:
          "A genuine verbal noun in the ض ح و family, listed in approved Arabic lexical evidence alongside الضُّحَى.",
        provenance:
          "Codex-authored after review of Arabic Academy and classical lexicon evidence for ضُحُوٌّ and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "ضحو",
      },
    ],
    ["قمر"]: [
      {
        form: "قَمَرٌ",
        meaning: "a moon",
        difference:
          "Indefinite masculine singular noun; it shows the lexical base behind the current conjunction, article and genitive ending.",
        relationship:
          "The basic noun of the ق م ر family, attested throughout the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ق م ر evidence and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:singular", "state:indefinite", "attached-prefixes:removed"],
        baseDistinct: true,
        lexicalKey: "قمر",
      },
      {
        form: "قَمَرَانِ",
        meaning: "two moons",
        difference:
          "Regular dual, nominative form; the ending marks exactly two moons instead of one.",
        relationship:
          "A genuine dual of قَمَرٌ in the ق م ر lexical family.",
        provenance:
          "Codex-authored after review of standard Arabic dual formation for قَمَرٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "number:dual", "case:nominative"],
        baseDistinct: true,
        lexicalKey: "قمران",
      },
      {
        form: "أَقْمَارٌ",
        meaning: "moons",
        difference:
          "Broken plural noun; it changes the singular moon into the established plural form.",
        relationship:
          "A genuine broken plural of قَمَرٌ in the ق م ر family, supported by approved Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy lexical evidence listing أَقْمَارٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "أقمار",
      },
      {
        form: "قَمَرِيٌّ",
        meaning: "lunar or moon-related",
        difference:
          "Nisbah adjective; the ـيّ ending derives an adjective meaning ‘related to the moon’ rather than naming the object itself.",
        relationship:
          "A genuine nisbah adjective derived from قَمَرٌ in the ق م ر lexical family.",
        provenance:
          "Codex-authored after review of Arabic Academy lexical evidence for القَمَرِيّ and the standard nisbah pattern.",
        featureSignal: ["partofspeech:adjective", "derivation:nisbah", "meaning:related-adjective"],
        baseDistinct: true,
        lexicalKey: "قمري",
      },
      {
        form: "أَقْمَرَ",
        meaning: "it became a moon or reached the moon stage",
        difference:
          "Form IV perfect verb; the prefixed hamza marks a change into the moon stage, adding a real verb contrast to the noun family.",
        relationship:
          "A genuine Form IV verb in the ق م ر family, listed in Arabic Academy lexical evidence for أَقْمَرَ.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing أَقْمَرَ and the established Form IV pattern.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "derivation:change-of-state"],
        baseDistinct: true,
        lexicalKey: "أقمر",
      },
    ],
    ["تلو"]: [
      {
        form: "تَلَا",
        meaning: "he recited or followed",
        difference:
          "Form I perfect without the attached object pronoun; it isolates the completed root action behind the current occurrence.",
        relationship:
          "The Form I perfect of the ت ل و family, attested throughout the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ت ل و evidence and standard weak-final Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "attached-pronoun:removed"],
        baseDistinct: true,
        lexicalKey: "تلا-perfect",
      },
      {
        form: "يَتْلُو",
        meaning: "he recites or follows",
        difference:
          "Form I imperfect, third-person masculine singular; it presents the action as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of تَلَا in the ت ل و family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ت ل و occurrences and standard weak-final Form I imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يتلو",
      },
      {
        form: "اِتْلُ",
        meaning: "recite or follow!",
        difference:
          "Form I imperative, second-person masculine singular; it turns the root into a direct command.",
        relationship:
          "The canonical imperative of تَلَا, attested repeatedly in Qur'anic commands to recite.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences including 5:27 and standard Form I imperative morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "mood:imperative", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "اتل",
      },
      {
        form: "تِلَاوَةٌ",
        meaning: "recitation",
        difference:
          "Verbal noun; it names the act of reciting rather than expressing the action as a finite verb with an object pronoun.",
        relationship:
          "A canonical verbal noun of the ت ل و family, attested in Qur'an 2:121.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 2:121 and the approved ت ل و root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "تلاوة",
      },
      {
        form: "تَالٍ",
        meaning: "one who recites or follows",
        difference:
          "Form I active participle; it describes the agent performing the reciting or following rather than expressing a finite verb.",
        relationship:
          "A canonical active participle of the ت ل و family, attested in التَّالِيَاتِ in Qur'an 37:3.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 37:3 and standard weak-final Form I active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-1", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "تال",
      },
    ],
    ["طحو"]: [
      {
        form: "طَحَا",
        meaning: "he spread or extended",
        difference:
          "Form I perfect without the attached object pronoun; it isolates the completed spreading action behind the current occurrence.",
        relationship:
          "The Form I perfect of the ط ح و family, attested in the Qur'anic occurrence طَحَاهَا.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 91:6 and approved Arabic lexical evidence for طَحَا.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "attached-pronoun:removed"],
        baseDistinct: true,
        lexicalKey: "طحا-perfect",
      },
      {
        form: "يَطْحُو",
        meaning: "he spreads or extends",
        difference:
          "Form I imperfect, third-person masculine singular; it presents spreading as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of طَحَا in the ط ح و lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for يَطْحُو and regular weak-final Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يطحو",
      },
      {
        form: "اِطْحُ",
        meaning: "spread or extend!",
        difference:
          "Form I imperative, second-person masculine singular; it turns the spreading root into a direct command.",
        relationship:
          "The imperative of طَحَا in the ط ح و family, supported by standard weak-final imperative morphology.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for اِطْحُ and the regular Form I imperative pattern.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "mood:imperative", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "اطح",
      },
      {
        form: "طَحْوٌ",
        meaning: "spreading or extending",
        difference:
          "Verbal noun; it names the spreading action rather than expressing it as a finite verb with an attached object.",
        relationship:
          "A genuine verbal noun of طَحَا in the ط ح و lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence listing طَحْوًا for طَحَا.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "طحو",
      },
      {
        form: "مَطْحُوٌّ",
        meaning: "spread or extended",
        difference:
          "Form I passive participle; it describes something that has undergone the spreading action rather than the agent doing it.",
        relationship:
          "A genuine passive participle of طَحَا in the ط ح و lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for مَطْحُوٌّ and weak-final passive-participle morphology.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-1", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مطحوي",
      },
    ],
    ["لهم"]: [
      {
        form: "أَلْهَمَ",
        meaning: "he inspired",
        difference:
          "Form IV perfect without the conjunction and attached object pronoun; it isolates the completed inspiration action.",
        relationship:
          "The Form IV perfect behind فَأَلْهَمَهَا in the ل ه م family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 91:8 and the aligned Form IV pattern.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "attached-pronoun:removed"],
        baseDistinct: true,
        lexicalKey: "ألهم-perfect",
      },
      {
        form: "يُلْهِمُ",
        meaning: "he inspires",
        difference:
          "Form IV imperfect, third-person masculine singular; it presents inspiration as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of أَلْهَمَ in the ل ه م family.",
        provenance:
          "Codex-authored after review of standard Form IV imperfect morphology and the canonical ل ه م root evidence.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يلهم",
      },
      {
        form: "إِلْهَامٌ",
        meaning: "inspiration",
        difference:
          "Form IV verbal noun; it names the act or result of inspiring rather than expressing it as a finite verb.",
        relationship:
          "The standard Form IV verbal noun of أَلْهَمَ in the ل ه م lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for إِلْهَامٌ and Form IV verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-4", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "إلهام",
      },
      {
        form: "مُلْهِمٌ",
        meaning: "inspiring or one who inspires",
        difference:
          "Form IV active participle; it describes the source or agent of inspiration rather than expressing the verb itself.",
        relationship:
          "The active participle of أَلْهَمَ in the ل ه م lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for مُلْهِمٌ and standard Form IV active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-4", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "ملهم",
      },
    ],
    ["فلح"]: [
      {
        form: "يُفْلِحُ",
        meaning: "he succeeds",
        difference:
          "Form IV imperfect, third-person masculine singular; it presents success as ongoing or expected rather than completed.",
        relationship:
          "The imperfect counterpart of أَفْلَحَ in the ف ل ح family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ف ل ح occurrences and standard Form IV imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يفلح",
      },
      {
        form: "تُفْلِحُ",
        meaning: "you (masculine singular) succeed",
        difference:
          "Form IV imperfect, second-person masculine singular; the prefix تـ changes the person from the current third-person perfect.",
        relationship:
          "A genuine person contrast within the Form IV ف ل ح verb family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences including تُفْلِحُونَ and regular singular imperfect inflection.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:imperfect", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "تفلح",
      },
      {
        form: "إِفْلَاحٌ",
        meaning: "success or causing success",
        difference:
          "Form IV verbal noun; it names the action or result of succeeding rather than expressing it as a finite verb.",
        relationship:
          "The standard Form IV verbal noun of أَفْلَحَ in the ف ل ح lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence and the canonical Form IV ف ل ح pattern.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-4", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "إفلاح",
      },
      {
        form: "مُفْلِحٌ",
        meaning: "successful or one who succeeds",
        difference:
          "Form IV active participle; it describes a successful person rather than expressing success as a finite verb.",
        relationship:
          "The singular active participle behind the canonical plural الْمُفْلِحُونَ in the ف ل ح family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences of الْمُفْلِحُونَ and standard Form IV active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-4", "derivation:descriptor", "number:singular"],
        baseDistinct: true,
        lexicalKey: "مفلح",
      },
    ],
    ["خيب"]: [
      {
        form: "يَخِيبُ",
        meaning: "he fails or is disappointed",
        difference:
          "Form I imperfect, third-person masculine singular; it presents failure as ongoing or expected rather than completed.",
        relationship:
          "The imperfect counterpart of خَابَ in the خ ي ب family, supported by canonical and Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus خ ي ب evidence and Arabic Academy entries for خَابَ يَخِيبُ.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يخيب",
      },
      {
        form: "خَيْبَةٌ",
        meaning: "failure or disappointment",
        difference:
          "Verbal noun; it names the experience or result of failing rather than expressing it as a finite verb.",
        relationship:
          "A genuine verbal noun of خَابَ in the خ ي ب lexical family, listed by Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for خَيْبَةٌ and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:result-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "خيبة",
      },
      {
        form: "خَائِبٌ",
        meaning: "disappointed or unsuccessful",
        difference:
          "Form I active participle; it describes one who has failed or been disappointed rather than stating the event.",
        relationship:
          "The singular active participle behind the canonical plural خَائِبِينَ in the خ ي ب family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 3:127 and Arabic Academy evidence for خَائِبٌ.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-1", "derivation:descriptor"],
        baseDistinct: true,
        lexicalKey: "خائب",
      },
      {
        form: "خَيَّبَ",
        meaning: "he disappointed or frustrated",
        difference:
          "Form II perfect; the doubled middle radical marks causing someone to become disappointed, contrasting with the intransitive current verb.",
        relationship:
          "A genuine Form II causative verb in the خ ي ب lexical family, listed by Arabic Academy evidence.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for خَيَّبَ and standard Form II morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "خيب-form-2",
      },
    ],
    ["دسو"]: [
      {
        form: "دَسَا",
        meaning: "he concealed or buried",
        difference:
          "Form I perfect without the attached object pronoun; it isolates the completed concealment action behind the current occurrence.",
        relationship:
          "The Form I perfect of the د س و family, supported by Arabic Academy lexical evidence for دَسَا يَدْسُو.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 91:10 and Arabic Academy evidence for دَسَا.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "attached-pronoun:removed"],
        baseDistinct: true,
        lexicalKey: "دسا-perfect",
      },
      {
        form: "يَدْسُو",
        meaning: "he conceals or buries",
        difference:
          "Form I imperfect, third-person masculine singular; it presents concealing as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of دَسَا in the د س و lexical family.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence for يَدْسُو and standard weak-final Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يدسو",
      },
      {
        form: "دَسْوٌ",
        meaning: "concealment or burying",
        difference:
          "Verbal noun; it names the act of concealing or burying rather than expressing it as a finite verb with an object pronoun.",
        relationship:
          "A genuine verbal noun of دَسَا, explicitly listed in Arabic Academy evidence for the د س و family.",
        provenance:
          "Codex-authored after review of Arabic Academy evidence listing دَسْوًا and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "دسو",
      },
      {
        form: "مَدْسُوٌّ",
        meaning: "concealed or buried",
        difference:
          "Form I passive participle; it describes something hidden or buried by the action rather than the agent doing it.",
        relationship:
          "A genuine weak-final passive participle of دَسَا in the د س و lexical family.",
        provenance:
          "Codex-authored after review of Arabic Academy lexical evidence for دَسَا and standard weak-final passive-participle morphology.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-1", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مدسو",
      },
    ],
    ["نوق"]: [
      {
        form: "نَاقَةٌ",
        meaning: "a she-camel",
        difference:
          "Indefinite feminine singular noun; it shows the lexical base behind the current definite accusative form.",
        relationship:
          "The basic noun of the ن و ق family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ن و ق evidence and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "number:singular", "state:indefinite"],
        baseDistinct: true,
        lexicalKey: "ناقة",
      },
      {
        form: "نَاقَتَانِ",
        meaning: "two she-camels",
        difference:
          "Regular dual, nominative form; the ending marks exactly two she-camels instead of one.",
        relationship:
          "A genuine dual of نَاقَةٌ in the ن و ق lexical family.",
        provenance:
          "Codex-authored after review of standard Arabic dual formation for نَاقَةٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "number:dual", "case:nominative"],
        baseDistinct: true,
        lexicalKey: "ناقتان",
      },
      {
        form: "نُوقٌ",
        meaning: "she-camels",
        difference:
          "Broken plural noun; it changes the feminine singular into the established plural form.",
        relationship:
          "A classical plural of نَاقَةٌ, supported by Arabic Academy and Lisān al-ʿArab evidence for the ن و ق family.",
        provenance:
          "Codex-authored after review of Arabic Academy and Lisān al-ʿArab evidence listing نُوقٌ as a plural of نَاقَةٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "نوق",
      },
      {
        form: "نِيَاقٌ",
        meaning: "she-camels",
        difference:
          "Alternate broken plural; it gives a second established plural pattern without relying on case-ending variation.",
        relationship:
          "An established alternate plural of نَاقَةٌ in the ن و ق lexical family, supported by classical Arabic lexicon evidence.",
        provenance:
          "Codex-authored after review of Lisān al-ʿArab evidence listing نِيَاقٌ among the plurals of نَاقَةٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:alternate-broken-plural"],
        baseDistinct: true,
        lexicalKey: "نياق",
      },
      {
        form: "نَوَّقَ",
        meaning: "he trained or prepared camels",
        difference:
          "Form II perfect verb; the doubled middle radical adds a genuine action contrast to the noun’s singular, dual and plural forms.",
        relationship:
          "A genuine Form II verb in the ن و ق lexical family, listed in Arabic Academy evidence under نَوَّقَ.",
        provenance:
          "Codex-authored after review of Arabic Academy lexical evidence for نَوَّقَ and standard Form II morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "نوق-form-2",
      },
    ],
    ["عقر"]: [
      {
        form: "عَقَرَ",
        meaning: "he hamstrung",
        difference:
          "Form I perfect without the conjunction, plural subject or attached object pronoun; it isolates the completed action.",
        relationship:
          "The Form I perfect of the ع ق ر family, attested in Qur'anic occurrences of hamstringing.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ع ق ر evidence including 7:77 and 91:14.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "attached-pronoun:removed"],
        baseDistinct: true,
        lexicalKey: "عقر-perfect",
      },
      {
        form: "يَعْقِرُ",
        meaning: "he hamstrings",
        difference:
          "Form I imperfect, third-person masculine singular; it presents the hamstringing action as ongoing.",
        relationship:
          "The imperfect counterpart of عَقَرَ in the ع ق ر family.",
        provenance:
          "Codex-authored after review of standard Form I imperfect morphology and the canonical ع ق ر root range.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يعقر",
      },
      {
        form: "عَقْرٌ",
        meaning: "hamstringing",
        difference:
          "Verbal noun; it names the act of hamstringing rather than expressing it as a finite verb with attached material.",
        relationship:
          "The verbal noun of عَقَرَ in the ع ق ر lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for عَقْرٌ and the canonical Qur'anic verb.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "عقر-noun",
      },
      {
        form: "مَعْقُورٌ",
        meaning: "hamstrung",
        difference:
          "Form I passive participle; it describes the animal affected by hamstringing rather than the agent performing it.",
        relationship:
          "A genuine passive participle of عَقَرَ in the ع ق ر family, supported by Arabic lexical evidence.",
        provenance:
          "Codex-authored after review of Arabic lexical evidence for مَعْقُورٌ and standard Form I passive-participle morphology.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-1", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "معقور",
      },
    ],
    ["دمدم"]: [
      {
        form: "دَمْدَمَ",
        meaning: "he destroyed or crushed",
        difference:
          "Quadriliteral Form I perfect without the conjunction; it isolates the completed destructive action in the current occurrence.",
        relationship:
          "The base quadriliteral verb of the د م د م family, attested in Qur'an 91:14.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus quadriliteral د م د م evidence and standard quadriliteral morphology.",
        featureSignal: ["partofspeech:verb", "pattern:quadriliteral-form-1", "tense:perfect", "attached-prefixes:removed"],
        baseDistinct: true,
        lexicalKey: "دمدم-perfect",
      },
      {
        form: "يُدَمْدِمُ",
        meaning: "he destroys or crushes",
        difference:
          "Quadriliteral imperfect; it presents the destructive action as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of دَمْدَمَ in the quadriliteral د م د م family.",
        provenance:
          "Codex-authored after review of standard Arabic quadriliteral imperfect morphology and the canonical root evidence.",
        featureSignal: ["partofspeech:verb", "pattern:quadriliteral-form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يدمدم",
      },
      {
        form: "دَمْدِمْ",
        meaning: "destroy or crush!",
        difference:
          "Quadriliteral imperative, second-person masculine singular; it changes the destructive root into a direct command.",
        relationship:
          "The regular imperative of the quadriliteral verb دَمْدَمَ.",
        provenance:
          "Codex-authored after review of standard Arabic quadriliteral imperative morphology and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:quadriliteral-form-1", "mood:imperative", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "دمدم-imperative",
      },
      {
        form: "دَمْدَمَةٌ",
        meaning: "destruction or crushing",
        difference:
          "Quadriliteral verbal noun; it names the destructive event rather than expressing it as a finite verb.",
        relationship:
          "The verbal noun of دَمْدَمَ in the quadriliteral د م د م family.",
        provenance:
          "Codex-authored after review of standard quadriliteral verbal-noun morphology and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:quadriliteral-form-1", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "دمدمة",
      },
      {
        form: "مُدَمْدَمٌ",
        meaning: "destroyed or crushed",
        difference:
          "Quadriliteral passive participle; it describes something affected by the destructive action rather than the agent doing it.",
        relationship:
          "The passive participle of دَمْدَمَ in the quadriliteral د م د م family.",
        provenance:
          "Codex-authored after review of standard quadriliteral passive-participle morphology and the canonical root evidence.",
        featureSignal: ["partofspeech:passive-participle", "pattern:quadriliteral-form-1", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مدمدم",
      },
    ],
    ["جلو"]: [
      {
        form: "يَتَجَلَّىٰ",
        meaning: "he/it becomes manifest or appears",
        difference:
          "Form V imperfect; the prefix يـ presents the becoming-manifest action as ongoing rather than the current perfect form.",
        relationship:
          "The Form V imperfect of تَجَلَّىٰ in the ج ل و family; it keeps the same reflexive/becoming-manifest pattern while changing tense.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ج ل و evidence for تَجَلَّىٰ and standard Form V imperfect morphology.",
        featureSignal: ["pattern:form-5", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يتجلى",
      },
      {
        form: "جَلَّىٰ",
        meaning: "he revealed or displayed",
        difference:
          "Form II perfect; the doubled middle radical marks an agent causing something to become clear, contrasting with the current self-becoming form.",
        relationship:
          "A canonical Form II counterpart in the ج ل و family, attested in جَلَّاهَا ‘He displayed it’.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrences 7:187 and 91:3 and the aligned Form II pattern.",
        featureSignal: ["pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "جلى-form-2",
      },
      {
        form: "يُجَلِّي",
        meaning: "he reveals or displays",
        difference:
          "Form II imperfect; it presents the causative revealing action as ongoing and contrasts with both the current Form V perfect and the Form II perfect.",
        relationship:
          "The canonical Form II imperfect of the ج ل و family, attested in يُجَلِّيها.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 7:187 and standard Form II imperfect morphology.",
        featureSignal: ["pattern:form-2", "tense:imperfect", "person:third-person", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "يجلي",
      },
      {
        form: "جَلَاءٌ",
        meaning: "removal, departure or exile",
        difference:
          "Verbal noun/lexical noun; it names the result or event of making something clear or removing it, rather than expressing a finite verb.",
        relationship:
          "A canonical noun of the ج ل و family, attested in الْجَلَاءِ in Qur'an 59:3.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 59:3 and the approved ج ل و root meaning range.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "جلاء",
      },
    ],
    ["أنث"]: [
      {
        form: "أُنْثَىٰ",
        meaning: "a female",
        difference:
          "Bare indefinite feminine noun; it removes the conjunction and definite article from the current occurrence and shows the lexical base.",
        relationship:
          "The basic feminine noun of the أ ن ث family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus أ ن ث occurrences and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "state:indefinite", "attached-prefixes:removed"],
        baseDistinct: true,
        lexicalKey: "أنثى",
      },
      {
        form: "أُنْثَيَيْنِ",
        meaning: "two females",
        difference:
          "Dual noun in the accusative/genitive form; the ending marks exactly two females rather than one.",
        relationship:
          "A canonical dual form of أُنْثَىٰ in the أ ن ث family, attested in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus evidence for أُنْثَيَيْنِ and standard feminine-dual morphology.",
        featureSignal: ["partofspeech:noun", "number:dual", "case:accusative-or-genitive"],
        baseDistinct: true,
        lexicalKey: "أنثيين",
      },
      {
        form: "إِنَاثٌ",
        meaning: "females",
        difference:
          "Broken plural noun; it changes the singular feminine noun into the established plural form.",
        relationship:
          "A canonical plural in the أ ن ث family, attested in Qur'an 4:117.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 4:117 and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "إناث",
      },
      {
        form: "أَنَّثَ",
        meaning: "he feminized or made feminine",
        difference:
          "Form II perfect verb; the doubled middle radical marks the action of making something feminine, contrasting with the current noun.",
        relationship:
          "A genuine derived Form II verb of the أ ن ث lexical family, formed from the feminine root meaning.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for أَنَّثَ and standard Form II morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "أنث-form-2",
      },
    ],
    ["شتت"]: [
      {
        form: "أَشْتَاتٌ",
        meaning: "scattered groups",
        difference:
          "Broken plural noun; it expresses separate groups rather than the current singular feminine adjective meaning diverse.",
        relationship:
          "A canonical plural of the ش ت ت family, attested in Qur'anic occurrences 24:61 and 99:6.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ش ت ت occurrences and the approved project root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "أشتات",
      },
      {
        form: "تَشَتَّتَ",
        meaning: "he became scattered",
        difference:
          "Form V perfect verb; the تفعّل pattern presents scattering as a change of state rather than the current adjective.",
        relationship:
          "A genuine Form V verb in the ش ت ت lexical family, derived from the meaning of becoming dispersed.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for تَشَتَّتَ and standard Form V morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:perfect", "derivation:change-of-state"],
        baseDistinct: true,
        lexicalKey: "تشتت-perfect",
      },
      {
        form: "يَتَشَتَّتُ",
        meaning: "he becomes scattered",
        difference:
          "Form V imperfect verb; it presents the scattering as ongoing, contrasting with the completed Form V and the current adjective.",
        relationship:
          "The imperfect counterpart of تَشَتَّتَ in the ش ت ت family.",
        provenance:
          "Codex-authored after review of standard Form V imperfect morphology and the approved ش ت ت root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يتشتت",
      },
      {
        form: "تَشْتِيتٌ",
        meaning: "scattering or dispersal",
        difference:
          "Form II verbal noun; it names the causative act of scattering rather than describing something as diverse.",
        relationship:
          "A genuine Form II action noun in the ش ت ت lexical family.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for تَشْتِيتٌ and standard Form II verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-2", "derivation:action-noun", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "تشتيت",
      },
    ],
    ["بخل"]: [
      {
        form: "يَبْخَلُ",
        meaning: "he is stingy or withholds",
        difference:
          "Form I imperfect, third-person masculine singular; it presents the withholding as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of بَخِلَ in the ب خ ل family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ب خ ل occurrences and standard Form I imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يبخل",
      },
      {
        form: "تَبْخَلُ",
        meaning: "you (masculine singular) are stingy or withhold",
        difference:
          "Form I imperfect, second-person masculine singular; the prefix تـ changes the person from the current third-person perfect.",
        relationship:
          "A genuine person contrast within the Form I ب خ ل verb family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus Form I ب خ ل evidence and regular imperfect-person inflection.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "تبخل",
      },
      {
        form: "بُخْلٌ",
        meaning: "stinginess or withholding",
        difference:
          "Verbal noun/abstract noun; it names the quality or act of withholding rather than expressing it as a finite verb.",
        relationship:
          "A canonical noun of the ب خ ل family, attested in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ب خ ل evidence for البخل and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:quality-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "بخل-noun",
      },
      {
        form: "بَخِيلٌ",
        meaning: "stingy or miserly",
        difference:
          "Adjective; it describes a person characterised by withholding rather than naming the completed action.",
        relationship:
          "A genuine adjective in the ب خ ل lexical family, derived from the withholding root.",
        provenance:
          "Codex-authored after review of approved Arabic lexical evidence for بَخِيلٌ and the established adjective pattern.",
        featureSignal: ["partofspeech:adjective", "derivation:descriptor", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "بخيل",
      },
    ],
    ["ردي"]: [
      {
        form: "تَرْدَىٰ",
        meaning: "you perish or fall",
        difference:
          "Form I imperfect; it expresses perishing in the basic pattern, contrasting with the current Form V verb of falling.",
        relationship:
          "A canonical Form I form of the ر د ي family, attested in Qur'an 20:16.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ر د ي occurrence 20:16 and standard weak-final Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:second-person"],
        baseDistinct: true,
        lexicalKey: "ترْدى",
      },
      {
        form: "أَرْدَىٰ",
        meaning: "he ruined or caused to perish",
        difference:
          "Form IV perfect; the prefixed hamza marks a causative action, changing basic perishing into causing someone or something to perish.",
        relationship:
          "A canonical Form IV verb of the ر د ي family, attested in Qur'anic occurrences including 6:137 and 41:23.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ر د ي Form IV evidence and standard Form IV morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "أردى",
      },
      {
        form: "يُرْدِي",
        meaning: "he ruins or causes to perish",
        difference:
          "Form IV imperfect; it presents the causative ruining action as ongoing rather than completed.",
        relationship:
          "The imperfect counterpart of أَرْدَىٰ in the ر د ي family.",
        provenance:
          "Codex-authored after review of standard weak-final Form IV imperfect morphology and the canonical ر د ي root evidence.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:imperfect", "person:third-person", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "يردي",
      },
      {
        form: "مُتَرَدِّيَةٌ",
        meaning: "falling fatally",
        difference:
          "Form V active participle, feminine singular; it describes the one undergoing the fall rather than expressing the action as a finite verb.",
        relationship:
          "A canonical Form V active participle of the ر د ي family, attested in Qur'an 5:3.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 5:3 and standard Form V active-participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-5", "gender:feminine", "derivation:descriptor"],
        baseDistinct: true,
        lexicalKey: "متردية",
      },
    ],
    ["لظي"]: [
      {
        form: "لَظَىٰ",
        meaning: "blazing fire",
        difference:
          "Lexical noun; it names the blazing fire itself rather than expressing blazing as a verb.",
        relationship:
          "A canonical noun of the ل ظ ي family, attested in Qur'an 70:15.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ل ظ ي evidence and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:related-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "لظى",
      },
      {
        form: "تَتَلَظَّىٰ",
        meaning: "it blazes",
        difference:
          "Form V imperfect, third-person feminine singular; the repeated تـ pattern presents a feminine subject blazing as an ongoing action.",
        relationship:
          "A regular feminine Form V imperfect related to تَلَظَّىٰ in the ل ظ ي family.",
        provenance:
          "Codex-authored after review of the canonical Form V verb تَلَظَّىٰ and standard feminine imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:imperfect", "gender:feminine"],
        baseDistinct: true,
        lexicalKey: "تتلظى",
      },
      {
        form: "تَلَظٍّ",
        meaning: "blazing or flaming",
        difference:
          "Form V verbal noun; it names the state or action of blazing rather than expressing it as a finite verb.",
        relationship:
          "The action noun of تَلَظَّىٰ in the ل ظ ي lexical family.",
        provenance:
          "Codex-authored after review of standard Form V verbal-noun morphology for تَلَظَّىٰ and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-5", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تلظ",
      },
      {
        form: "مُتَلَظٍّ",
        meaning: "blazing or flaming",
        difference:
          "Form V active participle; it describes something that is blazing rather than presenting the action as a finite verb.",
        relationship:
          "The active participle of تَلَظَّىٰ in the ل ظ ي lexical family.",
        provenance:
          "Codex-authored after review of standard Form V active-participle morphology and the approved ل ظ ي root meaning.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-5", "derivation:descriptor"],
        baseDistinct: true,
        lexicalKey: "متلظ",
      },
    ],
    ["شقو"]: [
      {
        form: "شَقِيَ",
        meaning: "he was wretched or distressed",
        difference:
          "Form I perfect; it states the completed state of wretchedness behind the current elative noun.",
        relationship:
          "The singular Form I perfect counterpart of canonical شَقُوا in the ش ق و family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ش ق و Form I evidence and standard weak-final perfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "شقي-perfect",
      },
      {
        form: "يَشْقَىٰ",
        meaning: "he suffers or is wretched",
        difference:
          "Form I imperfect, third-person masculine singular; it presents distress as ongoing rather than naming the superlative degree.",
        relationship:
          "A canonical Form I imperfect of the ش ق و family, attested in Qur'anic occurrences including 20:2 and 20:123.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ش ق و occurrences and standard weak-final imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يشقى",
      },
      {
        form: "شِقْوَةٌ",
        meaning: "wretchedness or misery",
        difference:
          "Abstract noun; it names the condition of wretchedness rather than expressing it as a verb or degree adjective.",
        relationship:
          "A canonical noun of the ش ق و family, attested in شِقْوَتُنَا in Qur'an 23:106.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 23:106 and the approved ش ق و root meaning.",
        featureSignal: ["partofspeech:abstract-noun", "derivation:quality-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "شقوة",
      },
      {
        form: "شَقِيٌّ",
        meaning: "wretched or unhappy",
        difference:
          "Adjective/noun; it describes an individual as wretched without the superlative meaning of أَشْقَى.",
        relationship:
          "A canonical adjective/noun in the ش ق و family, attested repeatedly in the Qur'an.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ش ق و occurrences including 11:105 and 19:32.",
        featureSignal: ["partofspeech:adjective", "derivation:descriptor", "degree:positive"],
        baseDistinct: true,
        lexicalKey: "شقي-adjective",
      },
    ],
    ["وتر"]: [
      {
        form: "أَوْتَرَ",
        meaning: "he made odd; performed the witr prayer",
        difference: "Form IV perfect; the added أـ makes the odd/single quality an action rather than a noun description.",
        relationship: "A genuine Form IV verb of the و ت ر family, documented in Arabic lexicon evidence for making something odd.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus و ت ر evidence and Arabic Academy evidence for وَتَرَ/أَوْتَرَ.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "derivation:causative"],
        baseDistinct: true,
        lexicalKey: "اوتر",
      },
      {
        form: "يُوتِرُ",
        meaning: "he makes odd; performs witr",
        difference: "Form IV imperfect; it presents the making-odd action as ongoing rather than completed.",
        relationship: "The imperfect counterpart of أَوْتَرَ within the و ت ر family.",
        provenance: "Codex-authored after review of Arabic lexicon evidence for the Form IV imperfect of و ت ر.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:imperfect", "derivation:causative"],
        baseDistinct: true,
        lexicalKey: "يوتر",
      },
      {
        form: "تَتْرَىٰ",
        meaning: "in succession",
        difference: "Lexical noun/adverb; it shows the root’s related sense of repeated occurrences arriving one after another, not the singular odd noun.",
        relationship: "A canonical Qur'anic noun of the و ت ر family, attested in 23:44.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrence 23:44:4 and the approved و ت ر root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:sequence", "meaning:successive"],
        baseDistinct: true,
        lexicalKey: "تترى",
      },
      {
        form: "أَوْتَارٌ",
        meaning: "strings or cords",
        difference: "Broken plural noun; it contrasts the singular odd/one-fold noun with an established plural meaning strings or cords.",
        relationship: "An established plural of وَتَرٌ within the و ت ر lexical family, listed in Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for وَتَرٌ and أَوْتَارٌ and the approved و ت ر root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "اوتار",
      },
    ],
    ["سري"]: [
      {
        form: "يَسْرِي",
        meaning: "he travels by night; it passes",
        difference: "Form I imperfect with the full final weak vowel; it contrasts the Qur'anic jussive يَسْرِ with the ongoing indicative form.",
        relationship: "The full imperfect counterpart of the canonical Qur'anic Form I verb يَسْرِ in the س ر ي family.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrence 89:4:3 and standard weak-final Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "mood:indicative"],
        baseDistinct: true,
        lexicalKey: "يسري",
      },
      {
        form: "أَسْرَىٰ",
        meaning: "he took by night; he travelled by night",
        difference: "Form IV perfect; the derived pattern presents completed night travel or taking someone by night.",
        relationship: "A canonical Form IV verb of the س ر ي family, attested in 17:1 and related Qur'anic occurrences.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus س ر ي Form IV occurrences and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "اسرى",
      },
      {
        form: "أَسْرِ",
        meaning: "travel by night",
        difference: "Form IV imperative; it turns the night-travel action into a direct command.",
        relationship: "A canonical Form IV imperative of the س ر ي family, attested in 11:81, 15:65, 20:77, 26:52 and 44:23.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus imperative occurrences and standard Form IV morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "mood:imperative", "voice:active"],
        baseDistinct: true,
        lexicalKey: "اسر-imperative",
      },
      {
        form: "إِسْرَاءٌ",
        meaning: "travelling by night; a night journey",
        difference: "Verbal noun; it names the night-travel event rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of the س ر ي family connected to أَسْرَىٰ and أَسْرِ.",
        provenance: "Codex-authored after review of standard Arabic Form IV verbal-noun morphology and the approved س ر ي root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:masdar", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "اسراء",
      },
    ],
    ["جوب"]: [
      {
        form: "جَابَ",
        meaning: "he carved through",
        difference: "Form I perfect, third-person masculine singular; it gives the completed singular counterpart of جَابُوا۟.",
        relationship: "The singular Form I counterpart of the canonical Qur'anic verb جَابُوا۟ in 89:9.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrence 89:9:3 and its Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "number:singular"],
        baseDistinct: true,
        lexicalKey: "جاب-perfect",
      },
      {
        form: "يَجُوبُ",
        meaning: "he traverses or carves through",
        difference: "Form I imperfect; it presents traversing or cutting through as ongoing rather than completed.",
        relationship: "A genuine Form I imperfect of the ج و ب family, related to the carving/traversing sense of جَابَ.",
        provenance: "Codex-authored after review of Arabic lexicon evidence for جَابَ/يَجُوبُ and the canonical occurrence in 89:9.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يجوب",
      },
      {
        form: "اِسْتَجَابَ",
        meaning: "he responded",
        difference: "Form X perfect; the derived pattern shifts the root from traversing/opening through to responding to a call or request.",
        relationship: "A canonical Form X verb of the ج و ب family, attested repeatedly in the Qur'an.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ج و ب Form X occurrences and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-10", "tense:perfect", "derivation:derived"],
        baseDistinct: true,
        lexicalKey: "استجاب",
      },
      {
        form: "جَوَابٌ",
        meaning: "an answer or response",
        difference: "Noun; it names the response produced by the answering family rather than expressing an action.",
        relationship: "A canonical noun of the ج و ب family, attested in Qur'anic occurrences including 7:82 and 27:56.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus noun evidence and the approved ج و ب root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:agent-result", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "جواب",
      },
    ],
    ["صخر"]: [
      {
        form: "صَخْرٌ",
        meaning: "rock",
        difference: "Indefinite singular noun; it removes the definite article and case marking while retaining the lexical rock meaning.",
        relationship: "The singular noun underlying ٱلصَّخْرَ in the ص خ ر family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for صَخْرٌ and the canonical occurrence 89:9:4.",
        featureSignal: ["partofspeech:noun", "number:singular", "state:indefinite"],
        baseDistinct: true,
        lexicalKey: "صخر",
      },
      {
        form: "صُخُورٌ",
        meaning: "rocks",
        difference: "Broken plural noun; the internal vowel pattern marks multiple rocks rather than one definite rock.",
        relationship: "An established broken plural of صَخْرَةٌ/صَخْرٌ in the ص خ ر family.",
        provenance: "Codex-authored after review of Arabic Academy evidence listing صُخُورٌ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "صخور",
      },
      {
        form: "صَخْرَةٌ",
        meaning: "a rock",
        difference: "Feminine singular noun; the ة ending presents one individual rock as a countable unit.",
        relationship: "A genuine feminine noun of the ص خ ر lexical family, defined by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الصَّخْرَةُ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "number:singular"],
        baseDistinct: true,
        lexicalKey: "صخرة",
      },
      {
        form: "صَخْرِيٌّ",
        meaning: "rocky; made of rock",
        difference: "Relational adjective; the nisbah ending turns the rock noun into a description of material or association.",
        relationship: "A genuine relational adjective of the ص خ ر family, supported by Arabic lexicon usage.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الصخري and the approved root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:nisbah", "gender:masculine"],
        baseDistinct: true,
        lexicalKey: "صخري",
      },
    ],
    ["ودي"]: [
      {
        form: "وَادٍ",
        meaning: "a valley",
        difference: "Indefinite singular noun; it gives the unprefixed base form of the Qur'anic valley expression.",
        relationship: "The singular noun underlying بِٱلْوَادِ in the و د ي family.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrences of وَادٍ and Arabic Academy evidence for الوادي.",
        featureSignal: ["partofspeech:noun", "number:singular", "state:indefinite"],
        baseDistinct: true,
        lexicalKey: "واد",
      },
      {
        form: "أَوْدِيَةٌ",
        meaning: "valleys",
        difference: "Broken plural noun; it contrasts the singular valley with the established plural form.",
        relationship: "A canonical Qur'anic plural of the و د ي family, attested in 13:17 and 46:24.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrences 13:17 and 46:24 and Arabic Academy evidence.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "اودية",
      },
      {
        form: "وُدْيَانٌ",
        meaning: "valleys",
        difference: "An alternate plural pattern; it gives the learner a genuine second plural shape for the valley noun.",
        relationship: "An established alternate plural of الوادي, listed in Arabic Academy evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence listing وُدْيَانٌ and the approved و د ي root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:alternate-plural"],
        baseDistinct: true,
        lexicalKey: "وديان",
      },
      {
        form: "وَادِيٌّ",
        meaning: "valley-related; valley",
        difference: "Relational adjective; the nisbah ending marks association with a valley rather than naming the valley itself.",
        relationship: "A genuine relational derivative of الوادي within the و د ي lexical family.",
        provenance: "Codex-authored after review of Arabic relational morphology and Arabic Academy evidence for الوادي derivatives.",
        featureSignal: ["partofspeech:adjective", "derivation:nisbah", "meaning:relation"],
        baseDistinct: true,
        lexicalKey: "واديّ",
      },
    ],
    ["وتد"]: [
      {
        form: "وَتَدٌ",
        meaning: "a peg or stake",
        difference: "Indefinite singular noun; it contrasts the current definite broken plural أَوْتَادِ with one peg.",
        relationship: "The singular noun underlying أَوْتَادٌ in the و ت د family.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrence 89:10:3 and Arabic Academy evidence for الوَتَدُ.",
        featureSignal: ["partofspeech:noun", "number:singular", "state:indefinite"],
        baseDistinct: true,
        lexicalKey: "وتد",
      },
      {
        form: "وَتِدٌ",
        meaning: "a peg or stake",
        difference: "Established vowel variant of the singular noun; it teaches a real lexical-vocalic variant rather than a case ending.",
        relationship: "An established variant noun of the و ت د family, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence listing الوَتِدُ alongside الوَتَدُ.",
        featureSignal: ["partofspeech:noun", "number:singular", "variant:vocalic"],
        baseDistinct: true,
        lexicalKey: "وتد-vowel",
      },
      {
        form: "وَتَدَ",
        meaning: "he pegged or fixed",
        difference: "Form I perfect verb; it turns the peg noun into the completed action of fixing something firmly.",
        relationship: "A genuine Form I verb of the و ت د family, documented by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for وَتَدَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "وتد-verb",
      },
      {
        form: "أَوْتَدَ",
        meaning: "he set up pegs; he fastened",
        difference: "Form IV derived verb; the added pattern presents actively fixing or setting up pegs as a causative action.",
        relationship: "A genuine Form IV verb of the و ت د family, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for أَوْتَدَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "derivation:causative"],
        baseDistinct: true,
        lexicalKey: "اوتد",
      },
      {
        form: "وَتَّدَ",
        meaning: "he secured; he strengthened with pegs",
        difference: "Form II perfect; the doubled middle radical presents intensive or causative securing, distinct from basic وَتَدَ and Form IV أَوْتَدَ.",
        relationship: "A genuine Form II verb of the و ت د family, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for وَتَّدَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "derivation:intensive"],
        baseDistinct: true,
        lexicalKey: "وتد-form-2",
      },
    ],
    ["فسد"]: [
      {
        form: "فَسَدَ",
        meaning: "he became corrupt; it became spoiled",
        difference: "Form I perfect; it describes corruption as a state that has occurred, contrasting with the abstract noun فساد.",
        relationship: "A canonical Form I verb of the ف س د family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ف س د Form I evidence and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "فسد-perfect",
      },
      {
        form: "يَفْسُدُ",
        meaning: "he becomes corrupt; it becomes spoiled",
        difference: "Form I imperfect; it presents corruption as ongoing rather than naming it as a noun.",
        relationship: "The imperfect counterpart of فَسَدَ within the ف س د family.",
        provenance: "Codex-authored after review of standard Form I morphology and Quranic Arabic Corpus ف س د evidence.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يفسد",
      },
      {
        form: "أَفْسَدَ",
        meaning: "he caused corruption; he spoiled",
        difference: "Form IV perfect; the derived pattern makes the subject an agent who causes corruption in something else.",
        relationship: "A canonical Form IV verb of the ف س د family, attested repeatedly in the Qur'an.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus Form IV occurrences and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "افسد",
      },
      {
        form: "مُفْسِدٌ",
        meaning: "one who causes corruption; corrupting",
        difference: "Form IV active participle; it names the agent who produces فساد rather than the corruption itself.",
        relationship: "A canonical Form IV active participle of the ف س د family, attested repeatedly in the Qur'an.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus active-participle evidence and the approved root meaning.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-4", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "مفسد",
      },
    ],
    ["صبب"]: [
      {
        form: "صَبَّ",
        meaning: "he poured",
        difference: "Form I perfect without the conjunction prefix; it isolates the completed pouring action in فَصَبَّ.",
        relationship: "The lexical Form I base of the canonical Qur'anic occurrence فَصَبَّ in 89:13.",
        provenance: "Codex-authored after review of canonical Qur'anic occurrence 89:13:1 and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "prefix:absent"],
        baseDistinct: true,
        lexicalKey: "صب-perfect",
      },
      {
        form: "يَصُبُّ",
        meaning: "he pours; it pours",
        difference: "Form I imperfect; it presents the pouring action as ongoing rather than completed.",
        relationship: "The imperfect counterpart of صَبَّ in the ص ب ب family.",
        provenance: "Codex-authored after review of Arabic lexicon evidence and standard Form I doubled-root morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يصب",
      },
      {
        form: "مَصْبُوبٌ",
        meaning: "poured; poured out",
        difference: "Passive participle; it describes what has received the pouring action rather than the one who performs it.",
        relationship: "A genuine passive participle of the ص ب ب family, documented in Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for المَصْبُوب and the approved root meaning.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-1", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مصبوب",
      },
      {
        form: "يَنْصَبُّ",
        meaning: "it flows or pours down",
        difference: "Form VII imperfect; the derived pattern presents the liquid as flowing or pouring itself downward.",
        relationship: "A genuine Form VII verb of the ص ب ب family, listed in Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for انصبّ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-7", "tense:imperfect", "voice:reflexive"],
        baseDistinct: true,
        lexicalKey: "ينصب",
      },
    ],
    ["سوط"]: [
      {
        form: "أَسْوَاطٌ",
        meaning: "whips",
        difference: "Broken plural noun; it contrasts the singular scourge with multiple whips.",
        relationship: "An established plural of سَوْطٌ, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for السوط and أَسْوَاطٌ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "اسواط",
      },
      {
        form: "سَوَّطَ",
        meaning: "he whipped; he struck with a whip",
        difference: "Form II perfect; the doubled middle radical turns the whip noun into a completed whipping action.",
        relationship: "A genuine Form II verb of the س و ط family, listed in Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for سَوَّطَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "سوط-form-2-perfect",
      },
      {
        form: "يُسَوِّطُ",
        meaning: "he whips; he strikes with a whip",
        difference: "Form II imperfect; it presents the whipping action as ongoing rather than completed.",
        relationship: "The imperfect counterpart of سَوَّطَ within the س و ط family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for سَوَّطَ and standard Form II imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يسوط-form-2",
      },
      {
        form: "مِسْوَطٌ",
        meaning: "a whip; a whipping instrument",
        difference: "Instrument noun; it names the tool associated with the scourge rather than the scourge as a bare noun.",
        relationship: "An established instrument noun of the س و ط family, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence listing المِسْوَط and the approved root meaning.",
        featureSignal: ["partofspeech:instrument-noun", "derivation:instrument", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "مسوط",
      },
    ],
    ["هون"]: [
      {
        form: "يُهِينُ",
        meaning: "he humiliates",
        difference: "Form IV imperfect active; it presents the humiliating action as ongoing rather than completed.",
        relationship: "The imperfect Form IV counterpart of أَهَانَنِ in the ه و ن family, attested in Qur'an 22:18.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ه و ن evidence and standard Form IV imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يهين",
      },
      {
        form: "مُهِينٌ",
        meaning: "humiliating",
        difference: "Form IV active participle; it describes the agent or quality that causes humiliation rather than the finite act.",
        relationship: "A canonical Form IV active participle of the ه و ن family, attested repeatedly in the Qur'an.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus active-participle evidence and the approved root meaning.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-4", "derivation:descriptor"],
        baseDistinct: true,
        lexicalKey: "مهين",
      },
      {
        form: "مُهَانٌ",
        meaning: "humiliated; treated with contempt",
        difference: "Form IV passive participle; it describes the person who receives the humiliating action, contrasting with مُهِينٌ.",
        relationship: "A canonical Form IV passive participle of the ه و ن family, attested in Qur'an 25:69.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrence 25:69:8 and the approved root meaning.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-4", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "مهان",
      },
      {
        form: "هَوْنٌ",
        meaning: "humbleness; gentleness",
        difference: "Abstract noun; it names the quality of lowliness or gentleness rather than an act of humiliating someone.",
        relationship: "A canonical noun of the ه و ن family, attested in Qur'an 25:63.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus occurrence 25:63:7 and the approved root meaning.",
        featureSignal: ["partofspeech:abstract-noun", "derivation:quality-noun", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "هون",
      },
    ],
    ["ورث"]: [
      {
        form: "وَرِثَ",
        meaning: "he inherited",
        difference: "Form I perfect; it expresses the completed act underlying the inheritance noun.",
        relationship: "The Form I verb underlying التُّرَاثَ in the و ر ث family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for وَرِثَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "ورث-perfect",
      },
      {
        form: "يَرِثُ",
        meaning: "he inherits",
        difference: "Form I imperfect; it presents inheriting as ongoing or prospective rather than completed.",
        relationship: "The imperfect counterpart of وَرِثَ within the و ر ث family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for يَرِثُ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يرث",
      },
      {
        form: "وَارِثٌ",
        meaning: "an heir; inheritor",
        difference: "Active participle; it names the person who inherits rather than the inheritance received.",
        relationship: "A genuine active participle of the و ر ث family, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الوارث and the approved root meaning.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent", "tense:not-applicable"],
        baseDistinct: true,
        lexicalKey: "وارث",
      },
      {
        form: "مَوْرُوثٌ",
        meaning: "inherited; handed down",
        difference: "Passive participle; it describes what has been received from an earlier owner or generation.",
        relationship: "A genuine passive participle of the و ر ث family, documented by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الموروث and the approved root meaning.",
        featureSignal: ["partofspeech:passive-participle", "derivation:result", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "موروث",
      },
    ],
    ["لمم"]: [
      {
        form: "لَمَّ",
        meaning: "he gathered together",
        difference: "Form I perfect; it expresses the completed act of gathering that underlies لَمًّا.",
        relationship: "A canonical Form I verb of the ل م م family, listed in Quranic Arabic Corpus and Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ل م م evidence and Arabic Academy evidence for لَمَّ.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "لم-perfect",
      },
      {
        form: "يَلُمُّ",
        meaning: "he gathers together",
        difference: "Form I imperfect; it presents the gathering action as ongoing rather than completed.",
        relationship: "The imperfect counterpart of لَمَّ within the ل م م family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for يَلُمُّ and standard doubled-root morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يلم",
      },
      {
        form: "أَلَمَّ",
        meaning: "he approached; he committed a minor fault",
        difference: "Form IV derived verb; it shows the root’s related sense of approaching or engaging in a minor fault, distinct from the gathering noun.",
        relationship: "A genuine Form IV verb of the ل م م family, documented by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for أَلَمَّ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "derivation:derived"],
        baseDistinct: true,
        lexicalKey: "الم",
      },
      {
        form: "مَلْمُومٌ",
        meaning: "gathered; assembled",
        difference: "Passive participle; it describes something that has been gathered together rather than the act of gathering.",
        relationship: "A genuine passive participle of the ل م م family, listed in Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الملموم and the approved root meaning.",
        featureSignal: ["partofspeech:passive-participle", "derivation:result", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "ملموم",
      },
    ],
    ["جمم"]: [
      {
        form: "يَجُمُّ",
        meaning: "he becomes abundant; it overflows",
        difference: "Form I imperfect; it turns the abundance adjective into an ongoing state or action.",
        relationship: "A genuine Form I imperfect of the ج م م family, supported by Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for جَمَّ and standard doubled-root imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يجم",
      },
      {
        form: "جُمُومٌ",
        meaning: "abundance; overflowing fullness",
        difference: "Abstract noun; it names abundance as a state rather than describing something as immense.",
        relationship: "An established noun of abundance in the ج م م family, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence listing جُمُومٌ for the جَمّ family.",
        featureSignal: ["partofspeech:abstract-noun", "derivation:quality-noun", "meaning:abundance"],
        baseDistinct: true,
        lexicalKey: "جموم",
      },
      {
        form: "جِمَامٌ",
        meaning: "abundance; fullness",
        difference: "Alternate established noun pattern; it gives a real lexical-vocalic contrast within the abundance family.",
        relationship: "An established noun of the ج م م family, listed by the Arabic Academy alongside جُمُومٌ.",
        provenance: "Codex-authored after review of Arabic Academy evidence for جِمَامٌ and the approved root meaning.",
        featureSignal: ["partofspeech:abstract-noun", "derivation:alternate-noun", "meaning:abundance"],
        baseDistinct: true,
        lexicalKey: "جمام",
      },
      {
        form: "جَمِيمٌ",
        meaning: "abundant; luxuriant",
        difference: "Descriptive adjective; it applies abundance to a noun rather than functioning as the adverbial current form جَمًّا.",
        relationship: "A genuine descriptive derivative of the ج م م family, listed in Arabic Academy evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence listing الجَمِيمُ and the approved root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:descriptor", "meaning:abundance"],
        baseDistinct: true,
        lexicalKey: "جميم",
      },
    ],
    ["أرض"]: [
      {
        form: "أَرَاضٍ",
        meaning: "lands; territories",
        difference: "Broken plural noun; it contrasts the singular earth with multiple lands or territories.",
        relationship: "An established plural of أَرْضٌ, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الأرض and أَرَاضٍ.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:broken-plural"],
        baseDistinct: true,
        lexicalKey: "اراض",
      },
      {
        form: "أَرَضُونَ",
        meaning: "lands; earths",
        difference: "Sound plural noun; it gives a second established plural pattern for the earth noun.",
        relationship: "An established plural of أَرْضٌ, listed by the Arabic Academy alongside أَرَاضٍ.",
        provenance: "Codex-authored after review of Arabic Academy evidence for أَرَضُونَ and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "number:plural", "derivation:sound-plural"],
        baseDistinct: true,
        lexicalKey: "ارضون",
      },
      {
        form: "أَرْضِيٌّ",
        meaning: "earthly; terrestrial",
        difference: "Relational adjective; the nisbah ending describes something associated with the earth rather than naming the earth itself.",
        relationship: "A genuine relational adjective of the أ ر ض family, documented in Arabic lexicon evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الأرضي and the approved root meaning.",
        featureSignal: ["partofspeech:adjective", "derivation:nisbah", "meaning:relation"],
        baseDistinct: true,
        lexicalKey: "ارضي",
      },
      {
        form: "أَرْضِيَّةٌ",
        meaning: "ground; terrestrial surface",
        difference: "Feminine derivative; it can name a ground or earth-related surface rather than the general earth noun.",
        relationship: "A genuine feminine derivative of the أ ر ض family, listed in Arabic Academy evidence.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الأَرْضِيّة and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "gender:feminine", "derivation:derivative"],
        baseDistinct: true,
        lexicalKey: "ارضية",
      },
    ],
    ["وثق"]: [
      {
        form: "أَوْثَقَ",
        meaning: "he bound firmly; he secured",
        difference: "Form IV perfect; it presents completed firm binding, contrasting with the current imperfect يُوثِقُ.",
        relationship: "The perfect Form IV counterpart of يُوثِقُ in the و ث ق family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for أَوْثَقَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "اوثق",
      },
      {
        form: "وَثِقَ",
        meaning: "he trusted; he had confidence",
        difference: "Form I perfect; the basic root pattern expresses completed trust, contrasting with the causative binding pattern.",
        relationship: "A genuine Form I verb of the و ث ق family, documented by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for وَثِقَ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "وثق-perfect",
      },
      {
        form: "يَثِقُ",
        meaning: "he trusts; he has confidence",
        difference: "Form I imperfect; it presents trusting as an ongoing state rather than a completed event.",
        relationship: "The imperfect counterpart of وَثِقَ in the و ث ق family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for يَثِقُ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يثق",
      },
      {
        form: "مَوْثُوقٌ",
        meaning: "trusted; securely bound",
        difference: "Passive participle; it describes something or someone that has been trusted or firmly secured.",
        relationship: "A genuine passive participle in the و ث ق family, listed by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for مَوْثُوقٌ and the approved root meaning.",
        featureSignal: ["partofspeech:passive-participle", "derivation:result", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "موثوق",
      },
    ],
    ["طمأن"]: [
      {
        form: "اِطْمَأَنَّ",
        meaning: "he became calm; he felt secure",
        difference: "Form VIII perfect; it describes completed settling or becoming at peace, from which the current participle is derived.",
        relationship: "The perfect Form VIII verb underlying ٱلْمُطْمَئِنَّةُ in the ط م أ ن family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for اطْمَأَنَّ and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-8", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "اطمان",
      },
      {
        form: "يَطْمَئِنُّ",
        meaning: "he becomes calm; he feels secure",
        difference: "Form VIII imperfect; it presents settling and reassurance as ongoing rather than completed.",
        relationship: "The imperfect counterpart of اِطْمَأَنَّ in the ط م أ ن family.",
        provenance: "Codex-authored after review of Arabic Academy evidence for يَطْمَئِنُّ and standard Form VIII imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-8", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يطمان",
      },
      {
        form: "اِطْمِئْنَانٌ",
        meaning: "peace of mind; reassurance",
        difference: "Form VIII verbal noun; it names the state or experience of becoming settled rather than expressing it as a verb.",
        relationship: "A genuine verbal noun of the ط م أ ن family, documented by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الاطمئنان and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-8", "derivation:masdar"],
        baseDistinct: true,
        lexicalKey: "اطمئنان",
      },
      {
        form: "طُمَأْنِينَةٌ",
        meaning: "tranquillity; inner calm",
        difference: "Established abstract noun; it gives the learner a second nominal expression of the settled state behind the current adjective.",
        relationship: "An established abstract noun of the ط م أ ن family, defined by the Arabic Academy.",
        provenance: "Codex-authored after review of Arabic Academy evidence for الطمأنينة and the approved root meaning.",
        featureSignal: ["partofspeech:abstract-noun", "derivation:quality-noun", "meaning:calm"],
        baseDistinct: true,
        lexicalKey: "طمأنينة",
      },
    ],
    ["جنب"]: [
      {
        form: "جَنَّبَ",
        meaning: "he kept or removed someone away",
        difference:
          "Form II perfect active; the doubled middle radical presents the completed causative action behind the current passive future.",
        relationship:
          "The active Form II counterpart of وَسَيُجَنَّبُهَا in the ج ن ب family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 92:17 and standard Form II perfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "جنب-form-2-perfect",
      },
      {
        form: "يُجَنِّبُ",
        meaning: "he keeps or removes someone away",
        difference:
          "Form II imperfect active; it presents the causative action as ongoing and contrasts with the current passive future form.",
        relationship:
          "The active Form II imperfect counterpart of the current passive verb in the ج ن ب family.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 92:17 and standard Form II imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يجنب-form-2",
      },
      {
        form: "اِجْتَنَبَ",
        meaning: "he avoided",
        difference:
          "Form VIII perfect; the derived pattern expresses deliberately keeping oneself away, contrasting with Form II causative removal.",
        relationship:
          "A canonical Form VIII verb of the ج ن ب family, attested repeatedly in Qur'anic usage.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus ج ن ب Form VIII occurrences and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-8", "tense:perfect", "voice:reflexive"],
        baseDistinct: true,
        lexicalKey: "اجتنب",
      },
      {
        form: "مُجَنَّبٌ",
        meaning: "kept or removed away",
        difference:
          "Form II passive participle; it describes the person or thing affected by the keeping-away action, clarifying the passive meaning of the current occurrence.",
        relationship:
          "The passive participle of جَنَّبَ in the ج ن ب family, directly related to the current passive Form II verb.",
        provenance:
          "Codex-authored after review of Quranic Arabic Corpus occurrence 92:17 and standard Form II passive-participle morphology.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-2", "voice:passive", "derivation:result"],
        baseDistinct: true,
        lexicalKey: "مجنب",
      },
    ],
    ["ضرع"]: [
      {
        form: "تَضَرَّعَ",
        meaning: "he pleaded humbly or supplicated",
        difference: "Form V perfect; the doubled middle radical marks the completed act of humbly pleading or supplicating.",
        relationship: "Form V perfect of the ض ر ع family, related to ضَرِيعٌ through the root's attested semantic range but not identical in lexical sense.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ض ر ع entry, the approved root meaning and standard Form V morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "تضرع",
      },
      {
        form: "يَتَضَرَّعُ",
        meaning: "he pleads humbly or supplicates",
        difference: "Form V imperfect; the imperfect prefix presents the act of humble pleading as ongoing or repeated.",
        relationship: "Form V imperfect of the ض ر ع family, showing the imperfect counterpart of تَضَرَّعَ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ض ر ع entry, the approved root meaning and standard Form V morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يتضرع",
      },
      {
        form: "تَضَرُّعٌ",
        meaning: "humble pleading or supplication",
        difference: "Form V verbal noun; it names the act of humble pleading rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of the ض ر ع family, derived from تَضَرَّعَ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ض ر ع entry, the approved root meaning and standard Form V verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-5", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تضرع",
      },
      {
        form: "مُتَضَرِّعٌ",
        meaning: "one who pleads humbly",
        difference: "Form V active participle; it describes the person engaged in humble pleading rather than the thorny plant named by the current noun.",
        relationship: "The active participle of تَضَرَّعَ in the ض ر ع family.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ض ر ع entry, the approved root meaning and standard Form V participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-5", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "متضرع",
      },
    ],
    ["سمن"]: [
      {
        form: "سَمِنَ",
        meaning: "he became fat",
        difference: "Form I perfect; it states the completed change of becoming fat or plump, contrasting with the current causative Form IV verb.",
        relationship: "Form I perfect of the س م ن family, the intransitive counterpart of يُسْمِنُ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus س م ن entry, the approved root meaning and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "سمن",
      },
      {
        form: "يَسْمَنُ",
        meaning: "he becomes fat",
        difference: "Form I imperfect; it presents becoming fat as an ongoing or expected change rather than causing someone else to gain weight.",
        relationship: "Form I imperfect of the س م ن family, contrasting with the current Form IV causative.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus س م ن entry, the approved root meaning and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يسمن",
      },
      {
        form: "سَمَّنَ",
        meaning: "he fattened",
        difference: "Form II perfect; the doubled middle radical marks the causative act of making someone or something fat.",
        relationship: "Form II perfect of the س م ن family, a genuine derived causative related to يُسْمِنُ.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus س م ن entry, the approved root meaning and standard Form II morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "سمن-form-2",
      },
      {
        form: "تَسْمِينٌ",
        meaning: "fattening",
        difference: "Form II verbal noun; it names the causative act of fattening rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of سَمَّنَ in the س م ن family.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus س م ن entry, the approved root meaning and standard Form II verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-2", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تسمين",
      },
    ],
    ["لغو"]: [
      {
        form: "لَغَا",
        meaning: "he spoke idly",
        difference: "Form I perfect; it presents the completed act of speaking idly or engaging in vain speech.",
        relationship: "Form I perfect of the ل غ و family, related to the current feminine active-participle noun.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ل غ و entry, the approved root meaning and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "لغا",
      },
      {
        form: "يَلْغُو",
        meaning: "he speaks idly",
        difference: "Form I imperfect; it presents idle speech as ongoing or habitual.",
        relationship: "Form I imperfect of the ل غ و family, the imperfect counterpart of لَغَا.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ل غ و entry, the approved root meaning and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يلغو",
      },
      {
        form: "أَلْغَى",
        meaning: "he nullified or disregarded",
        difference: "Form IV perfect; the derived pattern expresses making something void or disregarding it, a distinct causative development of the root.",
        relationship: "Form IV perfect of the ل غ و family, attested in Arabic lexical usage.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ل غ و entry, the approved root meaning and standard Form IV morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-4", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "ألغى",
      },
      {
        form: "لَاغٍ",
        meaning: "one speaking idly",
        difference: "Form I active participle; it describes a person characterized by idle speech rather than expressing the action as a finite verb.",
        relationship: "The active participle of لَغَا in the ل غ و family.",
        provenance: "Codex-authored after review of the Quranic Arabic Corpus ل غ و entry, the approved root meaning and standard Form I participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-1", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "لاغ",
      },
    ],
    ["صفف"]: [
      {
        form: "صَفَّ",
        meaning: "he lined up or arranged in a row",
        difference: "Form I perfect; it presents the completed act of lining up or arranging something in a row.",
        relationship: "Form I perfect of the ص ف ف family, related to the current passive participle.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ص ف ف evidence and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "صف",
      },
      {
        form: "يَصُفُّ",
        meaning: "he lines up or arranges in a row",
        difference: "Form I imperfect; it presents the lining-up action as ongoing or repeated.",
        relationship: "Form I imperfect of the ص ف ف family, the imperfect counterpart of صَفَّ.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ص ف ف evidence and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يصف",
      },
      {
        form: "صَفٌّ",
        meaning: "a row or lining-up",
        difference: "Form I verbal noun/lexical noun; it names the row or act of lining up rather than describing the object as already arranged.",
        relationship: "A genuine noun of the ص ف ف family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ص ف ف evidence and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "صف",
      },
      {
        form: "صَافٌّ",
        meaning: "lining up or spreading in a row",
        difference: "Form I active participle; it describes one who is lining up or spreading in a row rather than something already arranged.",
        relationship: "The active participle of صَفَّ in the ص ف ف family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus ص ف ف evidence and the approved root meaning.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-1", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "صاف",
      },
    ],
    ["بثث"]: [
      {
        form: "بَثَّ",
        meaning: "he spread or scattered",
        difference: "Form I perfect; it presents the completed act of spreading or scattering.",
        relationship: "Form I perfect of the ب ث ث family, related to the current passive participle.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "بث",
      },
      {
        form: "يَبُثُّ",
        meaning: "he spreads or scatters",
        difference: "Form I imperfect; it presents spreading or scattering as ongoing or repeated.",
        relationship: "Form I imperfect of the ب ث ث family, the imperfect counterpart of بَثَّ.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يبث",
      },
      {
        form: "بَثٌّ",
        meaning: "spreading or scattering",
        difference: "Form I verbal noun; it names the spreading action rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of بَثَّ in the ب ث ث family.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard Form I verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "بث",
      },
      {
        form: "بَاثٌّ",
        meaning: "one who spreads or disseminates",
        difference: "Form I active participle; it describes the agent who spreads something rather than the spread-out result.",
        relationship: "The active participle of بَثَّ in the ب ث ث family.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard Form I participle morphology.",
        featureSignal: ["partofspeech:active-participle", "derivation:agent"],
        baseDistinct: true,
        lexicalKey: "باث",
      },
    ],
    ["سطح"]: [
      {
        form: "سَطَحَ",
        meaning: "he flattened or spread out",
        difference: "Form I perfect active; it presents the completed act that produces the current passive result.",
        relationship: "Form I perfect of the س ط ح family, the active counterpart of سُطِحَتْ.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic occurrence 88:20 and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "سطح",
      },
      {
        form: "يَسْطَحُ",
        meaning: "he flattens or spreads out",
        difference: "Form I imperfect active; it presents the flattening action as ongoing rather than the current completed passive result.",
        relationship: "Form I imperfect of the س ط ح family.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic occurrence 88:20 and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يسطح",
      },
      {
        form: "سَطْحٌ",
        meaning: "a surface or flattening",
        difference: "Lexical noun; it names the surface or result associated with flattening rather than expressing the passive verb.",
        relationship: "A genuine noun of the س ط ح family, related to the current passive occurrence.",
        provenance: "Codex-authored after review of the approved root meaning and standard Arabic derivational morphology.",
        featureSignal: ["partofspeech:noun", "derivation:result-noun"],
        baseDistinct: true,
        lexicalKey: "سطح",
      },
      {
        form: "مَسْطُوحٌ",
        meaning: "flattened or spread out",
        difference: "Form I passive participle; it describes the flattened result without finite-tense marking.",
        relationship: "The passive participle of سَطَحَ in the س ط ح family.",
        provenance: "Codex-authored after review of the approved root meaning and standard Form I passive-participle morphology.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-1", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "مسطوح",
      },
    ],
    ["أوب"]: [
      {
        form: "آبَ",
        meaning: "he returned",
        difference: "Form I perfect; it presents the completed act of returning, contrasting with the current verbal noun plus attached pronoun.",
        relationship: "Form I perfect of the أ و ب family, the finite counterpart of إِيَاب.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard weak-verb morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "آب",
      },
      {
        form: "يَؤُوبُ",
        meaning: "he returns",
        difference: "Form I imperfect; it presents returning as ongoing or habitual rather than naming the return as a noun.",
        relationship: "Form I imperfect of the أ و ب family.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard weak-verb morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يؤوب",
      },
      {
        form: "أَوْبٌ",
        meaning: "returning or return",
        difference: "Form I verbal noun; it names the act of returning without the attached pronoun found in the current occurrence.",
        relationship: "A genuine verbal noun of آبَ in the أ و ب family.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard Arabic verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "أوب",
      },
      {
        form: "مَآبٌ",
        meaning: "a return or destination",
        difference: "Derived noun of place/result; it names the destination or end to which one returns rather than the act itself.",
        relationship: "A genuine derived noun of the أ و ب family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of the approved root meaning, canonical Qur'anic evidence and standard Arabic derivational morphology.",
        featureSignal: ["partofspeech:noun", "derivation:place-or-result"],
        baseDistinct: true,
        lexicalKey: "مآب",
      },
    ],
    ["جهر"]: [
      {
        form: "جَهَرَ",
        meaning: "he spoke aloud or made public",
        difference: "Form I perfect; it presents the completed act of speaking aloud or making something manifest.",
        relationship: "Form I perfect of the ج ه ر family, related to the current verbal noun.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ج ه ر evidence, including the Form I verb, and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "جهر",
      },
      {
        form: "يَجْهَرُ",
        meaning: "he speaks aloud or makes public",
        difference: "Form I imperfect; it presents speaking aloud or making public as ongoing or habitual.",
        relationship: "Form I imperfect of the ج ه ر family, the imperfect counterpart of جَهَرَ.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ج ه ر evidence and standard Form I imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يجهر",
      },
      {
        form: "جِهَارٌ",
        meaning: "speaking aloud or publicly",
        difference: "Form I verbal noun; it names the act of speaking aloud rather than expressing it as a finite verb.",
        relationship: "A genuine verbal noun of جَهَرَ in the ج ه ر family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ج ه ر evidence, including جِهَارًا, and the approved root meaning.",
        featureSignal: ["partofspeech:verbal-noun", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "جهار",
      },
      {
        form: "جَهْرَةٌ",
        meaning: "openly or manifestly",
        difference: "Derived noun/adverbial expression; it shows a separate nominal pattern for something appearing openly or manifestly.",
        relationship: "A genuine noun of the ج ه ر family, attested in Qur'anic usage as جَهْرَةً.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ج ه ر evidence, including جَهْرَةً, and the approved root meaning.",
        featureSignal: ["partofspeech:noun", "derivation:quality-noun", "meaning:manifestly"],
        baseDistinct: true,
        lexicalKey: "جهرة",
      },
    ],
    ["صلب"]: [
      {
        form: "صَلَبَ",
        meaning: "he crucified",
        difference: "Form I perfect; it presents the completed act of crucifying, contrasting with the current noun for the backbone.",
        relationship: "Form I perfect of the ص ل ب family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ص ل ب evidence and standard Form I morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "صلب",
      },
      {
        form: "يَصْلِبُ",
        meaning: "he crucifies",
        difference: "Form I imperfect; it presents crucifying as ongoing or habitual rather than naming the backbone.",
        relationship: "Form I imperfect of the ص ل ب family, the imperfect counterpart of صَلَبَ.",
        provenance: "Codex-authored after review of the approved root meaning, Quranic Arabic Corpus root ص ل ب evidence and standard Form I imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يصلب",
      },
      {
        form: "يُصَلَّبُ",
        meaning: "he is crucified",
        difference: "Form II imperfect passive; the doubled middle radical and passive voice show the person receiving the crucifying action.",
        relationship: "Form II passive of the ص ل ب family, attested in Quranic Arabic Corpus evidence.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ص ل ب evidence, including the Form II passive, and standard morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:imperfect", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "يصلب-form-2-passive",
      },
      {
        form: "مَصْلُوبٌ",
        meaning: "crucified",
        difference: "Form I passive participle; it describes the person affected by crucifying without finite-tense marking.",
        relationship: "The passive participle of صَلَبَ in the ص ل ب family.",
        provenance: "Codex-authored after review of the approved root meaning and standard Form I passive-participle morphology.",
        featureSignal: ["partofspeech:passive-participle", "pattern:form-1", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "مصلوب",
      },
    ],
    ["صدع"]: [
      {
        form: "ٱصْدَعْ",
        meaning: "proclaim",
        difference: "Form I imperative; it gives a direct command to proclaim, contrasting with the current noun for a crack or split.",
        relationship: "Form I imperative of the ص د ع family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ص د ع evidence and the canonical imperative ٱصْدَعْ.",
        featureSignal: ["partofspeech:imperative-verb", "pattern:form-1", "mood:imperative"],
        baseDistinct: true,
        lexicalKey: "اصدع",
      },
      {
        form: "يُصَدَّعُ",
        meaning: "he gets a headache",
        difference: "Form II imperfect passive; it expresses receiving the headache-causing action rather than the noun crack/opening.",
        relationship: "Form II passive of the ص د ع family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ص د ع evidence, including يُصَدَّعُونَ, and standard Form II passive morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:imperfect", "voice:passive"],
        baseDistinct: true,
        lexicalKey: "يصدع-form-2-passive",
      },
      {
        form: "يَصَّدَّعُ",
        meaning: "he divides or breaks apart",
        difference: "Form V imperfect; the derived pattern presents dividing or breaking apart as an unfolding action.",
        relationship: "Form V imperfect of the ص د ع family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ص د ع evidence, including يَصَّدَّعُونَ, and standard Form V morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-5", "tense:imperfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "يصدع-form-5",
      },
      {
        form: "مُتَصَدِّعٌ",
        meaning: "breaking asunder",
        difference: "Form V active participle; it describes something undergoing division or cracking rather than naming the crack as a noun.",
        relationship: "Form V active participle of the ص د ع family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ص د ع evidence, including مُتَصَدِّعًا, and standard Form V participle morphology.",
        featureSignal: ["partofspeech:active-participle", "pattern:form-5", "derivation:agent-or-state"],
        baseDistinct: true,
        lexicalKey: "متصدع",
      },
    ],
    ["فصل"]: [
      {
        form: "فَصَلَ",
        meaning: "he set out, departed or judged",
        difference: "Form I perfect; it presents a completed separating, departing or judging action rather than the current decisive noun.",
        relationship: "Form I perfect of the ف ص ل family, attested in Quranic Arabic Corpus evidence.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ف ص ل evidence and the approved root meaning.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:perfect", "voice:active"],
        baseDistinct: true,
        lexicalKey: "فصل",
      },
      {
        form: "يَفْصِلُ",
        meaning: "he judges or separates",
        difference: "Form I imperfect; it presents judging or separating as ongoing or future.",
        relationship: "Form I imperfect of the ف ص ل family, attested repeatedly in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ف ص ل evidence, including يَفْصِلُ, and standard Form I imperfect morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-1", "tense:imperfect", "person:third-person"],
        baseDistinct: true,
        lexicalKey: "يفصل",
      },
      {
        form: "فَصَّلَ",
        meaning: "he explained in detail",
        difference: "Form II perfect; the doubled middle radical marks the derived action of detailing or explaining fully.",
        relationship: "Form II perfect of the ف ص ل family, attested repeatedly in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ف ص ل evidence, including فَصَّلَ, and standard Form II morphology.",
        featureSignal: ["partofspeech:verb", "pattern:form-2", "tense:perfect", "voice:causative"],
        baseDistinct: true,
        lexicalKey: "فصل-form-2",
      },
      {
        form: "تَفْصِيلٌ",
        meaning: "detailed explanation",
        difference: "Form II verbal noun; it names the act or result of explaining in detail rather than expressing it as a finite verb.",
        relationship: "A genuine Form II verbal noun of the ف ص ل family, attested in Qur'anic usage.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ف ص ل evidence, including تَفْصِيلًا, and standard Form II verbal-noun morphology.",
        featureSignal: ["partofspeech:verbal-noun", "pattern:form-2", "derivation:action-noun"],
        baseDistinct: true,
        lexicalKey: "تفصيل",
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
  // Remove only terminal case markers. Do not strip every diacritic: forms
  // such as حَضَّ (perfect verb) and حَضٌّ (verbal noun) share an unvocalised
  // skeleton but are different Ṣarf rows. Simple terminal fatha/damma/kasra
  // and their tanwin forms are inflectional here; shaddah, sukun and lexical
  // vowels elsewhere in the form remain significant.
  return normalized(value)
    .replace(/[\u06D6-\u06ED]/gu, "")
    .replace(/[\u064B-\u0650]$/u, "");
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

function isKnownWrongRootForm(root: string, form: string) {
  return KNOWN_WRONG_ROOT_FORMS[root]?.has(base(form)) ?? false;
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
  if (isKnownWrongRootForm(root, row.form)) return undefined;
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
    if (REVIEWED_RESTRICTED_LEXICAL_ROOTS.has(root))
      return `${word} is a reviewed restricted lexical item in the ${root} family. Canonical and approved lexical evidence support this lexeme, but do not provide four additional learner-useful lexical Ṣarf contrasts; case-only, annotation-only or fabricated variants would be padding. The family retains ${forms.length} genuine reviewed form${forms.length === 1 ? "" : "s"}.`;
    return `${word} is a rootless ${category} rather than a lexical root family. The reviewed alternatives are grammatical or attached variants, not additional lexical Ṣarf forms; adding lexical rows would mislead the learner. The family retains ${forms.length} genuine reviewed form${forms.length === 1 ? "" : "s"}.`;
  }
  return `${word} is a rootful ${category} with root ${occurrence.lesson.root}. The audit found ${candidateCount} safe related form${candidateCount === 1 ? "" : "s"}, but did not establish four additional high-value contrasts from canonical evidence, approved project meanings and aligned morphology without an unverified claim. The family is blocked for genuine linguistic ambiguity rather than accepted as limited; further lexicon-led authoring is required.`;
}

const REVIEWED_RESTRICTED_LEXICAL_ROOTS = new Set(["أبد", "تين", "كوب", "نمرق", "زرب", "صيطر", "غثو", "حوي", "ثقب", "دفق", "هزل"]);

function reviewedRestrictedCandidates(root: string): Candidate[] {
  const families: Record<string, Array<Omit<Candidate, "score" | "sourceKind">>> = {
    ["كوب"]: [
      {
        form: "كَوْبٌ",
        meaning: "a cup or goblet",
        difference: "Singular lexical noun; it contrasts with the current broken plural أَكْوَابٌ while preserving the same drinking-vessel meaning.",
        relationship: "Established singular of أَكْوَابٌ in the ك و ب lexical family.",
        provenance: "Codex-authored after review of the approved root meaning and canonical Qur'anic evidence for ك و ب; no unrelated lexical form was added.",
        featureSignal: ["partofspeech:noun", "number:singular", "derivation:singular-of-broken-plural"],
        baseDistinct: true,
        lexicalKey: "كوب",
      },
      {
        form: "كَوْبَانِ",
        meaning: "two cups or goblets",
        difference: "Dual lexical inflection; it gives a genuine number contrast between the current broken plural and the dual form without treating case endings as new morphology.",
        relationship: "Genuine dual of كَوْبٌ in the restricted ك و ب lexical family.",
        provenance: "Codex-authored after review of the approved root meaning and standard Arabic dual formation for ك و ب.",
        featureSignal: ["partofspeech:noun", "number:dual"],
        baseDistinct: true,
        lexicalKey: "كوبان",
      },
    ],
    ["نمرق"]: [
      {
        form: "نُمْرُقَةٌ",
        meaning: "a cushion or pillow",
        difference: "Singular lexical noun; it contrasts with the current broken plural نَمَارِقُ and makes the number relationship visible.",
        relationship: "Established singular of نَمَارِقُ in the restricted ن م ر ق lexical family.",
        provenance: "Codex-authored after review of the approved root meaning and canonical Qur'anic evidence for نَمَارِقُ.",
        featureSignal: ["partofspeech:noun", "number:singular", "derivation:singular-of-broken-plural"],
        baseDistinct: true,
        lexicalKey: "نمرقة",
      },
    ],
    ["زرب"]: [
      {
        form: "زَرْبِيَّةٌ",
        meaning: "a carpet or rug",
        difference: "Singular lexical noun; it contrasts with the current plural زَرَابِيُّ while keeping the same carpet/rug sense.",
        relationship: "Established singular related to زَرَابِيُّ in the restricted ز ر ب lexical family.",
        provenance: "Codex-authored after review of the approved root meaning and standard Arabic lexical morphology for ز ر ب.",
        featureSignal: ["partofspeech:noun", "number:singular", "derivation:singular-of-plural"],
        baseDistinct: true,
        lexicalKey: "زربية",
      },
    ],
    ["حوي"]: [
      {
        form: "حَوَايَا",
        meaning: "entrails",
        difference: "Established plural/collective noun; it contrasts with the current adjective أَحْوَىٰ and shows the other attested Qur'anic form of the restricted family.",
        relationship: "A genuine Qur'anic noun of the ح و ي family, attested at 6:146:19.",
        provenance: "Codex-authored after review of Quranic Arabic Corpus root ح و ي evidence, which records only أَحْوَىٰ and حَوَايَا in the Qur'an.",
        featureSignal: ["partofspeech:noun", "derivation:plural-or-collective", "meaning:entrails"],
        baseDistinct: true,
        lexicalKey: "حوايا",
      },
    ],
  };
  return (families[root] ?? []).map((candidate) => ({
    ...candidate,
    score: 92,
    sourceKind: "codex-authored-lexicon",
    sourceOccurrence: `restricted-root-family:${root}`,
  }));
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
    if (REVIEWED_RESTRICTED_LEXICAL_ROOTS.has(root) && root !== "صيطر") continue;
    if (normalized(row.form) === normalized(rebuiltCurrent.form)) continue;
    if (inflectionalKey(row.form) === inflectionalKey(rebuiltCurrent.form)) continue;
    if (isKnownWrongRootForm(root, row.form)) continue;
    if (seen.has(normalized(row.form))) continue;
    seen.add(normalized(row.form));
    existingForms.push({
      ...row,
      relationship: row.relationship ?? `Reviewed relationship to the ${root || "grammatical"} family.`,
      provenance: row.provenance ?? "Existing project-authored row retained after independent Codex review.",
    });
  }

  const candidatePool: Candidate[] = [];
  if (root && !REVIEWED_RESTRICTED_LEXICAL_ROOTS.has(root)) {
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
  } else if (root && REVIEWED_RESTRICTED_LEXICAL_ROOTS.has(root)) {
    candidatePool.push(...reviewedRestrictedCandidates(root).filter((candidate) => safeForm(candidate, root)));
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
  } else if (!root || category === "proper noun" || REVIEWED_RESTRICTED_LEXICAL_ROOTS.has(root)) {
    decision = "confirmed-limited";
    const restrictedForms = candidatePool.map((candidate) => ({
      form: candidate.form,
      meaning: candidate.meaning,
      difference: candidate.difference,
      relationship: candidate.relationship ?? `Related to the ${root} root/lexeme.`,
      provenance: candidate.provenance ?? "Codex-reviewed restricted-family evidence.",
    }));
    afterForms = [rebuiltCurrent, ...existingForms, ...restrictedForms]
      .filter((row, index, rows) => rows.findIndex((item) => inflectionalKey(item.form) === inflectionalKey(row.form)) === index)
      .slice(0, 4);
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
    const reasonKey = !root
      ? `rootless:${category}`
      : category === "proper noun"
        ? "proper-noun-restricted"
        : "restricted-lexical-family";
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
