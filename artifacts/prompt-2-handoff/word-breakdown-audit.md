# WordBreakdown audit — Prompt 2 handoff

Inspection only. No lesson content, application code, schema, database or browser state was modified.

## Scope

The current TypeScript fixture data, all six import packages, `content-import/schema/word.schema.json`, and the existing tests were inspected. The audit covers every visible word occurrence in sūrahs 109–114: 27 āyāt and 127 occurrences. Browser testing and PostgreSQL work were intentionally not performed. The JSON file is the authoritative machine-readable occurrence register.

## Final counts

| Category | Count | Interpretation |
|---|---:|---|
| Valid segmented breakdowns | 2 | The two أَعُوذُ occurrences. |
| Valid atomic breakdowns | 0 | No authored one-part WordBreakdown exists. |
| Effective atomic fallbacks | 29 | Safe complete-word runtime fallbacks, not locked authored content. |
| Missing breakdowns | 98 | 69 source-only occurrences plus 29 custom fallback occurrences. |
| Invalid or incomplete breakdowns | 18 | Legacy parts do not cover the complete visible word. |
| Words still using legacy component data | 9 | Complete legacy parts without explicit WordBreakdown metadata. |

These disjoint categories total 127: 2 + 0 + 98 + 18 + 9.

## 1. Valid segmented breakdowns

- `word:113:1:2` — أَعُوذُ — shared breakdown أَ + عُوذُ; import package has an occurrence-level copy.
- `word:114:1:2` — أَعُوذُ — shared breakdown أَ + عُوذُ; import package has an occurrence-level copy.

## 2. Valid atomic breakdowns

None are authored. The runtime safely displays 29 complete custom words as one whole-word fallback, including `قُلْ` and rootless words, but this is not a persisted WordBreakdown contract.

## 3. Missing breakdowns

There are 98 disjoint missing cases: 69 source-only occurrences in 109–111 and 29 complete custom occurrences using whole-word fallback. The JSON register contains every occurrence and its required migration.

## 4. Invalid or incomplete breakdowns

There are 21 incomplete legacy cases. Notable failures are `لَّهُۥ`, where legacy `لِ + هُ` does not concatenate to the canonical source, and `وَٱلنَّاسِ`, where shared `lesson:wa` supplies only `وَ`.

## 5. Words still using legacy component data

The nine complete-but-legacy occurrences are:

- `word:112:2:2` — ٱلصَّمَدُ
- `word:112:3:2` — يَلِدْ
- `word:112:3:3` — وَلَمْ
- `word:112:3:4` — يُولَدْ
- `word:112:4:1` — وَلَمْ
- `word:113:1:3` — بِرَبِّ
- `word:114:1:3` — بِرَبِّ
- `word:114:2:1` — مَلِكِ
- `word:114:3:1` — إِلَٰهِ

Their legacy parts have labels and meanings but no stable part IDs or required `kind` values.

## 6. Shared words that may require occurrence overrides

- `lesson:wa`: shared `وَ` is used for `وَمِن` and `وَٱلنَّاسِ`; the latter needs a complete occurrence-specific record.
- `lesson:min`: shared lesson is used for `مِن` and `مِنَ`; the final-vowel occurrence needs an occurrence-aware decision.
- `lesson:ahad`: the same visible word is glossed uniquely One in 112:1 and anyone in 112:4.
- `lesson:nas`: repeated ٱلنَّاسِ occurrences have different sentence roles.
- `lesson:allah`: the repeated form has a distinct occurrence role in 112:2.

No fixture occurrence currently has a `breakdown` override. The two import-package overrides are the duplicated أَعُوذُ records.

## Required confirmations

| Word | Audit result |
|---|---|
| أَعُوذُ | Valid segmented: أَ + عُوذُ. |
| بِرَبِّ | Legacy only: بِ + رَبِّ concatenates exactly; no authored WordBreakdown. |
| وَلَمْ | Legacy only: وَ + لَمْ concatenates exactly; no authored WordBreakdown. |
| لَّهُۥ | Invalid/incomplete: current لِ + هُ does not concatenate to canonical لَّهُۥ. |
| وَٱلنَّاسِ | Incomplete shared legacy data: `lesson:wa` supplies only وَ. |
| قُلْ | Safe atomic runtime fallback; no fabricated split, but no authored atomic record. |
| Rootless particles | Can use authored atomic records, but none currently exist. |
| Display joining lines | `displayText` joining lines do not affect `sourceText` validation. |

## Schema assessment

`content-import/schema/word.schema.json` supports `sourceText`, `displayText`, `label`, `meaning`, `kind`, ordered integer parts, and occurrence-level `word.breakdown` overrides. It does not support stable part IDs. It does not explicitly encode atomic versus segmented mode; mode is inferred from part count. It requires `order` but does not enforce unique contiguous order itself. It has no shared teaching-entry breakdown schema; shared fixture data currently lives in `lesson.breakdown` in TypeScript.

## Test assessment

Existing tests cover the authored أَعُوذُ package record in 113 and 114, teaching mappings for complete packages, selected corrected mappings, and package presence. They do not audit all 127 occurrences, validate the schema contract, cover the requested special words, validate rootless atomic records, stable part IDs, or occurrence override behavior.

