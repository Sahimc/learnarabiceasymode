import { getPool } from "../../db";
import type {
  QuranSearchAyah,
  QuranSearchPayload,
  QuranSearchSurah,
} from "./search-types";

export type RootIndexItem = {
  id: string;
  text: string;
  picture: string;
  occurrenceCount: number;
};

export type PatternIndexItem = {
  id: string;
  name: string;
  entries: { form: string; meaning: string; difference: string }[];
};

export type SearchResult = {
  occurrenceId: string;
  surah: number;
  ayah: number;
  position: number;
  arabic: string;
  gloss: string;
  transliteration: string;
  status: string;
  root: string;
  meaning: string;
};

export async function getRootIndex(): Promise<RootIndexItem[]> {
  const pool = getPool();
  const result = await pool.query(`
    select r.id, r.text,
      coalesce(max(rpt.text), '') as picture,
      count(distinct wo.id)::int as occurrence_count
    from roots r
    left join root_picture_terms rpt on rpt.root_id = r.id
    left join word_occurrences wo on wo.root_id = r.id
    group by r.id, r.text
    order by r.text
  `);
  return result.rows.map((row) => ({
    id: row.id,
    text: row.text,
    picture: row.picture,
    occurrenceCount: row.occurrence_count,
  }));
}

export async function getPatternIndex(): Promise<PatternIndexItem[]> {
  const pool = getPool();
  const result = await pool.query(`
    select ff.id, ff.name, coalesce(json_agg(json_build_object('form', ffe.form, 'meaning', ffe.meaning, 'difference', ffe.difference) order by ffe.id) filter (where ffe.id is not null), '[]') as entries
    from form_families ff
    left join form_family_entries ffe on ffe.family_id = ff.id
    group by ff.id, ff.name
    order by ff.name
  `);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    entries: row.entries ?? [],
  }));
}

export async function searchLessons(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pool = getPool();
  const pattern = `%${trimmed}%`;
  const result = await pool.query(
    `
    select wo.id as occurrence_id, s.number as surah, a.number as ayah, wo.position,
      wo.arabic, coalesce(wo.gloss, '') as gloss, coalesce(wo.transliteration, '') as transliteration,
      wo.status, coalesce(r.text, '') as root, coalesce(twe.meaning, '') as meaning
    from word_occurrences wo
    join surahs s on s.id = wo.surah_id
    join ayahs a on a.id = wo.ayah_id
    left join roots r on r.id = wo.root_id
    left join teaching_word_entries twe on twe.id = wo.shared_teaching_id
    where wo.arabic ilike $1 or wo.gloss ilike $1 or wo.transliteration ilike $1
      or r.text ilike $1 or twe.meaning ilike $1 or s.name ilike $1 or cast(s.number as text) = $2
    order by s.number, a.number, wo.position
    limit 100
  `,
    [pattern, trimmed],
  );
  return result.rows.map((row) => ({
    occurrenceId: row.occurrence_id,
    surah: row.surah,
    ayah: row.ayah,
    position: row.position,
    arabic: row.arabic,
    gloss: row.gloss,
    transliteration: row.transliteration,
    status: row.status,
    root: row.root,
    meaning: row.meaning,
  }));
}

const searchSourceCharacters = "āīūṣṭḍḥʿʾ -’ًٌٍَُِّْـٰ";
const searchTargetCharacters = "aiustdhc";

function searchKey(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/ā/g, "a")
    .replace(/ī/g, "i")
    .replace(/ū/g, "u")
    .replace(/ṣ/g, "s")
    .replace(/ṭ/g, "t")
    .replace(/ḍ/g, "d")
    .replace(/ḥ/g, "h")
    .replace(/[ʿʾ]/g, "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function sqlSearchKey(fields: string) {
  return `translate(lower(concat_ws(' ', ${fields})), '${searchSourceCharacters}', '${searchTargetCharacters}')`;
}

