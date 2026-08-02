# Prompt 2 Build Handoff — Fact Collection

Status: pre-build fact collection. This document was consumed as the authoritative input for the completed Prompt 2 production build; see `docs/prompt-2-production-run.md` for the resulting implementation and verification.

## 1. Handoff scope and authoritative audit

The existing WordBreakdown audit is authoritative and has not been repeated or modified:

- `artifacts/prompt-2-handoff/word-breakdown-audit.md`
- `artifacts/prompt-2-handoff/word-breakdown-audit.json`

It covers all 127 visible word occurrences in Sūrahs 109–114. The audit reports every occurrence ID, source word, custom-content state, effective breakdown state, legacy component state, concatenation result, validation result, and migration requirement. Prompt 2 must consume these files as inputs rather than rediscovering their counts.

The colleague’s interpretation is included in this handoff:

- Sūrahs 109–111 are intentionally source-only. Their 69 occurrences do not need invented custom WordBreakdown records in the initial release. They need exact source content and a polished source-only/incomplete lesson state.
- Sūrahs 112–114 contain 58 custom-content occurrences. Two occurrences of أَعُوذُ already have valid explicit segmented records. The remaining 56 custom occurrences require migration: 29 safe whole-word fallbacks, 18 incomplete/invalid legacy records, and 9 complete legacy component records.
- Prompt 2 must not perform that migration during the handoff task.

## 2. Repository snapshot

Repository: `C:\Users\Sahim Chowdhury\Documents\Learn Arabic Easy mode`

- Branch: `agent/rtl-lesson-redesign`
- Latest committed revision: `5c1dab7 Finalize lesson alignment and word breakdowns`
- Remote: `origin` tracks `https://github.com/Sahimc/learnarabiceasymode.git`
- Latest committed implementation is pushed to the tracked remote branch.
- Working tree is dirty only with untracked audit/screenshot artifacts at inspection start; no tracked implementation file was changed by this handoff task. The two files created by this task are also intentionally uncommitted until the owner decides how the handoff should be shared.
- Package manager: npm; lockfile: `package-lock.json`.
- Recorded toolchain: Node `v20.17.0`, npm `10.9.0`; `package.json` declares Node `>=22.13.0`, so the development environment and declared engine are not aligned.

No secrets, credentials, provider tokens, database URLs, or API keys are included in this handoff.

## 3. Current product state

The repository contains a public, no-auth Next.js/React prototype. Anyone can access the application; there is no login wall, account system, or server-side progress identity.

Implemented prototype surface:

- Public home page with hero, starter Sūrah rail, lesson entry, and six starter packages.
- Sūrah browsing view.
- Lesson route with Sūrah sidebar, explicit āyah navigation, RTL word strip, word selection, selected-word lesson, root/grammar/ṣarf sequence, takeaway, and local lesson settings.
- Presentation route with clickable words and separate whole-word, root, grammar, and ṣarf stages.
- Presentation word route for a selected word.
- Print preview route using HTML/CSS print rules and `window.print()`.
- Local-only completion and settings persistence; no account or remote progress.

Still prototype or placeholder:

- Lesson data is read from `app/data/fixtures.ts`, not PostgreSQL.
- External API refresh/import is not implemented.
- Audio metadata and playback are not connected; the Listen control is disabled placeholder UI.
- Search, roots, patterns, morphology indexes, API routes, and production content services are not implemented.
- Print is a current-āyah browser print preview, not the planned complete PDF/EPUB publication pipeline.
- The database files are scaffolding, not a production PostgreSQL schema or migration set.

## 4. Actual routes and important files

Current route files:

- `/` — `app/page.tsx`, home view.
- `/surahs` — `app/surahs/page.tsx`, Sūrah browser.
- `/learn/[surah]/[ayah]` — lesson view.
- `/presentation?surah=&ayah=` — presentation entry.
- `/presentation/[surah]/[ayah]/word/[position]` — presentation word detail.
- `/print` — print preview.

There are currently no API route files. `/api/health` and `/api/search` are planned in the documentation only.

Primary implementation files:

