/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPool } from "../../db";
import type {
  Ayah,
  LessonComponent,
  LessonForm,
  SarfReview,
  Surah,
  WordBreakdown,
  WordLesson,
  WordOccurrence,
} from "./fixtures";
import type { MorphologyAnalysis } from "./morphology";

type DbRow = Record<string, any>;

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

function rowToBreakdown(
  row: DbRow | undefined,
  partsByBreakdown: Map<string, DbRow[]>,
): WordBreakdown | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    mode: row.mode,
    sourceText: row.source_text,
    parts: (partsByBreakdown.get(row.id) ?? [])
      .sort((a, b) => a.part_order - b.part_order)
      .map((part) => ({
        id: part.stable_part_id,
        order: part.part_order,
        sourceText: part.source_text,
        displayText: part.display_text,
        label: part.label,
        meaning: part.meaning,
        rootStatus: part.root_status ?? undefined,
        root: part.root ?? undefined,
        rootExplanation: part.root_explanation ?? undefined,
        kind: part.kind,
      })),
  };
}

function rowToLesson(
  row: DbRow | undefined,
  breakdown: WordBreakdown | undefined,
): WordLesson | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    meaning: row.meaning,
    type: row.type,
    root: row.root,
    rootPicture: row.root_picture,
    construction: row.construction,
    components: parseJson<LessonComponent[]>(row.components, []),
    breakdown,
    grammar: row.grammar,
    sentenceRole: row.sentence_role,
    recognitionClue: row.recognition_clue,
    forms: parseJson<LessonForm[]>(row.forms, []),
    sarfReview: parseJson<SarfReview>(row.sarf_review, {
      status: "limited",
      limitedReason:
        "This database row predates the reviewed five-form Ṣarf contract and must be re-imported.",
      provenance: [
        "Legacy database row; re-import required for current contract.",
      ],
      reviewedBy: "Codex",
      reviewedAt: "legacy",
    }),
    takeaway: row.takeaway,
  };
}

function requiresSarfReview(lesson: WordLesson | undefined) {
  if (!lesson) return false;
  return [
    ...lesson.sarfReview.provenance,
    lesson.sarfReview.reviewedBy,
    lesson.sarfReview.reviewedAt,
  ].some((value) =>
    /legacy database row|re-import required|unreviewed|placeholder|pending review/iu.test(
      value,
    ),
  );
}

let runtimeCache: Surah[] | undefined;
let runtimeCachePromise: Promise<Surah[]> | undefined;

