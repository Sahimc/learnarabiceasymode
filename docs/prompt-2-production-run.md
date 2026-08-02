# Prompt 2 production run record

Date: 2026-08-02
Branch: `agent/rtl-lesson-redesign`

## Result

The approved Prompt 2 implementation is complete for all non-blocked local scope. The application is public and requires no authentication. PostgreSQL is the canonical runtime source. The approved prototype visual direction remains the web lesson and presentation baseline.

## Content

- Full source layer: 114 sūrahs, 6,236 āyāt, 77,442 visible word occurrences.
- Custom teaching layer: Sūrahs 112–114, 58 custom occurrences.
- Source-only layer: 111 sūrahs, including 109–111 and all other not-yet-reviewed sūrahs.
- Six-sūrah regression: 127 occurrences; 69 source-only and 58 custom.
- WordBreakdown resolution: 46 explicit atomic and 12 explicit segmented records; 58 occurrence overrides; 37 teaching entries.
- Source reconstruction: 6,236 retained Tanzil raw āyah variants, with canonical source attribution and version metadata.

Required examples are locked by tests: `أَعُوذُ` → `أَ + عُوذُ`, `بِرَبِّ` → `بِ + رَبِّ`, `وَلَمْ` → `وَ + لَمْ`, `وَٱلنَّاسِ` → `وَ + ٱلنَّاسِ`, `قُلْ` atomic, and `لَّهُۥ` atomic until an exact reviewed segmentation is supplied.

## Runtime systems

- PostgreSQL 17.5 with 29 Drizzle-managed tables and ordered migrations.
- Versioned JSON/Zod package contracts, source-only/custom-complete status, stable IDs, source variants, occurrence overrides and importer validation.
- Deterministic, transactional, package-aware imports with dry-run/no-op behavior.
- Shared database lesson service used by lessons, presentation, print data, indexes and search.
- Full sūrah library, source-only state, public local progress/settings, presentation word routes, root index, ṣarf/form index, search and `/api/health`.
- Explicit PDF generation through Playwright/Chromium with paged CSS, page numbers and deterministic fingerprints. Paged.js-compatible print CSS remains the primary print styling boundary.

## Generated documents

- `artifacts/generated-pdfs/ayah-114-1.pdf` — A4, 4 pages.
- `artifacts/generated-pdfs/surah-114.pdf` — A4, 13 pages.
- `artifacts/generated-pdfs/volume-final-six-surahs.pdf` — A4, 54 pages.

PDF output is derived from the same PostgreSQL lesson model and is independent of browser Lesson Settings.

## Verification

`npm run verify` passed after the final clean-server run:

- Prettier format check: passed.
- ESLint: passed.
- TypeScript strict check: passed.
- Node unit/content tests: 7 passed.
- Production build: passed.
- Playwright E2E: 4 passed across Chromium desktop and Chromium mobile viewport projects.
- Content validation: 114 packages, 77,442 occurrences, 58 custom, 0 missing/invalid breakdowns.
- Database status: PostgreSQL reachable, 29 tables, 114 sūrahs and 6,236 āyāt.

## Commands

Use Node 22.13.0 via `.nvmrc` and npm:

```text
npm run db:migrate
npm run content:validate
npm run content:coverage
npm run content:import -- --dry-run
npm run content:import
npm run pdf:ayah -- --surah 114 --ayah 1
npm run pdf:surah -- --surah 114
npm run pdf:volume -- --volume final-six-surahs
npm run verify
```

## Genuine limitations

Quran.Foundation credentials were not available locally, so its optional refresh/audio integration remains an explicit server-side adapter boundary with truthful unavailable audio. Quranic Arabic Corpus and QuranMorph raw licensed source artifacts were not present, so their evidence tables remain empty rather than being fabricated. The initial full-Qur’an release therefore provides the complete canonical Tanzil source layer and reviewed project teaching, while secondary morphology/audio coverage can be added through controlled refresh/import later.
