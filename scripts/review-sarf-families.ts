import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";
import { pool } from "./lib/db";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { rootMeaningFor } from "./lib/root-meanings";
import {
  reviewSarfFamily,
  normalizeSarfForm,
  type SarfCandidate,
} from "./lib/sarf-authoring";

const contract = assertAuthoringContract("Ṣarf family review");
const repositoryRoot = process.cwd();
const packagesRoot = path.join(repositoryRoot, "content-import", "surahs");
const reviewedAt = new Date().toISOString();
const apply = !process.argv.includes("--dry-run");

type JsonObject = Record<string, unknown>;

type PackageWord = {
  id: string;
  position: number;
  arabic: string;
  gloss?: string;
  teachingId?: string;
  [key: string]: unknown;
};

type LessonForm = {
  form: string;
  meaning: string;
  difference: string;
  relationship?: string;
  provenance?: string;
};

type TeachingLesson = {
  id: string;
  meaning: string;
  type: string;
  root: string;
  rootPicture: string;
  forms: LessonForm[];
  [key: string]: unknown;
};

type PackageAyah = {
  id: string;
  number: number;
  words: PackageWord[];
  [key: string]: unknown;
};

type SourcePackage = {
  packageId: string;
  surah: { number: number };
  contentVersion: string;
  status: string;
  ayahs: PackageAyah[];
  teachingEntries: Record<string, TeachingLesson>;
  [key: string]: unknown;
};

type Feature = { key?: string; label?: string; value?: string };

type ProviderEvidence = {
  occurrenceId: string;
  provider: string;
  recordKey: string;
  version: string;
  root: string;
  lemma: string;
  pattern: string;
  partOfSpeech: string;
  features: Feature[];
};

type Occurrence = {
  packagePath: string;
  pkg: SourcePackage;
  ayah: PackageAyah;
  word: PackageWord;
  lesson: TeachingLesson;
  provider?: ProviderEvidence;
};

type RootCandidate = {
  form: string;
  meaning: string;
  evidence?: ProviderEvidence;
  occurrenceId?: string;
  surah?: number;
  ayah?: number;
  position?: number;
};

type ProviderRow = {
  occurrence_id: string;
  provider: string;
  record_key: string | null;
  version: string | null;
  part_of_speech: string | null;
  features: unknown;
};

const placeholderPattern =
  /root[- ]letter|root skeleton|dictionary form connected|lemma \/ dictionary|case or pattern used|(?:nominative|accusative|genitive) ending(?: pattern)?|related verbal ending|recognition variant|related grammatical (?:word|form)|the form used in this occurrence|^lexical stem$|^additional root|^base grammatical form$/iu;
const arabicPattern =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalized(value: string) {
  return normalizeSarfForm(value);
}

function base(value: string) {
  return normalized(value).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "");
}

function rootKey(value: string | undefined) {
  return (value ?? "").replace(/\s+/gu, "").trim();
}

function featuresFrom(value: unknown) {
  const details = parseJson<JsonObject>(value, {});
  return parseJson<Feature[]>(details.features, []).filter(
    (feature) => typeof feature === "object" && feature !== null,
  );
}

function featureText(evidence: ProviderEvidence | undefined) {
  if (!evidence) return "";
  const details = evidence.features
    .map((feature) =>
      `${feature.label ?? feature.key ?? "feature"}: ${feature.value ?? ""}`.trim(),
    )
    .filter((item) => !item.endsWith(":"));
  return [evidence.pattern ? `pattern: ${evidence.pattern}` : "", ...details]
    .filter(Boolean)
    .join("; ");
}

function featureMap(evidence: ProviderEvidence | undefined) {
  const result = new Map<string, string>();
  for (const feature of evidence?.features ?? []) {
    const key = (feature.key ?? feature.label ?? "feature").toLowerCase();
    if (feature.value) result.set(key, feature.value);
  }
  if (evidence?.pattern) result.set("pattern", evidence.pattern);
  if (evidence?.partOfSpeech) result.set("partofspeech", evidence.partOfSpeech);
  return result;
}

