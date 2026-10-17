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
      return `${word} is a reviewed restricted lexical item in the ${root} family. Canonical and lexicon evidence support the time-adverb lexeme, but do not provide four additional learner-useful lexical Ṣarf contrasts; case-only or annotation-only variants would be padding. The family retains ${forms.length} genuine reviewed form${forms.length === 1 ? "" : "s"}.`;
    return `${word} is a rootless ${category} rather than a lexical root family. The reviewed alternatives are grammatical or attached variants, not additional lexical Ṣarf forms; adding lexical rows would mislead the learner. The family retains ${forms.length} genuine reviewed form${forms.length === 1 ? "" : "s"}.`;
  }
  return `${word} is a rootful ${category} with root ${occurrence.lesson.root}. The audit found ${candidateCount} safe related form${candidateCount === 1 ? "" : "s"}, but did not establish four additional high-value contrasts from canonical evidence, approved project meanings and aligned morphology without an unverified claim. The family is blocked for genuine linguistic ambiguity rather than accepted as limited; further lexicon-led authoring is required.`;
}

const REVIEWED_RESTRICTED_LEXICAL_ROOTS = new Set(["أبد"]);

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
  } else if (!root || category === "proper noun" || REVIEWED_RESTRICTED_LEXICAL_ROOTS.has(root)) {
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
