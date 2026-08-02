# Prompt 1 prototype review map

The prototype is fixture-backed to keep Prompt 1 inside its stated boundary. It demonstrates the public learner journey and the incomplete-content state without pretending that the production database or importer is already implemented.

## Review routes

| Route           | Screenshot target        | What to inspect                                            |
| --------------- | ------------------------ | ---------------------------------------------------------- |
| `/`             | `home-desktop.png`       | Public hero, no-auth message, sūrah scope and lesson entry |
| `/learn/114/1`  | `lesson-114-1.png`       | Complete word-first lesson, root picture and form family   |
| `/learn/109/1`  | `source-only-109-1.png`  | Exact source layer and polished incomplete notice          |
| `/presentation` | `presentation-114-1.png` | Large Arabic classroom view                                |
| `/print`        | `print-114-1.png`        | A4-style print handout and content provenance language     |
| `/surahs`       | `surah-library.png`      | Six-sūrah scope and status tags                            |

## Automated screenshot plan

Use the local dev server and a browser automation tool to:

1. open each route;
2. wait for network idle;
3. capture a desktop screenshot;
4. capture a 390px mobile screenshot for `/learn/114/1`;
5. verify body text is non-empty;
6. verify no framework error overlay or console error is present;
7. store outputs under `artifacts/screenshots/prompt-1/`.

The screenshot files are review artifacts, not production assets. Do not add screenshots to the public application bundle.
