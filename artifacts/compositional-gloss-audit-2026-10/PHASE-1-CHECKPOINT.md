# Qur'an compositional-gloss audit — Phase 1 checkpoint

**Checkpoint:** 2026-11-01, after completing Sūrah 2, āyahs 1–21
**Phase:** exhaustive audit and root-cause investigation only  
**Corpus corrections:** none authorized or made

## Coverage ledger

- The repository contains 114 surah packages with 6,236 ayahs and 77,434 distinct package occurrence IDs.
- The ledger has one row for every package occurrence and includes the repository position, canonical source token mapping, current whole-word gloss, current displayed parts, runtime lesson context, translation, morphology evidence, package/runtime provenance, audit state, change-needed value, and comment.
- The ledger has 77,434 unique occurrence IDs and reconciles to the package occurrence count.
- 39,672 occurrences have relevant displayed segmentation and require occurrence-level linguistic adjudication. 37,762 have no relevant displayed segmentation and are explicitly classified `NOT-APPLICABLE` / `NO-RELEVANT-SEGMENTATION`, with `Change needed: No`.
- Canonical alignment checked 77,434 package occurrences against 77,433 Tanzil source tokens after the documented basmalah and standalone-waqf boundaries. The sole one-to-many mapping is Sūrah 109:1, where repository/QAC occurrences 2 and 3 map separately to components of Tanzil token 2. Alignment error count: zero.

## Completed occurrence review

Sūrah 1 is the first completed surah:

- 29 total occurrence rows: 19 segmented and manually adjudicated; 10 atomic and correctly marked not applicable.
- 9 segmented occurrences have `Change needed: Yes` (including two `NEEDS-REVIEW` cases where a compositional defect is established but the final English segment wording needs editorial resolution).
- 10 segmented occurrences have `Change needed: No`.
- Sūrah 2, āyah 1: one occurrence, verified against the package and canonical token 1; atomic, not applicable.
- Sūrah 2, āyah 2: seven occurrences, all repository positions 1–7 verified against canonical visible tokens 1–7; four relevant segmented occurrences individually adjudicated (all `Yes`), and three atomic occurrences marked not applicable.
- Sūrah 2, āyah 3: eight occurrences, all repository positions 1–8 verified against canonical visible tokens 1–8; six relevant segmented occurrences individually adjudicated (all `Yes`), and two atomic occurrences marked not applicable.
- Sūrah 2, āyah 4: twelve occurrences, all repository positions 1–12 verified against canonical visible tokens 1–12; seven relevant segmented occurrences individually adjudicated (`Yes`), and five atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 5: eight occurrences, all repository positions 1–8 verified against canonical visible tokens 1–8; two relevant segmented occurrences individually adjudicated (`Yes`), and six atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 6: eleven occurrences, all repository positions 1–11 verified against canonical visible tokens 1–11; five relevant segmented occurrences individually adjudicated (`Yes`), and six atomic/whole-word occurrences marked not applicable. Position 6 is marked `NEEDS-REVIEW` because a change is clearly needed but the exact English allocation across four displayed pieces requires editorial review.
- Sūrah 2, āyah 7: twelve occurrences, all repository positions 1–12 verified against canonical visible tokens 1–12; five relevant segmented occurrences individually adjudicated (`Yes`), and seven atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 8: eleven occurrences, all repository positions 1–11 verified against canonical visible tokens 1–11; seven relevant segmented occurrences individually adjudicated (six `Yes`, one `No`), and four atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 9: ten occurrences, all repository positions 1–10 verified against canonical visible tokens 1–10; seven relevant segmented occurrences individually adjudicated (all `Yes`), and three atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 10: twelve occurrences, all repository positions 1–12 verified against canonical visible tokens 1–12; six relevant segmented occurrences individually adjudicated (all `Yes`), and six atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 11: eleven occurrences, all repository positions 1–11 verified against canonical visible tokens 1–11; six relevant segmented occurrences individually adjudicated (all `Yes`), and five atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 12: seven occurrences, all repository positions 1–7 verified against canonical visible tokens 1–7; three relevant segmented occurrences individually adjudicated (all `Yes`), and four atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 13: nineteen occurrences, all repository positions 1–19 verified against canonical visible tokens 1–19; twelve relevant segmented occurrences individually adjudicated (all `Yes`), and seven atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 14: sixteen occurrences, all repository positions 1–16 verified against canonical visible tokens 1–16; eleven relevant segmented occurrences individually adjudicated (all `Yes`), and five atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 15: seven occurrences, all repository positions 1–7 verified against canonical visible tokens 1–7; three relevant segmented occurrences individually adjudicated (all `Yes`), and four atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 16: eleven occurrences, all repository positions 1–11 verified against canonical visible tokens 1–11; six relevant segmented occurrences individually adjudicated (all `Yes`), and five atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 17: seventeen occurrences, all repository positions 1–17 verified against canonical visible tokens 1–17; seven relevant segmented occurrences individually adjudicated (all `Yes`), and ten atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 18: six occurrences, all repository positions 1–6 verified against canonical visible tokens 1–6; two relevant segmented occurrences individually adjudicated (both `Yes`), and four atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 19: nineteen occurrences, all repository positions 1–19 verified against canonical visible tokens 1–19; ten relevant segmented occurrences individually adjudicated (all `Yes`), and nine atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 20: twenty-five occurrences, all repository positions 1–25 verified against canonical visible tokens 1–25; ten relevant segmented occurrences individually adjudicated (all `Yes`), and fifteen atomic/whole-word occurrences marked not applicable.
- Sūrah 2, āyah 21: eleven occurrences, all repository positions 1–11 verified against canonical visible tokens 1–11; eight relevant segmented occurrences individually adjudicated (seven `Yes`, one `No`), and three atomic/whole-word occurrences marked not applicable.
- Total segmented occurrences individually adjudicated: 146 of 39,672; 134 `Yes` and 12 `No`. Total segmented occurrences pending: 39,526; stale decisions: zero. In addition, 124 non-segmented occurrences have been individually checked in the twenty-two completed āyahs and remain explicitly marked not applicable.
- Next audit location: Sūrah 2, āyah 22, repository word position 1 (`word:2:22:1`, canonical token 1), verified against both the repository package and Tanzil source.

