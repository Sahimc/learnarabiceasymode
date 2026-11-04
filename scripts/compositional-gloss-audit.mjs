import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { query, pool } from "./lib/db.ts";
import { assertAuthoringContract } from "./lib/authoring-contract.mjs";

assertAuthoringContract("compositional gloss audit");

const root = process.cwd();
const sourcePath = path.join(root, "content-import/sources/tanzil/quran-uthmani.txt");
const packageRoot = path.join(root, "content-import/surahs");
const outputRoot = path.join(root, "artifacts/compositional-gloss-audit-2026-10");
const [sourceRaw, directories] = await Promise.all([
  fs.readFile(sourcePath, "utf8"),
  fs.readdir(packageRoot, { withFileTypes: true }),
]);
const sourceRows = new Map(
  sourceRaw.split(/\r?\n/u).filter((line) => line.includes("|")).map((line) => {
    const [surah, ayah, arabic] = line.split("|");
    return [`${Number(surah)}:${Number(ayah)}`, arabic.trim()];
  }),
);
const packageFiles = [];
for (const directory of directories.filter((entry) => entry.isDirectory())) {
  const file = path.join(packageRoot, directory.name, "surah.json");
  try { await fs.access(file); packageFiles.push(file); } catch { /* empty generated directory */ }
}
packageFiles.sort((left, right) => left.localeCompare(right));
const packages = [];
for (const file of packageFiles) {
  const raw = await fs.readFile(file, "utf8");
  packages.push({ file, raw, hash: sha256(raw), data: JSON.parse(raw) });
}
packages.sort((left, right) => left.data.surah.number - right.data.surah.number);

const dbRowsResult = await query(`
  select s.number as surah_number, a.number as ayah_number, a.id as ayah_id,
         a.arabic as ayah_arabic, a.translation as ayah_translation,
         certified_translation.text as certified_translation,
         wo.id as occurrence_id, wo.position, wo.arabic, wo.transliteration,
         wo.gloss, wo.status, wo.shared_teaching_id, wo.occurrence_role,
         wo.source_refs,
         mr.provider as morphology_provider, mr.part_of_speech,
         mr.root_id as morphology_root_id, mr.lemma_id as morphology_lemma_id,
         mr.features as morphology_features, mr.segmentation as morphology_segmentation,
         mr.syntax as morphology_syntax
  from word_occurrences wo
  join surahs s on s.id = wo.surah_id
  join ayahs a on a.id = wo.ayah_id
  left join lateral (
    select t.text from translations t
    where t.scope_type = 'ayah' and t.scope_id = a.id
      and t.provider = 'Tanzil translation repository'
      and t.version = 'tanzil-en.sahih'
    order by t.id limit 1
  ) certified_translation on true
  left join morphology_records mr
    on mr.occurrence_id = wo.id and mr.provider = 'quranic-arabic-corpus'
  order by s.number, a.number, wo.position
`);
const allMorphologyResult = await query(`
  select occurrence_id, provider, part_of_speech, root_id, lemma_id,
         features, segmentation, syntax
  from morphology_records order by occurrence_id, provider
`);
const breakdownRowsResult = await query(`
  select wb.id, wb.mode, wb.source_text, wb.teaching_entry_id, wb.word_occurrence_id,
         p.stable_part_id, p.part_order, p.source_text as part_source_text,
         p.display_text, p.label, p.meaning, p.kind, p.root_status,
         p.root, p.root_explanation
  from word_breakdowns wb
  left join word_breakdown_parts p on p.breakdown_id = wb.id
  order by wb.id, p.part_order
`);
const teachingRowsResult = await query("select * from teaching_word_entries");
const packageRowsResult = await query("select id, checksum, content_version, status from content_packages");

