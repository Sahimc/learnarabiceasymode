# Content import design

## Package layout

```text
/content-import
  /schema
    package.schema.json
    word.schema.json
  /surahs
    /109-al-kafirun
      manifest.json
      surah.json
      /ayahs/001/ayah.json
      /ayahs/001/words/001-qul.json
    /110-an-nasr
    /111-al-masad
    /112-al-ikhlas
    /113-al-falaq
    /114-an-nas
  /volumes
    final-six-surahs.json
  /sources
    /tanzil
    /quran-foundation
    /quranic-arabic-corpus
    /quranmorph
```

One sūrah package is the smallest independently valid import unit. A package can be authored or corrected a file at a time, but the importer validates the assembled package before touching PostgreSQL.

## Manifest contract

```json
{
  "schemaVersion": 1,
  "packageId": "surah-114-al-nas",
  "surahNumber": 114,
  "contentVersion": 1,
  "title": "Al-Nās",
  "customContentStatus": "complete",
  "includedAyahs": [1, 2, 3, 4, 5, 6],
  "sources": ["tanzil", "quran-foundation", "quranic-arabic-corpus"],
  "notes": "Starter custom Word Tree content."
}
```

Allowed `customContentStatus` values: `source-only`, `partial`, `complete`.

## Validation rules

The Zod package schema and semantic validator must check:

1. Manifest schema version and package ID.
2. Sūrah number, title and folder match.
3. All included āyah files exist exactly once.
4. Āyah numbers are contiguous and ordered.
5. Word positions are contiguous and ordered.
6. Every word has exact Arabic text and a stable occurrence ID.
7. Every complete word has meaning, type, construction, grammar, sentence role, recognition clue and at least one form-family entry.
8. Every authored word breakdown has a sourceText equal to the complete word, and its ordered parts concatenate to that sourceText.
9. Every breakdown part stores sourceText, displayText, label, meaning and kind. displayText may add a joining line such as `أَـ`, but sourceText must remain the exact Qur’anic segment.
10. Legacy or incomplete component data must never silently hide the remainder of a word; the application falls back to the complete word and the validator reports the missing breakdown for authoring.
11. Every repeated-word reference points to a valid shared teaching ID.
12. Every drill points to an existing scope and has an answer.
13. Provider records retain provider name, version/date, source ID and raw-record checksum.
14. Tanzil text is not silently normalised or rewritten.
15. Unknown fields fail validation unless the package schema explicitly allows an extension namespace.

## Import commands

```text
npm run content:validate
npm run content:validate -- --surah 114
npm run content:status
npm run content:import -- --surah 114 --dry-run
npm run content:import -- --surah 114
npm run content:import
```

The final CLI may use `pnpm` in the production repository if the owner standardises on pnpm; the command contract is more important than the package-manager spelling.

## Transaction flow

```text
discover package
  → parse manifest and files
  → validate structural and semantic rules
  → assemble package graph
  → compute package checksum
  → compare stable IDs and fingerprints
  → print additions/updates/removals
  → if not dry-run, begin transaction
  → upsert source records
  → upsert custom teaching records
  → archive/remove package-owned records intentionally absent
  → write content_import and item rows
  → commit
```

If any stage fails, no content row or import audit row is partially committed. Unrelated sūrahs are outside the transaction scope and remain unchanged.

## Provider merge policy

Provider data is stored as separate records first:

```text
quran-foundation / verse text and word data
tanzil          / canonical locally stored Arabic text
qac             / morphology, roots, lemmas, syntax and segmentation
quranmorph      / additional reviewed lemma and POS evidence
```

A normalisation step selects a current canonical view per field, but retains all available evidence and provenance. Conflicts become import warnings or explicit review items, not silent overwrites. Custom teaching prose is never generated automatically from a provider record.

## Content ownership and removals

Every row created by a package carries `contentPackageId` or equivalent. A re-import computes the package-owned ID set. A missing stable ID is removed or archived only if it belongs to that package and the import flag permits removals. No global delete is allowed.

## Initial package states

- 109–111: exact Arabic, āyah structure, word order, available translation/transliteration/source morphology, custom status `source-only`.
- 112–114: complete custom Word Tree content with all words represented, repeated occurrences linked to shared teaching entries, sentence maps and drills.
