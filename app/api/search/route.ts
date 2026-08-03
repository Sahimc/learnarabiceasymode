import { searchQuran } from "../../data/db-index-service";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return Response.json(await searchQuran(query));
  } catch (error) {
    console.error("quran search failed", error);
    return Response.json(
      { error: "Search is temporarily unavailable" },
      { status: 500 },
    );
  }
}
