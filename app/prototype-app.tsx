"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  getAyah,
  getProgressKey,
  getSurah,
  getWordBreakdown,
  getWordLesson,
  orderLessonForms,
  surahs,
  type LessonComponent,
  type Surah,
  type WordOccurrence,
} from "./data/fixtures";

type PrototypeView = "home" | "surahs" | "lesson" | "print" | "presentation";

type PrototypeAppProps = {
  view?: PrototypeView;
  initialSurah?: number;
  initialAyah?: number;
};

function LessonBreakdownParts({
  parts,
  presentation = false,
}: {
  parts: LessonComponent[];
  presentation?: boolean;
}) {
  return (
    <div
      className={
        presentation ? "presentation-breakdown-parts" : "breakdown-parts"
      }
      dir="ltr"
    >
      {parts.map((component) => (
        <span
          className="breakdown-part"
          key={`${component.text}-${component.label}`}
        >
          <b dir="rtl">{component.displayText ?? component.text}</b>
          <small>{component.label}</small>
        </span>
      ))}
    </div>
  );
}

type LessonSettings = {
  showRoot: boolean;
  showTransliteration: boolean;
  largeArabic: boolean;
  largeEnglish: boolean;
  expandedExplanations: boolean;
};

const defaultLessonSettings: LessonSettings = {
  showRoot: true,
  showTransliteration: true,
  largeArabic: false,
  largeEnglish: false,
  expandedExplanations: true,
};

const lessonSettingsKey = "qawt:lesson-settings";
let memoryLessonSettings = defaultLessonSettings;

const statusLabel = {
  complete: "Complete Word Tree",
  "source-only": "Source text ready",
} as const;

const sourceBadges = [
  "Arabic text",
  "Word order",
  "Translation",
  "Morphology ready later",
];

function subscribeToProgress(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener("qawt-progress-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("qawt-progress-change", onChange);
  };
}