const dbWords = new Map();
for (const row of dbRowsResult.rows) {
  const key = row.occurrence_id;
  const existing = dbWords.get(key);
  if (existing) throw new Error(`Duplicate runtime word row: ${key}`);
  dbWords.set(key, row);
}
const morphologyByOccurrence = new Map();
for (const row of allMorphologyResult.rows) {
  const rows = morphologyByOccurrence.get(row.occurrence_id) ?? [];
  rows.push({
    provider: row.provider,
    partOfSpeech: row.part_of_speech ?? null,
    rootId: row.root_id ?? null,
    lemmaId: row.lemma_id ?? null,
    features: row.features ?? null,
    segmentation: row.segmentation ?? null,
    syntax: row.syntax ?? null,
  });
  morphologyByOccurrence.set(row.occurrence_id, rows);
}
const breakdownRows = new Map();
for (const row of breakdownRowsResult.rows) {
  let breakdown = breakdownRows.get(row.id);
  if (!breakdown) {
    breakdown = {
      id: row.id,
      mode: row.mode,
      sourceText: row.source_text,
      teachingEntryId: row.teaching_entry_id ?? null,
      occurrenceId: row.word_occurrence_id ?? null,
      parts: [],
    };
    breakdownRows.set(row.id, breakdown);
  }
  if (row.part_order !== null) breakdown.parts.push({
    id: row.stable_part_id,
    order: row.part_order,
    sourceText: row.part_source_text,
    displayText: row.display_text,
    label: row.label,
    meaning: row.meaning,
    kind: row.kind,
    rootStatus: row.root_status ?? null,
    root: row.root ?? null,
    rootExplanation: row.root_explanation ?? null,
  });
}
const runtimeBreakdownByOccurrence = new Map();
const runtimeBreakdownByTeaching = new Map();
for (const breakdown of breakdownRows.values()) {
  if (breakdown.occurrenceId) runtimeBreakdownByOccurrence.set(breakdown.occurrenceId, breakdown);
  if (breakdown.teachingEntryId) runtimeBreakdownByTeaching.set(breakdown.teachingEntryId, breakdown);
}
const teachingEntries = new Map(teachingRowsResult.rows.map((row) => [row.id, {
  id: row.id,
  meaning: row.meaning,
  type: row.type,
  root: row.root,
  rootPicture: row.root_picture,
  construction: row.construction,
  components: row.components,
  grammar: row.grammar,
  sentenceRole: row.sentence_role,
  recognitionClue: row.recognition_clue,
  forms: row.forms,
  takeaway: row.takeaway,
}]));
const dbPackages = new Map(packageRowsResult.rows.map((row) => [row.id, row]));
const canonicalPositionByOccurrence = new Map();
const alignmentAyahs = [];
let canonicalTextTokenCount = 0;
let standaloneStopTokensRemoved = 0;
let basmalaTokensRemoved = 0;
const alignmentErrors = [];

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function foldArabic(value) {
  return value.normalize("NFD")
    .replace(/\u0670/gu, "ا")
    .replace(/[\u0640\u064B-\u065F\u06D6-\u06ED\p{M}]/gu, "")
    .normalize("NFC")
    .replace(/[ٱآأإٲٳ]/gu, "ا")
    .replace(/ى/gu, "ي");
}
function parseBreakdown(value) {
  if (!value) return null;
  return {
    id: value.id ?? null,
    mode: value.mode,
    sourceText: value.sourceText,
    parts: (value.parts ?? []).map((part) => ({
      id: part.id ?? null,
      order: part.order,
      sourceText: part.sourceText,
      displayText: part.displayText,
      label: part.label,
      meaning: part.meaning,
      kind: part.kind,
      rootStatus: part.rootStatus ?? null,
      root: part.root ?? null,
      rootExplanation: part.rootExplanation ?? null,
    })),
  };
}
function morphologyForAudit(row) {
  if (!row) return null;
  const details = row.features ?? {};
  return {
    provider: row.provider,
    partOfSpeech: row.partOfSpeech ?? null,
    rootId: row.rootId ?? null,
    lemmaId: row.lemmaId ?? null,
    recordKey: details.recordKey ?? null,
    version: details.version ?? null,
    sourceText: details.sourceText ?? null,
    lemma: details.lemma ?? null,
    root: details.root ?? null,
    pattern: details.pattern ?? null,
    features: details.features ?? [],
    segmentation: row.segmentation ?? details.segmentation ?? null,
    formation: details.formation ?? null,
    syntax: row.syntax ?? null,
  };
}
function lessonForAudit(lesson) {
  if (!lesson) return null;
  return {
    id: lesson.id,
    meaning: lesson.meaning,
    type: lesson.type,
    root: lesson.root,
    rootPicture: lesson.rootPicture,
    construction: lesson.construction,
    components: lesson.components,
    grammar: lesson.grammar,
    sentenceRole: lesson.sentenceRole,
    recognitionClue: lesson.recognitionClue,
  };
}

