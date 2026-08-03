"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type {
  QuranSearchAyah,
  QuranSearchPayload,
  QuranSearchWord,
} from "../data/search-types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({
  text,
  terms,
  fallback = false,
}: {
  text: string;
  terms: string[];
  fallback?: boolean;
}) {
  if (!text) return null;
  const patterns = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map(escapeRegExp);
  if (patterns.length === 0) return text;
  const expression = new RegExp(`(${patterns.join("|")})`, "giu");
  const chunks = text.split(expression);
  const hasMatch = chunks.some((chunk, index) => index % 2 === 1);
  if (!hasMatch && fallback) {
    return <mark className="search-highlight">{text}</mark>;
  }
  return chunks.map((chunk, index) =>
    index % 2 === 1 ? (
      <mark className="search-highlight" key={`${chunk}-${index}`}>
        {chunk}
      </mark>
    ) : (
      <span key={`${chunk}-${index}`}>{chunk}</span>
    ),
  );
}

function arabicExcerpt(words: QuranSearchWord[]) {
  const matched = words
    .map((word, index) => (word.matched ? index : -1))
    .filter((index) => index >= 0);
  if (matched.length === 0) {
    return {
      before: false,
      after: words.length > 8,
      words: words.slice(0, 8),
    };
  }
  const start = Math.max(0, matched[0] - 3);
  const end = Math.min(words.length, matched[matched.length - 1] + 4);
  return {
    before: start > 0,
    after: end < words.length,
    words: words.slice(start, end),
  };
}

function ArabicResult({ ayah }: { ayah: QuranSearchAyah }) {
  const excerpt = arabicExcerpt(ayah.words);
  const hasWordMatch = ayah.words.some((word) => word.matched);
  return (
    <div className="search-ayah-arabic" dir="rtl" lang="ar">
      {excerpt.before && <span className="search-ellipsis">… </span>}
      {hasWordMatch ? (
        excerpt.words.map((word) => (
          <span
            className="search-arabic-word"
            key={`${ayah.id}-${word.position}`}
          >
            {word.matched ? (
              <mark className="search-highlight">{word.arabic}</mark>
            ) : (
              word.arabic
            )}
          </span>
        ))
      ) : (
        <mark className="search-highlight">{ayah.arabic}</mark>
      )}
      {excerpt.after && <span className="search-ellipsis"> …</span>}
    </div>
  );
}

function EnglishResult({
  ayah,
  terms,
}: {
  ayah: QuranSearchAyah;
  terms: string[];
}) {
  const translation = ayah.translation || ayah.naturalMeaning;
  const matchedGlosses = ayah.words
    .filter((word) => word.matched)
    .map((word) => word.meaning || word.gloss)
    .filter(Boolean);
  if (translation) {
    return (
      <p className="search-ayah-english">
        <HighlightedText
          text={translation}
          terms={terms}
          fallback={matchedGlosses.length === 0}
        />
      </p>
    );
  }
  if (matchedGlosses.length > 0) {
    return (
      <p className="search-ayah-english search-gloss-result">
        {matchedGlosses.map((gloss, index) => (
          <span key={`${gloss}-${index}`}>
            <mark className="search-highlight">{gloss}</mark>
            {index < matchedGlosses.length - 1 ? " · " : ""}
          </span>
        ))}
      </p>
    );
  }
  return <p className="search-source-note">Canonical Arabic source text</p>;
}

