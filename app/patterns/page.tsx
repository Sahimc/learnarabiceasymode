import Link from "next/link";
import { getPatternIndex } from "../data/db-index-service";

export default async function PatternsPage() {
  const patterns = await getPatternIndex();
  return (
    <main className="simple-page">
      <p className="eyebrow">Word Tree · Index</p>
      <h1>Ṣarf and form families</h1>
      <p className="lede">
        A content-derived index of the reviewed form families currently present
        in the teaching layer.
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
      <p>
        <Link href="/">← Back to Word Tree</Link>
      </p>
    </main>
  );
}
