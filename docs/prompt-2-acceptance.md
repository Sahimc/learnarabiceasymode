# Prompt 2 acceptance checklist

Prompt 2 is complete only when every item below is checked against the running application and the production database.

## Content and database

- [ ] PostgreSQL is configured and the connection is not exposed to the browser.
- [ ] Migrations work on a fresh database and a repeat run.
- [ ] All six packages validate.
- [ ] Imports are transactional.
- [ ] Repeated imports do not duplicate records.
- [ ] A changed package updates stable records rather than creating duplicates.
- [ ] Package-owned removal/archive behavior is tested.
- [ ] Sūrahs 109–114 exist.
- [ ] Sūrahs 112–114 contain complete starter custom content.
- [ ] Sūrahs 109–111 show source-only/incomplete states.
- [ ] Provider records remain separately attributable.
- [ ] Tanzil attribution and text handling are present.

## Digital experience

- [ ] Public home loads without authentication.
- [ ] Mobile layout is usable at 360px width.
- [ ] Tablet layout is usable at 768px width.
- [ ] Desktop layout is usable at 1280px width.
- [ ] Word order matches source records.
- [ ] Arabic word controls and lesson content render right-to-left, with the English gloss below each word.
- [ ] Full āyah Arabic and English translation are centered, and the selected word metadata is centered beneath it.
- [ ] Lesson progress explicitly distinguishes `Āyah x of y` from `Word x of y`.
- [ ] The selected-word audio control is a clear `Listen` control rather than an ambiguous loading spinner.
- [ ] Supporting text, form-family meanings, recognition clues, labels and contrast remain readable on tablets and projectors.
- [ ] Whole word appears before components and form family.
- [ ] Presentation word cards are clickable and open a full-page word lesson with a back link.
- [ ] Presentation navigation moves through whole word → root → grammar → ṣarf.
- [ ] The lesson sequence is one vertical flow: root → grammar → ṣarf, with root picture first.
- [ ] Rootless words have a short plain-English explanation instead of a dash.
- [ ] Root visibility and future display controls live inside the lesson settings control.
- [ ] Root, morphology and custom teaching data are visibly distinguished.
- [ ] Repeated words link to shared content and occurrence context.
- [ ] Drills work without an account.
- [ ] Local progress survives reload when storage is available.
- [ ] The app remains usable when storage is blocked.
- [ ] Presentation view works with keyboard controls.
- [ ] No route redirects to sign-in or expects identity headers.

## Print

- [ ] Current āyah handout renders.
- [ ] Complete sūrah PDF renders.
- [ ] A5 volume PDF renders for the approved first volume scope.
- [ ] Arabic and RTL layout are legible.
- [ ] Page numbers, running headings, contents and credits are present where required.
- [ ] Printed lesson content comes from the shared lesson model.
- [ ] Reimporting content changes newly generated PDFs without manual copy edits.
- [ ] Generated document stores a content fingerprint.

## Backend and operations

- [ ] Backend remains lightweight and single-application.
- [ ] No Redis, queues, microservices or multi-tenant infrastructure was added.
- [ ] Health route works without exposing secrets.
- [ ] Search and public refresh routes have abuse controls.
- [ ] Environment variables are documented in `.env.example`.
- [ ] Production Node version is pinned to a supported release.

## Tests and final handoff

- [ ] Format passes.
- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Unit tests pass.
- [ ] Import validation and transaction tests pass.
- [ ] Integration tests pass.
- [ ] Selected Playwright flows pass.
- [ ] Production build passes.
- [ ] Screenshots or browser evidence cover home, complete lesson, source-only state, mobile layout, presentation and print preview.
- [ ] Final report includes the public URL, main routes, test results, import commands, database commands and known limitations.