- `app/prototype-app.tsx` — consolidated prototype views and interactions.
- `app/data/fixtures.ts` — canonical current TypeScript fixture model, lesson data, shared lessons, WordBreakdown helpers, and starter content.
- `app/globals.css` — current layout, RTL, responsive, print, typography, and visual styling.
- `app/layout.tsx` — public metadata and global CSS entry.
- `content-import/README.md` — current transfer-format notes.
- `content-import/schema/word.schema.json` — current word-package schema.
- `tests/content-mapping.test.mjs` and `tests/rendered-html.test.mjs` — current automated coverage.

## 5. Current UI contract to preserve in Prompt 2

The current prototype expresses the approved direction: a calm, minimal, Ryo Lu-inspired learning interface with one-column teaching flow where the content is easier to read. Arabic is kept in RTL flow, words are selectable, glosses appear below words, and supporting explanation is centered where it improves balance.

The teaching hierarchy currently intended is:

1. Root — root/root picture where present, rootless explanation where not applicable, and relevant word type.
2. Grammar — construction, component meanings, plain-English sentence explanation, sentence role, and recognition clue.
3. Ṣarf / Form Family — primary form first, related forms, what changed, what stayed recognisable, and takeaway.

The visual grouping must not remove teaching information. A source-only occurrence must be honest and polished rather than receiving invented morphology. A complete custom occurrence must retain its word type, contextual meaning, root information, full construction, component explanation, grammar, sentence role, recognition clue, form family, and takeaway.

The current local settings model has `showRoot`, `showTransliteration`, `largeArabic`, `largeEnglish`, and `expandedExplanations`, persisted under `qawt:lesson-settings`. Completion is stored under `qawt:completed` using per-lesson progress keys. Presentation currently has its own view path and does not consume lesson settings; Prompt 2 must decide whether this is intentional and document it.

## 6. Content inventory and existing WordBreakdown result

Current starter inventory:

| Sūrah     |   Āyāt | Visible occurrences | Current status                 |
| --------- | -----: | ------------------: | ------------------------------ |
| 109       |      6 |                  27 | source-only                    |
| 110       |      3 |                  19 | source-only                    |
| 111       |      5 |                  23 | source-only                    |
| 112       |      4 |                  15 | custom starter                 |
| 113       |      5 |                  23 | custom starter                 |
| 114       |      6 |                  20 | custom starter                 |
| **Total** | **27** |             **127** | **69 source-only / 58 custom** |

Authoritative WordBreakdown totals:

- Authored valid atomic records: 0.
- Effective atomic fallbacks: 29. These are runtime safety fallbacks, not valid authored production breakdowns.
- Valid explicit segmented records: 2, both أَعُوذُ occurrences.
- Missing breakdowns: 98 total — 69 source-only plus 29 custom whole-word fallbacks.
- Invalid or incomplete legacy records: 18.
- Complete legacy component records needing formal conversion: 9.
- Explicit occurrence-level WordBreakdown overrides in the import packages: 2.
- Fixture occurrence-level WordBreakdown overrides: 0.
- Repository ready to lock WordBreakdown as the Prompt 2 production contract: no.

The audit’s required examples must remain explicit in the production migration plan:

- قُلْ — explicit atomic record; do not fabricate a split.
- مِن and فِي — explicit rootless atomic records.
- أَعُوذُ — segmented `أَ` + `عُوذُ`; display the prefix as `أَـ` when a joining line is pedagogically useful, while keeping sourceText as `أَ`.
- بِرَبِّ — segmented `بِ` + `رَبِّ`.
- وَلَمْ — segmented `وَ` + `لَمْ`.
- لَّهُۥ — correct the canonical reconstruction; do not retain the incomplete legacy representation `لِ` + `هُ`.
- وَٱلنَّاسِ — occurrence-specific `وَ` + `ٱلنَّاسِ` where the conjunction is present.
- ٱلنَّفَّاثَاتِ — complete reviewed segmentation.
- Shared lessons such as مِن/مِنَ and ٱلنَّاسِ must preserve contextual meaning and use occurrence-level overrides when the visible word or grammatical role differs.

