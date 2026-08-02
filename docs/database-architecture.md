# Database architecture

## Canonical rules

PostgreSQL is the runtime source of truth after import. Import packages are versioned authoring and transfer files. Every package-owned record uses a stable identifier and a package ownership key so a later import can update only the intended sūrah and archive or remove records intentionally removed from that package.

All writes from a content import occur in one transaction. A failed validation, checksum mismatch or foreign-key conflict rolls back the whole package. Re-importing an unchanged package is a no-op.

## Entity groups

### Source Qur’anic and linguistic records

| Entity                | Key fields                                                        | Purpose                                       |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| `surah`               | `id=surah:<number>`, number, Arabic name, transliteration, status | Chapter identity and package status           |
| `ayah`                | `id=ayah:<surah>:<number>`, surah ID, number, Arabic text         | Ordered verse record                          |
| `word_occurrence`     | `id=word:<surah>:<ayah>:<position>`, ayah ID, position, text      | Exact visible word occurrence                 |
| `quran_text_variant`  | occurrence ID, provider, script, text, checksum                   | Multiple retained script/text variants        |
| `translation`         | target ID, provider, language, text, license                      | Verse or word translation with provenance     |
| `transliteration`     | target ID, provider, text, scheme                                 | Transliteration with provenance               |
| `audio_reference`     | ayah ID, provider, reciter, URL, duration, timing JSON            | Audio metadata without storing audio binaries |
| `root`                | stable root ID, Arabic letters, transliteration, picture note     | Shared root index                             |
| `lemma`               | stable lemma ID, Arabic, transliteration                          | Lexical base                                  |
| `morphology_record`   | occurrence ID, provider, lemma, root, POS, features JSON          | Separate provider morphology evidence         |
| `morpheme`            | stable ID, text, kind, gloss                                      | Segmentation unit                             |
| `occurrence_morpheme` | occurrence ID, morpheme ID, order                                 | Ordered segmentation                          |
| `lexical_entry`       | lemma/root, language, gloss, source, provenance                   | External lexical evidence                     |

### Project teaching records

| Entity                | Key fields                                                          | Purpose                                |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `teaching_word_entry` | stable ID, canonical visible form, contextual meaning, type, status | Shared custom Word Tree teaching       |
| `teaching_component`  | stable ID, teaching word ID, order, text, label, meaning            | Prefix/stem/suffix/pronoun explanation |
| `root_picture_term`   | root ID, term, explanation, source or project note                  | Plain-English root picture             |
| `recognition_clue`    | teaching word ID, clue text, order                                  | Memory and recognition aids            |
| `form_family`         | stable ID, root/teaching word, title, takeaway                      | Related form group                     |
| `form_family_entry`   | form family ID, order, Arabic form, meaning, difference             | Ṣarf comparison rows                   |
| `ayah_teaching_entry` | ayah ID, natural meaning, sentence explanation, status              | Context-specific lesson prose          |
| `sentence_map_node`   | ayah ID, order, label, parent ID, explanation                       | Sentence assembly/map                  |
| `drill`               | stable ID, ayah/word scope, type, prompt, answer                    | Recall exercise                        |
| `drill_option`        | drill ID, order, option text, correct flag, explanation             | Multiple choice or matching options    |

### Publishing and import records

| Entity                | Key fields                                                                 | Purpose                                     |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `volume`              | stable ID, title, format, status                                           | A5/complete-volume definition               |
| `volume_surah`        | volume ID, surah ID, order                                                 | Volume composition                          |
| `generated_document`  | stable ID, kind, scope ID, content fingerprint, storage URL, generated at  | PDF snapshot tracking                       |
| `content_package`     | package ID, schema version, surah ID, content version, checksum, status    | Package registry                            |
| `content_import`      | import ID, package ID, dry-run flag, actor label, started/finished, result | Import attempt record without user accounts |
| `content_import_item` | import ID, stable ID, action, old/new fingerprints, message                | Auditable change summary                    |

No `user`, `account`, `session`, `organisation`, `role` or `tenant` table exists in the first release.

## Relationship outline

```text
surah 1─* ayah 1─* word_occurrence
word_occurrence 1─* quran_text_variant
word_occurrence 1─* morphology_record
word_occurrence *─1 teaching_word_entry
teaching_word_entry 1─* teaching_component
teaching_word_entry 1─* form_family
form_family 1─* form_family_entry
ayah 1─* ayah_teaching_entry
ayah 1─* sentence_map_node
ayah 1─* drill 1─* drill_option
volume *─* surah through volume_surah
content_package 1─* content_import 1─* content_import_item
```

## Stable IDs and uniqueness

```text
surah:114
ayah:114:1
word:114:1:1
component:114:1:1:main
form:114:1:1:qul
drill:114:1:meaning-01
package:surah-114-al-nas
```

Required unique constraints:

- `surah.number`.
- `ayah (surah_id, number)`.
- `word_occurrence (ayah_id, position)`.
- `quran_text_variant (occurrence_id, provider, script, source_version)`.
- `morphology_record (occurrence_id, provider, source_version)`.
- every stable `id`.
- `content_package (package_id, content_version)`.
- `volume_surah (volume_id, surah_id)`.

## Indexes

- `ayah(surah_id, number)` for navigation.
- `word_occurrence(ayah_id, position)` for exact word order.
- `word_occurrence(text_normalized)` and PostgreSQL full-text/search columns for search.
- `morphology_record(root_id)`, `morphology_record(lemma_id)`, `morphology_record(pos)`.
- `teaching_word_entry(status)`, `form_family(root_id)`.
- `content_package(surah_id, status, content_version)`.
- `generated_document(scope_type, scope_id, content_fingerprint)`.

## Migration sequence

1. Core chapter, āyah and occurrence tables.
2. Provider/source tables and provenance fields.
3. Teaching Word Tree tables.
4. Repeated-word and form-family indexes.
5. Drills and sentence maps.
6. Volume and generated-document records.
7. Content package/import audit tables.
8. Search indexes and performance constraints.

Each migration is reviewed as SQL before being applied. Prompt 2 must include a clean empty-database migration run and a repeat run against an already migrated database.
