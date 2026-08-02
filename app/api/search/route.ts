import { searchLessons } from "../../data/db-index-service";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ query, results: await searchLessons(query) });
}