The audit also identifies shared-review candidates including `lesson:wa`, `lesson:min`, `lesson:ahad`, `lesson:nas`, and `lesson:allah`. These are candidates, not permission to overwrite every occurrence with one context-free explanation.

## 7. Actual fixture and TypeScript WordBreakdown model

The actual TypeScript definitions are in `app/data/fixtures.ts`:

```ts
type WordBreakdownPart = {
  order: number;
  sourceText: string;
  displayText: string;
  label: string;
  meaning: string;
  kind:
    | "prefix"
    | "stem"
    | "suffix"
    | "article"
    | "ending"
    | "connector"
    | "whole";
};

type WordBreakdown = {
  sourceText: string;
  parts: WordBreakdownPart[];
};
```

`WordLesson` has an optional shared `breakdown`; `WordOccurrence` has an optional occurrence-level `breakdown`. `getWordBreakdown` gives occurrence data precedence, validates explicit data, accepts exact legacy component concatenation as a transitional fallback, and otherwise returns a synthetic whole-word fallback. `validateWordBreakdown` checks normalised word equality, ordered concatenation, non-empty parts, contiguous order, and required text fields.

The current model does not contain a stable part ID or explicit `mode`. It infers atomic versus segmented from the number of parts. The current runtime validator is stricter than the JSON schema for some order semantics, but it is fixture/runtime behavior rather than a production import contract.

## 8. Required locked WordBreakdown contract for Prompt 2

Prompt 2 must formalise the following before importing completed custom lessons:

- `mode` is explicitly `atomic` or `segmented`.
- `sourceText` is the complete canonical visible word.
- `displayText` is presentation-only. A joining line such as `أَـ` must never alter canonical source text.
- Every part has a stable part ID, unique within the breakdown, plus contiguous order.
- Every part has `sourceText`, `displayText`, `label`, `meaning`, and `kind`.
- Ordered part sourceText values concatenate exactly to the complete word after the agreed canonical normalisation rules.
- Atomic records are one complete-word part, including rootless particles and simple words such as قُلْ, مِن, and فِي.
- Segmented records contain the internally meaningful components and must not split solely for visual decoration.
- A shared teaching breakdown may be reused where the visible word and lesson meaning are genuinely shared.
- An occurrence-level override must be able to replace the shared breakdown or contextual teaching fields without mutating another occurrence.
- Database constraints and importer validation must enforce unique contiguous ordering and canonical reconstruction.
- A complete custom package cannot enter PostgreSQL without a valid WordBreakdown.
- Invalid custom data fails the package transaction; it must not silently become completed teaching content.
- Legacy incomplete data may be rendered as a safe prototype fallback during migration, but cannot be imported as completed canonical content.

The current `content-import/schema/word.schema.json` supports `sourceText`, ordered parts, `displayText`, `label`, `meaning`, and `kind`, and it allows an occurrence-level `breakdown` property. It does not explicitly support `mode`, stable part IDs, a shared teaching-breakdown reference, or JSON-Schema uniqueness/contiguous-order guarantees. It also does not define the full shared lesson/package contract.

## 9. Import packages and migration state

All six package directories exist under `content-import/surahs/`, each with `manifest.json` and `surah.json`. Sūrahs 109–111 are marked source-only and use simple source word strings. Sūrahs 112–114 are marked complete starter packages with word mappings, but the formal breakdown coverage is incomplete. Only the two audhu package occurrences currently carry explicit segmented breakdown data.

The package format and fixture format are not yet the same contract:

- Packages use `teachingId`; fixtures use `sharedLessonId` and inline/shared lesson data.
- Packages do not yet carry the complete lesson, forms, grammar, components, drills, sentence maps, provenance, providers, or override contract described in the planning documents.
- There is no `package.schema.json` in the current repository.
- There is no importer, package validator command, transaction wrapper, or migration runner in `package.json`.

Prompt 2 must first formalise package validation, then migrate the 56 custom occurrences identified by the audit. It must preserve exact source-only behavior for 109–111 and must not invent custom authored breakdowns for them.

