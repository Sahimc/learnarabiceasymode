import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { loadLocalEnv } from "./lib/env";
import { pool } from "./lib/db";

loadLocalEnv();
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
console.log("PostgreSQL migrations applied.");
await pool.end();
