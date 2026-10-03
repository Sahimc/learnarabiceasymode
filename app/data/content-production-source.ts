import crypto from "node:crypto";
import type { SurahPackage } from "./content-contract";
import {
  SourcePacketSchema,
  validateSourcePacket,
  type KnowledgeSnapshot,
  type SourcePacket,
} from "./content-production-contract";

function checksum(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildSourcePacket(
  pkg: SurahPackage,
  knowledgeSnapshot: KnowledgeSnapshot,
  rangeStart?: number,
  rangeEnd?: number,
): SourcePacket {
  if (
    rangeStart !== undefined &&
    rangeEnd !== undefined &&
    rangeStart > rangeEnd
  )
    throw new Error("--ayah-start must be less than or equal to --ayah-end");

  const ayahs = pkg.ayahs.filter(
    (ayah) =>
      (rangeStart === undefined || ayah.number >= rangeStart) &&
      (rangeEnd === undefined || ayah.number <= rangeEnd),
  );
  if (!ayahs.length) throw new Error("Requested packet range contains no āyāt");

  const sourceAyahs = ayahs.map((ayah) => ({
    id: ayah.id,
    number: ayah.number,
    arabic: ayah.arabic,
    sourceRawArabic: ayah.sourceRawArabic,
    translation: ayah.translation,
    words: ayah.words.map((word) => ({
      id: word.id,
      position: word.position,
      arabic: word.arabic,
      transliteration: word.transliteration,
      gloss: word.gloss,
      sourceReferences: word.sourceReferences,
    })),
  }));
  const sourceFingerprint = checksum(
    JSON.stringify({
      packageId: pkg.packageId,
      contentVersion: pkg.contentVersion,
      ayahs: sourceAyahs,
    }),
  );
  const packet = {
    schemaVersion: "1.0.0" as const,
    packetId: `packet:${pkg.surah.number}:${ayahs[0].number}-${ayahs.at(-1)?.number}`,
    sourcePackageId: pkg.packageId,
    sourceFingerprint,
    knowledgeSnapshot,
    status: "source-imported" as const,
    surahNumber: pkg.surah.number,
    ayahStart: ayahs[0].number,
    ayahEnd: ayahs.at(-1)!.number,
    sourceVersion: pkg.contentVersion,
    sourceReferences: pkg.sourceReferences,
    ayahs: sourceAyahs,
  };
  const parsed = SourcePacketSchema.parse(packet);
  const errors = validateSourcePacket(parsed);
  if (errors.length) throw new Error(errors.join("\n"));
  return parsed;
}

export function sourcePacketMatchesPackage(
  packet: SourcePacket,
  pkg: SurahPackage,
) {
  const expected = buildSourcePacket(
    pkg,
    packet.knowledgeSnapshot,
    packet.ayahStart,
    packet.ayahEnd,
  );
  return JSON.stringify(packet) === JSON.stringify(expected);
}