## 10. Database and shared lesson status

The planned database architecture is documented in `docs/database-architecture.md` and names PostgreSQL plus Drizzle entities for Sūrahs, āyāt, word occurrences, source variants, translations, transliterations, audio, roots, morphology, teaching entries, components, form families, sentence maps, drills, packages, imports, and generated documents.

The actual database implementation is not ready:

- `db/schema.ts` is a placeholder and has no production tables.
- `db/index.ts` contains a Cloudflare D1-style example binding path, not a configured PostgreSQL runtime.
- `drizzle.config.ts` currently targets SQLite, not PostgreSQL.
- No migrations exist for the planned entities.
- No WordBreakdown or WordBreakdownPart database model exists.
- No database constraints exist for shared breakdowns, occurrence overrides, canonical reconstruction, or transaction failure.

Prompt 2 must add a production PostgreSQL decision and migration design before import. The shared model should separate reusable teaching breakdowns from occurrence-level override records and retain stable occurrence identity. The importer must validate the complete package before insertion and roll back the package when any completed custom occurrence is invalid.

## 11. Sources, fonts, translations, audio, and print

`docs/source-research.md` records the intended source roles; no external source refresh was performed for this handoff.

- Quran.Foundation Content API v4 is the planned credentialed source for chapters, verses, words, translations, transliteration, tafsīr, recitations, and audio metadata. Credentials are not in the repository.
- Tanzil is the planned local canonical Arabic source and attribution source. Canonical text must remain verbatim.
- Quranic Arabic Corpus is the planned morphology/root/lemma/grammar evidence source; QuranMorph is a secondary source to evaluate.
- Current lesson meanings and translations are authored fixture strings. Source licensing/redistribution approval is not represented in code.
- CSS uses a fallback Arabic stack including Noto Naskh Arabic when installed, but no font binaries or `@font-face` loading are present. A dedicated Qur’anic font system is not implemented.
- Audio is not connected; the current Listen button is disabled placeholder UI.
- `/print` is a browser print preview for the current āyah. Paged.js and Vivliostyle are not installed; no generated PDF/EPUB pipeline exists. Print options must be independent of digital Lesson Settings in Prompt 2.

These are source and release decisions, not reasons to invent data during the handoff.

## 12. Existing tests and required Prompt 2 tests

The recorded most recent `npm test` run passed the production build and five tests. Current scripts are:

- `npm run build` — production build.
- `npm test` — build plus `node --test tests/rendered-html.test.mjs tests/content-mapping.test.mjs`.
- `npm run lint` — ESLint.
- `npm run typecheck` — TypeScript no-emit.
- `npm run format` — Prettier check.

Existing tests cover the audhu authored breakdown, package mapping, selected corrected mappings, public prototype shell, and six-package coverage. They do not audit all 127 occurrences or enforce the final schema contract.

Prompt 2 must add tests for:

- every visible occurrence and exact Qur’anic order;
- explicit valid WordBreakdown for all completed custom occurrences;
- atomic versus segmented mode;
- stable IDs, unique contiguous order, labels, meanings, kinds, and canonical concatenation;
- display-only joining lines;
- قُلْ, بِرَبِّ, وَلَمْ, لَّهُۥ, وَٱلنَّاسِ, ٱلنَّفَّاثَاتِ, rootless مِن/فِي, repeated words, and active/passive contrast;
- shared lesson reuse plus occurrence-level override isolation;
- source-only 109–111 behavior without invented teaching data;
- invalid package transaction rollback;
- settings persistence, hidden-root spacing, responsive text, and print-settings independence;
- selected digital flows and PDF generation where the final renderer is approved.

No browser test was run for this fact-only handoff.

## 13. Documentation versus code

`docs/prompt-2-production-plan.md` describes a P0–P12 one-shot dependency chain: source/environment lock, design foundation, Drizzle schema, Zod package contracts, providers, importer, shared lesson service, public app, print, quality, production import, deployment, and final handoff. Only the prototype-facing portions are presently reusable.

