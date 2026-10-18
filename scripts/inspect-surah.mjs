import { query, pool } from "./lib/db.ts";
import { assertAuthoringContract } from "./lib/authoring-contract.mjs";

assertAuthoringContract("sūrah inspection");

const surah = Number(process.argv[2]);
const result = await query(
  `
  select s.number as surah, a.number as ayah, wo.position, wo.id, wo.arabic,
         mr.features->>'root' as root,
         mr.features->>'lemma' as lemma,
         mr.segmentation
  from word_occurrences wo
  join surahs s on s.id = wo.surah_id
  join ayahs a on a.id = wo.ayah_id
  left join morphology_records mr
    on mr.occurrence_id = wo.id
   and mr.provider = 'quranic-arabic-corpus'
  where s.number = $1
  order by a.number, wo.position
`,
  [surah],
);

if (process.argv.includes("--summary")) {
  for (const row of result.rows)
    console.log(
      `${row.ayah}:${row.position}|${row.arabic}|${row.root ?? "ROOTLESS"}`,
    );
} else {
  console.log(JSON.stringify(result.rows, null, 2));
}
await pool.end();
