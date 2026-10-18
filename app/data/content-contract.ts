import { z } from "zod";

const MorphologyFeatureSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
});

const MorphologySurfacePartKindSchema = z.enum([
  "whole",
  "prefix",
  "stem",
  "suffix",
  "article",
  "preposition",
  "subject-marker",
  "object-pronoun",
  "possessive-pronoun",
  "ending",
  "connector",
  "other",
]);

const MorphologySurfacePartSchema = z.object({
  sourceText: z.string().min(1),
  displayText: z.string().min(1),
  label: z.string().min(1),
  meaning: z.string().min(1),
  kind: MorphologySurfacePartKindSchema,
});

const MorphologyFormationPartSchema = z.object({
  displayText: z.string().min(1),
  label: z.string().min(1),
  meaning: z.string().min(1),
  kind: z.enum(["lemma", "ending", "pattern", "other"]),
});

export const MorphologyAnalysisSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  recordKey: z.string().min(1),
  version: z.string().min(1),
  sourceText: z.string().min(1),
  lemma: z.string().optional(),
  root: z.string().optional(),
  pattern: z.string().optional(),
  partOfSpeech: z.string().optional(),
  features: z.array(MorphologyFeatureSchema),
  segmentation: z.array(MorphologySurfacePartSchema).optional(),
  formation: z.array(MorphologyFormationPartSchema).optional(),
});
export type ContentMorphologyAnalysis = z.infer<
  typeof MorphologyAnalysisSchema
>;

export const WordBreakdownModeSchema = z.enum(["atomic", "segmented"]);
export type WordBreakdownMode = z.infer<typeof WordBreakdownModeSchema>;

export const WordBreakdownPartKindSchema = z.enum([
  "whole",
  "prefix",
  "stem",
  "suffix",
  "article",
  "preposition",
  "connector",
  "subject-marker",
  "object-pronoun",
  "possessive-pronoun",
  "ending",
  "other",
]);
export type WordBreakdownPartKind = z.infer<typeof WordBreakdownPartKindSchema>;

export const RootStatusSchema = z.enum(["lexical", "rootless"]);
export type RootStatus = z.infer<typeof RootStatusSchema>;

const ARABIC_SCRIPT_PATTERN =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

function normalizeRootForValidation(root: string) {
  return root.replace(/\s+/gu, "").trim();
}

export function validateRootPicture(root: string, rootPicture: string) {
  const errors: string[] = [];
  const trimmedPicture = rootPicture.trim();

  if (!/[A-Za-z]/u.test(trimmedPicture))
    errors.push("rootPicture must contain an English learner-facing meaning");
  if (ARABIC_SCRIPT_PATTERN.test(trimmedPicture))
    errors.push("rootPicture must not contain Arabic root letters");

  if (root.trim()) {
    if (
      normalizeRootForValidation(root) ===
      normalizeRootForValidation(trimmedPicture)
    )
      errors.push("rootPicture must not repeat the Arabic root");
    if (/^No lexical root\b/u.test(trimmedPicture))
      errors.push("a lexical lesson cannot use a rootless rootPicture");
  } else {
    const marker = trimmedPicture.match(/^No lexical root \(([^()]+)\)/u);
    if (!marker)
      errors.push(
        "a rootless lesson rootPicture must begin with 'No lexical root (category)'",
      );
    else if (trimmedPicture.slice(marker[0].length).includes(`(${marker[1]})`))
      errors.push("rootPicture must not repeat its rootless category marker");
  }

  return errors;
}

const RootAnnotationShape = {
  rootStatus: RootStatusSchema.optional(),
  root: z.string().min(1).optional(),
  rootExplanation: z.string().min(1).optional(),
};

export const WordBreakdownPartSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().min(1),
    sourceText: z.string().min(1),
    displayText: z.string().min(1),
    label: z.string().min(1),
    meaning: z.string().min(1),
    kind: WordBreakdownPartKindSchema,
    ...RootAnnotationShape,
  })
  .superRefine((part, context) => {
    if (part.rootStatus === "lexical" && !part.root) {
      context.addIssue({
        code: "custom",
        path: ["root"],
        message: "lexical parts must record their root",
      });
    }
    if (part.rootStatus === "rootless") {
      if (part.root) {
        context.addIssue({
          code: "custom",
          path: ["root"],
          message: "rootless parts cannot also record a lexical root",
        });
      }
      if (!/^No lexical root \([^()]+\)$/u.test(part.rootExplanation ?? "")) {
        context.addIssue({
          code: "custom",
          path: ["rootExplanation"],
          message:
            "rootless parts must explain the category as 'No lexical root (category)'",
        });
      }
    }
  });
