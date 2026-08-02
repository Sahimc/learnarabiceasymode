# Qur’anic Arabic Word Tree

Prompt 1 planning and prototype for a public Qur’anic Arabic learning and print platform.

The prototype is intentionally public and anonymous. It has no login, no account system and no server-side learner profile. Optional progress is kept in the browser only.

## Run locally

```text
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The local environment currently has Node 20.17.0, which runs the Next.js prototype. Prompt 2 must pin Node 22.13.0+ for the production toolchain and deployment.

## Prototype routes

- `/` — public landing page and lesson explorer
- `/surahs` — six-sūrah starter scope
- `/learn/114/1` — complete Word Tree lesson
- `/learn/109/1` — source-only/incomplete-content state
- `/presentation` — classroom presentation view
- `/print` — A4 handout preview

## Checks

```text
npm run format
npm run lint
npx tsc --noEmit --incremental false
npm run build
node --test tests/rendered-html.test.mjs
```

## Prompt 1 documents

- `docs/prompt-1-plan.md` — product, route, lesson, no-auth and design plan
- `docs/database-architecture.md` — PostgreSQL entity and migration plan
- `docs/content-import-design.md` — package, validation and transaction plan
- `docs/source-research.md` — researched source/library decisions and licensing gates
- `docs/prompt-2-production-plan.md` — full one-shot production phases and chunks
- `docs/prompt-2-acceptance.md` — production acceptance checklist
- `docs/prototype-screenshots.md` — screenshot review map

## Content fixtures

`content-import/` contains the planned package shape and starter source/custom fixtures for sūrahs 109–114. The prototype reads TypeScript fixtures so Prompt 1 stays lightweight. Prompt 2 will add Zod validation, PostgreSQL migrations, the importer and the shared database lesson service.

