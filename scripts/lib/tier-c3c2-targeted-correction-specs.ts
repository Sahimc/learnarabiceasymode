import type { C3C2Candidate, C3C2Decision } from "./tier-c3c2-specs";

export type C3C2TargetedCorrection = {
  hamzaPosition?:
    | "first radical"
    | "second radical"
    | "third radical"
    | "not a radical / lexicalised";
  decision?: C3C2Decision;
  candidates?: C3C2Candidate[];
  reason?: string;
  rejectedCandidates?: string[];
  rootNormalization?: string;
};

const evidence = (root: string) =>
  `Targeted C3-C2 correction evidence for ${root}: canonical Qur’anic occurrence(s), the project-reviewed root data, aligned Qur’anic morphology evidence, and the authoritative lexical evidence identified in the correction brief were checked.`;

const candidate = (
  root: string,
  form: string,
  meaning: string,
  morphology: string,
  relationship: string,
  semanticDevelopment: string,
  pedagogicalValue: string,
  confidence: "high" | "medium" = "high",
): C3C2Candidate => ({
  form,
  meaning,
  morphology,
  relationship,
  semanticDevelopment,
  evidence: evidence(root),
  confidence,
  pedagogicalValue,
  accepted: true,
});

const rejected = (form: string, reason: string): C3C2Candidate => ({
  form,
  meaning: "Not accepted",
  morphology: "Candidate",
  relationship: "Candidate considered during targeted re-adjudication.",
  semanticDevelopment: "Not accepted into the learner-facing family.",
  evidence: "Targeted correction evidence was reviewed.",
  confidence: "high",
  pedagogicalValue:
    "Rejected under the no-padding and evidence-first safeguards.",
  accepted: false,
  rejectionReason: reason,
});