for (const { data: pkg } of packages) {
  const seenAyahs = new Set();
  for (const ayah of pkg.ayahs) {
    const key = `${pkg.surah.number}:${ayah.number}`;
    if (seenAyahs.has(ayah.number)) alignmentErrors.push(`${key}: duplicate package ayah`);
    seenAyahs.add(ayah.number);
    const sourceText = sourceRows.get(key);
    if (sourceText === undefined) {
      alignmentErrors.push(`${key}: missing canonical Tanzil row`);
      continue;
    }
    let sourceTokens = sourceText.split(/\s+/u).filter(Boolean);
    const originalSourceTokenCount = sourceTokens.length;
    sourceTokens = sourceTokens.filter((token) => {
      if (/^[\u06D6-\u06ED]+$/u.test(token)) { standaloneStopTokensRemoved += 1; return false; }
      return true;
    });
    const removedStops = originalSourceTokenCount - sourceTokens.length;
    if (ayah.number === 1 && ![1, 9].includes(pkg.surah.number)) {
      const basmala = ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"];
      if (sourceTokens.length < 5 || basmala.some((token, index) => foldArabic(sourceTokens[index]) !== foldArabic(token))) {
        alignmentErrors.push(`${key}: canonical basmalah prefix not verified`);
      } else {
        sourceTokens = sourceTokens.slice(4);
        basmalaTokensRemoved += 4;
      }
    }
    const visibleTokens = ayah.arabic.trim().split(/\s+/u).filter(Boolean);
    if (sourceTokens.length !== visibleTokens.length || sourceTokens.some((token, index) => foldArabic(token) !== foldArabic(visibleTokens[index] ?? ""))) {
      alignmentErrors.push(`${key}: visible ayah text does not align with canonical Tanzil after contract boundary rules`);
    }
    const words = [...ayah.words].sort((a, b) => a.position - b.position);
    const exception = pkg.surah.number === 109 && ayah.number === 1;
    const sourcePositionMap = exception ? [1, 2, 2, 3] : words.map((_, index) => index + 1);
    const alignmentKind = exception ? ["ONE_TO_ONE", "ONE_TO_MANY_SPLIT", "ONE_TO_MANY_SPLIT", "ONE_TO_ONE"] : words.map(() => "ONE_TO_ONE");
    if (sourcePositionMap.length !== words.length) alignmentErrors.push(`${key}: crosswalk length mismatch`);
    if (!exception && sourceTokens.length !== words.length) alignmentErrors.push(`${key}: canonical source token count ${sourceTokens.length} differs from package occurrence count ${words.length}`);
    if (exception && !(words.length === 4 && foldArabic(words[0]?.arabic ?? "") === foldArabic("قُلْ") && foldArabic(words[1]?.arabic ?? "") === foldArabic("يَا") && foldArabic(words[2]?.arabic ?? "") === foldArabic("أَيُّهَا") && foldArabic(words[3]?.arabic ?? "") === foldArabic("الْكَافِرُونَ") && sourceTokens.length === 3)) {
      alignmentErrors.push(`${key}: canonical split exception does not match the recorded occurrence forms`);
    }
    const wordLinks = [];
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      const sourcePosition = sourcePositionMap[index];
      const canonicalSourceText = sourceTokens[sourcePosition - 1];
      const structurallyValid = word.position === index + 1 && word.id === `word:${pkg.surah.number}:${ayah.number}:${index + 1}`;
      if (!structurallyValid) alignmentErrors.push(`${word.id ?? key}: position or stable ID mismatch at ordered index ${index + 1}`);
      if (!exception && foldArabic(word.arabic) !== foldArabic(canonicalSourceText ?? "")) alignmentErrors.push(`${word.id}: word surface differs from canonical source token ${sourcePosition}`);
      canonicalPositionByOccurrence.set(word.id, {
        repositoryPosition: word.position,
        canonicalSourceTokenPosition: sourcePosition,
        canonicalSourceTokenText: canonicalSourceText,
        mapping: alignmentKind[index],
      });
      wordLinks.push({ occurrenceId: word.id, repositoryPosition: word.position, canonicalSourceTokenPosition: sourcePosition, canonicalSourceTokenText: canonicalSourceText, mapping: alignmentKind[index] });
    }
    canonicalTextTokenCount += sourceTokens.length;
    alignmentAyahs.push({ surah: pkg.surah.number, ayah: ayah.number, sourceStopSignsExcluded: removedStops, canonicalSourceTokenCount: sourceTokens.length, packageOccurrenceCount: words.length, links: wordLinks });
  }
}
if (sourceRows.size !== 6236) alignmentErrors.push(`canonical source row count is ${sourceRows.size}, expected 6236`);
if (alignmentErrors.length) {
  console.error(JSON.stringify({ alignmentErrorCount: alignmentErrors.length, examples: alignmentErrors.slice(0, 30) }, null, 2));
  await pool.end();
  process.exit(1);
}

