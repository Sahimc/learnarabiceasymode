/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPool } from "../../db";
import type {
  Ayah,
  LessonComponent,
  LessonForm,
  Surah,
  WordBreakdown,
  WordLesson,
  WordOccurrence,
} from "./fixtures";

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
    takeaway: row.takeaway,
  };
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
  ] = await Promise.all([
    pool.query("select * from surahs order by number"),
    pool.query("select * from ayahs order by surah_id, number"),
    pool.query("select * from word_occurrences order by ayah_id, position"),
    pool.query("select * from teaching_word_entries"),
    pool.query("select * from word_breakdowns"),
    pool.query(
      "select * from word_breakdown_parts order by breakdown_id, part_order",
    ),
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
        translation: row.translation ?? "",
        naturalMeaning: row.natural_meaning ?? "",
        words: wordsByAyah.get(row.id) ?? [],
        assembly: [],
        sentenceMap: [],
        drills: [],
      },
    ]),
  );

  return surahsResult.rows.map((row) => ({
    number: row.number,
    name: row.name,
    arabicName: row.arabic_name,
    transliteration: row.transliteration,
    englishLabel: row.english_label,
    ayahCount: row.ayah_count,
    status: row.status === "custom-complete" ? "complete" : row.status,
    description: row.description ?? "",
    ayahs: ayahsResult.rows
      .filter((ayah) => ayah.surah_id === row.id)
      .map((ayah) => ayahRows.get(ayah.id)!)
      .filter(Boolean),
  }));
}

export async function getRuntimeSurahs(): Promise<Surah[]> {
  if (runtimeCache) return runtimeCache;
  runtimeCachePromise ??= loadRuntimeSurahs().then((value) => {
    runtimeCache = value;
    return value;
  });
  return runtimeCachePromise;
}

export function clearRuntimeSurahCache() {
  runtimeCache = undefined;
  runtimeCachePromise = undefined;
}

export async function getRuntimeSurah(number: number) {
  const all = await getRuntimeSurahs();
  return all.find((surah) => surah.number === number) ?? all[all.length - 1];
}