async function loadRuntimeSurahs(): Promise<Surah[]> {
  const pool = getPool();
  const [
    surahsResult,
    ayahsResult,
    wordsResult,
    lessonsResult,
    breakdownsResult,
    partsResult,
    morphologyResult,
  ] = await Promise.all([
    pool.query("select * from surahs order by number"),
    pool.query(`
      select a.*, certified_translation.text as certified_translation
      from ayahs a
      left join lateral (
        select t.text
        from translations t
        where t.scope_type = 'ayah'
          and t.scope_id = a.id
          and t.provider = 'Tanzil translation repository'
          and t.version = 'tanzil-en.sahih'
        order by t.id
        limit 1
      ) certified_translation on true
      order by a.surah_id, a.number
    `),
    pool.query("select * from word_occurrences order by ayah_id, position"),
    pool.query("select * from teaching_word_entries"),
    pool.query("select * from word_breakdowns"),
    pool.query(
      "select * from word_breakdown_parts order by breakdown_id, part_order",
    ),
    pool.query("select * from morphology_records order by occurrence_id"),
  ]);

  const lessonRows = new Map<string, DbRow>(
    lessonsResult.rows.map((row) => [row.id, row]),
  );
  const breakdownRows = new Map<string, DbRow>(
    breakdownsResult.rows.map((row) => [row.id, row]),
  );
  const partsByBreakdown = new Map<string, DbRow[]>();
  for (const row of partsResult.rows) {
    const list = partsByBreakdown.get(row.breakdown_id) ?? [];
    list.push(row);
    partsByBreakdown.set(row.breakdown_id, list);
  }
  const sharedBreakdowns = new Map<string, WordBreakdown>();
  const occurrenceBreakdowns = new Map<string, WordBreakdown>();
  for (const row of breakdownRows.values()) {
    const breakdown = rowToBreakdown(row, partsByBreakdown);
    if (!breakdown) continue;
    if (row.word_occurrence_id)
      occurrenceBreakdowns.set(row.word_occurrence_id, breakdown);
    if (row.teaching_entry_id)
      sharedBreakdowns.set(row.teaching_entry_id, breakdown);
  }
  const morphologyByOccurrence = new Map<string, MorphologyAnalysis>();
  for (const row of morphologyResult.rows) {
    const details = parseJson<{
      recordKey?: string;
      version?: string;
      sourceText?: string;
      lemma?: string;
      root?: string;
      pattern?: string;
      features?: MorphologyAnalysis["features"];
      segmentation?: MorphologyAnalysis["segmentation"];
      formation?: MorphologyAnalysis["formation"];
    }>(row.features, {});
    morphologyByOccurrence.set(row.occurrence_id, {
      id: row.id,
      provider: row.provider,
      recordKey: details.recordKey ?? row.occurrence_id,
      version: details.version ?? "unknown",
      sourceText: details.sourceText ?? "",
      lemma: details.lemma,
      root: details.root,
      pattern: details.pattern,
      partOfSpeech: row.part_of_speech,
      features: details.features ?? [],
      segmentation: details.segmentation,
      formation: details.formation,
    });
  }

  const wordsByAyah = new Map<string, WordOccurrence[]>();
  for (const row of wordsResult.rows) {
    const breakdown =
      occurrenceBreakdowns.get(row.id) ??
      (row.shared_teaching_id
        ? sharedBreakdowns.get(row.shared_teaching_id)
        : undefined);
    const lesson = rowToLesson(
      row.shared_teaching_id
        ? lessonRows.get(row.shared_teaching_id)
        : undefined,
      breakdown,
    );
    const word: WordOccurrence = {
      id: row.id,
      position: row.position,
      arabic: row.arabic,
      transliteration: row.transliteration ?? "",
      gloss: row.gloss ?? "",
      sharedLessonId: row.shared_teaching_id ?? undefined,
      lesson,
      occurrenceRole: row.occurrence_role ?? undefined,
      sourceRoot: row.root_id ?? undefined,
      breakdown,
      morphology: morphologyByOccurrence.get(row.id),
    };
    const list = wordsByAyah.get(row.ayah_id) ?? [];
    list.push(word);
    wordsByAyah.set(row.ayah_id, list);
  }

  const ayahRows = new Map<string, Ayah>(
    ayahsResult.rows.map((row) => [
      row.id,
      {
        id: row.id,
        number: row.number,
        arabic: row.arabic,
        translation: row.certified_translation ?? row.translation ?? "",
        naturalMeaning: row.natural_meaning ?? "",
        words: wordsByAyah.get(row.id) ?? [],
        assembly: [],
        sentenceMap: [],
        drills: [],
      },
    ]),
  );

  return surahsResult.rows.map((row) => {
    const ayahs = ayahsResult.rows
      .filter((ayah) => ayah.surah_id === row.id)
      .map((ayah) => ayahRows.get(ayah.id)!)
      .filter(Boolean);
    const reviewRequired = ayahs.some((ayah) =>
      ayah.words.some((word) => requiresSarfReview(word.lesson)),
    );
    return {
      number: row.number,
      name: row.name,
      arabicName: row.arabic_name,
      transliteration: row.transliteration,
      englishLabel: row.english_label,
      ayahCount: row.ayah_count,
      status: reviewRequired
        ? "custom-partial"
        : row.status === "custom-complete"
          ? "complete"
          : row.status,
      description: row.description ?? "",
      ayahs,
    };
  });
}