function changedFeatures(
  current: ProviderEvidence | undefined,
  candidate: ProviderEvidence | undefined,
) {
  const currentMap = featureMap(current);
  const candidateMap = featureMap(candidate);
  const keys = new Set([...currentMap.keys(), ...candidateMap.keys()]);
  return [...keys]
    .filter((key) => currentMap.get(key) !== candidateMap.get(key))
    .map(
      (key) =>
        `${key}: ${currentMap.get(key) ?? "not marked"} → ${candidateMap.get(key) ?? "not marked"}`,
    );
}

function usefulFeatureChange(changes: string[]) {
  return changes.some((change) =>
    /tense|person|gender|number|voice|verbform|pattern|mood|pronoun|state|partofspeech/iu.test(
      change,
    ),
  );
}

function differenceFor(
  currentForm: string,
  currentEvidence: ProviderEvidence | undefined,
  candidate: RootCandidate,
) {
  const changes = changedFeatures(currentEvidence, candidate.evidence);
  if (changes.length)
    return `Compared with ${currentForm}, this form changes ${changes.slice(0, 3).join("; ")}.`;
  if (base(currentForm) !== base(candidate.form))
    return `A distinct vocalised form in the same root family; its surface pattern and form-specific meaning change to “${candidate.meaning}”.`;
  return `An inflectional or attached-element contrast with ${currentForm}; the Arabic ending or attachment changes the grammatical role.`;
}

function relationshipFor(root: string, candidate: RootCandidate) {
  const source = candidate.occurrenceId
    ? ` Canonical Qur'anic evidence: ${candidate.occurrenceId}.`
    : "";
  return `Related to the ${root} root/lexeme as a real Qur'anic form.${source}`;
}

function provenanceFor(root: string, candidate: RootCandidate) {
  const provider = candidate.evidence
    ? ` Aligned ${candidate.evidence.provider} morphology ${candidate.evidence.version} was used as evidence.`
    : " The existing project-authored row was retained only after Codex review against canonical evidence.";
  return `Codex-reviewed form for the ${root} family.${provider}`;
}

function candidateIsSafe(candidate: LessonForm, root: string) {
  if (!candidate.form.trim() || !arabicPattern.test(candidate.form))
    return false;
  if (!candidate.meaning.trim() || !candidate.difference.trim()) return false;
  if (placeholderPattern.test(`${candidate.meaning} ${candidate.difference}`))
    return false;
  if (root && base(candidate.form) === base(root)) return false;
  return true;
}

function providerEvidence(row: ProviderRow): ProviderEvidence {
  const details = parseJson<JsonObject>(row.features, {});
  return {
    occurrenceId: row.occurrence_id,
    provider: row.provider,
    recordKey: row.record_key ?? String(details.recordKey ?? row.occurrence_id),
    version: row.version ?? String(details.version ?? "unknown"),
    root: String(details.root ?? ""),
    lemma: String(details.lemma ?? ""),
    pattern: String(details.pattern ?? ""),
    partOfSpeech: row.part_of_speech ?? "",
    features: featuresFrom(row.features),
  };
}

function lessonTypeSignal(
  lesson: TeachingLesson,
  evidence: ProviderEvidence | undefined,
) {
  const featurePartOfSpeech = evidence?.features.find(
    (feature) =>
      (feature.key ?? feature.label ?? "").toLowerCase() === "partofspeech",
  )?.value;
  return [
    lesson.type,
    evidence?.partOfSpeech,
    featurePartOfSpeech,
    ...(evidence?.features ?? []).map((feature) => feature.value),
  ]
    .filter(Boolean)
    .join(" ");
}

function candidateScore(
  currentForm: string,
  currentEvidence: ProviderEvidence | undefined,
  candidate: RootCandidate,
) {
  const changes = changedFeatures(currentEvidence, candidate.evidence);
  let score = 30;
  if (base(currentForm) !== base(candidate.form)) score += 24;
  if (usefulFeatureChange(changes)) score += 25;
  if (candidate.evidence) score += 10;
  return score;
}

function dedupeCandidates(candidates: SarfCandidate[]) {
  const byForm = new Map<string, SarfCandidate>();
  for (const candidate of candidates) {
    const key = normalized(candidate.form);
    const previous = byForm.get(key);
    if (!previous || (candidate.score ?? 0) > (previous.score ?? 0))
      byForm.set(key, candidate);
  }
  return [...byForm.values()];
}

