import {
  TeachingLessonSchema,
  validateResolvedBreakdown,
  type SurahPackage,
  type TeachingLesson,
} from "./content-contract";
import {
  validateDraftAgainstPacket,
  validateReviewMatrix,
  type ContentDraft,
  type IssueManifest,
  type KnowledgeSnapshot,
  type ReviewArtifact,
  type SourcePacket,
} from "./content-production-contract";
import { sourcePacketMatchesPackage } from "./content-production-source";

export type AssemblyInput = {
  sourcePackage: SurahPackage;
  packets: SourcePacket[];
  drafts: ContentDraft[];
  reviews: ReviewArtifact[];
  manifests: IssueManifest[];
  knowledgeSnapshot: KnowledgeSnapshot;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function sameValue(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right);
}

function componentRows(breakdown: TeachingLesson["breakdown"]) {
  return (breakdown?.parts ?? []).map((part) => ({
    text: part.sourceText,
    displayText: part.displayText,
    label: part.label,
    meaning: part.meaning,
    kind: part.kind,
  }));
}

type DraftTeachingLesson = Omit<TeachingLesson, "components" | "breakdown"> & {
  breakdown?: TeachingLesson["breakdown"];
};

function validatePacketSet(input: AssemblyInput) {
  const errors: string[] = [];
  const expectedAyahs = new Map(
    input.sourcePackage.ayahs.map((ayah) => [ayah.number, ayah]),
  );
  const owners = new Map<number, string>();
  const occurrenceOwners = new Map<string, string>();
  const packetIds = new Set<string>();

  for (const packet of input.packets) {
    if (packetIds.has(packet.packetId)) {
      errors.push(`duplicate packet ${packet.packetId}`);
      continue;
    }
    packetIds.add(packet.packetId);
    if (packet.surahNumber !== input.sourcePackage.surah.number)
      errors.push(`${packet.packetId}: wrong sūrah`);
    if (!sameValue(packet.knowledgeSnapshot, input.knowledgeSnapshot))
      errors.push(`${packet.packetId}: stale knowledge snapshot`);
    if (!sourcePacketMatchesPackage(packet, input.sourcePackage))
      errors.push(`${packet.packetId}: stale or mismatched source fingerprint`);
    for (const ayah of packet.ayahs) {
      if (!expectedAyahs.has(ayah.number))
        errors.push(`${packet.packetId}: unexpected āyah ${ayah.number}`);
      const previousOwner = owners.get(ayah.number);
      if (previousOwner && previousOwner !== packet.packetId)
        errors.push(
          `āyah ${ayah.number}: overlapping packet ownership (${previousOwner}, ${packet.packetId})`,
        );
      owners.set(ayah.number, packet.packetId);
      for (const word of ayah.words) {
        const previousWordOwner = occurrenceOwners.get(word.id);
        if (previousWordOwner && previousWordOwner !== packet.packetId)
          errors.push(`duplicate occurrence ${word.id}`);
        occurrenceOwners.set(word.id, packet.packetId);
      }
    }
  }
  for (const number of expectedAyahs.keys())
    if (!owners.has(number)) errors.push(`missing āyah ${number}`);
  return errors;
}

function mergeTeachingEntry(
  entries: Map<string, TeachingLesson>,
  lesson: DraftTeachingLesson,
  breakdown: TeachingLesson["breakdown"],
  sourceId: string,
) {
  const normalized: TeachingLesson = TeachingLessonSchema.parse({
    ...lesson,
    breakdown: breakdown ?? lesson.breakdown,
    components: componentRows(breakdown ?? lesson.breakdown),
  });
  const existing = entries.get(normalized.id);
  if (existing && !sameValue(existing, normalized))
    throw new Error(
      `${sourceId}: conflicting shared teaching entry ${normalized.id}`,
    );
  entries.set(normalized.id, normalized);
}

