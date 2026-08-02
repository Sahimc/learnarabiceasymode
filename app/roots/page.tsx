import Link from "next/link";
import { getRootIndex } from "../data/db-index-service";

export default async function RootsPage() {
  const roots = await getRootIndex();
  return (
    <main className="simple-page">
      <p className="eyebrow">Word Tree · Index</p>
      <h1>Root index</h1>
      <p className="lede">
        Roots present in the imported source and reviewed teaching layers. Root
        pictures appear only where project teaching has authored one.
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
      <p>
        <Link href="/">← Back to Word Tree</Link>
      </p>
    </main>
  );
}
