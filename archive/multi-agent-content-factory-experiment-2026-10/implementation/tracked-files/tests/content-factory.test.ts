import assert from "node:assert/strict";
import test from "node:test";
import { SurahPackageSchema } from "../app/data/content-contract";
import {
  assembleAuthoredSurah,
  type AssemblyInput,
} from "../app/data/content-production-assembler";
import {
  ContentDraftSchema,
  ContentIssueSchema,
  IssueManifestSchema,
  ReviewArtifactSchema,
  validateDraftAgainstPacket,
  validateSourcePacket,
  type ContentDraft,
  type IssueManifest,
  type SourcePacket,
} from "../app/data/content-production-contract";
import { buildSourcePacket } from "../app/data/content-production-source";

const snapshot = {
  snapshotId: "b".repeat(64),
  version: "1.0.0",
  files: [{ path: "test-knowledge.json", checksum: "c".repeat(64) }],
};

function wordBreakdown(word: string, id: string) {
  return {
    id: `breakdown:${id}`,
    mode: "atomic" as const,
    sourceText: word,
    parts: [
      {
        id: `breakdown:${id}:part:whole`,
        order: 1,
        sourceText: word,
        displayText: word,
        label: "complete form",
        meaning: `meaning of ${word}`,
        kind: "whole" as const,
      },
    ],
  };
}

function packageWithAyahs(count = 4) {
  return SurahPackageSchema.parse({
    schemaVersion: "1.0.0",
    packageId: "package:test-surah",
    surah: {
      number: 107,
      name: "Test Sūrah",
      arabicName: "اختبار",
      transliteration: "Test",
      englishLabel: "Test",
    },
    contentVersion: "source-test-1",
    status: "source-only",
    sourceReferences: [],
    ayahs: Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      const word = `WORD${number}`;
      return {
        id: `ayah:test:${number}`,
        number,
        arabic: word,
        words: [
          {
            id: `word:test:${number}:1`,
            position: 1,
            arabic: word,
            sourceReferences: [],
          },
        ],
      };
    }),
    teachingEntries: {},
    volumeReferences: [],
  });
}

function draftForPacket(packet: SourcePacket, authored = true, revision = 1) {
  return ContentDraftSchema.parse({
    schemaVersion: "1.0.0",
    draftId: `draft:${packet.packetId}:revision:${revision}`,
    packetId: packet.packetId,
    sourceFingerprint: packet.sourceFingerprint,
    knowledgeSnapshot: packet.knowledgeSnapshot,
    revision,
    status: "draft",
    createdBy: "test-worker",
    ayahs: packet.ayahs.map((ayah) => ({
      ayahId: ayah.id,
      ayahLayers: authored
        ? {
            grammar: `grammar for ${ayah.id}`,
            contextualMeaning: `meaning for ${ayah.id}`,
          }
        : {},
      words: ayah.words.map((word) => ({
        wordId: word.id,
        layers: authored
          ? {
              breakdownScope: "shared" as const,
              surfaceBreakdown: wordBreakdown(word.arabic, word.id),
              teaching: {
                id: `teaching:${word.id}`,
                meaning: `meaning of ${word.arabic}`,
                type: "noun",
                root: "",
                rootPicture: "",
                construction: "complete form",
                grammar: "test grammar",
                sentenceRole: "test role",
                recognitionClue: "test clue",
                forms: [],
                takeaway: "test takeaway",
              },
            }
          : { breakdownScope: "shared" as const },
        layerState: {
          segmentation: authored ? "approved" : "pending",
          morphology: authored ? "approved" : "pending",
          grammar: authored ? "approved" : "pending",
          meaning: authored ? "approved" : "pending",
          learnerConnections: authored ? "approved" : "pending",
          pedagogy: authored ? "approved" : "pending",
        },
      })),
    })),
  });
}

function reviewsForDraft(
  draft: ContentDraft,
  roles = ["source", "morphology", "grammar", "meaning", "pedagogy"] as const,
  scopeAyahIds = draft.ayahs.map((ayah) => ayah.ayahId),
) {
  const packetScope = scopeAyahIds.length === draft.ayahs.length;
  return roles.map((role) =>
    ReviewArtifactSchema.parse({
      schemaVersion: "1.0.0",
      reviewId: `review:${draft.draftId}:${role}`,
      packetId: draft.packetId,
      draftId: draft.draftId,
      revision: draft.revision,
      scope: {
        type: packetScope ? "packet" : "ayah",
        ayahIds: scopeAyahIds,
      },
      reviewerRole: role,
      reviewerId: `${role}-reviewer`,
      independent: role !== "source",
      status: "approved",
      issues: [],
      reviewedAt: "2026-01-01T00:00:00.000Z",
    }),
  );
}

function resolvedManifest(
  draft: ContentDraft,
  scopeAyahIds = draft.ayahs.map((ayah) => ayah.ayahId),
): IssueManifest {
  return IssueManifestSchema.parse({
    schemaVersion: "1.0.0",
    manifestId: `manifest:${draft.draftId}`,
    packetId: draft.packetId,
    draftId: draft.draftId,
    revision: draft.revision,
    scope: {
      type: scopeAyahIds.length === draft.ayahs.length ? "packet" : "ayah",
      ayahIds: scopeAyahIds,
    },
    status: "resolved",
    issues: [],
  });
}