function hash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function packagePaths() {
  const dirs = await fs.readdir(packagesRoot, { withFileTypes: true });
  const paths: string[] = [];
  for (const dir of dirs.filter((entry) => entry.isDirectory())) {
    const file = path.join(packagesRoot, dir.name, "surah.json");
    try {
      await fs.access(file);
      paths.push(file);
    } catch {
      /* stale empty package folder */
    }
  }
  return paths.sort();
}

const files = await packagePaths();
const packages = new Map<string, { path: string; pkg: SourcePackage }>();
const occurrences: Occurrence[] = [];
for (const packagePath of files) {
  const pkg = JSON.parse(
    await fs.readFile(packagePath, "utf8"),
  ) as SourcePackage;
  if (!pkg.teachingEntries || !Object.keys(pkg.teachingEntries).length)
    continue;
  packages.set(pkg.packageId, { path: packagePath, pkg });
  for (const ayah of pkg.ayahs) {
    for (const word of ayah.words) {
      if (!word.teachingId) continue;
      const lesson = pkg.teachingEntries[word.teachingId];
      if (!lesson) continue;
      occurrences.push({ packagePath, pkg, ayah, word, lesson });
    }
  }
}

const providerResult = await pool.query<ProviderRow>(
  `select distinct on (occurrence_id)
      occurrence_id,
      provider,
      features->>'recordKey' as record_key,
      features->>'version' as version,
      part_of_speech,
      features
   from morphology_records
   where provider='quranic-arabic-corpus'
     and occurrence_id = any($1::text[])
   order by occurrence_id, id`,
  [occurrences.map((occurrence) => occurrence.word.id)],
);
const providerByOccurrence = new Map(
  providerResult.rows.map((row) => [row.occurrence_id, providerEvidence(row)]),
);
for (const occurrence of occurrences)
  occurrence.provider = providerByOccurrence.get(occurrence.word.id);

const evidenceByRoot = new Map<string, RootCandidate[]>();
for (const occurrence of occurrences) {
  const root = rootKey(occurrence.lesson.root);
  const meaning =
    occurrence.word.gloss?.trim() || occurrence.lesson.meaning.trim();
  if (!root || !meaning) continue;
  const candidate: RootCandidate = {
    form: occurrence.word.arabic,
    meaning,
    evidence: occurrence.provider,
    occurrenceId: occurrence.word.id,
    surah: occurrence.pkg.surah.number,
    ayah: occurrence.ayah.number,
    position: occurrence.word.position,
  };
  evidenceByRoot.set(root, [...(evidenceByRoot.get(root) ?? []), candidate]);
}

const counts = {
  packages: packages.size,
  occurrences: occurrences.length,
  splitOccurrences: 0,
  lessonsReviewed: 0,
  full: 0,
  limited: 0,
  oldThree: 0,
  oldFour: 0,
  oldOther: 0,
  rowsBefore: 0,
  rowsAfter: 0,
  rowsRemovedAsSynthetic: 0,
  rowsAdded: 0,
};
const auditRecords: AuditRecord[] = [];

