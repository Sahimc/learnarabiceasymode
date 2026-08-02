import Link from "next/link";

export default function CreditsPage() {
  return (
    <main className="simple-page">
      <p className="eyebrow">Word Tree · Sources</p>
      <h1>Sources and credits</h1>
      <p className="lede">
        The source layer and the reviewed teaching layer are kept separate so
        every learner-facing explanation can be traced to its intended author.
      </p>
      <section className="simple-card">
        <h2>Tanzil</h2>
        <p>
          The retained canonical Uthmani Arabic source is from Tanzil and is
          kept verbatim with attribution.
        </p>
        <p>
          <a href="https://tanzil.net" target="_blank" rel="noreferrer">
            Tanzil website ↗
          </a>
        </p>
      </section>
      <section className="simple-card">
        <h2>Project-authored teaching</h2>
        <p>
          Contextual meanings, root pictures, learner-facing grammar, Word Tree
          explanations, form-family notes, drills and starter translations for
          Sūrahs 112–114 are project-authored unless a package says otherwise.
        </p>
      </section>
      <p>
        <Link href="/">← Back to Word Tree</Link>
      </p>
    </main>
  );
}
