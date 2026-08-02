import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { loadLocalEnv } from "./env";

loadLocalEnv();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
});

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
) {
  return pool.query<T>(text, values);
}
