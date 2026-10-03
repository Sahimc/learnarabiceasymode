import { z } from "zod";
import {
  normalizeCanonicalArabic,
  validateResolvedBreakdown,
  WordBreakdownSchema,
} from "./content-contract";

export const ContentPacketSchemaVersion = "1.0.0" as const;

const KnowledgeFileSchema = z.object({
  path: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});

export const KnowledgeSnapshotSchema = z.object({
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.string().min(1),
  files: z.array(KnowledgeFileSchema).min(1),
});
export type KnowledgeSnapshot = z.infer<typeof KnowledgeSnapshotSchema>;

export const ProductionLayerStatusSchema = z.enum([
  "pending",
  "draft",
  "reviewed",
  "approved",
  "not-applicable",
]);
export type ProductionLayerStatus = z.infer<typeof ProductionLayerStatusSchema>;

export const ProductionPacketStatusSchema = z.enum([
  "source-imported",
  "draft",
  "review-required",
  "repair-required",
  "approved",
  "assembled",
  "imported",
]);
export type ProductionPacketStatus = z.infer<
  typeof ProductionPacketStatusSchema
>;

const SourceReferenceSchema = z.object({
  provider: z.string().min(1),
  recordKey: z.string().min(1),
  version: z.string().optional(),
  attribution: z.string().optional(),
});

export const SourcePacketWordSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().min(1),
  arabic: z.string().min(1),
  transliteration: z.string().optional(),
  gloss: z.string().optional(),
  sourceReferences: z.array(SourceReferenceSchema).default([]),
});

export const SourcePacketAyahSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().min(1),
  arabic: z.string().min(1),
  sourceRawArabic: z.string().optional(),
  translation: z.string().optional(),
  words: z.array(SourcePacketWordSchema).min(1),
});

export const SourcePacketSchema = z.object({
  schemaVersion: z.literal(ContentPacketSchemaVersion),
  packetId: z.string().min(1),
  sourcePackageId: z.string().min(1),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  knowledgeSnapshot: KnowledgeSnapshotSchema,
  status: z.literal("source-imported"),
  surahNumber: z.number().int().min(1).max(114),
  ayahStart: z.number().int().min(1),
  ayahEnd: z.number().int().min(1),
  sourceVersion: z.string().min(1),
  sourceReferences: z.array(SourceReferenceSchema).default([]),
  ayahs: z.array(SourcePacketAyahSchema).min(1),
});
export type SourcePacket = z.infer<typeof SourcePacketSchema>;

const MorphologyDraftSchema = z.object({
  provider: z.string().min(1).optional(),
  root: z.string().optional(),
  lemma: z.string().optional(),
  pattern: z.string().optional(),
  partOfSpeech: z.string().optional(),
  features: z.array(z.string().min(1)).default([]),
  notes: z.string().optional(),
});

const LayerStateSchema = z.object({
  segmentation: ProductionLayerStatusSchema,
  morphology: ProductionLayerStatusSchema,
  grammar: ProductionLayerStatusSchema,
  meaning: ProductionLayerStatusSchema,
  learnerConnections: ProductionLayerStatusSchema,
  pedagogy: ProductionLayerStatusSchema,
});

const DraftFormSchema = z.object({
  form: z.string().min(1),
  meaning: z.string().min(1),
  difference: z.string().min(1),
});

const DraftTeachingSchema = z.object({
  id: z.string().min(1),
  meaning: z.string().min(1),
  type: z.string().min(1),
  root: z.string(),
  rootPicture: z.string(),
  construction: z.string().min(1),
  grammar: z.string().min(1),
  sentenceRole: z.string().min(1),
  recognitionClue: z.string().min(1),
  forms: z.array(DraftFormSchema),
  takeaway: z.string().min(1),
});

export const DraftWordSchema = z.object({
  wordId: z.string().min(1),
  teachingId: z.string().min(1).optional(),
  layers: z.object({
    surfaceBreakdown: WordBreakdownSchema.optional(),
    breakdownScope: z.enum(["shared", "occurrence"]).default("shared"),
    teaching: DraftTeachingSchema.optional(),
    occurrenceRole: z.string().min(1).optional(),
    morphology: MorphologyDraftSchema.optional(),
    grammar: z.string().min(1).optional(),
    meaning: z.string().min(1).optional(),
    learnerConnections: z.array(z.string().min(1)).optional(),
    pedagogy: z
      .object({
        recognitionClue: z.string().min(1).optional(),
        explanation: z.string().min(1).optional(),
        takeaway: z.string().min(1).optional(),
      })
      .optional(),
  }),
  layerState: LayerStateSchema,
});

export const DraftAyahSchema = z.object({
  ayahId: z.string().min(1),
  ayahLayers: z.object({
    grammar: z.string().min(1).optional(),
    contextualMeaning: z.string().min(1).optional(),
    sentenceMap: z.array(z.string().min(1)).optional(),
  }),
  words: z.array(DraftWordSchema).min(1),
});