function validAssemblyInput(): AssemblyInput {
  const sourcePackage = packageWithAyahs();
  const packets = [
    buildSourcePacket(sourcePackage, snapshot, 1, 2),
    buildSourcePacket(sourcePackage, snapshot, 3, 4),
  ];
  const drafts = packets.map((packet) => draftForPacket(packet));
  return {
    sourcePackage,
    packets,
    drafts,
    reviews: drafts.flatMap((draft) => reviewsForDraft(draft)),
    manifests: drafts.map((draft) => resolvedManifest(draft)),
    knowledgeSnapshot: snapshot,
  };
}

function expectAssemblyError(input: AssemblyInput, pattern: RegExp) {
  assert.throws(() => assembleAuthoredSurah(input), pattern);
}

test("source packets enforce contiguous ayah and word structure", () => {
  const packet = buildSourcePacket(packageWithAyahs(1), snapshot, 1, 1);
  assert.deepEqual(validateSourcePacket(packet), []);
});

test("draft validation accepts an exact atomic breakdown", () => {
  const packet = buildSourcePacket(packageWithAyahs(1), snapshot, 1, 1);
  const draft = draftForPacket(packet);
  assert.deepEqual(validateDraftAgainstPacket(packet, draft), []);
});

test("draft validation rejects a breakdown that changes source text", () => {
  const packet = buildSourcePacket(packageWithAyahs(1), snapshot, 1, 1);
  const draft = draftForPacket(packet);
  draft.ayahs[0].words[0].layers.surfaceBreakdown!.sourceText = "OTHER";
  assert.match(
    validateDraftAgainstPacket(packet, draft).join("\n"),
    /does not match word/,
  );
});

test("review matrix requires every authored review role", () => {
  const input = validAssemblyInput();
  input.reviews = input.reviews.filter(
    (review) => review.reviewerRole !== "meaning",
  );
  expectAssemblyError(input, /missing approved meaning review/);
});

test("overlapping approved packets fail closed", () => {
  const input = validAssemblyInput();
  input.packets[1] = buildSourcePacket(input.sourcePackage, snapshot, 2, 4);
  expectAssemblyError(input, /overlapping packet ownership/);
});

test("missing ayah fails closed", () => {
  const input = validAssemblyInput();
  input.packets = [
    buildSourcePacket(input.sourcePackage, snapshot, 1, 1),
    buildSourcePacket(input.sourcePackage, snapshot, 3, 4),
  ];
  expectAssemblyError(input, /missing āyah 2/);
});

test("duplicate occurrence fails closed", () => {
  const input = validAssemblyInput();
  input.packets[1].ayahs[0].words[0].id = input.packets[0].ayahs[0].words[0].id;
  expectAssemblyError(input, /duplicate occurrence/);
});

test("stale fingerprint fails closed", () => {
  const input = validAssemblyInput();
  input.packets[0].sourceFingerprint = "a".repeat(64);
  expectAssemblyError(input, /stale or mismatched source fingerprint/);
});

test("stale knowledge snapshot fails closed", () => {
  const input = validAssemblyInput();
  input.drafts[0].knowledgeSnapshot = {
    ...snapshot,
    snapshotId: "d".repeat(64),
  };
  expectAssemblyError(input, /stale knowledge snapshot/);
});

test("unapproved revision fails closed", () => {
  const input = validAssemblyInput();
  input.reviews[1].status = "revision-required";
  expectAssemblyError(input, /no approved revision/);
});

test("unresolved blocking issue fails closed", () => {
  const input = validAssemblyInput();
  const issue = ContentIssueSchema.parse({
    id: "issue:blocker",
    code: "GRAMMAR_REVIEW_FAILED",
    severity: "blocker",
    scopeId: input.drafts[0].ayahs[0].ayahId,
    path: "ayahs.0",
    message: "Grammar requires repair",
    requiredAction: "Repair and re-review",
    evidence: {},
  });
  input.manifests[0] = IssueManifestSchema.parse({
    ...input.manifests[0],
    status: "open",
    issues: [issue],
  });
  expectAssemblyError(input, /unresolved blocking issue/);
});

test("wrong ayah order fails closed", () => {
  const input = validAssemblyInput();
  input.packets[0].ayahs.reverse();
  expectAssemblyError(input, /stale or mismatched source fingerprint/);
});

test("several independently authored ranges assemble canonically", () => {
  const output = assembleAuthoredSurah(validAssemblyInput());
  assert.equal(output.status, "custom-complete");
  assert.deepEqual(
    output.ayahs.map((ayah) => ayah.number),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    output.ayahs.flatMap((ayah) => ayah.words.map((word) => word.position)),
    [1, 1, 1, 1],
  );
  assert.equal(Object.keys(output.teachingEntries).length, 4);
});

test("approved revisions remain independent at āyah level", () => {
  const input = validAssemblyInput();
  const original = input.drafts[0];
  const repaired = ContentDraftSchema.parse({
    ...structuredClone(original),
    draftId: `${original.draftId}:revision:2`,
    revision: 2,
  });
  repaired.ayahs[1].words[0].layers.teaching!.id = "teaching:repaired-ayah-2";
  input.drafts.push(repaired);
  const repairedScope = [repaired.ayahs[1].ayahId];
  input.reviews.push(...reviewsForDraft(repaired, undefined, repairedScope));
  input.manifests.push(resolvedManifest(repaired, repairedScope));

  const output = assembleAuthoredSurah(input);
  assert.equal(
    output.ayahs[0].words[0].teachingId,
    original.ayahs[0].words[0].layers.teaching!.id,
  );
  assert.equal(output.ayahs[1].words[0].teachingId, "teaching:repaired-ayah-2");
});

test("same approved inputs produce deterministic output", () => {
  const first = assembleAuthoredSurah(validAssemblyInput());
  const second = assembleAuthoredSurah(validAssemblyInput());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