const decisionPath = path.join(outputRoot, "review-decisions.jsonl");
let decisionRows = [];
try { decisionRows = (await fs.readFile(decisionPath, "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); } catch { /* first checkpoint */ }
const decisionsByOccurrence = new Map();
for (const decision of decisionRows) decisionsByOccurrence.set(decision.occurrenceId, decision);
const ledgerRows = [];
const packageMismatches = [];
const dbOccurrenceIds = new Set(dbWords.keys());
let totalWords = 0;
let segmentedRelevant = 0;
let notApplicable = 0;
let packageChecksumMatches = 0;
let packageChecksumMismatches = 0;
let morphologyQacPresent = 0;
let runtimeWordBreakdownsPresent = 0;
let runtimeVsPackageBreakdownMismatches = 0;
let packageVsRuntimeLessonMismatches = 0;
let packageVsRuntimeAyahTextMismatches = 0;
let packageVsCertifiedTranslationMismatches = 0;
const perSurah = new Map();
const packageChecksumMismatchIds = [];
const lessonMismatchExamples = [];
const ayahTextMismatchExamples = [];
const certifiedTranslationMismatchExamples = [];

for (const packageInfo of packages) {
  const pkg = packageInfo.data;
  const contentPackage = dbPackages.get(pkg.packageId);
  const currentChecksum = contentPackage?.checksum ?? null;
  if (currentChecksum && currentChecksum === packageInfo.hash) packageChecksumMatches += 1;
  else {
    packageChecksumMismatches += 1;
    packageChecksumMismatchIds.push({
      packageId: pkg.packageId,
      surah: pkg.surah.number,
      databaseChecksum: currentChecksum,
      packageChecksum: packageInfo.hash,
      databaseContentVersion: contentPackage?.content_version ?? null,
      packageContentVersion: pkg.contentVersion,
    });
  }
  const pkgSummary = perSurah.get(pkg.surah.number) ?? { surah: pkg.surah.number, ayahs: 0, occurrences: 0, segmented: 0, notApplicable: 0 };
  for (const ayah of pkg.ayahs) {
    pkgSummary.ayahs += 1;
    const orderedWords = [...ayah.words].sort((a, b) => a.position - b.position);
    for (const word of orderedWords) {
      totalWords += 1;
      pkgSummary.occurrences += 1;
      const lesson = word.teachingId ? pkg.teachingEntries?.[word.teachingId] ?? null : null;
      const packageBreakdown = parseBreakdown(word.breakdownOverride ?? word.breakdown ?? lesson?.breakdown);
      const dbWord = dbWords.get(word.id) ?? null;
      const dbMorphology = morphologyByOccurrence.get(word.id) ?? [];
      const qacMorphology = dbMorphology.find((item) => item.provider === "quranic-arabic-corpus") ?? null;
      const runtimeMorphology = dbMorphology.at(-1) ?? null;
      const dbBreakdown = runtimeBreakdownByOccurrence.get(word.id) ?? (word.teachingId ? runtimeBreakdownByTeaching.get(word.teachingId) : null) ?? null;
      const runtimeBreakdown = parseBreakdown(dbBreakdown);
      const runtimeLesson = word.teachingId ? teachingEntries.get(word.teachingId) ?? null : null;
      if (word.teachingId) {
        const lessonFields = ["meaning", "type", "root", "rootPicture", "construction", "components", "grammar", "sentenceRole", "recognitionClue", "forms", "takeaway"];
        const differences = !runtimeLesson
          ? ["missing-runtime-lesson"]
          : lessonFields.filter((field) => stableJson(runtimeLesson[field] ?? null) !== stableJson(lesson[field] ?? null));
        if (differences.length) {
          packageVsRuntimeLessonMismatches += 1;
          if (lessonMismatchExamples.length < 40) lessonMismatchExamples.push({ occurrenceId: word.id, teachingId: word.teachingId, fields: differences });
        }
      }
      if (dbWord && dbWord.ayah_arabic !== ayah.arabic) {
        packageVsRuntimeAyahTextMismatches += 1;
        if (ayahTextMismatchExamples.length < 20) ayahTextMismatchExamples.push({ occurrenceId: word.id, package: ayah.arabic, database: dbWord.ayah_arabic });
      }
      if (dbWord?.certified_translation && dbWord.certified_translation !== ayah.translation) {
        packageVsCertifiedTranslationMismatches += 1;
        if (certifiedTranslationMismatchExamples.length < 20) certifiedTranslationMismatchExamples.push({ occurrenceId: word.id, ayah: String(pkg.surah.number) + ":" + String(ayah.number), package: ayah.translation, databaseCertified: dbWord.certified_translation });
      }
      const formation = runtimeMorphology?.features?.formation ?? qacMorphology?.features?.formation ?? null;
      const displayedFormation = Array.isArray(formation) && formation.length > 1 ? formation : null;
      const relevantLayers = [];
      if (packageBreakdown?.mode === "segmented" || (packageBreakdown?.parts?.length ?? 0) > 1) relevantLayers.push("package-word-breakdown");
      if (runtimeBreakdown?.mode === "segmented" || (runtimeBreakdown?.parts?.length ?? 0) > 1) relevantLayers.push("runtime-word-breakdown");
      if (displayedFormation) relevantLayers.push("runtime-deeper-formation");
      const relevant = relevantLayers.length > 0;
      if (relevant) { segmentedRelevant += 1; pkgSummary.segmented += 1; } else { notApplicable += 1; pkgSummary.notApplicable += 1; }
      if (qacMorphology) morphologyQacPresent += 1;
      if (runtimeBreakdown) runtimeWordBreakdownsPresent += 1;
      if (runtimeBreakdown && JSON.stringify(runtimeBreakdown) !== JSON.stringify(packageBreakdown)) runtimeVsPackageBreakdownMismatches += 1;
      if (!dbWord) packageMismatches.push(`${word.id}: absent from runtime word_occurrences`);
      else if (dbWord.position !== word.position || dbWord.arabic !== word.arabic || (dbWord.gloss ?? "") !== (word.gloss ?? "") || dbWord.shared_teaching_id !== (word.teachingId ?? null)) packageMismatches.push(`${word.id}: runtime occurrence differs from package`);
      const sourcePosition = canonicalPositionByOccurrence.get(word.id);
      const packageLessonCore = lessonForAudit(lesson);
      const runtimeLessonCore = lessonForAudit(runtimeLesson);
      const packageLessonIsSameAsRuntime = stableJson(packageLessonCore) === stableJson(runtimeLessonCore);
      const packageBreakdownIsSameAsRuntime = stableJson(packageBreakdown) === stableJson(runtimeBreakdown);
      const morphologySnapshot = {
        runtimeProvider: runtimeMorphology?.provider ?? null,
        providersPresent: dbMorphology.map((item) => item.provider),
        qac: morphologyForAudit(qacMorphology),
      };
      const currentSnapshot = {
        occurrenceId: word.id,
        repositoryPosition: word.position,
        surface: word.arabic,
        wholeWordGloss: word.gloss ?? "",
        packageBreakdown,
        runtimeBreakdown,
        morphologySnapshot,
        packageLessonCore,
        runtimeLessonCore,
        packageChecksum: packageInfo.hash,
        contextAyah: ayah.arabic,
        contextTranslation: dbWord?.certified_translation ?? ayah.translation ?? "",
      };
      const snapshotHash = sha256(JSON.stringify(currentSnapshot));
      const decision = decisionsByOccurrence.get(word.id);
      const validDecision = decision && decision.snapshotHash === snapshotHash;
      let auditState;
      let changeNeeded;
      let comment;
      if (!relevant) {
        auditState = "NOT-APPLICABLE";
        changeNeeded = "No";
        const details = [
          runtimeBreakdown ? `runtime breakdown is ${runtimeBreakdown.mode} with ${runtimeBreakdown.parts.length} part` : "no runtime word breakdown",
          packageBreakdown ? `package breakdown is ${packageBreakdown.mode} with ${packageBreakdown.parts.length} part` : "no package word breakdown",
          displayedFormation ? "no multi-part formation is displayed" : "no multi-part deeper formation is displayed",
        ];
        comment = `NO-RELEVANT-SEGMENTATION: ${details.join("; ")}. The complete word remains intact, so a compositional segment-gloss decision does not apply.`;
      } else if (validDecision) {
        auditState = decision.auditState;
        changeNeeded = decision.changeNeeded;
        comment = decision.comment;
      } else {
        auditState = decision ? "STALE-DECISION" : "PENDING";
        changeNeeded = "Pending";
        const labels = [
          ...(runtimeBreakdown?.parts ?? []).map((part) => part.label),
          ...(displayedFormation ?? []).map((part) => part.label ?? part.meaning ?? ""),
        ].filter(Boolean);
        comment = `Occurrence-level linguistic review pending. ${relevantLayers.join(" + ")} currently displays ${labels.length} component gloss(es): ${JSON.stringify(labels)}; whole-word gloss: ${JSON.stringify(word.gloss ?? "")}. No change decision has been assigned.`;
      }
      const runtimeSnapshotMatchesPackage = Boolean(dbWord && dbWord.position === word.position && dbWord.arabic === word.arabic && (dbWord.gloss ?? "") === (word.gloss ?? ""));
      const row = {
        surah: pkg.surah.number,
        surahName: pkg.surah.transliteration,
        ayah: ayah.number,
        wordPosition: word.position,
        occurrenceId: word.id,
        canonicalSourcePosition: sourcePosition,
        canonicalAyahText: ayah.arabic,
        canonicalSourceRawAyah: ayah.sourceRawArabic ?? null,
        canonicalSourceRow: sourceRows.get(`${pkg.surah.number}:${ayah.number}`),
        packageAyahTranslation: ayah.translation ?? "",
        runtimeCertifiedTranslation: dbWord?.certified_translation ?? null,
        currentWholeWord: {
          surface: word.arabic,
          transliteration: word.transliteration ?? "",
          englishGloss: word.gloss ?? "",
          occurrenceRole: word.occurrenceRole ?? null,
        },
        currentDisplayedBreakdown: runtimeBreakdown,
        packageBreakdownIsSameAsRuntime,
        ...(packageBreakdownIsSameAsRuntime ? {} : { currentPackageBreakdown: packageBreakdown }),
        relevantDisplayedLayers: relevantLayers,
        morphology: morphologySnapshot,
        currentRuntimeLesson: runtimeLessonCore,
        packageLessonIsSameAsRuntime,
        ...(packageLessonIsSameAsRuntime ? {} : { currentPackageLesson: packageLessonCore }),
        provenance: {
          packagePath: path.relative(root, packageInfo.file).replaceAll(path.sep, "/"),
          packageVersion: pkg.contentVersion,
          packageChecksumSha256: packageInfo.hash,
          databasePackageId: pkg.packageId,
          databasePackageChecksum: currentChecksum,
          sourceReferences: word.sourceReferences ?? [],
          runtimeWordRowPresent: Boolean(dbWord),
          runtimeOccurrenceMatchesPackage: runtimeSnapshotMatchesPackage,
          morphologyProvidersPresent: dbMorphology.map((item) => item.provider),
        },
        currentSnapshotHash: snapshotHash,
        auditState,
        changeNeeded,
        comment,
      };
      ledgerRows.push(row);
    }
  }
  perSurah.set(pkg.surah.number, pkgSummary);
}

const rowsWithRuntime = [...dbWords.keys()];
const packageOccurrenceIds = new Set(ledgerRows.map((row) => row.occurrenceId));
const dbOnly = rowsWithRuntime.filter((id) => !packageOccurrenceIds.has(id));
const packageOnly = [...packageOccurrenceIds].filter((id) => !dbOccurrenceIds.has(id));
const classCounts = {};
for (const row of ledgerRows) classCounts[row.auditState] = (classCounts[row.auditState] ?? 0) + 1;
const manifest = {
  generatedAt: new Date().toISOString(),
  contractVersion: "1.3.9",
  sources: {
    canonicalArabic: "content-import/sources/tanzil/quran-uthmani.txt",
    canonicalArabicVersion: "1.1",
    wordOccurrenceInventory: "content-import/surahs/*/surah.json and current runtime database",
    morphology: "quranic-arabic-corpus rows in morphology_records, plus other stored providers",
    currentDisplay: "word_breakdowns/word_breakdown_parts resolved the same way as app/data/db-lesson-service.ts",
  },
  coverage: {
    packageFiles: packages.length,
    uniqueSurahs: new Set(packages.map((item) => item.data.surah.number)).size,
    canonicalAyahs: sourceRows.size,
    packageAyahs: packages.reduce((sum, item) => sum + item.data.ayahs.length, 0),
    canonicalSourceTextTokensAfterContractBoundaries: canonicalTextTokenCount,
    packageWordOccurrences: totalWords,
    oneToManyTokenSplitOccurrences: 1,
    occurrenceRows: ledgerRows.length,
    relevantSegmentedOccurrences: segmentedRelevant,
    notApplicableOccurrences: notApplicable,
    pendingRelevantOccurrences: ledgerRows.filter((row) => row.auditState === "PENDING").length,
    staleDecisions: ledgerRows.filter((row) => row.auditState === "STALE-DECISION").length,
    classificationCounts: classCounts,
    occurrenceLedgerReconciles: totalWords === ledgerRows.length,
  },
  canonicalAlignment: {
    comparisonNormalization: "For position checks only: NFC/NFD, remove tatweel, short-vowel/tanwin/shadda and Qur'anic stop marks; map dagger alif to alif, alif wasla variants to plain alif, and alif maqsurah to ya. Stored source text is never rewritten.",
    standAloneWaqfTokensExcluded: standaloneStopTokensRemoved,
    basmalahWordsExcludedFromVisibleAyahs: basmalaTokensRemoved,
    sourceTextTokenCount: canonicalTextTokenCount,
    packageOccurrenceCount: totalWords,
    explicitCrosswalk: {
      "109:1": {
        reason: "Tanzil writes يَـٰٓأَيُّهَا as one Uthmani text token; this repository stores separate occurrence IDs for the vocative particle يَا and pronoun form أَيُّهَا. QAC morphology rows also distinguish word positions 2 and 3.",
        mapping: ["word:109:1:1 -> source token 1", "word:109:1:2 -> source token 2 (first component)", "word:109:1:3 -> source token 2 (second component)", "word:109:1:4 -> source token 3"],
      },
    },
    alignmentErrorCount: alignmentErrors.length,
  },
  runtimeDatabase: {
    wordOccurrenceRows: dbWords.size,
    qacMorphologyRowsMatched: morphologyQacPresent,
    allMorphologyRows: allMorphologyResult.rows.length,
    runtimeBreakdownsResolved: runtimeWordBreakdownsPresent,
    packageVsRuntimeBreakdownDifferences: runtimeVsPackageBreakdownMismatches,
    packageVsRuntimeLessonDifferences: packageVsRuntimeLessonMismatches,
    packageVsRuntimeAyahTextDifferences: packageVsRuntimeAyahTextMismatches,
    packageVsCertifiedTranslationDifferences: packageVsCertifiedTranslationMismatches,
    packageChecksumMatches: packageChecksumMatches,
    packageChecksumMismatches: packageChecksumMismatches,
    packageChecksumMismatchIds,
    packageOccurrenceDifferences: packageMismatches.length,
    packageOnlyOccurrences: packageOnly.length,
    databaseOnlyOccurrences: dbOnly.length,
    packageOccurrenceDifferenceExamples: packageMismatches.slice(0, 30),
    packageOnlyExamples: packageOnly.slice(0, 20),
    databaseOnlyExamples: dbOnly.slice(0, 20),
    packageVsRuntimeLessonDifferenceExamples: lessonMismatchExamples,
    packageVsRuntimeAyahTextDifferenceExamples: ayahTextMismatchExamples,
    packageVsCertifiedTranslationDifferenceExamples: certifiedTranslationMismatchExamples,
  },
  perSurah: [...perSurah.values()].sort((a, b) => a.surah - b.surah),
};

const requestedWrite = process.argv.includes("--write");
if (!requestedWrite) {
  console.log(JSON.stringify(manifest, null, 2));
  await pool.end();
  process.exit(alignmentErrors.length ? 1 : 0);
}
if (alignmentErrors.length) {
  console.error(JSON.stringify(alignmentErrors.slice(0, 50), null, 2));
  await pool.end();
  process.exit(1);
}
await fs.mkdir(outputRoot, { recursive: true });
const ledgerPath = path.join(outputRoot, "coverage-ledger.jsonl");
const alignmentPath = path.join(outputRoot, "canonical-alignment.json");
const manifestPath = path.join(outputRoot, "coverage-manifest.json");
const ledgerHandle = await fs.open(ledgerPath, "w");
for (let start = 0; start < ledgerRows.length; start += 500) {
  const batch = ledgerRows.slice(start, start + 500).map((row) => JSON.stringify(row)).join("\n") + "\n";
  await ledgerHandle.writeFile(batch, "utf8");
}
await ledgerHandle.close();
await fs.writeFile(alignmentPath, `${JSON.stringify({ ...manifest.canonicalAlignment, ayahs: alignmentAyahs }, null, 2)}\n`, "utf8");
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ledgerPath: path.relative(root, ledgerPath), ledgerRows: ledgerRows.length, manifest: manifest.coverage, runtimeDatabase: manifest.runtimeDatabase, canonicalAlignment: manifest.canonicalAlignment }, null, 2));
await pool.end();