export const ContentDraftSchema = z.object({
  schemaVersion: z.literal(ContentPacketSchemaVersion),
  draftId: z.string().min(1),
  packetId: z.string().min(1),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  knowledgeSnapshot: KnowledgeSnapshotSchema,
  revision: z.number().int().min(1),
  status: ProductionPacketStatusSchema,
  createdBy: z.string().min(1),
  ayahs: z.array(DraftAyahSchema).min(1),
});
export type ContentDraft = z.infer<typeof ContentDraftSchema>;

export const ContentIssueSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error", "blocker"]),
  scopeId: z.string().min(1),
  path: z.string().min(1),
  message: z.string().min(1),
  requiredAction: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()).default({}),
});
export type ContentIssue = z.infer<typeof ContentIssueSchema>;

export const ReviewRoleSchema = z.enum([
  "source",
  "morphology",
  "grammar",
  "meaning",
  "pedagogy",
  "schema",
  "adjudicator",
]);
export type ReviewRole = z.infer<typeof ReviewRoleSchema>;

export const ReviewScopeSchema = z.object({
  type: z.enum(["packet", "ayah"]),
  ayahIds: z.array(z.string().min(1)).min(1),
});
export type ReviewScope = z.infer<typeof ReviewScopeSchema>;

export const ReviewArtifactSchema = z.object({
  schemaVersion: z.literal(ContentPacketSchemaVersion),
  reviewId: z.string().min(1),
  packetId: z.string().min(1),
  draftId: z.string().min(1),
  revision: z.number().int().min(1),
  scope: ReviewScopeSchema,
  reviewerRole: ReviewRoleSchema,
  reviewerId: z.string().min(1),
  independent: z.boolean(),
  status: z.enum(["approved", "revision-required"]),
  issues: z.array(ContentIssueSchema),
  reviewedAt: z.string().datetime(),
});
export type ReviewArtifact = z.infer<typeof ReviewArtifactSchema>;

export const IssueManifestSchema = z.object({
  schemaVersion: z.literal(ContentPacketSchemaVersion),
  manifestId: z.string().min(1),
  packetId: z.string().min(1),
  draftId: z.string().min(1),
  revision: z.number().int().min(1),
  scope: ReviewScopeSchema,
  status: z.enum(["open", "resolved"]),
  issues: z.array(ContentIssueSchema),
});
export type IssueManifest = z.infer<typeof IssueManifestSchema>;

export const RequiredReviewRoles = [
  "source",
  "morphology",
  "grammar",
  "meaning",
  "pedagogy",
] as const satisfies ReviewRole[];

export function draftHasAuthoredContent(draft: ContentDraft) {
  return draft.ayahs.some(
    (ayah) =>
      Boolean(
        ayah.ayahLayers.grammar ||
          ayah.ayahLayers.contextualMeaning ||
          ayah.ayahLayers.sentenceMap,
      ) ||
      ayah.words.some((word) => {
        const layers = word.layers;
        return Boolean(
          layers.surfaceBreakdown ||
            layers.teaching ||
            layers.occurrenceRole ||
            layers.grammar ||
            layers.meaning ||
            layers.learnerConnections?.length ||
            layers.pedagogy,
        );
      }),
  );
}

function reviewCoversAyah(review: ReviewArtifact, ayahId: string) {
  return (
    review.scope.type === "packet" || review.scope.ayahIds.includes(ayahId)
  );
}

export function validateReviewMatrix(
  draft: ContentDraft,
  reviews: ReviewArtifact[],
  manifests: IssueManifest[],
) {
  const errors: string[] = [];
  const requiredRoles: readonly ReviewRole[] = draftHasAuthoredContent(draft)
    ? RequiredReviewRoles
    : ["source"];

  for (const ayah of draft.ayahs) {
    for (const role of requiredRoles) {
      const matching = reviews.filter(
        (review) =>
          review.packetId === draft.packetId &&
          review.draftId === draft.draftId &&
          review.revision === draft.revision &&
          review.reviewerRole === role &&
          reviewCoversAyah(review, ayah.ayahId),
      );
      if (!matching.some((review) => review.status === "approved")) {
        errors.push(
          `${ayah.ayahId}: missing approved ${role} review for revision ${draft.revision}`,
        );
      }
      if (
        matching.some(
          (review) =>
            review.status === "revision-required" ||
            (role !== "source" && !review.independent),
        )
      ) {
        errors.push(
          `${ayah.ayahId}: ${role} review is not independently approved`,
        );
      }
    }
    for (const manifest of manifests) {
      if (
        manifest.packetId === draft.packetId &&
        manifest.draftId === draft.draftId &&
        manifest.revision === draft.revision &&
        manifest.status === "open" &&
        (manifest.scope.type === "packet" ||
          manifest.scope.ayahIds.includes(ayah.ayahId)) &&
        manifest.issues.some((issue) =>
          ["error", "blocker"].includes(issue.severity),
        )
      ) {
        errors.push(`${ayah.ayahId}: unresolved blocking issue`);
      }
    }
  }
  return [...new Set(errors)];
}

