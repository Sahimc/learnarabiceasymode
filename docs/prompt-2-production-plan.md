# Prompt 2 one-shot production plan

> Implementation status: this plan has now been executed in the current checkout. The final implementation record is in `docs/prompt-2-production-run.md`; that record supersedes any historical prototype-only status below.

This is the build sequence for the later uninterrupted production prompt. It is intentionally explicit so implementation can proceed without architectural discovery during the build.

## Operating rule

Prompt 2 starts only after the owner approves this plan and resolves the five decisions in `docs/prompt-1-plan.md`. The build must run in dependency order, stop only for a genuine external blocker, and not introduce authentication or unrelated infrastructure.

## Phase 0 — lock the build contract

### P0.1 Environment lock

- Pin Node 22.13.0+ in `.nvmrc`, CI and deployment.
- Choose npm or pnpm and preserve one lockfile.
- Define required environment variables and provide `.env.example`.
- Confirm PostgreSQL provider, connection pooling and SSL requirements.

Exit: clean install, clean TypeScript compile, empty database connection check.

### P0.2 Source/licensing lock

- Record approved translations and permissions.
- Record Quran.Foundation client credentials without committing secrets.
- Record Tanzil attribution and no-modification handling.
- Record font licenses and source credits.

Exit: a reviewed `NOTICE`/credits source exists and imports can fail closed when required metadata is absent.

## Phase 1 — application foundation

### P1.1 Project structure

- Establish App Router route groups for public lessons, print and API.
- Add shared TypeScript config, path aliases, lint, format and test scripts.
- Remove starter-only metadata and dependencies.
- Add error, not-found and loading states.

### P1.2 Design system

- Extract prototype tokens into CSS variables/theme primitives.
- Add typography and Qur’anic font loading strategy.
- Build accessible primitives: button, badge, tabs, card, disclosure, table, progress marker and breadcrumb.
- Keep Arabic direction and font selection explicit.

Exit: the shell renders at mobile, tablet and desktop widths with no account controls.

## Phase 2 — canonical schema and migrations

### P2.1 Drizzle schema

- Implement the source, teaching, drill, publishing and import entities in `docs/database-architecture.md`.
- Add stable IDs, foreign keys, uniqueness and indexes.
- Add provider/source provenance and checksums.

### P2.2 Migrations

- Generate ordered migrations.
- Review generated SQL.
- Test fresh database and repeat migration.
- Add seed metadata only; content is imported through the importer.

Exit: schema creates cleanly and rejects duplicate occurrences and invalid package ownership.

## Phase 3 — content package contracts

### P3.1 Zod schemas

- Define manifest, sūrah, āyah, word, component, form-family, sentence-map, drill and provider-record schemas.
- Version the package schema.
- Preserve unknown provider raw payloads in a controlled raw-data field or source file, not in UI-facing prose.

### P3.2 Starter packages

- Complete 112, 113 and 114 using the reviewed custom fixture.
- Create source-only 109, 110 and 111 packages.
- Include exact Arabic text, word order, translations/transliterations only where approved and explicit status.

Exit: all six packages validate; missing custom content renders as source-only rather than malformed complete content.

## Phase 4 — provider adapters and normalisation

### P4.1 Quran.Foundation adapter

- Implement server-side token acquisition and safe caching.
- Request chapters, verses with words, translations/transliterations, recitations and audio metadata.
- Retry once on token expiry; fail closed on missing credentials.
- Never return provider credentials to the browser.

### P4.2 Tanzil adapter

- Import the approved text version verbatim.
- Store text checksum and attribution metadata.
- Reject changed text unless the source version/checksum is explicitly updated.

### P4.3 Linguistic adapters

- Import Quranic Arabic Corpus records and QuranMorph records separately.
- Normalise roots, lemmas, POS, morphology features, segmentation and syntax links.
- Store conflicts as visible provenance/review warnings.

Exit: a single occurrence can show its source records without one provider deleting another.

## Phase 5 — transactional importer

### P5.1 Validate and assemble

- Discover packages.
- Parse all files.
- Validate structure and semantic references.
- Compute package checksum and stable-ID inventory.

### P5.2 Dry-run diff

- Compare package records to the database.
- Report creates, updates, unchanged rows, archives/removals and warnings.
- Support one-sūrah filtering.

### P5.3 Transactional apply

- Upsert parent-to-child records in dependency order.
- Upsert shared teaching entries before occurrences.
- Upsert form families, sentence maps and drills.
- Apply package-owned removals only.
- Write import and item audit records.

Exit: repeated unchanged import is a no-op; modified one-word import changes only intended records; failed import leaves no partial state.