type RuntimeRows = {
  surahRows: DbRow[];
  ayahRows: DbRow[];
  wordRows: DbRow[];
  lessonRows: DbRow[];
  breakdownRows: DbRow[];
  partsRows: DbRow[];
  morphologyRows: DbRow[];
};

function buildRuntimeSurahsFromRows({
  surahRows,
  ayahRows,
  wordRows,
  lessonRows: lessonResultRows,
  breakdownRows: breakdownResultRows,
  partsRows,
  morphologyRows,
}: RuntimeRows): Surah[] {
  const lessonRows = new Map<string, DbRow>(
    lessonResultRows.map((row) => [row.id, row]),
  );
  const breakdownRows = new Map<string, DbRow>(
    breakdownResultRows.map((row) => [row.id, row]),
  );
  const partsByBreakdown = new Map<string, DbRow[]>();
  for (const row of partsRows) {
    const list = partsByBreakdown.get(row.breakdown_id) ?? [];
    list.push(row);
    partsByBreakdown.set(row.breakdown_id, list);
  }
  const sharedBreakdowns = new Map<string, WordBreakdown>();
  const occurrenceBreakdowns = new Map<string, WordBreakdown>();
  for (const row of breakdownRows.values()) {
    const breakdown = rowToBreakdown(row, partsByBreakdown);
    if (!breakdown) continue;
    if (row.word_occurrence_id)
      occurrenceBreakdowns.set(row.word_occurrence_id, breakdown);
    if (row.teaching_entry_id)
      sharedBreakdowns.set(row.teaching_entry_id, breakdown);
  }
  const morphologyByOccurrence = new Map<string, MorphologyAnalysis>();
  for (const row of morphologyRows) {
    const details = parseJson<{
      recordKey?: string;
      version?: string;
      sourceText?: string;
      lemma?: string;
      root?: string;
      pattern?: string;
      features?: MorphologyAnalysis["features"];
      segmentation?: MorphologyAnalysis["segmentation"];
      formation?: MorphologyAnalysis["formation"];
    }>(row.features, {});
    morphologyByOccurrence.set(row.occurrence_id, {
      id: row.id,
      provider: row.provider,
      recordKey: details.recordKey ?? row.occurrence_id,
      version: details.version ?? "unknown",
      sourceText: details.sourceText ?? "",
      lemma: details.lemma,
      root: details.root,
      pattern: details.pattern,
      partOfSpeech: row.part_of_speech,
      features: details.features ?? [],
      segmentation: details.segmentation,
      formation: details.formation,
    });
  }

  const wordsByAyah = new Map<string, WordOccurrence[]>();
  for (const row of wordRows) {
    const breakdown =
      occurrenceBreakdowns.get(row.id) ??
      (row.shared_teaching_id
        ? sharedBreakdowns.get(row.shared_teaching_id)
        : undefined);
    const lesson = rowToLesson(
      row.shared_teaching_id
        ? lessonRows.get(row.shared_teaching_id)
        : undefined,
      breakdown,
    );
    const word: WordOccurrence = {
      id: row.id,
      position: row.position,
      arabic: row.arabic,
      transliteration: row.transliteration ?? "",
      gloss: row.gloss ?? "",
      sharedLessonId: row.shared_teaching_id ?? undefined,
      lesson,
      occurrenceRole: row.occurrence_role ?? undefined,
      sourceRoot: row.root_id ?? undefined,
      breakdown,
      morphology: morphologyByOccurrence.get(row.id),
    };
    const list = wordsByAyah.get(row.ayah_id) ?? [];
    list.push(word);
    wordsByAyah.set(row.ayah_id, list);
  }

  const ayahMap = new Map<string, Ayah>(
    ayahRows.map((row) => [
      row.id,
      {
        id: row.id,
        number: row.number,
        arabic: row.arabic,
        translation: row.certified_translation ?? row.translation ?? "",
        naturalMeaning: row.natural_meaning ?? "",
        words: wordsByAyah.get(row.id) ?? [],
        assembly: [],
        sentenceMap: [],
        drills: [],
      },
    ]),
  );

  return surahRows.map((row) => {
    const ayahs = ayahRows
      .filter((ayah) => ayah.surah_id === row.id)
      .map((ayah) => ayahMap.get(ayah.id)!)
      .filter(Boolean);
    const reviewRequired = ayahs.some((ayah) =>
      ayah.words.some((word) => requiresSarfReview(word.lesson)),
    );
    return {
      number: row.number,
      name: row.name,
      arabicName: row.arabic_name,
      transliteration: row.transliteration,
      englishLabel: row.english_label,
      ayahCount: row.ayah_count,
      status: reviewRequired
        ? "custom-partial"
        : row.status === "custom-complete"
          ? "complete"
          : row.status,
      description: row.description ?? "",
      ayahs,
    };
  });
}