export function validateSourcePacket(packet: SourcePacket) {
  const errors: string[] = [];
  const ayahNumbers = packet.ayahs.map((ayah) => ayah.number);
  if (ayahNumbers[0] !== packet.ayahStart)
    errors.push("packet ayahStart does not match the first ayah");
  if (ayahNumbers.at(-1) !== packet.ayahEnd)
    errors.push("packet ayahEnd does not match the last ayah");
  for (let index = 1; index < ayahNumbers.length; index++) {
    if (ayahNumbers[index] !== ayahNumbers[index - 1] + 1)
      errors.push("packet ayahs must be contiguous");
  }
  for (const ayah of packet.ayahs) {
    const positions = ayah.words.map((word) => word.position);
    for (let index = 0; index < positions.length; index++) {
      if (positions[index] !== index + 1)
        errors.push(
          `${ayah.id}: word positions must start at 1 and be contiguous`,
        );
    }
    if (new Set(ayah.words.map((word) => word.id)).size !== ayah.words.length)
      errors.push(`${ayah.id}: duplicate word IDs`);
  }
  return errors;
}

export function validateDraftAgainstPacket(
  packet: SourcePacket,
  draft: ContentDraft,
) {
  const errors: string[] = [];
  if (packet.packetId !== draft.packetId)
    errors.push("draft packetId does not match source packet");
  if (packet.sourceFingerprint !== draft.sourceFingerprint)
    errors.push("draft sourceFingerprint does not match source packet");
  if (
    JSON.stringify(packet.knowledgeSnapshot) !==
    JSON.stringify(draft.knowledgeSnapshot)
  )
    errors.push("draft knowledgeSnapshot does not match source packet");
  const sourceAyahIds = packet.ayahs.map((ayah) => ayah.id);
  if (
    JSON.stringify(draft.ayahs.map((ayah) => ayah.ayahId)) !==
    JSON.stringify(sourceAyahIds)
  )
    errors.push("draft ayahs must preserve canonical order");
  const draftAyahs = new Map(draft.ayahs.map((ayah) => [ayah.ayahId, ayah]));
  if (draftAyahs.size !== draft.ayahs.length)
    errors.push("draft contains duplicate ayahs");
  for (const sourceAyah of packet.ayahs) {
    const draftAyah = draftAyahs.get(sourceAyah.id);
    if (!draftAyah) {
      errors.push(`${sourceAyah.id}: missing draft ayah`);
      continue;
    }
    const sourceWords = new Map(
      sourceAyah.words.map((word) => [word.id, word]),
    );
    if (
      JSON.stringify(draftAyah.words.map((word) => word.wordId)) !==
      JSON.stringify(sourceAyah.words.map((word) => word.id))
    )
      errors.push(
        `${sourceAyah.id}: draft words must preserve canonical order`,
      );
    const seenDraftWords = new Set<string>();
    if (draftAyah.words.length !== sourceAyah.words.length)
      errors.push(`${sourceAyah.id}: draft word count does not match source`);
    for (const draftWord of draftAyah.words) {
      if (seenDraftWords.has(draftWord.wordId))
        errors.push(`${draftWord.wordId}: duplicate draft word`);
      seenDraftWords.add(draftWord.wordId);
      const sourceWord = sourceWords.get(draftWord.wordId);
      if (!sourceWord) {
        errors.push(`${draftWord.wordId}: word is not in source packet`);
        continue;
      }
      const breakdown = draftWord.layers.surfaceBreakdown;
      if (breakdown) {
        errors.push(
          ...validateResolvedBreakdown(sourceWord.arabic, breakdown).map(
            (error) => `${draftWord.wordId}: ${error}`,
          ),
        );
      }
    }
    for (const sourceWord of sourceAyah.words) {
      if (!seenDraftWords.has(sourceWord.id))
        errors.push(`${sourceWord.id}: missing draft word`);
    }
  }
  if (draftAyahs.size !== packet.ayahs.length)
    errors.push("draft contains an unexpected number of ayahs");
  return errors;
}

export function layerStateForSourceOnly(): z.infer<typeof LayerStateSchema> {
  return {
    segmentation: "pending",
    morphology: "pending",
    grammar: "pending",
    meaning: "pending",
    learnerConnections: "pending",
    pedagogy: "pending",
  };
}

export function canonicalJoin(parts: string[]) {
  return parts.map(normalizeCanonicalArabic).join("");
}
