import { getPool } from "../../../db";

export async function GET() {
  const pool = getPool();
  try {
    const [database, content, imports] = await Promise.all([
      pool.query("select current_database() as database, version() as version"),
      pool.query(
        "select (select count(*) from surahs)::int as surahs, (select count(*) from ayahs)::int as ayahs, (select count(*) from word_occurrences)::int as words",
      ),
      pool.query(
        "select max(finished_at) as latest from content_imports where status='succeeded'",
      ),
    ]);
    return Response.json({
      status: "ok",
      database: {
        connected: true,
        name: database.rows[0].database,
        version: database.rows[0].version,
      },
      content: content.rows[0],
      latestSuccessfulImport: imports.rows[0].latest,
    });
  } catch (error) {
    return Response.json(
      {
        status: "degraded",
        database: { connected: false },
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
