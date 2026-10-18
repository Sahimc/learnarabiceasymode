import Link from "next/link";
import {
  getPatternIndex,
  getPatternIndexCount,
} from "../data/db-index-service";

const PAGE_SIZE = 200;

export default async function PatternsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.max(requestedPage, 1)
    : 1;
  const [patterns, total] = await Promise.all([
    getPatternIndex({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getPatternIndexCount(),
  ]);
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(page, pageCount);
  return (
    <main className="simple-page">
      <p className="eyebrow">Word Tree · Index</p>
      <h1>Ṣarf and form families</h1>
      <p className="lede">
        A content-derived index of the reviewed form families currently present
        in the teaching layer. Showing families {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}–{Math.min(currentPage * PAGE_SIZE, total)} of {total}.
      </p>
      <div className="index-grid">
        {patterns.map((pattern) => (
          <article className="simple-card" key={pattern.id}>
            <h2>{pattern.name}</h2>
            <div className="index-forms">
              {pattern.entries.map((entry) => (
                <p key={`${entry.form}-${entry.meaning}`}>
                  <strong dir="rtl">{entry.form}</strong>
                  <span>{entry.meaning}</span>
                  <small>{entry.difference}</small>
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
      <nav aria-label="Form family pages" className="simple-page-nav">
        {currentPage > 1 ? (
          <Link href={`/patterns?page=${currentPage - 1}`}>← Previous page</Link>
        ) : (
          <span aria-disabled="true">← Previous page</span>
        )}
        <span>
          Page {currentPage} of {pageCount}
        </span>
        {currentPage < pageCount ? (
          <Link href={`/patterns?page=${currentPage + 1}`}>Next page →</Link>
        ) : (
          <span aria-disabled="true">Next page →</span>
        )}
      </nav>
      <p>
        <Link href="/">← Back to Word Tree</Link>
      </p>
    </main>
  );
}