function getProgressSnapshot() {
  if (typeof window === "undefined") return "[]";
  try {
    return window.localStorage.getItem("qawt:completed") ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerProgressSnapshot() {
  return "[]";
}

function subscribeToLessonSettings(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener("qawt-lesson-settings-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("qawt-lesson-settings-change", onChange);
  };
}

function getLessonSettingsSnapshot() {
  if (typeof window === "undefined")
    return JSON.stringify(defaultLessonSettings);
  try {
    return (
      window.localStorage.getItem(lessonSettingsKey) ??
      JSON.stringify(defaultLessonSettings)
    );
  } catch {
    return JSON.stringify(memoryLessonSettings);
  }
}

function getServerLessonSettingsSnapshot() {
  return JSON.stringify(defaultLessonSettings);
}

function parseLessonSettings(snapshot: string): LessonSettings {
  try {
    const stored = JSON.parse(snapshot) as Partial<LessonSettings>;
    return {
      showRoot:
        typeof stored.showRoot === "boolean"
          ? stored.showRoot
          : defaultLessonSettings.showRoot,
      showTransliteration:
        typeof stored.showTransliteration === "boolean"
          ? stored.showTransliteration
          : defaultLessonSettings.showTransliteration,
      largeArabic:
        typeof stored.largeArabic === "boolean"
          ? stored.largeArabic
          : defaultLessonSettings.largeArabic,
      largeEnglish:
        typeof stored.largeEnglish === "boolean"
          ? stored.largeEnglish
          : defaultLessonSettings.largeEnglish,
      expandedExplanations:
        typeof stored.expandedExplanations === "boolean"
          ? stored.expandedExplanations
          : defaultLessonSettings.expandedExplanations,
    };
  } catch {
    return defaultLessonSettings;
  }
}

function resolveInitialSurah(view: PrototypeView, initialSurah?: number) {
  if (initialSurah) return initialSurah;
  if (view === "home") return 114;
  return 112;
}

export function PrototypeApp({
  view = "home",
  initialSurah,
  initialAyah = 1,
}: PrototypeAppProps) {
  const [selectedSurah, setSelectedSurah] = useState(
    resolveInitialSurah(view, initialSurah),
  );
  const [selectedAyah, setSelectedAyah] = useState(initialAyah);
  const [selectedWordIndex, setSelectedWordIndex] = useState(0);
  const lessonSettingsSnapshot = useSyncExternalStore(
    subscribeToLessonSettings,
    getLessonSettingsSnapshot,
    getServerLessonSettingsSnapshot,
  );
  const lessonSettings = useMemo(
    () => parseLessonSettings(lessonSettingsSnapshot),
    [lessonSettingsSnapshot],
  );
  const [quietMode, setQuietMode] = useState(false);
  function updateLessonSettings(
    updater: (current: LessonSettings) => LessonSettings,
  ) {
    const next = updater(lessonSettings);
    memoryLessonSettings = next;
    try {
      window.localStorage.setItem(lessonSettingsKey, JSON.stringify(next));
    } catch {
      // The lesson remains usable when device storage is blocked.
    }
    window.dispatchEvent(new Event("qawt-lesson-settings-change"));
  }
  const {
    showRoot,
    showTransliteration,
    largeArabic,
    largeEnglish,
    expandedExplanations,
  } = lessonSettings;
  const progressSnapshot = useSyncExternalStore(
    subscribeToProgress,
    getProgressSnapshot,
    getServerProgressSnapshot,
  );
  const completed = useMemo(() => {
    try {
      return JSON.parse(progressSnapshot) as string[];
    } catch {
      return [];
    }
  }, [progressSnapshot]);

  const surah = getSurah(selectedSurah);
  const ayah = getAyah(selectedSurah, selectedAyah);
  const selectedWord = ayah.words[selectedWordIndex] ?? ayah.words[0];
  const selectedLesson = getWordLesson(selectedWord);
  const progressKey = getProgressKey(selectedSurah, selectedAyah);
  const hasCompleted = completed.includes(progressKey);
  const completeCount = surahs.filter(
    (item) => item.status === "complete",
  ).length;

  function chooseSurah(item: Surah) {
    setSelectedSurah(item.number);
    setSelectedAyah(1);
    setSelectedWordIndex(0);
  }

  function toggleLessonSetting(setting: keyof LessonSettings) {
    updateLessonSettings((current) => ({
      ...current,
      [setting]: !current[setting],
    }));
  }

  function markComplete() {
    const next = completed.includes(progressKey)
      ? completed.filter((item) => item !== progressKey)
      : [...completed, progressKey];
    try {
      window.localStorage.setItem("qawt:completed", JSON.stringify(next));
      window.dispatchEvent(new Event("qawt-progress-change"));
    } catch {
      // The interaction still works for the current session without persistent storage.
    }
  }

  function stepAyah(direction: "next" | "previous") {
    const nextNumber =
      direction === "next" ? selectedAyah + 1 : selectedAyah - 1;
    if (nextNumber < 1 || nextNumber > surah.ayahCount) return;
    setSelectedAyah(nextNumber);
    setSelectedWordIndex(0);
  }

  const sectionLabel = "Lesson explorer";
  const visibleSurahs = useMemo(() => surahs, []);

  if (view === "print") {
    return <PrintPreview surah={surah} ayah={ayah} />;
  }

  if (view === "presentation") {
    return (
      <main className="presentation-page">
        <Link
          className="presentation-exit"
          href={`/learn/${surah.number}/${ayah.number}`}
        >
          Exit presentation
        </Link>
        <div className="presentation-kicker">
          {surah.transliteration} · Āyah {ayah.number}
        </div>
        <p className="presentation-arabic" dir="rtl">
          {ayah.arabic}
        </p>
        <p className="presentation-meaning">{ayah.naturalMeaning}</p>
        <p className="presentation-instruction">
          {ayah.words.length} words in this āyah · Select one to open its lesson
        </p>
        <div className="presentation-words" dir="rtl">
          {ayah.words.map((word) => (
            <Link
              className="presentation-word"
              href={`/presentation/${surah.number}/${ayah.number}/word/${word.position}`}
              key={word.id}
            >
              <span className="presentation-word-number">
                {String(word.position).padStart(2, "0")}
              </span>
              <strong dir="rtl">{word.arabic}</strong>
              <small>{word.gloss}</small>
            </Link>
          ))}
        </div>
        <p className="presentation-note">
          One āyah, one clear idea, one word at a time.
        </p>
      </main>
    );
  }

  return (
    <main
      className={`app-shell${quietMode ? " quiet-mode" : ""}${largeArabic ? " large-arabic" : ""}${largeEnglish ? " large-english" : ""}`}
    >
      <header className="topbar">
        <Link
          className="brand"
          href="/"
          aria-label="Qur’anic Arabic Word Tree home"
        >
          <span className="brand-mark" aria-hidden="true">
            و
          </span>
          <span>
            <strong>Word Tree</strong>
            <small>Qur’anic Arabic</small>
          </span>
        </Link>

        <nav className="topnav" aria-label="Primary navigation">
          <Link className={view === "home" ? "active" : ""} href="/">
            Learn
          </Link>
          <Link className={view === "surahs" ? "active" : ""} href="/surahs">
            Sūrahs
          </Link>
          <Link href="/print">Print</Link>
        </nav>

        <div className="topbar-actions">
          <span className="public-pill">
            <span className="status-dot" /> Open to everyone
          </span>
          <button
            className="quiet-button"
            type="button"
            onClick={() => setQuietMode((value) => !value)}
            aria-pressed={quietMode}
          >
            {quietMode ? "Color on" : "Quiet mode"}
          </button>
        </div>
      </header>

      {view === "home" && (
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-line" /> A calmer way into Qur’anic
              Arabic
            </p>
            <h1 id="hero-title">
              Make every word <em>understandable.</em>
            </h1>
            <p className="hero-description">
              Learn the language of the Qur’an by moving from the complete word
              to its root, construction, grammar and place in the āyah.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#lesson">
                Open the lesson <span>↓</span>
              </a>
              <Link className="text-action" href="/surahs">
                Browse the six sūrahs <span>→</span>
              </Link>
            </div>
          </div>
          <div
            className="hero-orbit"
            aria-label="Learning loop illustration"
            role="img"
          >
            <div className="orbit-ring orbit-ring-one" />
            <div className="orbit-ring orbit-ring-two" />
            <div className="orbit-card orbit-card-main">
              <span>WORD</span>
              <strong>ٱلنَّاسِ</strong>
              <small>humankind</small>
            </div>
            <div className="orbit-card orbit-card-root">
              <span>ROOT</span>
              <strong>ن و س</strong>
              <small>people · humanity</small>
            </div>
            <div className="orbit-card orbit-card-note">
              <span>CLUE</span>
              <strong>Repeat it.</strong>
              <small>Seen across 114:1–6</small>
            </div>
            <div className="orbit-spark spark-one" />
            <div className="orbit-spark spark-two" />
          </div>
        </section>
      )}

      <section className="workspace" id="lesson">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-line" /> {sectionLabel}
            </p>
            <h2>Start with the whole word.</h2>
          </div>
          <div className="workspace-summary">
            <span>
              <strong>{completeCount}</strong> complete starter sūrahs
            </span>
            <span className="summary-divider" />
            <span>
              <strong>0</strong> accounts required
            </span>
          </div>
        </div>

        <div className="surah-rail" aria-label="Sūrah selector">
          <div className="rail-label">
            Starter scope <span>109–114</span>
          </div>
          <div className="surah-cards">
            {visibleSurahs.map((item) => (
              <button
                key={item.number}
                type="button"
                className={
                  selectedSurah === item.number
                    ? "surah-card selected"
                    : "surah-card"
                }
                onClick={() => chooseSurah(item)}
              >
                <span className="surah-number">{item.number}</span>
                <span className="surah-card-copy">
                  <strong>{item.transliteration}</strong>
                  <small>{item.englishLabel}</small>
                </span>
                <span
                  className={
                    item.status === "complete"
                      ? "status-tag complete"
                      : "status-tag source"
                  }
                >
                  {item.status === "complete" ? "Ready" : "Source"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lesson-grid">
          <aside className="ayah-sidebar" aria-label="Āyah navigation">
            <div className="sidebar-topline">
              <span>Current sūrah</span>
              <span>{surah.ayahCount} āyāt</span>
            </div>
            <div className="current-surah-name">
              <span className="arabic-mini" dir="rtl">
                {surah.arabicName}
              </span>
              <strong>{surah.transliteration}</strong>
              <small>{surah.englishLabel}</small>
            </div>
            <div className="ayah-list">
              {surah.ayahs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    selectedAyah === item.number
                      ? "ayah-item active"
                      : "ayah-item"
                  }
                  onClick={() => {
                    setSelectedAyah(item.number);
                    setSelectedWordIndex(0);
                  }}
                >
                  <span className="ayah-index">Āyah {item.number}</span>
                  <span className="ayah-preview" dir="rtl">
                    {item.arabic}
                  </span>
                  {completed.includes(
                    getProgressKey(surah.number, item.number),
                  ) && (
                    <span className="check-mark" aria-label="Completed">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="sidebar-note">
              <span className="note-icon">i</span>
              <p>Your progress is kept on this device. No account, no login.</p>
            </div>
          </aside>

          <article className="lesson-canvas">
            <div className="lesson-topline">
              <div>
                <span className="lesson-kicker">
                  {surah.transliteration} / Āyah {ayah.number}
                </span>
                <span
                  className={
                    surah.status === "complete"
                      ? "lesson-status ready"
                      : "lesson-status pending"
                  }
                >
                  {statusLabel[surah.status]}
                </span>
              </div>
              <div className="lesson-tools">
                <details className="lesson-settings">
                  <summary>Lesson settings</summary>
                  <div className="lesson-settings-panel">
                    <button
                      type="button"
                      onClick={() => toggleLessonSetting("showRoot")}
                      aria-pressed={showRoot}
                    >
                      Roots: {showRoot ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLessonSetting("showTransliteration")}
                      aria-pressed={showTransliteration}
                    >
                      Transliteration: {showTransliteration ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLessonSetting("largeArabic")}
                      aria-pressed={largeArabic}
                    >
                      Arabic size: {largeArabic ? "Large" : "Normal"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLessonSetting("largeEnglish")}
                      aria-pressed={largeEnglish}
                    >
                      English size: {largeEnglish ? "Large" : "Normal"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toggleLessonSetting("expandedExplanations")
                      }
                      aria-pressed={expandedExplanations}
                    >
                      Explanations: {expandedExplanations ? "Open" : "Compact"}
                    </button>
                  </div>
                </details>
                <Link
                  className="presentation-control"
                  href={`/presentation?surah=${surah.number}&ayah=${ayah.number}`}
                >
                  Presentation ↗
                </Link>
              </div>
            </div>
            <nav className="lesson-ayah-nav" aria-label="Āyah navigation">
              <button
                type="button"
                onClick={() => stepAyah("previous")}
                disabled={selectedAyah === 1}
              >
                ← Previous
              </button>
              <strong>
                Āyah {selectedAyah} of {surah.ayahCount}
              </strong>
              <button
                type="button"
                onClick={() => stepAyah("next")}
                disabled={selectedAyah === surah.ayahCount}
              >
                Next →
              </button>
            </nav>
            <div className="ayah-heading">
              <span className="ayah-label">
                {String(ayah.number).padStart(2, "0")}
              </span>
              <div>
                <h3 dir="rtl">{ayah.arabic}</h3>
                <p>{ayah.naturalMeaning}</p>
              </div>
            </div>
            <div className="word-select-heading">
              <span>There are {ayah.words.length} words in this āyah.</span>
              <strong> · Select one.</strong>
              <small>
                {" "}
                · Word {selectedWordIndex + 1} of {ayah.words.length}
              </small>
            </div>
            <div
              className="word-strip"
              dir="rtl"
              role="tablist"
              aria-label="Words in Qur’anic order"
            >
              {ayah.words.map((word, index) => (
                <button
                  key={word.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedWordIndex === index}
                  className={
                    selectedWordIndex === index
                      ? "word-chip active"
                      : "word-chip"
                  }
                  onClick={() => setSelectedWordIndex(index)}
                >
                  <span className="word-chip-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong dir="rtl">{word.arabic}</strong>
                  <small>{word.gloss}</small>
                </button>
              ))}
            </div>

            {surah.status === "source-only" ? (
              <SourceOnlyState word={selectedWord} />
            ) : selectedLesson ? (
              <WordFocus
                lesson={selectedLesson}
                word={selectedWord}
                showRoot={showRoot}
                showTransliteration={showTransliteration}
                expandedExplanations={expandedExplanations}
              />
            ) : null}

            <div className="lesson-footer">
              <button
                type="button"
                className={
                  hasCompleted ? "complete-button completed" : "complete-button"
                }
                onClick={markComplete}
              >
                {hasCompleted ? "✓ Āyah completed" : "Mark āyah complete"}
              </button>
              <div className="ayah-stepper">
                <button
                  type="button"
                  onClick={() => stepAyah("previous")}
                  disabled={selectedAyah === 1}
                >
                  ← Previous āyah
                </button>
                <span className="progress-counts">
                  <strong>
                    Āyah {selectedAyah} of {surah.ayahCount}
                  </strong>
                  <small>
                    · Word {selectedWordIndex + 1} of {ayah.words.length}
                  </small>
                </span>
                <button
                  type="button"
                  onClick={() => stepAyah("next")}
                  disabled={selectedAyah === surah.ayahCount}
                >
                  Next āyah →
                </button>
              </div>
            </div>
          </article>

          <aside className="lesson-rail" aria-label="Lesson map">
            <div className="rail-card map-card">
              <div className="rail-card-heading">
                <span>Lesson map</span>
                <span className="tiny-status">
                  {surah.status === "complete" ? "4 steps" : "2 steps"}
                </span>
              </div>
              <div className="map-steps">
                <div className="map-step current">
                  <span>01</span>
                  <div>
                    <strong>Whole word</strong>
                    <small>See it in context</small>
                  </div>
                </div>
                <div className="map-step">
                  <span>02</span>
                  <div>
                    <strong>Root</strong>
                    <small>Picture & word family</small>
                  </div>
                </div>
                <div
                  className={
                    surah.status === "complete" ? "map-step" : "map-step muted"
                  }
                >
                  <span>03</span>
                  <div>
                    <strong>Grammar</strong>
                    <small>Role in the āyah</small>
                  </div>
                </div>
                <div
                  className={
                    surah.status === "complete" ? "map-step" : "map-step muted"
                  }
                >
                  <span>04</span>
                  <div>
                    <strong>Ṣarf</strong>
                    <small>Form family</small>
                  </div>
                </div>
              </div>
            </div>
            <div className="rail-card drill-card">
              <div className="drill-mark">✦</div>
              <span className="card-kicker">Quick recall</span>
              <h4>
                {surah.status === "complete"
                  ? "What does the root picture suggest?"
                  : "This lesson is being prepared."}
              </h4>
              <p>
                {surah.status === "complete"
                  ? "Use the image of the root before looking back at the gloss."
                  : "The Arabic, translation and word order are ready now. The custom Word Tree comes next."}
              </p>
              <button
                type="button"
                onClick={() =>
                  updateLessonSettings((current) => ({
                    ...current,
                    showRoot: true,
                  }))
                }
              >
                {surah.status === "complete"
                  ? "Reveal the root"
                  : "Keep exploring"}{" "}
                <span>→</span>
              </button>
            </div>
            <div className="rail-card source-card">
              <span className="card-kicker">Source layers</span>
              <div className="source-badges">
                {sourceBadges.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
              <p>
                Provider records remain separate until the import normalises
                them.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <strong>Word Tree</strong>
          <span>
            Learn the language of the Qur’an by making every word
            understandable.
          </span>
        </div>
        <div className="footer-links">
          <Link href="/print">Print preview</Link>
          <a href="https://tanzil.net" target="_blank" rel="noreferrer">
            Tanzil source ↗
          </a>
          <span>Prompt 1 prototype</span>
        </div>
      </footer>
    </main>
  );
}

export function PresentationWordView({
  surahNumber,
  ayahNumber,
  wordPosition,
}: {
  surahNumber: number;
  ayahNumber: number;
  wordPosition: number;
}) {
  const surah = getSurah(surahNumber);
  const ayah = getAyah(surahNumber, ayahNumber);
  const word =
    ayah.words.find((item) => item.position === wordPosition) ?? ayah.words[0];
  const lesson = getWordLesson(word);
  const [sectionIndex, setSectionIndex] = useState(0);

  if (!lesson) {
    return (
      <main className="presentation-page presentation-word-page">
        <Link
          className="presentation-exit"
          href={`/presentation?surah=${surah.number}&ayah=${ayah.number}`}
        >
          ← Back to words
        </Link>
        <p className="presentation-kicker">Source text lesson</p>
        <p className="presentation-arabic" dir="rtl">
          {word.arabic}
        </p>
        <p className="presentation-meaning">
          This word is ready for a future custom lesson.
        </p>
      </main>
    );
  }

  const sectionNames = ["Whole word", "Root", "Grammar", "Ṣarf"];
  const orderedForms = orderLessonForms(lesson, word);
  const breakdownParts = getWordBreakdown(word, lesson);
  const nextSection = () =>
    setSectionIndex((value) => Math.min(value + 1, sectionNames.length - 1));
  const previousSection = () =>
    setSectionIndex((value) => Math.max(value - 1, 0));

  return (
    <main className="presentation-page presentation-word-page">
      <Link
        className="presentation-exit"
        href={`/presentation?surah=${surah.number}&ayah=${ayah.number}`}
      >
        ← Back to word chooser
      </Link>
      <div className="presentation-kicker">
        {surah.transliteration} · Āyah {ayah.number} · Word {word.position} of{" "}
        {ayah.words.length}
      </div>
      <div className="presentation-section-card">
        <div className="presentation-section-label">
          Section {String(sectionIndex + 1).padStart(2, "0")} ·{" "}
          {sectionNames[sectionIndex]}
        </div>
        {sectionIndex === 0 && (
          <div className="presentation-section-content">
            <p className="presentation-word-arabic" dir="rtl">
              {word.arabic}
            </p>
            <p className="presentation-word-transliteration">
              {word.transliteration}
            </p>
            <p className="presentation-word-meaning">{lesson.meaning}</p>
            <p className="presentation-word-context">
              In this āyah: {word.gloss}
            </p>
            {breakdownParts.length > 0 && (
              <div className="presentation-breakdown">
                <strong dir="rtl">{word.arabic}</strong>
                <span aria-hidden="true">↓</span>
                <LessonBreakdownParts parts={breakdownParts} presentation />
              </div>
            )}
          </div>
        )}
        {sectionIndex === 1 && (
          <div className="presentation-section-content">
            <span className="presentation-section-kicker">Root picture</span>
            {lesson.root ? (
              <p className="presentation-root" dir="rtl">
                {lesson.root}
              </p>
            ) : (
              <p className="presentation-no-root">No lexical root</p>
            )}
            <p className="presentation-section-copy">{lesson.rootPicture}</p>
            <p className="presentation-section-copy">
              How it is built: <span dir="rtl">{lesson.construction}</span>
            </p>
          </div>
        )}
        {sectionIndex === 2 && (
          <div className="presentation-section-content">
            <span className="presentation-section-kicker">
              Grammar in this āyah
            </span>
            <p className="presentation-section-copy">{lesson.grammar}</p>
            <div className="presentation-grammar-list">
              {(breakdownParts.length > 0
                ? breakdownParts
                : [
                    {
                      text: lesson.construction,
                      label: "Structure",
                      meaning: lesson.grammar,
                    },
                  ]
              ).map((component) => (
                <div key={`${component.text}-${component.label}`}>
                  <strong dir="rtl">
                    {component.displayText ?? component.text}
                  </strong>
                  <span>{component.label}</span>
                  <small>{component.meaning}</small>
                </div>
              ))}
            </div>
          </div>
        )}
        {sectionIndex === 3 && (
          <div className="presentation-section-content">
            <span className="presentation-section-kicker">
              Ṣarf / form family
            </span>
            <p className="presentation-section-title">
              What stays recognisable?
            </p>
            <div className="presentation-form-list">
              {orderedForms.map((item) => (
                <div key={`${item.form}-${item.meaning}`}>
                  <strong dir="rtl">{item.form}</strong>
                  <span>{item.meaning}</span>
                  <small>{item.difference}</small>
                </div>
              ))}
            </div>
            <p className="presentation-section-copy">{lesson.takeaway}</p>
          </div>
        )}
      </div>
      <div
        className="presentation-navigation"
        aria-label="Presentation sections"
      >
        <button
          type="button"
          onClick={previousSection}
          disabled={sectionIndex === 0}
        >
          ← Previous
        </button>
        <span>
          {sectionIndex + 1} / {sectionNames.length}
        </span>
        {sectionIndex < sectionNames.length - 1 ? (
          <button
            type="button"
            className="presentation-next"
            onClick={nextSection}
          >
            Next section →
          </button>
        ) : (
          <Link
            className="presentation-next"
            href={`/presentation?surah=${surah.number}&ayah=${ayah.number}`}
          >
            Choose another word →
          </Link>
        )}
      </div>
    </main>
  );
}

function WordFocus({
  lesson,
  word,
  showRoot,
  showTransliteration,
  expandedExplanations,
}: {
  lesson: NonNullable<ReturnType<typeof getWordLesson>>;
  word: WordOccurrence;
  showRoot: boolean;
  showTransliteration: boolean;
  expandedExplanations: boolean;
}) {
  const breakdownParts = getWordBreakdown(word, lesson);
  const hasComponents = breakdownParts.length > 0;
  const orderedForms = orderLessonForms(lesson, word);
  const grammarItems =
    lesson.components.length > 0
      ? breakdownParts
      : [
          {
            text: lesson.construction,
            label: "Structure",
            meaning: lesson.grammar,
          },
        ];

  return (
    <section className="word-focus" aria-labelledby="word-focus-title">
      <div className="word-focus-head">
        <div className="word-focus-copy">
          <span className="card-kicker">
            Selected word · {String(word.position).padStart(2, "0")}
          </span>
          <h4 id="word-focus-title" dir="rtl">
            {word.arabic}
          </h4>
          <p className="selected-word-meta">
            {showTransliteration && <span>{word.transliteration}</span>}
            <span>· {lesson.meaning}</span>
          </p>
        </div>
        <button
          className="listen-button"
          type="button"
          disabled
          aria-label={`Listen to ${word.arabic}`}
          title="Audio will be connected when the recitation source is imported"
        >
          ▶ Listen
        </button>
      </div>
      <div className="meaning-line">
        <span>In this āyah</span>
        <strong>{word.gloss}</strong>
      </div>
      {hasComponents && (
        <div className="selected-word-breakdown" aria-label="Word breakdown">
          <strong dir="rtl">{word.arabic}</strong>
          <span className="breakdown-arrow" aria-hidden="true">
            ↓
          </span>
          <LessonBreakdownParts parts={breakdownParts} />
          <p>{lesson.meaning}</p>
        </div>
      )}
      <div className="lesson-sequence">
        {showRoot && (
          <section
            className="lesson-section root-section"
            aria-labelledby="root-section-title"
          >
            <div className="section-heading">
              <span className="section-number">01</span>
              <div>
                <span className="card-kicker">Root</span>
                <h5 id="root-section-title">Where the word comes from</h5>
              </div>
            </div>
            <div className="root-picture-card">
              <span className="field-label">Root picture</span>
              {lesson.root ? (
                <strong dir="rtl">{lesson.root}</strong>
              ) : (
                <strong className="no-root-label">No lexical root</strong>
              )}
              <p>{lesson.rootPicture}</p>
            </div>
            <div className="root-top-grid">
              <div className="detail-card">
                <span className="field-label">Root</span>
                {lesson.root ? (
                  <strong className="detail-arabic" dir="rtl">
                    {lesson.root}
                  </strong>
                ) : (
                  <strong className="no-root-label">No lexical root</strong>
                )}
              </div>
              <div className="detail-card">
                <span className="field-label">How it is built</span>
                <strong className="construction" dir="rtl">
                  {lesson.construction}
                </strong>
              </div>
            </div>
            <div className="lesson-detail-stack">
              <div className="detail-card">
                <span className="field-label">What kind of word?</span>
                <p className="type-value">{lesson.type}</p>
              </div>
              <div className="detail-card">
                <span className="field-label">Sentence role</span>
                <p>{lesson.sentenceRole}</p>
              </div>
              <div className="detail-card">
                <span className="field-label">Recognition clue</span>
                <p>{lesson.recognitionClue}</p>
              </div>
            </div>
          </section>
        )}

        <section
          className="lesson-section grammar-section"
          aria-labelledby="grammar-section-title"
        >
          <div className="section-heading">
            <span className="section-number">02</span>
            <div>
              <span className="card-kicker">Grammar in this āyah</span>
              <h5 id="grammar-section-title">How the parts make meaning</h5>
            </div>
          </div>
          <p className="grammar-lead">{lesson.grammar}</p>
          <div className="grammar-breakdown">
            {grammarItems.map((component) => (
              <div
                className="grammar-row"
                key={`${component.text}-${component.label}`}
              >
                <strong dir="rtl">
                  {component.displayText ?? component.text}
                </strong>
                <div>
                  <b>{component.label}</b>
                  {expandedExplanations && <p>{component.meaning}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          className="lesson-section sarf-section"
          aria-labelledby="sarf-section-title"
        >
          <div className="section-heading">
            <span className="section-number">03</span>
            <div>
              <span className="card-kicker">Ṣarf / form family</span>
              <h5 id="sarf-section-title">What stays recognisable?</h5>
            </div>
          </div>
          <div className="form-table">
            {orderedForms.map((item, index) => (
              <div
                className={index === 0 ? "form-row current" : "form-row"}
                key={`${item.form}-${item.meaning}`}
              >
                <strong dir="rtl">{item.form}</strong>
                <span>{item.meaning}</span>
                <small>{item.difference}</small>
              </div>
            ))}
          </div>
          {expandedExplanations && (
            <div className="takeaway">
              <span>Takeaway</span>
              <p>{lesson.takeaway}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function SourceOnlyState({ word }: { word: WordOccurrence }) {
  return (
    <section className="source-only-state" aria-label="Custom lesson pending">
      <div className="pending-icon">○</div>
      <div>
        <span className="card-kicker">Source layer available</span>
        <h4>{word.arabic} is ready to explore at the text level.</h4>
        <p>
          We have the exact Arabic, position and imported source fields. The
          complete Word Tree lesson for this word has not been authored yet.
        </p>
        <div className="pending-fields">
          <span>Arabic text ✓</span>
          <span>Word position ✓</span>
          <span>Custom teaching pending</span>
        </div>
      </div>
    </section>
  );
}

function PrintPreview({
  surah,
  ayah,
}: {
  surah: Surah;
  ayah: ReturnType<typeof getAyah>;
}) {
  return (
    <main className="print-page">
      <div className="print-toolbar">
        <Link href={`/learn/${surah.number}/${ayah.number}`}>
          ← Back to lesson
        </Link>
        <span>Printable handout · A4 prototype</span>
        <button type="button" onClick={() => window.print()}>
          Print this page
        </button>
      </div>
      <article className="print-sheet">
        <header className="print-header">
          <span>Qur’anic Arabic Word Tree</span>
          <span>
            Lesson {surah.number}:{ayah.number}
          </span>
        </header>
        <div className="print-title">
          <span className="card-kicker">
            {surah.transliteration} · {surah.englishLabel}
          </span>
          <h1>One āyah, one clear idea.</h1>
          <p>
            Meaning, word order and the first root picture—ready for a classroom
            conversation.
          </p>
        </div>
        <div className="print-ayah">
          <p dir="rtl">{ayah.arabic}</p>
          <span>{ayah.naturalMeaning}</span>
        </div>
        <div className="print-word-grid">
          {ayah.words.map((word) => {
            const wordLesson = getWordLesson(word);
            return (
              <div className="print-word" key={word.id}>
                <span>{String(word.position).padStart(2, "0")}</span>
                <strong dir="rtl">{word.arabic}</strong>
                <b>{word.gloss}</b>
                <small>
                  {wordLesson?.rootPicture ??
                    "Source field ready for later teaching content."}
                </small>
              </div>
            );
          })}
        </div>
        <div className="print-reflection">
          <span className="card-kicker">Try this</span>
          <h2>{ayah.drills[0]}</h2>
          <p>
            Say the answer aloud, then return to the digital lesson to explore
            the construction.
          </p>
        </div>
        <footer className="print-footer">
          <span>Content model: canonical lesson → digital + print</span>
          <span>Free · public · no account</span>
        </footer>
      </article>
    </main>
  );
}