for (const { path: packagePath, pkg } of packages.values()) {
  const originalEntries = clone(pkg.teachingEntries);
  const originalWords = pkg.ayahs
    .flatMap((ayah) => ayah.words)
    .filter((word) => word.teachingId);
  const usesById = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences.filter(
    (item) => item.packagePath === packagePath,
  )) {
    usesById.set(occurrence.word.teachingId!, [
      ...(usesById.get(occurrence.word.teachingId!) ?? []),
      occurrence,
    ]);
  }

  for (const [teachingId, uses] of usesById) {
    const variants = new Set(
      uses.map(
        (use) => `${normalized(use.word.arabic)}\u0000${use.word.gloss ?? ""}`,
      ),
    );
    if (variants.size <= 1) continue;
    const original = pkg.teachingEntries[teachingId];
    if (!original) continue;
    delete pkg.teachingEntries[teachingId];
    for (const use of uses) {
      const occurrenceLessonId = `lesson:${pkg.surah.number}:${use.ayah.number}:${use.word.position}`;
      const next = clone(original);
      next.id = occurrenceLessonId;
      pkg.teachingEntries[occurrenceLessonId] = next;
      use.word.teachingId = occurrenceLessonId;
      counts.splitOccurrences += 1;
    }
  }

  const activeTeachingIds = new Set(
    pkg.ayahs.flatMap((ayah) =>
      ayah.words.map((word) => word.teachingId).filter(Boolean),
    ),
  );
  for (const teachingId of Object.keys(pkg.teachingEntries))
    if (!activeTeachingIds.has(teachingId))
      delete pkg.teachingEntries[teachingId];

  const packageOccurrences = pkg.ayahs.flatMap((ayah) =>
    ayah.words
      .filter((word) => word.teachingId && pkg.teachingEntries[word.teachingId])
      .map((word) => ({
        packagePath,
        pkg,
        ayah,
        word,
        lesson: pkg.teachingEntries[word.teachingId!],
        provider: providerByOccurrence.get(word.id),
      })),
  );

  for (const occurrence of packageOccurrences) {
    const lesson = occurrence.lesson;
    const beforeLesson = clone(
      originalEntries[occurrence.word.teachingId!] ?? lesson,
    );
    const before = {
      word:
        originalWords.find((word) => word.id === occurrence.word.id) ??
        occurrence.word,
      lesson: beforeLesson,
    };
    const root = rootKey(lesson.root);
    if (root) lesson.rootPicture = rootMeaningFor(lesson.root);
    lesson.meaning = occurrence.word.gloss?.trim() || lesson.meaning;

    const currentEvidence = occurrence.provider;
    const currentFeatures = featureText(currentEvidence);
    const currentDifference = currentFeatures
      ? `Current Qur'anic occurrence; ${currentFeatures}.`
      : "Current Qur'anic occurrence in this āyah; its exact vocalisation and context are primary.";
    const currentForm = occurrence.word.arabic;
    const candidates: SarfCandidate[] = [];

    for (const oldForm of lesson.forms ?? []) {
      if (
        !candidateIsSafe(oldForm, root) ||
        normalized(oldForm.form) === normalized(currentForm)
      )
        continue;
      candidates.push({
        form: oldForm.form,
        meaning: oldForm.meaning,
        difference: oldForm.difference,
        relationship:
          oldForm.relationship ??
          `Existing project-reviewed relationship to the ${root || "grammatical"} family.`,
        provenance:
          oldForm.provenance ??
          "Existing project-authored row retained only after Codex review against canonical evidence.",
        score: 90,
      });
    }

    for (const candidate of evidenceByRoot.get(root) ?? []) {
      if (
        normalized(candidate.form) === normalized(currentForm) ||
        !candidate.meaning.trim()
      )
        continue;
      const difference = differenceFor(currentForm, currentEvidence, candidate);
      const proposed: SarfCandidate = {
        form: candidate.form,
        meaning: candidate.meaning,
        difference,
        relationship: relationshipFor(lesson.root, candidate),
        provenance: provenanceFor(lesson.root, candidate),
        score: candidateScore(currentForm, currentEvidence, candidate),
      };
      if (candidateIsSafe(proposed, root)) candidates.push(proposed);
    }

    const dedupedCandidates = dedupeCandidates(candidates).sort(
      (left, right) => (right.score ?? 0) - (left.score ?? 0),
    );
    const reviewed = reviewSarfFamily({
      currentForm,
      currentMeaning: occurrence.word.gloss?.trim() || lesson.meaning,
      currentDifference,
      root: lesson.root,
      type: lessonTypeSignal(lesson, currentEvidence),
      candidates: dedupedCandidates,
      provenance: [
        `Canonical Qur'anic occurrence ${occurrence.word.id}.`,
        currentEvidence
          ? `Aligned ${currentEvidence.provider} morphology ${currentEvidence.version} (${currentEvidence.recordKey}).`
          : "No aligned provider morphology was available; the current occurrence was reviewed directly.",
      ],
      reviewedAt,
    });
    lesson.forms = reviewed.forms;
    lesson.sarfReview = reviewed.review;
    counts.lessonsReviewed += 1;
    counts.rowsBefore += (before.lesson.forms ?? []).length;
    counts.rowsAfter += lesson.forms.length;
    counts.rowsAdded += Math.max(
      0,
      lesson.forms.length - (before.lesson.forms ?? []).length,
    );
    counts.rowsRemovedAsSynthetic += (before.lesson.forms ?? []).filter(
      (form) => !candidateIsSafe(form, root),
    ).length;
    if (reviewed.review.status === "full") counts.full += 1;
    else counts.limited += 1;
    if ((before.lesson.forms ?? []).length === 3) counts.oldThree += 1;
    else if ((before.lesson.forms ?? []).length === 4) counts.oldFour += 1;
    else counts.oldOther += 1;

    const after = { word: occurrence.word, lesson };
    const sourceHash = hash(before);
    const contentHash = hash(after);
    auditRecords.push({
      recordId: `sarf-lesson-${occurrence.word.id.replaceAll(":", "-")}-${contentHash.slice(0, 12)}`,
      eventType: "lesson-sarf-reviewed",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        type: "lesson",
        packageId: pkg.packageId,
        surah: pkg.surah.number,
        ayah: occurrence.ayah.number,
        position: occurrence.word.position,
        occurrenceId: occurrence.word.id,
        teachingId: occurrence.word.teachingId,
      },
      status: reviewed.review.status === "full" ? "passed" : "passed-limited",
      sarfStatus: reviewed.review.status,
      reviewedAt,
      checks: [
        "current-quranic-form-first",
        "real-vocalised-arabic-forms",
        "form-specific-meanings-and-differences",
        "lexeme-root-relationship",
        "review-provenance",
        reviewed.review.status === "full"
          ? "five-form-family"
          : "reviewed-limited-family",
      ],
      evidence: [
        `source:${occurrence.word.id}`,
        `root:${lesson.root || "no-lexical-root"}`,
        `rows:${lesson.forms.length}`,
        ...reviewed.review.provenance,
      ],
      sourceHash,
      contentHash,
      contentChanged: sourceHash !== contentHash,
      limitedReason: reviewed.review.limitedReason,
    });
  }

  pkg.contentVersion = `${pkg.contentVersion.replace(/-sarf-[^\s]+$/u, "")}-sarf-1.1`;
  if (apply) {
    await fs.writeFile(
      packagePath,
      `${JSON.stringify(pkg, null, 2)}\n`,
      "utf8",
    );
    const manifestPath = path.join(path.dirname(packagePath), "manifest.json");
    try {
      const manifest = JSON.parse(
        await fs.readFile(manifestPath, "utf8"),
      ) as JsonObject;
      manifest.contentVersion = pkg.contentVersion;
      await fs.writeFile(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
    } catch {
      /* A package manifest is optional in older source-only folders. */
    }
  }
}