async function loadRuntimeSurahsForSelection(
  selectedNumber: number,
): Promise<Surah[]> {
  const pool = getPool();
  const surahsResult = await pool.query("select * from surahs order by number");
  const selectedSurah = surahsResult.rows.find(
    (row) => row.number === selectedNumber,
  );
  if (!selectedSurah) return buildRuntimeSurahsFromRows({
    surahRows: surahsResult.rows,
    ayahRows: [],
    wordRows: [],
    lessonRows: [],
    breakdownRows: [],
    partsRows: [],
    morphologyRows: [],
  });

  const ayahsResult = await pool.query(
    `
      select a.*, certified_translation.text as certified_translation
      from ayahs a
      left join lateral (
        select t.text
        from translations t
        where t.scope_type = 'ayah'
          and t.scope_id = a.id
          and t.provider = 'Tanzil translation repository'
          and t.version = 'tanzil-en.sahih'
        order by t.id
        limit 1
      ) certified_translation on true
      where a.surah_id = $1
      order by a.number
    `,
    [selectedSurah.id],
  );
  const wordsResult = await pool.query(
    "select * from word_occurrences where surah_id = $1 order by ayah_id, position",
    [selectedSurah.id],
  );
  const occurrenceIds = wordsResult.rows.map((row) => row.id);
  const sharedTeachingIds = wordsResult.rows
    .map((row) => row.shared_teaching_id)
    .filter(Boolean);

  const [lessonsResult, breakdownsResult, morphologyResult] =
    await Promise.all([
      pool.query(
        "select * from teaching_word_entries where id = any($1)",
        [sharedTeachingIds],
      ),
      pool.query(
        `
          select * from word_breakdowns
          where word_occurrence_id = any($1)
             or teaching_entry_id = any($2)
        `,
        [occurrenceIds, sharedTeachingIds],
      ),
      pool.query(
        "select * from morphology_records where occurrence_id = any($1) order by occurrence_id",
        [occurrenceIds],
      ),
    ]);
  const breakdownIds = breakdownsResult.rows.map((row) => row.id);
  const partsResult = await pool.query(
    "select * from word_breakdown_parts where breakdown_id = any($1) order by breakdown_id, part_order",
    [breakdownIds],
  );

  return buildRuntimeSurahsFromRows({
    surahRows: surahsResult.rows,
    ayahRows: ayahsResult.rows,
    wordRows: wordsResult.rows,
    lessonRows: lessonsResult.rows,
    breakdownRows: breakdownsResult.rows,
    partsRows: partsResult.rows,
    morphologyRows: morphologyResult.rows,
  });
}

export async function getRuntimeSurahs(): Promise<Surah[]> {
  if (runtimeCache) return runtimeCache;
  runtimeCachePromise ??= loadRuntimeSurahs().then((value) => {
    runtimeCache = value;
    return value;
  });
  return runtimeCachePromise;
}

export async function getRuntimeSurahsForSelection(
  selectedNumber: number,
): Promise<Surah[]> {
  return loadRuntimeSurahsForSelection(selectedNumber);
}

export function clearRuntimeSurahCache() {
  runtimeCache = undefined;
  runtimeCachePromise = undefined;
}

export async function getRuntimeSurah(number: number) {
  const all = await getRuntimeSurahs();
  return all.find((surah) => surah.number === number) ?? all[all.length - 1];
}