export async function searchQuran(query: string): Promise<QuranSearchPayload> {
  const trimmed = query.trim().slice(0, 120);
  const terms = trimmed.split(/\s+/).filter(Boolean);
  const termKeys = terms.map(searchKey).filter(Boolean);
  if (!trimmed || termKeys.length === 0) {
    return {
      query: trimmed,
      terms,
      approximateCount: 0,
      matchingWordCount: 0,
      matchingAyahCount: 0,
      surahMatches: [],
      ayahMatches: [],
    };
  }

  const pool = getPool();
  const surahKey = sqlSearchKey(
    "s.name, s.arabic_name, s.transliteration, s.english_label",
  );
  const wordKey = sqlSearchKey(
    "wo.arabic, wo.transliteration, wo.gloss, twe.meaning, twe.type, twe.root_picture, twe.construction, twe.grammar, twe.sentence_role, twe.recognition_clue, r.text, r.transliteration, l.text, l.transliteration",
  );
  const candidateWordKey = sqlSearchKey(
    "wo2.arabic, wo2.transliteration, wo2.gloss, twe2.meaning, twe2.type, twe2.root_picture, twe2.construction, twe2.grammar, twe2.sentence_role, twe2.recognition_clue, r2.text, r2.transliteration, l2.text, l2.transliteration",
  );
  const rootKey = sqlSearchKey("r.text, r.transliteration");
  const candidateRootKey = sqlSearchKey("r2.text, r2.transliteration");
  const ayahTextKey = sqlSearchKey(
    "a.arabic, a.translation, tr_search.text, a.natural_meaning",
  );
  const compactKey = searchKey(trimmed);
  const useCompactRootKey =
    termKeys.length > 1 &&
    compactKey.length > 1 &&
    /[\u0600-\u06ff]/u.test(trimmed);

  const surahPhraseKey = searchKey(trimmed);
  const surahParams = useCompactRootKey
    ? [`%${compactKey}%`]
    : [`%${surahPhraseKey}%`, ...termKeys.map((term) => `%${term}%`)];
  const surahTerms = termKeys
    .map((_, index) => `${surahKey} like $${index + 2}`)
    .join(" and ");
  const surahPredicate = useCompactRootKey
    ? `${surahKey} like $1`
    : `${surahKey} like $1 or (${surahTerms})`;
  const surahResult = await pool.query(
    `
      select s.number, s.name, s.arabic_name, s.transliteration,
        s.english_label, s.ayah_count
      from surahs s
      where ${surahPredicate}
      order by s.number
    `,
    surahParams,
  );

  let precomputedAyahIds: string[] | null = null;
  if (!/[\u0600-\u06ff]/u.test(trimmed)) {
    const latinTerms = termKeys
      .map(
        (_, index) => `(
          coalesce(a.translation, '') ilike $${index + 1}
          or coalesce(a.natural_meaning, '') ilike $${index + 1}
          or coalesce(t.text, '') ilike $${index + 1}
          or coalesce(wo.arabic, '') ilike $${index + 1}
          or coalesce(wo.transliteration, '') ilike $${index + 1}
          or coalesce(wo.gloss, '') ilike $${index + 1}
          or coalesce(twe.meaning, '') ilike $${index + 1}
          or coalesce(twe.root_picture, '') ilike $${index + 1}
          or coalesce(twe.construction, '') ilike $${index + 1}
          or coalesce(twe.grammar, '') ilike $${index + 1}
          or coalesce(twe.sentence_role, '') ilike $${index + 1}
          or coalesce(twe.recognition_clue, '') ilike $${index + 1}
          or coalesce(r.text, '') ilike $${index + 1}
          or coalesce(r.transliteration, '') ilike $${index + 1}
          or coalesce(l.text, '') ilike $${index + 1}
          or coalesce(l.transliteration, '') ilike $${index + 1}
        )`,
      )
      .join(" and ");
    const candidateResult = await pool.query(
      `
        select distinct a.id
        from ayahs a
        left join translations t on t.scope_type = 'ayah' and t.scope_id = a.id
        left join word_occurrences wo on wo.ayah_id = a.id
        left join roots r on r.id = wo.root_id
        left join lemmas l on l.id = wo.lemma_id
        left join teaching_word_entries twe on twe.id = wo.shared_teaching_id
        where ${latinTerms}
      `,
      termKeys.map((term) => `%${term}%`),
    );
    precomputedAyahIds = candidateResult.rows.map((row) => row.id as string);
  }

  const wordTermPlaceholders = termKeys
    .map((_, index) => `${wordKey} like $${index + 1}`)
    .join(" or ");
  const wordPlaceholders = useCompactRootKey
    ? `${rootKey} like $1`
    : `(${wordTermPlaceholders})`;
  const rootPlaceholders = useCompactRootKey
    ? `${rootKey} like $1`
    : termKeys.map((_, index) => `${rootKey} like $${index + 1}`).join(" or ");
  const ayahTermPlaceholders = termKeys
    .map((_, index) => `${ayahTextKey} like $${index + 1}`)
    .join(" and ");
  const candidateWordTerms = termKeys
    .map(
      (_, index) =>
        `exists (select 1 from word_occurrences wo2
          left join teaching_word_entries twe2 on twe2.id = wo2.shared_teaching_id
          left join roots r2 on r2.id = wo2.root_id
          left join lemmas l2 on l2.id = wo2.lemma_id
          where wo2.ayah_id = a.id and ${candidateWordKey} like $${index + 1})`,
    )
    .join(" and ");
  const ayahPredicate = precomputedAyahIds
    ? `a.id = any($${termKeys.length + 1}::text[])`
    : useCompactRootKey
      ? `exists (select 1 from word_occurrences wo2
          left join roots r2 on r2.id = wo2.root_id
          where wo2.ayah_id = a.id and ${candidateRootKey} like $1)`
      : `(${ayahTermPlaceholders}) or (${candidateWordTerms})`;
  const ayahParams = precomputedAyahIds
    ? [...termKeys.map((term) => `%${term}%`), precomputedAyahIds]
    : useCompactRootKey
      ? [`%${compactKey}%`]
      : termKeys.map((term) => `%${term}%`);
  const ayahResult = await pool.query(
    `
      with matching_ayahs as (
        select a.id, a.surah_id, a.number, a.arabic, a.translation,
          a.natural_meaning, tr_display.text as display_translation
        from ayahs a
        left join lateral (
          select t.text
          from translations t
          where t.scope_type = 'ayah' and t.scope_id = a.id
          order by case when t.version = 'tanzil-en.sahih' then 0 else 1 end, t.id
          limit 1
        ) tr_display on true
        left join lateral (
          select string_agg(t.text, ' ' order by t.id) as text
          from translations t
          where t.scope_type = 'ayah' and t.scope_id = a.id
        ) tr_search on true
        where ${ayahPredicate}
      )
      select m.id, s.number as surah, s.name as surah_name,
        s.transliteration as surah_transliteration, m.number as ayah,
        coalesce(m.display_translation, m.translation, '') as translation,
        coalesce(m.natural_meaning, '') as natural_meaning,
        coalesce(
          json_agg(
            json_build_object(
              'position', wo.position,
              'arabic', wo.arabic,
              'transliteration', coalesce(wo.transliteration, ''),
              'gloss', coalesce(wo.gloss, ''),
              'meaning', coalesce(twe.meaning, ''),
              'root', coalesce(r.text, ''),
              'rootMatched', case when ${rootPlaceholders} then true else false end,
              'matched', case when ${wordPlaceholders} then true else false end
            ) order by wo.position
          ) filter (where wo.id is not null),
          '[]'::json
        ) as words
      from matching_ayahs m
      join surahs s on s.id = m.surah_id
      left join word_occurrences wo on wo.ayah_id = m.id
      left join roots r on r.id = wo.root_id
      left join lemmas l on l.id = wo.lemma_id
      left join teaching_word_entries twe on twe.id = wo.shared_teaching_id
      group by m.id, s.number, s.name, s.transliteration, m.number,
        m.arabic, m.translation, m.display_translation, m.natural_meaning
      order by s.number, m.number
    `,
    ayahParams,
  );

  const surahMatches: QuranSearchSurah[] = surahResult.rows.map((row) => ({
    number: row.number,
    name: row.name,
    arabicName: row.arabic_name,
    transliteration: row.transliteration,
    englishLabel: row.english_label,
    ayahCount: row.ayah_count,
  }));
  const ayahMatches: QuranSearchAyah[] = ayahResult.rows.map((row) => ({
    id: row.id,
    surah: row.surah,
    surahName: row.surah_name,
    surahTransliteration: row.surah_transliteration,
    ayah: row.ayah,
    arabic: row.arabic,
    translation: row.translation,
    naturalMeaning: row.natural_meaning,
    words: (row.words ?? []) as QuranSearchAyah["words"],
  }));
  const matchingWordCount = ayahMatches.reduce(
    (count, ayah) => count + ayah.words.filter((word) => word.matched).length,
    0,
  );

  return {
    query: trimmed,
    terms,
    approximateCount:
      matchingWordCount || ayahMatches.length || surahMatches.length,
    matchingWordCount,
    matchingAyahCount: ayahMatches.length,
    surahMatches,
    ayahMatches,
  };
}
