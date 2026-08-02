import { z } from "zod";

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

export const WordBreakdownPartSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  sourceText: z.string().min(1),
  displayText: z.string().min(1),
  label: z.string().min(1),
  meaning: z.string().min(1),
  kind: WordBreakdownPartKindSchema,
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
});
export type SourceWord = z.infer<typeof SourceWordSchema>;

export const LessonFormSchema = z.object({
  form: z.string().min(1),
  meaning: z.string().min(1),
  difference: z.string().min(1),
});

export const LessonComponentSchema = z.object({
  text: z.string().min(1),
  displayText: z.string().optional(),
  label: z.string().min(1),
  meaning: z.string().min(1),
  kind: WordBreakdownPartKindSchema.optional(),
});

export const TeachingLessonSchema = z.object({
  id: z.string().min(1),
  meaning: z.string().min(1),
  type: z.string().min(1),
  root: z.string(),
  rootPicture: z.string(),
  construction: z.string().min(1),
  components: z.array(LessonComponentSchema),
  breakdown: WordBreakdownSchema.optional(),
  grammar: z.string().min(1),
  sentenceRole: z.string().min(1),
  recognitionClue: z.string().min(1),
  forms: z.array(LessonFormSchema),
  takeaway: z.string().min(1),
});
export type TeachingLesson = z.infer<typeof TeachingLessonSchema>;

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