export function assembleAuthoredSurah(input: AssemblyInput): SurahPackage {
  const errors = validatePacketSet(input);
  if (errors.length) throw new Error(errors.join("\n"));

  const packetsById = new Map(
    input.packets.map((packet) => [packet.packetId, packet]),
  );
  const draftsById = new Map<string, ContentDraft>();
  for (const draft of input.drafts) {
    if (draftsById.has(draft.draftId))
      errors.push(`duplicate draft ${draft.draftId}`);
    draftsById.set(draft.draftId, draft);
    const packet = packetsById.get(draft.packetId);
    if (!packet) {
      errors.push(`${draft.draftId}: packet is missing`);
      continue;
    }
    errors.push(...validateDraftAgainstPacket(packet, draft));
    if (!sameValue(draft.knowledgeSnapshot, input.knowledgeSnapshot))
      errors.push(`${draft.draftId}: stale knowledge snapshot`);
  }
  if (errors.length) throw new Error([...new Set(errors)].join("\n"));

  const selectedDrafts = new Map<string, ContentDraft>();
  const approvalErrors: string[] = [];
  for (const draft of [...draftsById.values()].sort(
    (left, right) => right.revision - left.revision,
  )) {
    const packetReviews = input.reviews.filter(
      (review) =>
        review.packetId === draft.packetId &&
        review.draftId === draft.draftId &&
        review.revision === draft.revision,
    );
    const packetManifests = input.manifests.filter(
      (manifest) =>
        manifest.packetId === draft.packetId &&
        manifest.draftId === draft.draftId &&
        manifest.revision === draft.revision,
    );
    const matrixErrors = validateReviewMatrix(
      draft,
      packetReviews,
      packetManifests,
    );
    approvalErrors.push(...matrixErrors);
    const approvedAyahs = new Set(
      draft.ayahs
        .map((ayah) => ayah.ayahId)
        .filter(
          (ayahId) =>
            !matrixErrors.some((error) => error.startsWith(`${ayahId}:`)),
        ),
    );
    for (const ayah of draft.ayahs) {
      if (!approvedAyahs.has(ayah.ayahId)) continue;
      if (!selectedDrafts.has(ayah.ayahId))
        selectedDrafts.set(ayah.ayahId, draft);
    }
  }

  const missingApprovedAyahs = input.sourcePackage.ayahs
    .map((ayah) => ayah.id)
    .filter((ayahId) => !selectedDrafts.has(ayahId));
  if (missingApprovedAyahs.length)
    throw new Error(
      [
        `no approved revision for āyāt: ${missingApprovedAyahs.join(", ")}`,
        ...new Set(approvalErrors),
      ].join("\n"),
    );

  const teachingEntries = new Map<string, TeachingLesson>(
    Object.entries(input.sourcePackage.teachingEntries),
  );
  for (const draft of selectedDrafts.values()) {
    for (const ayah of draft.ayahs) {
      if (
        !selectedDrafts.get(ayah.ayahId) ||
        selectedDrafts.get(ayah.ayahId) !== draft
      )
        continue;
      for (const word of ayah.words) {
        const teaching = word.layers.teaching;
        if (!teaching) continue;
        const breakdown = word.layers.surfaceBreakdown;
        if (breakdown) {
          const sourceWord = input.sourcePackage.ayahs
            .find((item) => item.id === ayah.ayahId)
            ?.words.find((item) => item.id === word.wordId);
          if (!sourceWord)
            throw new Error(`${word.wordId}: source occurrence is missing`);
          const breakdownErrors = validateResolvedBreakdown(
            sourceWord.arabic,
            breakdown,
          );
          if (breakdownErrors.length)
            throw new Error(
              breakdownErrors
                .map((error) => `${word.wordId}: ${error}`)
                .join("\n"),
            );
        }
        if (word.layers.breakdownScope === "shared" && !breakdown)
          throw new Error(`${word.wordId}: shared teaching needs a breakdown`);
        mergeTeachingEntry(
          teachingEntries,
          teaching,
          word.layers.breakdownScope === "shared" ? breakdown : undefined,
          word.wordId,
        );
      }
    }
  }

  const output: SurahPackage = structuredClone(input.sourcePackage);
  const authoredWordIds = new Set<string>();
  for (const ayah of output.ayahs) {
    const draft = selectedDrafts.get(ayah.id);
    if (!draft) throw new Error(`${ayah.id}: selected draft disappeared`);
    const draftAyah = draft.ayahs.find((item) => item.ayahId === ayah.id);
    if (!draftAyah) throw new Error(`${ayah.id}: selected draft is incomplete`);
    if (draftAyah.ayahLayers.contextualMeaning)
      ayah.naturalMeaning = draftAyah.ayahLayers.contextualMeaning;
    if (draftAyah.ayahLayers.grammar || draftAyah.ayahLayers.sentenceMap)
      ayah.teaching = {
        grammar: draftAyah.ayahLayers.grammar,
        sentenceMap: draftAyah.ayahLayers.sentenceMap,
      };
    for (const word of ayah.words) {
      const draftWord = draftAyah.words.find((item) => item.wordId === word.id);
      if (!draftWord)
        throw new Error(`${word.id}: selected draft is incomplete`);
      const teaching = draftWord.layers.teaching;
      const breakdown = draftWord.layers.surfaceBreakdown;
      const teachingId = teaching?.id ?? draftWord.teachingId;
      if (!teachingId) continue;
      authoredWordIds.add(word.id);
      word.teachingId = teachingId;
      if (draftWord.layers.occurrenceRole)
        word.occurrenceRole = draftWord.layers.occurrenceRole;
      if (draftWord.layers.breakdownScope === "occurrence") {
        if (!breakdown)
          throw new Error(`${word.id}: occurrence teaching needs a breakdown`);
        word.breakdownOverride = breakdown;
        delete word.breakdown;
      } else {
        const shared = teachingEntries.get(teachingId)?.breakdown;
        if (!shared)
          throw new Error(`${word.id}: shared breakdown did not resolve`);
        word.breakdown = shared;
        delete word.breakdownOverride;
      }
    }
  }

  output.teachingEntries = Object.fromEntries(
    [...teachingEntries.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  const totalWords = output.ayahs.reduce(
    (sum, ayah) => sum + ayah.words.length,
    0,
  );
  output.status =
    authoredWordIds.size === 0
      ? "source-only"
      : authoredWordIds.size === totalWords
        ? "custom-complete"
        : "custom-partial";
  return output;
}