Each segmented decision has an occurrence ID, snapshot hash, audit state, explicit Yes/No decision, occurrence-specific comment, evidence references, reviewer, and timestamp in `review-decisions.jsonl`. No package word, lesson, breakdown, or runtime data has been changed.

## Root-cause investigation: findings to date

These are observed contributors or reconciliation issues, not yet a final root-cause conclusion for all 39,672 segmented occurrences.

1. The app displays the authored `part.label` as the segment English gloss. Whole-word glosses are stored and displayed separately. Therefore a segment label that repeats the whole-word determiner or a suffix meaning is directly visible to learners.
2. Package-authored breakdowns override provider morphology when content is imported. QAC morphology is evidence, not necessarily the displayed source. In the first surah, QAC itself has several broader stem labels (for example `guide us`, `belongs to Allah`, `upon them`) that package breakdowns sometimes correctly narrow.
3. The current runtime resolves a breakdown for all 77,434 occurrences, and package/runtime displayed breakdown differences are zero in the inspected snapshot. Thus the first reviewed defects are present in the authored package and runtime display rather than being caused by an observed package/runtime breakdown divergence.
4. Seven package checksums differ from their database `content_packages` snapshots (sūrahs 5, 6, 9, 16, 17, 18, 19). The package versions have later correction suffixes. This is a package/database freshness discrepancy; it did not produce a word-occurrence or displayed-breakdown difference in the inventory comparison, but it must be resolved before any future import/correction workflow.
5. Package/runtime lesson fields differ for 59 occurrences (mostly `forms` or `components`); package/runtime ayah text differences are zero. Package translation values differ from the certified runtime translation at 286 occurrences. These require field-level review so audit evidence is attributed to the value the app currently displays.
6. QAC morphology is matched for 77,138 rows; 296 occurrences have no QAC morphology row. These still remain fully auditable from package, canonical text, runtime display, and context; missing provider morphology is not a coverage gap.
7. The repository's read-only content validator currently exits with four Ṣarf synthetic-placeholder failures: `word:9:25:5`, `word:16:91:10`, `word:17:63:10`, and `word:19:85:6`. The raw audit ledger retains those occurrences and all others; these issues are outside compositional-gloss Phase 1 remediation scope unless root-cause evidence makes them directly relevant.

## Validation and evidence limits

- Ledger ID uniqueness, total coverage, segmentation/N/A partition, CSV row count, and compressed/plain CSV byte identity have been checked.
- Current counts are recorded in `coverage-manifest.json`.
- The canonical Arabic alignment uses normalization only for comparison; source and package Arabic have not been rewritten.
- Findings above are preliminary. Phase 1 is not complete until all 39,672 relevant segmented occurrences have individual decisions, pending states reconcile to zero, every proposed change has occurrence-level evidence, and the final root-cause report is reconciled.

## Next checkpoint

Continue in canonical sequence with Sūrah 2, āyah 22, word by word. Preserve occurrence-level decisions even where a surface form or gloss resembles an occurrence reviewed elsewhere. After each completed āyah, post its complete word table in the chat before starting the next āyah.
