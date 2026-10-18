import Link from "next/link";
import {
  getRootIndex,
  getRootIndexCount,
} from "../data/db-index-service";

const PAGE_SIZE = 200;

export default async function RootsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.max(requestedPage, 1)
    : 1;
  const [roots, total] = await Promise.all([
    getRootIndex({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getRootIndexCount(),
  ]);
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(page, pageCount);
  return (
    <main className="simple-page">
      <p className="eyebrow">Word Tree · Index</p>
      <h1>Root index</h1>
      <p className="lede">
        Roots present in the imported source and reviewed teaching layers. Root
        pictures appear only where project teaching has authored one. Showing
        roots {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}–
        {Math.min(currentPage * PAGE_SIZE, total)} of {total}.
      </p>
      <div className="index-grid">
        {roots.map((root) => (
          <article className="simple-card" key={root.id}>
            <p className="arabic-index" dir="rtl">
              {root.text}
            </p>
            <h2>{root.picture || "Source root evidence"}</h2>
            <p>
              {root.occurrenceCount} visible occurrence
              {root.occurrenceCount === 1 ? "" : "s"}
            </p>
          </article>
        ))}
      </div>
      <nav aria-label="Root pages" className="simple-page-nav">
        {currentPage > 1 ? (
          <Link href={`/roots?page=${currentPage - 1}`}>← Previous page</Link>
        ) : (
          <span aria-disabled="true">← Previous page</span>
        )}
        <span>
          Page {currentPage} of {pageCount}
        </span>
        {currentPage < pageCount ? (
          <Link href={`/roots?page=${currentPage + 1}`}>Next page →</Link>
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
