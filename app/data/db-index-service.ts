import { getPool } from "../../db";

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
