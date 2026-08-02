import { loadLocalEnv } from "./lib/env";
import { pool } from "./lib/db";

loadLocalEnv();
const result = await pool.query<{ table_name: string }>(
  "select table_name from information_schema.tables where table_schema='public' order by table_name",
);
const version = await pool.query<{ version: string }>("select version()");
console.log(version.rows[0]?.version);
console.log(`Database tables: ${result.rows.length}`);
console.log(result.rows.map((row) => row.table_name).join(", "));
await pool.end();