export type WordBreakdownPart = z.infer<typeof WordBreakdownPartSchema>;

export const WordBreakdownSchema = z
  .object({
    id: z.string().min(1),
    mode: WordBreakdownModeSchema,
    sourceText: z.string().min(1),
    parts: z.array(WordBreakdownPartSchema).min(1),
  })
  .superRefine((value, context) => {
    const orders = value.parts.map((part) => part.order);
    const sorted = [...orders].sort((a, b) => a - b);
    const expected = sorted.map((_, index) => index + 1);
    if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
      context.addIssue({
        code: "custom",
        path: ["parts"],
        message: "part order must be unique and contiguous from 1",
      });
    }
    if (
      new Set(value.parts.map((part) => part.id)).size !== value.parts.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["parts"],
        message: "part IDs must be unique within a breakdown",
      });
    }
    if (value.mode === "atomic" && value.parts.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "atomic breakdowns must contain exactly one part",
      });
    }
    if (value.mode === "segmented" && value.parts.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "segmented breakdowns must contain at least two parts",
      });
    }
  });
export type WordBreakdown = z.infer<typeof WordBreakdownSchema>;

export const ContentStatusSchema = z.enum([
  "source-only",
  "custom-partial",
  "custom-complete",
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const ProviderReferenceSchema = z.object({
  provider: z.string().min(1),
  recordKey: z.string().min(1),
  version: z.string().optional(),
  attribution: z.string().optional(),
});

export const SourceWordSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().min(1),
  arabic: z.string().min(1),
  transliteration: z.string().optional(),
  gloss: z.string().optional(),
  teachingId: z.string().optional(),
  occurrenceRole: z.string().optional(),
  sourceReferences: z.array(ProviderReferenceSchema).default([]),
  breakdown: WordBreakdownSchema.optional(),
  breakdownOverride: WordBreakdownSchema.optional(),
  morphology: MorphologyAnalysisSchema.optional(),
});
export type SourceWord = z.infer<typeof SourceWordSchema>;

export const LessonFormSchema = z.object({
  form: z.string().min(1),
  meaning: z.string().min(1),
  difference: z.string().min(1),
  relationship: z.string().min(1),
  provenance: z.string().min(1),
});
export type LessonForm = z.infer<typeof LessonFormSchema>;

export const SarfFamilyStatusSchema = z.enum(["full", "limited"]);
export type SarfFamilyStatus = z.infer<typeof SarfFamilyStatusSchema>;

export const SarfAuditDecisionSchema = z.enum([
  "confirmed-limited",
  "upgraded-to-full",
  "blocked-for-genuine-ambiguity",
]);
export type SarfAuditDecision = z.infer<typeof SarfAuditDecisionSchema>;

const UNREVIEWED_SARF_REVIEW_PATTERN =
  /legacy database row|re-import required|unreviewed|placeholder|pending review/iu;

export const SarfReviewSchema = z
  .object({
    status: SarfFamilyStatusSchema,
    familyScope: z.string().min(1).optional(),
    limitedReason: z.string().min(1).optional(),
    auditDecision: SarfAuditDecisionSchema.optional(),
    provenance: z.array(z.string().min(1)).min(1),
    reviewedBy: z.string().min(1),
    reviewedAt: z.string().min(1),
  })
  .superRefine((review, context) => {
    if (
      UNREVIEWED_SARF_REVIEW_PATTERN.test(
        [...review.provenance, review.reviewedBy, review.reviewedAt].join(" "),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message:
          "Ṣarf review provenance must identify an actual linguistic review, not a legacy or placeholder state",
      });
    }
    if (review.status === "limited" && !review.limitedReason) {
      context.addIssue({
        code: "custom",
        path: ["limitedReason"],
        message:
          "limited Ṣarf families must explain why five forms are not appropriate",
      });
    }
    if (
      review.status === "limited" &&
      (!review.auditDecision || review.auditDecision === "upgraded-to-full")
    ) {
      context.addIssue({
        code: "custom",
        path: ["auditDecision"],
        message:
          "every limited Ṣarf family must have a current confirmed-limited or blocked-for-genuine-ambiguity audit decision",
      });
    }
    if (
      review.status === "full" &&
      (review.auditDecision === "confirmed-limited" ||
        review.auditDecision === "blocked-for-genuine-ambiguity")
    ) {
      context.addIssue({
        code: "custom",
        path: ["auditDecision"],
        message:
          "a full Ṣarf family cannot carry a limited or blocked audit decision",
      });
    }
    if (review.status === "full" && review.limitedReason) {
      context.addIssue({
        code: "custom",
        path: ["limitedReason"],
        message: "full Ṣarf families cannot carry a limited-family reason",
      });
    }
  });