## Readiness decision

The repository is **not ready** to lock WordBreakdown as a Prompt 2 contract: only 2 of 127 occurrences have authored WordBreakdown data; 98 are missing, 18 are invalid/incomplete legacy cases, and 9 remain complete-but-legacy. Schema and test gaps are recorded above.

## Occurrence register

| ID | Sūrah:āyah:pos | Canonical source | Custom status | WordBreakdown | Mode | Source parts → display parts | Concatenate | Labels/meanings/kinds | Shared/override | Validation | Migration |
|---|---|---|---|---|---|---|---|---|---|---|---|
|word:109:1:1|109:1:1|قُلْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:1:2|109:1:2|يَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:1:3|109:1:3|أَيُّهَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:1:4|109:1:4|الْكَافِرُونَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:2:1|109:2:1|لَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:2:2|109:2:2|أَعْبُدُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:2:3|109:2:3|مَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:2:4|109:2:4|تَعْبُدُونَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:3:1|109:3:1|وَلَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:3:2|109:3:2|أَنْتُمْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:3:3|109:3:3|عَابِدُونَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:3:4|109:3:4|مَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:3:5|109:3:5|أَعْبُدُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:4:1|109:4:1|وَلَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:4:2|109:4:2|أَنَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:4:3|109:4:3|عَابِدٌ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:4:4|109:4:4|مَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:4:5|109:4:5|عَبَدْتُّمْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:5:1|109:5:1|وَلَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:5:2|109:5:2|أَنْتُمْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:5:3|109:5:3|عَابِدُونَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:5:4|109:5:4|مَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:5:5|109:5:5|أَعْبُدُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:6:1|109:6:1|لَكُمْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:6:2|109:6:2|دِينُكُمْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:6:3|109:6:3|وَلِيَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:109:6:4|109:6:4|دِينِ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:1:1|110:1:1|إِذَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:1:2|110:1:2|جَاءَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:1:3|110:1:3|نَصْرُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:1:4|110:1:4|اللَّهِ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:1:5|110:1:5|وَالْفَتْحُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:2:1|110:2:1|وَرَأَيْتَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:2:2|110:2:2|النَّاسَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:2:3|110:2:3|يَدْخُلُونَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:2:4|110:2:4|فِي|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:2:5|110:2:5|دِينِ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:2:6|110:2:6|اللَّهِ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:2:7|110:2:7|أَفْوَاجًا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:3:1|110:3:1|فَسَبِّحْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:3:2|110:3:2|بِحَمْدِ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:3:3|110:3:3|رَبِّكَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:3:4|110:3:4|وَاسْتَغْفِرْهُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:3:5|110:3:5|إِنَّهُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:3:6|110:3:6|كَانَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:110:3:7|110:3:7|تَوَّابًا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:1:1|111:1:1|تَبَّتْ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:1:2|111:1:2|يَدَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:1:3|111:1:3|أَبِي|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:1:4|111:1:4|لَهَبٍ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:1:5|111:1:5|وَتَبَّ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:2:1|111:2:1|مَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:2:2|111:2:2|أَغْنَىٰ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:2:3|111:2:3|عَنْهُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:2:4|111:2:4|مَالُهُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:2:5|111:2:5|وَمَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:2:6|111:2:6|كَسَبَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:3:1|111:3:1|سَيَصْلَىٰ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:3:2|111:3:2|نَارًا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:3:3|111:3:3|ذَاتَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:3:4|111:3:4|لَهَبٍ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:4:1|111:4:1|وَامْرَأَتُهُ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:4:2|111:4:2|حَمَّالَةَ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:4:3|111:4:3|الْحَطَبِ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:5:1|111:5:1|فِي|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:5:2|111:5:2|جِيدِهَا|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:5:3|111:5:3|حَبْلٌ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:5:4|111:5:4|مِّن|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:111:5:5|111:5:5|مَّسَدٍ|source-only|no|missing / missing|? ? ?|?|?|none / no|missing-authored-breakdown: no custom lesson or authored breakdown|Author custom content and an explicit breakdown.|
|word:112:1:1|112:1:1|قُلْ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:1:2|112:1:2|هُوَ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:1:3|112:1:3|ٱللَّهُ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:1:4|112:1:4|أَحَدٌ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:2:1|112:2:1|ٱللَّهُ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:2:2|112:2:2|ٱلصَّمَدُ|complete|no|missing / segmented|ٱلـ + صَّمَدُ ? ٱلـ + صَّمَدُ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:112:3:1|112:3:1|لَمْ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:3:2|112:3:2|يَلِدْ|complete|no|missing / segmented|يَ + لِدْ ? يَ + لِدْ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:112:3:3|112:3:3|وَلَمْ|complete|no|missing / segmented|وَ + لَمْ ? وَ + لَمْ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:112:3:4|112:3:4|يُولَدْ|complete|no|missing / segmented|يُ + ولَدْ ? يُ + ولَدْ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:112:4:1|112:4:1|وَلَمْ|complete|no|missing / segmented|وَ + لَمْ ? وَ + لَمْ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:112:4:2|112:4:2|يَكُن|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:4:3|112:4:3|لَّهُۥ|complete|no|missing / atomic|لِ + هُ ? لِ + هُ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:112:4:4|112:4:4|كُفُوًا|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:112:4:5|112:4:5|أَحَدٌ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:1:1|113:1:1|قُلْ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:1:2|113:1:2|أَعُوذُ|complete|yes|segmented / segmented|أَ + عُوذُ ? أَـ + عُوذُ|yes|yes|shared-and-occurrence-specific / yes|valid|None|
|word:113:1:3|113:1:3|بِرَبِّ|complete|no|missing / segmented|بِ + رَبِّ ? بِ + رَبِّ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:113:1:4|113:1:4|ٱلْفَلَقِ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:2:1|113:2:1|مِن|complete|no|missing / atomic|مِنْ + ـَ ? مِنْ + ـَ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:2:2|113:2:2|شَرِّ|complete|no|missing / atomic|مِنْ ? مِنْ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:2:3|113:2:3|مَا|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:2:4|113:2:4|خَلَقَ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:3:1|113:3:1|وَمِن|complete|no|missing / atomic|وَ ? وَ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:3:2|113:3:2|شَرِّ|complete|no|missing / atomic|مِنْ ? مِنْ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:3:3|113:3:3|غَاسِقٍ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:3:4|113:3:4|إِذَا|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:3:5|113:3:5|وَقَبَ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:4:1|113:4:1|وَمِن|complete|no|missing / atomic|وَ ? وَ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:4:2|113:4:2|شَرِّ|complete|no|missing / atomic|مِنْ ? مِنْ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:4:3|113:4:3|ٱلنَّفَّاثَاتِ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:4:4|113:4:4|فِي|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:4:5|113:4:5|ٱلْعُقَدِ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:5:1|113:5:1|وَمِن|complete|no|missing / atomic|وَ ? وَ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:5:2|113:5:2|شَرِّ|complete|no|missing / atomic|مِنْ ? مِنْ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:113:5:3|113:5:3|حَاسِدٍ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:5:4|113:5:4|إِذَا|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:113:5:5|113:5:5|حَسَدَ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:1:1|114:1:1|قُلْ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:1:2|114:1:2|أَعُوذُ|complete|yes|segmented / segmented|أَ + عُوذُ ? أَـ + عُوذُ|yes|yes|shared-and-occurrence-specific / yes|valid|None|
|word:114:1:3|114:1:3|بِرَبِّ|complete|no|missing / segmented|بِ + رَبِّ ? بِ + رَبِّ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:114:1:4|114:1:4|ٱلنَّاسِ|complete|no|missing / atomic|ٱلـ ? ٱلـ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:2:1|114:2:1|مَلِكِ|complete|no|missing / segmented|مَلِك + ـِ ? مَلِك + ـِ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:114:2:2|114:2:2|ٱلنَّاسِ|complete|no|missing / atomic|ٱلـ ? ٱلـ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:3:1|114:3:1|إِلَٰهِ|complete|no|missing / segmented|إِلَٰه + ـِ ? إِلَٰه + ـِ|yes|no|none / no|legacy-complete: no explicit WordBreakdown; legacy components remain|Migrate legacy parts to explicit WordBreakdown metadata.|
|word:114:3:2|114:3:2|ٱلنَّاسِ|complete|no|missing / atomic|ٱلـ ? ٱلـ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:4:1|114:4:1|مِن|complete|no|missing / atomic|مِنْ + ـَ ? مِنْ + ـَ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:4:2|114:4:2|شَرِّ|complete|no|missing / atomic|مِنْ ? مِنْ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:4:3|114:4:3|ٱلْوَسْوَاسِ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:4:4|114:4:4|ٱلْخَنَّاسِ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:5:1|114:5:1|ٱلَّذِي|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:5:2|114:5:2|يُوَسْوِسُ|complete|no|missing / atomic|يُ ? يُ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:5:3|114:5:3|فِي|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:5:4|114:5:4|صُدُورِ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:5:5|114:5:5|ٱلنَّاسِ|complete|no|missing / atomic|ٱلـ ? ٱلـ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:6:1|114:6:1|مِنَ|complete|no|missing / atomic|مِنْ + ـَ ? مِنْ + ـَ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
|word:114:6:2|114:6:2|ٱلْجِنَّةِ|complete|no|missing / atomic|? ? ?|?|?|none / no|missing-authored-breakdown: no explicit WordBreakdown; runtime whole-word fallback used|Author an explicit atomic whole-word breakdown.|
|word:114:6:3|114:6:3|وَٱلنَّاسِ|complete|no|missing / atomic|وَ ? وَ|no|no|none / no|invalid-or-incomplete: legacy component parts do not concatenate to canonical word; no explicit WordBreakdown; legacy components remain|Replace incomplete legacy parts with an author-reviewed complete breakdown.|