## Phase 6 — shared lesson service

### P6.1 Repositories

- Implement query modules for sūrah, āyah, occurrence, root, form-family, drills and print scope.
- Keep database-specific joins out of React components.

### P6.2 Normalised lesson model

- Build `getWordLesson`, `getAyahLesson`, `getSurahLesson` and `getVolumeLesson`.
- Resolve repeated words into shared teaching plus occurrence context.
- Resolve source-only status without empty content cards.
- Include provenance and content fingerprint.

Exit: web and print snapshots generated from the same serialised lesson model.

## Phase 7 — public digital application

### P7.1 Navigation and discovery

- Home, sūrah library, āyah navigation, search, root index and pattern index.
- Deep links for every sūrah/āyah/word.
- Public metadata and canonical URLs.

### P7.2 Lesson screens

- Whole-word context and word strip in exact Qur’anic order.
- Word focus: meaning, type, root picture, construction, components, grammar and role.
- Form family appears after the whole word and components.
- Repeated-word context links.
- Source-only notice for 109–111.

### P7.3 Local progress and drills

- Device-local current location and completion markers.
- Drill interactions with no server-side learner identity.
- Graceful storage failure behavior.

### P7.4 Presentation mode

- Large Arabic, contextual meaning and word tiles.
- Keyboard next/previous āyah controls.
- High contrast and no account UI.

Exit: selected public journeys work with a cold browser and no authentication headers.

## Phase 8 — print and book renderer

### P8.1 Print model adapter

- Consume only the shared lesson model.
- Add page metadata, source credits, content version and generated timestamp.

### P8.2 A4 handout

- Current āyah, word strip, selected-word teaching, drill and reflection space.
- Print-safe Arabic font and RTL layout.

### P8.3 Sūrah and volume documents

- Complete sūrah pack.
- A5 volume with title page, contents, section breaks, running headers, page numbers and credits.
- Compare Paged.js and Vivliostyle only if an actual acceptance failure appears.

Exit: the same content fingerprint appears in digital and generated print snapshots.

## Phase 9 — quality and accessibility

### P9.1 Static checks

- Format, lint, typecheck and production build.
- Import schema and migration checks.

### P9.2 Unit/integration

- Stable ID generation.
- Package validation.
- Dry-run diff.
- Transaction rollback.
- Repeated-word resolution.
- Lesson model completeness.
- Drill scoring.

### P9.3 End-to-end

- Open public home.
- Navigate 114:1 → select a word → move to 114:2.
- Open 109:1 and verify source-only state.
- Mark local completion and reload.
- Open presentation view.
- Generate a PDF and assert title, Arabic and source credits.

### P9.4 Accessibility

- Keyboard navigation.
- Screen-reader headings/roles.
- RTL direction and meaningful labels.
- Contrast at mobile and desktop.
- Reduced-motion behavior.

Exit: all required gates pass; failures are fixed before deployment.

## Phase 10 — production data import

### P10.1 Preflight

- Validate all six packages.
- Run dry-run and review change summary.
- Confirm translation/font/license metadata.

### P10.2 Import

- Apply 109–114 in one controlled release sequence.
- Record package versions/checksums.
- Verify counts: six sūrahs, 27 āyāt, ordered occurrences, complete teaching for 112–114.

### P10.3 Print snapshots

- Generate representative 112, 113 and 114 documents.
- Store content fingerprints and generation metadata.

Exit: production database and generated documents are traceable to package versions.

## Phase 11 — deploy and observe

### P11.1 Deploy

- Set Node runtime and environment variables.
- Apply migrations.
- Import content.
- Deploy public application.

### P11.2 Health and safety

- `/api/health` checks app and database connectivity without exposing secrets.
- Add public rate limits to search and refresh routes.
- Set security headers, CSP compatible with font/audio needs and no credential leakage.
- Configure error reporting without user identity tracking.

### P11.3 Smoke checks

- Public root returns 200.
- 114:1, 109:1 and print route return 200.
- Search returns expected record.
- No route redirects to sign-in.

Exit: public URL is usable anonymously and rollback steps are documented.

## Phase 12 — handoff

- Report deployment URL, routes, import commands and migration command.
- Report automated test results and data counts.
- Record known limitations and next content-authoring slice.
- Do not begin additional features after the acceptance checklist is green.

## One-shot dependency order

```text
P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12
```

Parallel work is allowed only where it does not create merge ambiguity: design primitives can proceed alongside schema work; print CSS can proceed alongside the web shell after the lesson model contract is frozen; test scaffolding can proceed alongside each implementation phase.