export type SarfReview = z.infer<typeof SarfReviewSchema>;

export const RootReviewSchema = z.object({
  status: z.literal("reviewed-override"),
  providerRoot: z.string().min(1),
  reviewedRoot: z.string().min(1),
  rationale: z.string().min(1),
  provenance: z.array(z.string().min(1)).min(1),
});
export type RootReview = z.infer<typeof RootReviewSchema>;

export type SarfValidationOptions = {
  status?: SarfFamilyStatus;
  currentForm?: string;
  root?: string;
};

const SARF_PLACEHOLDER_PATTERN =
  /root[- ]letter|root skeleton|dictionary form connected|lemma \/ dictionary|case or pattern used|(?:nominative|accusative|genitive) ending(?: pattern)?|related verbal ending|recognition variant|related grammatical (?:word|form)|the form used in this occurrence|^lexical stem$|^additional root|^base grammatical form$/iu;

const ARABIC_FORM_PATTERN =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

function normalizeSarfForm(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/gu, "");
}

function normalizeSarfBase(value: string) {
  return normalizeSarfForm(value).replace(
    /[\u064B-\u065F\u0670\u06D6-\u06ED]/gu,
    "",
  );
}

const ARABIC_DIACRITIC_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED]/u;

function isBareRootRadicals(form: string, root: string) {
  return (
    normalizeSarfBase(form) === normalizeSarfBase(root) &&
    !ARABIC_DIACRITIC_PATTERN.test(form)
  );
}

export function validateSarfForms(
  forms: LessonForm[],
  options: SarfValidationOptions = {},
) {
  const errors: string[] = [];
  const status = options.status ?? "full";
  if (status === "full" && forms.length !== 5)
    errors.push("a full Ṣarf family must contain exactly five reviewed forms");
  if (status === "limited" && (forms.length < 1 || forms.length >= 5))
    errors.push("a limited Ṣarf family must contain one to four genuine forms");
  if (options.currentForm && forms.length > 0) {
    if (
      normalizeSarfForm(forms[0].form) !==
      normalizeSarfForm(options.currentForm)
    )
      errors.push("the current Qur'anic form must be the first Ṣarf row");
  }
  // Preserve harakat: vocalic, case and mood changes are meaningful recognition data.
  const normalizedForms = forms.map((item) => normalizeSarfForm(item.form));
  if (new Set(normalizedForms).size !== normalizedForms.length)
    errors.push("Ṣarf form family must contain distinct forms");
  forms.forEach((item, index) => {
    if (!ARABIC_FORM_PATTERN.test(item.form))
      errors.push(`Ṣarf row ${index + 1} must contain a real Arabic form`);
    if (!item.meaning.trim())
      errors.push(`Ṣarf row ${index + 1} must contain a form-specific meaning`);
    if (!item.difference.trim())
      errors.push(
        `Ṣarf row ${index + 1} must explain a meaningful distinction`,
      );
    if (!item.relationship.trim())
      errors.push(
        `Ṣarf row ${index + 1} must record its lexeme/root relationship`,
      );
    if (!item.provenance.trim())
      errors.push(`Ṣarf row ${index + 1} must record review provenance`);
    if (
      SARF_PLACEHOLDER_PATTERN.test(
        `${item.meaning} ${item.difference} ${item.relationship}`,
      )
    )
      errors.push(
        `Ṣarf row ${index + 1} contains a synthetic or placeholder description`,
      );
    if (
      index > 0 &&
      options.root &&
      isBareRootRadicals(item.form, options.root)
    )
      errors.push(
        `Ṣarf row ${index + 1} cannot be the bare Arabic root radicals`,
      );
  });
  return errors;
}

export const LessonComponentSchema = z
  .object({
    text: z.string().min(1),
    displayText: z.string().optional(),
    label: z.string().min(1),
    meaning: z.string().min(1),
    kind: WordBreakdownPartKindSchema.optional(),
    ...RootAnnotationShape,
  })
  .superRefine((component, context) => {
    if (component.rootStatus === "lexical" && !component.root) {
      context.addIssue({
        code: "custom",
        path: ["root"],
        message: "lexical lesson components must record their root",
      });
    }
    if (component.rootStatus === "rootless") {
      if (component.root) {
        context.addIssue({
          code: "custom",
          path: ["root"],
          message: "rootless lesson components cannot record a lexical root",
        });
      }
      if (
        !/^No lexical root \([^()]+\)$/u.test(component.rootExplanation ?? "")
      ) {
        context.addIssue({
          code: "custom",
          path: ["rootExplanation"],
          message:
            "rootless lesson components must explain the category as 'No lexical root (category)'",
        });
      }
    }
  });