export const C3C2_TARGETED_CORRECTIONS: Record<string, C3C2TargetedCorrection> =
  {
    "lexical|هيأ|هية|noun/pronoun": {
      hamzaPosition: "third radical",
    },

    "lexical|ألل|الا|noun/pronoun": {
      hamzaPosition: "first radical",
      decision: "FULL",
      candidates: [
        candidate(
          "ألل",
          "أَلَّ",
          "he sped / attacked / raised his voice in pain",
          "Form I doubled verb",
          "A real doubled Form-I verb from the same root.",
          "The Qur’anic إلٌّ concerns covenant, kinship, good origin or hostility; this verb belongs to a different, lexically attested branch and is translated independently.",
          "Shows that one root can develop into distinct verbal and nominal branches without flattening their meanings.",
        ),
        candidate(
          "ألل",
          "أَلِلَ",
          "it became foul-smelling / the teeth became decayed",
          "Form I stative verb",
          "An attested Form-I state-change verb from the same root.",
          "This is a separate lexical branch from covenant or kinship and is not presented as synonymous with إِلًّا.",
          "Demonstrates honest semantic development across a doubled root.",
        ),
        candidate(
          "ألل",
          "أَلَّلَ",
          "he sharpened or defined its edge",
          "Form II perfect",
          "Derived Form-II verb listed under the same root.",
          "The meaning develops into defining an edge; the gloss is kept separate from the Qur’anic noun.",
          "Provides a clear derived-pattern contrast.",
        ),
        candidate(
          "ألل",
          "أَلَلٌ",
          "the edge of a knife / a broad blade",
          "Lexical noun",
          "A related root noun in the edge/blade branch.",
          "It is not a synonym for covenant or kinship; it is displayed as a separate lexical branch.",
          "Connects the Form-II edge verb to an established noun.",
        ),
        rejected(
          "ائْتَلَّ / تَأَلَّلَ",
          "The forms are listed in the root entry, but their exact learner-facing meanings and pattern relationship were not needed after four stronger, individually glossed forms were established.",
        ),
      ],
      reason:
        "The earlier LIMITED decision was too restrictive because it rejected same-root branches merely because their English meanings differed. The Academy root entry explicitly groups إلٌّ with أَلَّ, أَلِلَ, أَلَّلَ and أَلَلٌ. Each selected row is translated according to its own meaning; none is presented as meaning covenant or kinship.",
      rejectedCandidates: [
        "Forms from لَأَمَ, لَؤُمَ or الله remain rejected as wrong or unsafe root branches.",
        "Hamza-seat and doubled-letter surface variants are not separate rows.",
      ],
    },

    "lexical|أمو|امائ|noun/pronoun": {
      hamzaPosition: "first radical",
      decision: "FULL",
      candidates: [
        candidate(
          "أمو",
          "أَمَةٌ",
          "a female slave / handmaid",
          "Singular noun",
          "Singular lexical counterpart of the Qur’anic plural إِمَاءٌ.",
          "The current form is plural; this row establishes the lexical singular without treating a case ending as morphology.",
          "Directly improves recognition of the Qur’anic plural.",
        ),
        candidate(
          "أمو",
          "أَمَا",
          "he became a female slave / handmaid",
          "Form I perfect",
          "Basic verb listed under the same root.",
          "The noun develops into a verb describing becoming an أَمَةٌ.",
          "Adds a genuine verbal relationship rather than another plural or shell form.",
        ),
        candidate(
          "أمو",
          "أَمَّى",
          "he made a woman a female slave / handmaid",
          "Form II perfect",
          "Derived causative/intensive verb from the same lexical field.",
          "The meaning shifts from becoming an أَمَةٌ to causing that status.",
          "Shows a useful derived pattern and valency contrast.",
        ),
        candidate(
          "أمو",
          "اسْتَأْمَى",
          "he took or sought a female slave / handmaid",
          "Form X perfect",
          "Derived Form-X verb in the same root family.",
          "The meaning develops into seeking or taking an أَمَةٌ.",
          "Provides a stronger morphological contrast than repeating dialectal Form-I variants.",
        ),
        rejected(
          "أَمِيَ / أَمُوَ",
          "These are additional Form-I variants listed in the evidence, but they were not selected together as padding because the stronger Form-II and Form-X contrasts are more useful for the learner.",
        ),
        rejected(
          "وَإِمَاءُ / إِمَائِكُمْ",
          "Removing و or the possessive suffix changes the shell, not the lexical family.",
        ),
        rejected(
          "أُمَوِيٌّ",
          "Nisbah to Umayya; it is not the female-slave lexical branch.",
        ),
      ],
      reason:
        "The previous two-row family was too restrictive. The evidence establishes a singular noun, a basic verb, a Form-II derived verb and a Form-X derived verb. Together they provide five distinct, honest rows including the current plural occurrence.",
    },

    "lexical|أسن|اسن|noun/pronoun": {
      hamzaPosition: "first radical",
      decision: "FULL",
      candidates: [
        candidate(
          "أسن",
          "أَسِنَ",
          "it became stale / altered in smell",
          "Form I perfect",
          "Basic state-change verb behind the stale-water adjective.",
          "The current form describes water; this verb describes its becoming stale.",
          "Provides the core verbal relationship.",
        ),
        candidate(
          "أسن",
          "أُسُونٌ",
          "staleness / alteration",
          "Verbal noun",
          "Abstract noun for the stale or altered state.",
          "Names the condition rather than the affected water.",
          "Adds a clear noun-to-maṣdar contrast.",
        ),
        candidate(
          "أسن",
          "آسَنَ",
          "he caused something to become stale / foul-smelling",
          "Form IV perfect",
          "Causative branch of the stale/altered meaning.",
          "Moves from becoming stale to causing staleness.",
          "Adds a genuine derived-pattern and valency contrast.",
        ),
        candidate(
          "أسن",
          "تَأَسَّنَ",
          "it became stale / changed",
          "Form V perfect",
          "Derived inchoative/reflexive form in the same root family.",
          "Keeps the change-of-state meaning while showing a distinct derived pattern.",
          "Improves recognition without duplicating the Form-I variant.",
        ),
        rejected(
          "أَسَنَ / آسَنَتْ",
          "The listed variant and inflected feminine form were not added as separate rows because they would duplicate the selected state-change/causative contrasts.",
        ),
        rejected(
          "Case and Qur’anic spelling variants",
          "Orthographic or inflectional variation is not an additional Ṣarf row.",
        ),
      ],
      reason:
        "The previous LIMITED result stopped at the adjective, Form-I verb, imperfect and maṣdar. The authoritative evidence also supports causative and derived state-change forms, giving five useful rows without treating near-identical Form-I variants as separate teaching members.",
    },

    "lexical|بأر|بئر|noun/pronoun": {
      hamzaPosition: "second radical",
      decision: "FULL",
      candidates: [
        candidate(
          "بأر",
          "بَأَرَ",
          "he dug a well",
          "Form I perfect",
          "Basic verb related to the well noun.",
          "The noun is the excavated well; the verb names making it.",
          "Strong noun-to-verb bridge.",
        ),
        candidate(
          "بأر",
          "أَبْأَرَ",
          "he made or provided a well",
          "Form IV perfect",
          "Causative/derived well-related verb.",
          "Develops digging a well into causing or providing one.",
          "Adds a distinct derived pattern instead of plural padding.",
        ),
        candidate(
          "بأر",
          "ابْتَأَرَ",
          "he dug out or undertook the digging of a well",
          "Form VIII perfect",
          "Derived Form-VIII verb in the same well-making branch.",
          "Shows a further derived action related to the well noun.",
          "Provides genuine morphology beyond the basic verb.",
        ),
        candidate(
          "بأر",
          "بُؤْرَةٌ",
          "a hollow, central point or focal spot",
          "Lexical noun",
          "Established lexical derivative in the same root family.",
          "The meaning develops from a well or dug-out place to a hollow or focal point; it is translated honestly.",
          "Demonstrates same-root semantic development without using a case or plural variant.",
        ),
        rejected(
          "آبَارٌ",
          "The broken plural is genuine, but it was not selected because the four chosen comparison rows provide greater morphological variety than singular/plural padding.",
        ),
        rejected(
          "البَآّرُ",
          "The well-digger noun remains recorded as evidence, but it was not selected after the stronger Form-I, IV, VIII and lexical-noun contrasts were chosen.",
        ),
        rejected(
          "بِئْرٌ",
          "The uninflected form differs from بِئْرٍ only by case and is not a separate row.",
        ),
      ],
      reason:
        "The previous family stopped at the noun, basic verb, imperfect and plural. The correction replaces plural/case emphasis with Form-IV, Form-VIII and lexical-noun contrasts, producing a stronger five-row family.",
    },

    "lexical|وأل|موئل|noun/pronoun": {
      hamzaPosition: "second radical",
      decision: "FULL",
      candidates: [
        candidate(
          "وأل",
          "وَأَلَ",
          "he sought refuge / escaped",
          "Form I perfect",
          "Basic verb behind مَوْئِلٌ, a place of refuge.",
          "The noun names the refuge; the verb names seeking it.",
          "Secure noun-to-verb bridge.",
        ),
        candidate(
          "وأل",
          "يَئِلُ",
          "he seeks refuge / escapes",
          "Form I imperfect",
          "Imperfect counterpart of وَأَلَ.",
          "Keeps the refuge/escape meaning while showing the imperfect pattern.",
          "Useful aspect contrast.",
        ),
        candidate(
          "وأل",
          "وَأْلٌ",
          "refuge / escape",
          "Lexical noun / maṣdar",
          "Noun related to the act and place of refuge.",
          "Provides the abstract/lexical counterpart of مَوْئِلًا.",
          "Makes the noun family visible without changing case only.",
        ),
        candidate(
          "وأل",
          "وَاءَلَ",
          "he sought refuge with / fled to",
          "Form III perfect",
          "Derived reciprocal/relational verb in the refuge branch.",
          "Develops simple escape into seeking refuge with another or fleeing to a place.",
          "Adds genuinely distinct derived morphology.",
        ),
        rejected(
          "مُوَاءَلَةٌ",
          "The maṣdar is genuine, but وَاءَلَ gives the learner the more transparent derived verb; both were not needed to fill the family.",
        ),
        rejected(
          "وُءُولٌ / وَئِيلٌ",
          "These were considered as additional lexical evidence but not selected after the stronger verb, imperfect, maṣdar and derived-verb contrast were established.",
        ),
        rejected(
          "مَوْئِلٌ",
          "The uninflected form differs from مَوْئِلًا only by case and is not a separate row.",
        ),
      ],
      reason:
        "The Academy evidence establishes the basic verb, imperfect, maṣdar/lexical noun and a derived Form-III verb. The previous two-row limited result was therefore too restrictive.",
    },
  };

export const C3C2_TARGETED_KEYS = Object.keys(C3C2_TARGETED_CORRECTIONS);
