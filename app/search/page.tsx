import Link from "next/link";
import { searchLessons } from "../data/db-index-service";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = await searchLessons(q);
  return (
    <main className="simple-page">
      <p className="eyebrow">Word Tree · Search</p>
      <h1>Search the imported Qur’an</h1>
      <form className="search-form" action="/search">
        <label htmlFor="q">
          Arabic, meaning, transliteration, root or sūrah
        </label>
        <div>
          <input id="q" name="q" defaultValue={q} />
          <button type="submit">Search</button>
        </div>
      </form>
      {q && (
        <p className="search-summary">
          {results.length} result{results.length === 1 ? "" : "s"} for “{q}”.
        </p>
      )}
      <div className="search-results">
        {results.map((result) => (
          <Link
            className="search-result"
            key={result.occurrenceId}
            href={`/learn/${result.surah}/${result.ayah}`}
          >
            <strong dir="rtl">{result.arabic}</strong>
            <span>
              Sūrah {result.surah} · Āyah {result.ayah} · Word {result.position}
            </span>
            <small>
              {result.meaning || result.gloss || "Source word"}
              {result.root ? ` · Root ${result.root}` : ""}
            </small>
          </Link>
        ))}
      </div>
      <p>
        <Link href="/">← Back to Word Tree</Link>
      </p>
    </main>
  );
}