export const TeachingLessonSchema = z
  .object({
    id: z.string().min(1),
    meaning: z.string().min(1),
    type: z.string().min(1),
    root: z.string(),
    rootPicture: z.string().min(1),
    rootReview: RootReviewSchema.optional(),
    construction: z.string().min(1),
    components: z.array(LessonComponentSchema),
    breakdown: WordBreakdownSchema.optional(),
    grammar: z.string().min(1),
    sentenceRole: z.string().min(1),
    recognitionClue: z.string().min(1),
    forms: z.array(LessonFormSchema).min(1),
    sarfReview: SarfReviewSchema,
    takeaway: z.string().min(1),
  })
  .superRefine((lesson, context) => {
    for (const message of validateRootPicture(lesson.root, lesson.rootPicture))
      context.addIssue({
        code: "custom",
        path: ["rootPicture"],
        message,
      });
    for (const message of validateSarfForms(lesson.forms, lesson.sarfReview))
      context.addIssue({
        code: "custom",
        path: ["forms"],
        message,
      });
  });
export type TeachingLesson = z.infer<typeof TeachingLessonSchema>;

export function validateVocativeWording(
  word: SourceWord,
  lesson: TeachingLesson,
) {
  const normalizedArabic = word.arabic
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/gu, "");
  if (normalizedArabic !== "يا") return [];

  const errors: string[] = [];
  if (word.gloss !== "Oh")
    errors.push("the يَا gloss must use the approved learner wording 'Oh'");

  const teachingText = [
    word.occurrenceRole,
    lesson.meaning,
    lesson.sentenceRole,
    lesson.recognitionClue,
    lesson.takeaway,
    ...lesson.forms.map((form) => form.meaning),
    ...(word.breakdown?.parts ?? []).flatMap((part) => [
      part.label,
      part.meaning,
    ]),
    ...(word.breakdownOverride?.parts ?? []).flatMap((part) => [
      part.label,
      part.meaning,
    ]),
  ]
    .filter(Boolean)
    .join(" ");
  if (/\bO\b/u.test(teachingText))
    errors.push("the يَا teaching text must not shorten 'Oh' to 'O'");
  return errors;
}

export const AyahPackageSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().min(1),
  arabic: z.string().min(1),
  sourceRawArabic: z.string().optional(),
  translation: z.string().optional(),
  naturalMeaning: z.string().optional(),
  words: z.array(SourceWordSchema),
  teaching: z.record(z.string(), z.unknown()).optional(),
});

export const SurahPackageSchema = z.object({
  schemaVersion: z.string().min(1),
  packageId: z.string().min(1),
  surah: z.object({
    number: z.number().int().min(1).max(114),
    name: z.string().min(1),
    arabicName: z.string().min(1),
    transliteration: z.string().min(1),
    englishLabel: z.string().min(1),
    description: z.string().optional(),
  }),
  contentVersion: z.string().min(1),
  status: ContentStatusSchema,
  sourceReferences: z.array(ProviderReferenceSchema).default([]),
  ayahs: z.array(AyahPackageSchema).min(1),
  teachingEntries: z.record(z.string(), TeachingLessonSchema).default({}),
  volumeReferences: z.array(z.string()).default([]),
});
export type SurahPackage = z.infer<typeof SurahPackageSchema>;

export const VolumePackageSchema = z.object({
  schemaVersion: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  surahNumbers: z.array(z.number().int().min(1).max(114)).min(1),
});

export function normalizeCanonicalArabic(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/g, "");
}

export function validateResolvedBreakdown(
  word: string,
  breakdown: WordBreakdown,
) {
  const errors: string[] = [];
  const source = normalizeCanonicalArabic(breakdown.sourceText);
  const target = normalizeCanonicalArabic(word);
  const parts = [...breakdown.parts].sort((a, b) => a.order - b.order);
  const composed = parts
    .map((part) => normalizeCanonicalArabic(part.sourceText))
    .join("");

  if (source !== target)
    errors.push("breakdown sourceText does not match word");
  if (composed !== source)
    errors.push("breakdown parts do not reconstruct sourceText");
  if (breakdown.mode === "atomic" && parts.length !== 1) {
    errors.push("atomic breakdown must have one part");
  }
  if (breakdown.mode === "segmented" && parts.length < 2) {
    errors.push("segmented breakdown must have at least two parts");
  }

  return errors;
}
