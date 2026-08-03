import { loadLocalEnv } from "./lib/env";
import { pool } from "./lib/db";

loadLocalEnv();

const counts = await pool.query(`
  select
    count(*)::int as total,
    count(*) filter (where text ilike '%hell%')::int as hell,
    count(*) filter (where text ilike '%fire%')::int as fire,
    count(*) filter (where text ilike '%punish%')::int as punishment
  from translations
  where provider = 'Tanzil translation repository'
`);
const samples = await pool.query(`
  select s.number as surah, a.number as ayah, left(t.text, 160) as text
  from translations t
  join ayahs a on a.id = t.scope_id
  join surahs s on s.id = a.surah_id
  where t.provider = 'Tanzil translation repository' and t.text ilike '%hell%'
  order by s.number, a.number
  limit 5
`);
console.log(
  JSON.stringify(
    { counts: counts.rows[0], hellSamples: samples.rows },
    null,
    2,
  ),
);
await pool.end();