const finalContentHash = hash(
  [...packages.values()]
    .sort((left, right) =>
      left.pkg.packageId.localeCompare(right.pkg.packageId),
    )
    .map(({ pkg }) => ({
      packageId: pkg.packageId,
      contentVersion: pkg.contentVersion,
      teachingEntries: pkg.teachingEntries,
    })),
);
const batchRecord: AuditRecord = {
  recordId: `sarf-review-batch-${finalContentHash.slice(0, 20)}`,
  eventType: "sarf-contract-strengthened-and-content-reviewed",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  scope: {
    type: "repository-content",
    packages: counts.packages,
    occurrences: counts.occurrences,
    description:
      "All existing custom teaching packages reviewed against the five-form or reviewed-limited Ṣarf contract.",
  },
  status: "passed",
  reviewedAt,
  checks: [
    "contract-version-bumped-and-history-preserved",
    "old-three-form-rule-removed",
    "all-custom-occurrences-reviewed",
    "full-and-limited-statuses-recorded",
    "append-only-lesson-audit-records-written",
  ],
  evidence: [
    "docs/content-authoring/quranic-word-tree-contract.json",
    "scripts/lib/sarf-authoring.ts",
    `custom-lessons-reviewed:${counts.lessonsReviewed}`,
    `full-families:${counts.full}`,
    `limited-families:${counts.limited}`,
  ],
  contentChanged: true,
  counts,
};

if (apply) {
  const existingIds = new Set(
    readAuditRecords().map((record) => record.recordId),
  );
  const pending = [...auditRecords, batchRecord].filter(
    (record) => !existingIds.has(record.recordId),
  );
  if (pending.length) appendAuditRecords(pending);
}

console.log(
  JSON.stringify(
    {
      status: apply ? "applied" : "dry-run",
      contractVersion: contract.contractVersion,
      ...counts,
      auditRecords: auditRecords.length + 1,
      batchRecordId: batchRecord.recordId,
    },
    null,
    2,
  ),
);

await pool.end();