function SearchResultSections({ data }: { data: QuranSearchPayload }) {
  return (
    <div className="search-result-sections">
      <div className="search-result-summary" aria-live="polite">
        <strong>
          About {data.approximateCount.toLocaleString()} match
          {data.approximateCount === 1 ? "" : "es"}
        </strong>
        <span>
          {data.matchingWordCount > 0
            ? `${data.matchingWordCount.toLocaleString()} word occurrence${data.matchingWordCount === 1 ? "" : "s"}`
            : `${data.matchingAyahCount.toLocaleString()} matching āyah${data.matchingAyahCount === 1 ? "" : "āt"}`}
        </span>
      </div>

      {data.surahMatches.length > 0 && (
        <section
          className="search-result-group"
          aria-labelledby="surah-results-title"
        >
          <div className="search-group-heading">
            <span className="card-kicker">Sūrah matches</span>
            <strong id="surah-results-title">
              {data.surahMatches.length} result
              {data.surahMatches.length === 1 ? "" : "s"}
            </strong>
          </div>
          <div className="search-surah-results">
            {data.surahMatches.map((surah) => (
              <Link
                className="search-surah-result"
                href={`/learn/${surah.number}/1`}
                key={surah.number}
              >
                <span className="search-surah-number">
                  {String(surah.number).padStart(3, "0")}
                </span>
                <span>
                  <strong>
                    <mark className="search-highlight">{surah.name}</mark>
                  </strong>
                  <small>
                    {surah.arabicName} · {surah.englishLabel} ·{" "}
                    {surah.ayahCount} āyāt
                  </small>
                </span>
                <span className="search-result-arrow">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.ayahMatches.length > 0 && (
        <section
          className="search-result-group"
          aria-labelledby="ayah-results-title"
        >
          <div className="search-group-heading">
            <span className="card-kicker">Āyah matches</span>
            <strong id="ayah-results-title">
              {data.ayahMatches.length} āyah
              {data.ayahMatches.length === 1 ? "" : "āt"}
            </strong>
          </div>
          <div className="search-ayah-results">
            {data.ayahMatches.map((ayah) => {
              const roots = [
                ...new Set(
                  ayah.words
                    .filter((word) => word.rootMatched && word.root)
                    .map((word) => word.root),
                ),
              ];
              return (
                <Link
                  className="search-ayah-result"
                  href={`/learn/${ayah.surah}/${ayah.ayah}#lesson`}
                  key={ayah.id}
                >
                  <div className="search-ayah-meta">
                    <span>
                      {ayah.surahTransliteration} · Āyah {ayah.ayah}
                    </span>
                    <span>Sūrah {ayah.surah}</span>
                  </div>
                  <ArabicResult ayah={ayah} />
                  <EnglishResult ayah={ayah} terms={data.terms} />
                  {roots.length > 0 && (
                    <p className="search-root-result">
                      <span>Root discovery</span>
                      {roots.map((root) => (
                        <mark className="search-highlight" key={root} dir="rtl">
                          {root}
                        </mark>
                      ))}
                      <small>Related word forms in the imported evidence</small>
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {data.surahMatches.length === 0 && data.ayahMatches.length === 0 && (
        <div className="search-empty-state">
          <strong>No matches found in the imported Qur’anic content.</strong>
          <p>
            Try an Arabic word, a transliteration, a root, a short English
            gloss, or a sūrah name.
          </p>
        </div>
      )}
    </div>
  );
}

export function QuranSearch() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<QuranSearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setData(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}`,
      );
      if (!response.ok) throw new Error("Search request failed");
      setData((await response.json()) as QuranSearchPayload);
    } catch {
      setData(null);
      setError("Search is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="quran-search" aria-labelledby="quran-search-title">
      <div className="quran-search-intro">
        <div>
          <span className="card-kicker">Search the whole Qur’an</span>
          <h3 id="quran-search-title">Find a sūrah, word, root or meaning.</h3>
        </div>
        <p>
          Search the imported Arabic, transliteration, glosses, teaching notes
          and available translation text. Results stay in Qur’anic order.
          <span className="quran-search-attribution">
            English translation search: Saheeh International via Tanzil.
          </span>
        </p>
      </div>
      <form className="quran-search-form" onSubmit={submit} role="search">
        <label className="sr-only" htmlFor="quran-search-input">
          Search all sūrahs and Qur’anic words
        </label>
        <input
          id="quran-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try Al-Fātiḥah, رَبّ, Lord or a root…"
          autoComplete="off"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
        {query && (
          <button
            className="quran-search-clear"
            type="button"
            onClick={() => {
              setQuery("");
              setData(null);
              setError("");
            }}
          >
            Clear
          </button>
        )}
      </form>
      {error && <p className="quran-search-error">{error}</p>}
      {data && <SearchResultSections data={data} />}
    </section>
  );
}