`docs/prompt-2-acceptance.md` already captures much of the recent UI intent: RTL word order, counters, Listen control, Root → Grammar → Ṣarf flow, rootless explanation, Lesson Settings, clickable presentation words, source-only state, and print/import expectations. It must be extended with the locked WordBreakdown requirements above, especially explicit mode, stable part IDs, shared/override database support, unique contiguous ordering, exact migration counts, and transactional importer failure.

`docs/content-import-design.md` describes a richer future package layout, provider provenance, source variants, repeated references, and fallback rules. The actual repository still has flat starter package files and only a word schema, so this is design guidance rather than implemented behavior.

## 14. Phase status

- P0 Source/environment lock — partial; source research exists, but Node engine, production database, credentials, licenses, and provider decisions are unresolved.
- P1 Foundation/design — partial; Next.js prototype and visual language exist.
- P2 Drizzle/PostgreSQL schema — not started; current DB files are placeholder/SQLite/D1 scaffolding.
- P3 Zod/package contracts — partial only; JSON starter packages and word schema exist, but no Zod/package schema or locked WordBreakdown contract.
- P4 Provider adapters — not started.
- P5 Importer and transaction validation — not started.
- P6 Shared lesson service — partial fixture helpers exist; no database-backed service.
- P7 Public app/local progress/presentation — partial prototype exists.
- P8 Print/PDF — partial HTML/CSS preview only.
- P9 Quality/accessibility — partial lint, typecheck, build, and focused tests; no full Prompt 2 matrix.
- P10 Production import — not started.
- P11 Deploy/observe — not started.
- P12 Final production handoff — not started; this report is a fact-collection prerequisite.

## 15. Owner inputs required before production execution

The implementation can be planned from the documented defaults, but final production execution still needs owner decisions on:

1. PostgreSQL hosting and connection/deployment environment.
2. Quran.Foundation credentials and the allowed refresh/import workflow.
3. Translation, Arabic-source attribution, morphology, audio, and font licensing/redistribution approvals.
4. Final print renderer choice and release scope for PDF/EPUB.
5. Whether the current untracked audit/screenshots and this handoff should be committed and pushed, and to which branch.

These decisions must not be silently guessed in the importer or database layer.

## 16. Prompt 2 scope boundary

Prompt 2 production work should cover the P0–P12 chain only after the owner approves the decisions above. Its first locked content gate is the 56-occurrence custom migration from the authoritative audit. It must not add custom WordBreakdown records to the 69 source-only occurrences until those lessons are intentionally authored in a later content scope.

The intended production gate is:

`source/package validation → explicit WordBreakdown contract → shared/override resolution → PostgreSQL transaction validation → lesson service → public UI → print pipeline → tests → import/deploy`

The repository is not currently ready to accept WordBreakdown as a locked production contract without the schema and importer work described above. The handoff itself is ready for a colleague to review; the production build must remain paused until the required owner inputs are resolved.

## 17. File handoff index

Requested handoff inputs:

- `docs/prompt-2-build-handoff.md` — this factual narrative.
- `artifacts/prompt-2-build-handoff.json` — machine-readable summary.
- `package.json` — scripts, versions, and current capability boundary.
- `content-import/schema/word.schema.json` — current schema and its gaps.
- `app/data/fixtures.ts` — actual TypeScript `WordBreakdown` type and fixture implementation.
- `docs/prompt-2-production-plan.md` — newest P0–P12 production plan.
- `docs/prompt-2-acceptance.md` — newest acceptance document.
- `artifacts/prompt-2-handoff/word-breakdown-audit.md` — authoritative detailed audit.
- `artifacts/prompt-2-handoff/word-breakdown-audit.json` — authoritative machine-readable audit.
- `docs/content-import-design.md` — package/source design context.
- `docs/database-architecture.md` — planned database entity and migration context.
- `docs/source-research.md` — source/provider/font/print research roles.
- `tests/content-mapping.test.mjs` and `tests/rendered-html.test.mjs` — current test baseline.

There is no separate bundle folder because the requested handoff task permits only the two new report files. The repository root and the paths above are the shareable handoff location.
