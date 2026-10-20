# Historical Tier A/B1/B2 Ṣarf re-audit

Contract: 1.3.9
Generated: 2026-10-20T21:33:43.094Z

This pass targets only families flagged by the structured historical scan. Unflagged families were not rewritten. Same-root semantic development is permitted, but shell/case/attached-pronoun padding and unsupported forms remain prohibited.

## Summary

```json
{
  "contractVersion": "1.3.9",
  "scope": {
    "tiers": ["A", "B1", "B2"],
    "flaggedFamiliesChecked": 140,
    "changedFamilies": 43,
    "changedOccurrences": 152,
    "changedPackageFiles": [
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\002-al-baqarah\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\003-l-imr-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\004-an-nis\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\005-al-m-idah\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\006-al-an-m\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\007-al-a-r-f\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\008-al-anf-l\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\009-at-tawbah\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\010-y-nus\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\011-h-d\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\012-y-suf\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\013-ar-ra-d\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\014-ibr-h-m\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\015-al-ijr\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\016-an-na-l\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\017-al-isr\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\018-al-kahf\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\020-h\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\021-al-anbiy\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\022-al-ajj\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\023-al-mu-min-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\024-an-n-r\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\025-al-furq-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\026-ash-shu-ar\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\028-al-qa-a\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\029-al-ankab-t\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\031-luqm-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\032-as-sajdah\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\033-al-a-z-b\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\034-saba\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\036-y-s-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\037-a-ff-t\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\039-az-zumar\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\040-gh-fir\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\041-fu-ilat\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\042-ash-sh-r\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\043-az-zukhruf\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\044-ad-dukh-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\045-al-j-thiyah\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\046-al-a-q-f\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\048-al-fat\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\049-al-ujur-t\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\051-adh-dh-riy-t\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\055-ar-ra-m-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\056-al-w-qi-ah\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\058-al-muj-dilah\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\059-al-ashr\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\061-a-aff\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\064-at-tagh-bun\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\067-al-mulk\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\071-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\073-al-muzzammil\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\076-al-ins-n\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\084-al-inshiq-q\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\091-ash-shams\\surah.json",
      "C:\\Users\\Sahim Chowdhury\\Documents\\Learn Arabic Easy mode\\content-import\\surahs\\113-al-falaq\\surah.json"
    ]
  },
  "byTier": {
    "A": {
      "checked": 22,
      "flagged": 22,
      "changed": 12,
      "retained": 10,
      "falsePositives": 6
    },
    "B1": {
      "checked": 22,
      "flagged": 22,
      "changed": 4,
      "retained": 18,
      "falsePositives": 6
    },
    "B2": {
      "checked": 96,
      "flagged": 96,
      "changed": 27,
      "retained": 69,
      "falsePositives": 11
    }
  },
  "transitions": {
    "BLOCKED->BLOCKED": 12,
    "BLOCKED->FULL": 1,
    "CONFIRMED-LIMITED->CONFIRMED-LIMITED": 60,
    "CONFIRMED-LIMITED->FULL": 24,
    "FULL->CONFIRMED-LIMITED": 4,
    "FULL->FULL": 37,
    "MODEL-ISSUE->MODEL-ISSUE": 2
  },
  "falsePositiveFamilies": 23,
  "retainedExceptionFamilies": 74,
  "generatedAt": "2026-10-20T21:33:43.094Z"
}
```

## Decisions

| Tier | Family  | Previous | Corrected | Outcome      | Scan assessment   |       Occurrences | Flags    |
| ---- | ------- | -------: | --------: | ------------ | ----------------- | ----------------: | -------- | ----------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A    | lexical |      ألم |      اليم | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 72  | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      جزع |      جزوع | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| A    | lexical |      جني |       جنى | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      حصب |       حصب | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      حصد |      حصيد | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 4   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      دأب |       داب | noun/pronoun | FULL              | CONFIRMED-LIMITED | CHANGED  | confirmed-defect              | 5   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |     دمدم |      دمدم | verb         | FULL              |              FULL | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding, weak-root-or-root-normalization                   |
| A    | lexical |     رفرف |      رفرف | noun/pronoun | MODEL-ISSUE       |       MODEL-ISSUE | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved                                                                                                |
| A    | lexical |      شور |     تشاور | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      طرد |      طارد | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 2   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      عوم |       عام | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 9   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      غضض |       يغض | verb         | FULL              |              FULL | CHANGED  | confirmed-defect              | 3   | duplicate-after-shell-case-normalization                                                                                              |
| A    | lexical |      فأي |       فئة | noun/pronoun | FULL              | CONFIRMED-LIMITED | CHANGED  | confirmed-defect              | 9   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      فأي |     فئتان | noun/pronoun | FULL              | CONFIRMED-LIMITED | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      فلق |      فالق | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 2   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      فلق |       فلق | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| A    | lexical |      قفو |       تقف | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | weak-root-or-root-normalization                                                                                                       |
| A    | lexical |      قفو |       قفي | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 4   | weak-root-or-root-normalization                                                                                                       |
| A    | lexical |     قنطر |     قنطار | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 2   | weak-root-or-root-normalization                                                                                                       |
| A    | lexical |      مقت |      مقتا | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| A    | lexical |      هلع |      هلوع | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| A    | lexical |      وجل |      وجلة | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B1   | lexical |      أصر |       اصر | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 3   | semantic-branch-rejected-or-unresolved                                                                                                |
| B1   | lexical |      بقر |      بقرة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 6   | semantic-branch-rejected-or-unresolved                                                                                                |
| B1   | lexical |      جذع |       جذع | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 3   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B1   | lexical |      حفو |       يحف | verb         | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review, weak-root-or-root-normalization                                                    |
| B1   | lexical |      دخر |      داخر | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 4   | semantic-branch-rejected-or-unresolved                                                                                                |
| B1   | lexical |      رهط |       رهط | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B1   | lexical |      سأم |      يسام | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 3   | duplicate-after-shell-case-normalization                                                                                              |
| B1   | lexical |     سنبل |     سنبلة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 4   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding, semantic-branch-rejected-or-unresolved            |
| B1   | lexical |      سند |     مسندة | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B1   | lexical |      سيل |       سيل | noun/pronoun | FULL              | CONFIRMED-LIMITED | CHANGED  | confirmed-defect              | 2   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B1   | lexical |      صدف |     صدفين | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B1   | lexical |      صنم |     اصنام | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 5   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding, semantic-branch-rejected-or-unresolved            |
| B1   | lexical |      طلب |      طالب | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B1   | lexical |      طلب |     مطلوب | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B1   | lexical |     عبقر |     عبقرى | noun/pronoun | MODEL-ISSUE       |       MODEL-ISSUE | RETAINED | retained-linguistic-exception | 1   | weak-root-or-root-normalization                                                                                                       |
| B1   | lexical |      عصب |      عصبة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 4   | semantic-branch-rejected-or-unresolved                                                                                                |
| B1   | lexical |      غضض |      اغضض | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B1   | lexical |      كلب |       كلب | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 5   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding, semantic-branch-rejected-or-unresolved            |
| B1   | lexical |      مأي |      مائة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 10  | semantic-branch-rejected-or-unresolved                                                                                                |
| B1   | lexical |      موج |       موج | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 6   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B1   | lexical |      هزز |     اهتزت | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 4   | duplicate-after-shell-case-normalization                                                                                              |
| B1   | lexical |      ورق |       ورق | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 3   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |      أرب |      اربة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      أسف |         ي | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      أمل |       امل | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      أمو |       امة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      بطر |      بطرت | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      بهج |      بهجة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      بهج |      بهيج | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      بول |       بال | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 4   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      جأر |      يجار | verb         | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      جثو |     جاثية | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      جذذ |      جذاذ | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      جرز |       جرز | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      جزأ |       جزء | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      جلب |    جلابيب | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      جنف |       جنف | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      جود |      جياد | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      حرج |       حرج | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 15  | semantic-branch-rejected-or-unresolved                                                                                                |
| B2   | lexical |      حرض |       حرض | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      حرف |     متحرف | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      حفف |       حاف | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      حفو |       حفي | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 2   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      حمأ |      حمئة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding, lexical-limited-or-blocked-needs-same-root-review |
| B2   | lexical |      حمم |     يحموم | noun/pronoun | BLOCKED           |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      خذل |     مخذول | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      خمد |      خامد | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      خيط |       خيط | noun/pronoun | FULL              |              FULL | CHANGED  | confirmed-defect              | 2   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |      دحر |      دحور | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      دخن |      دخان | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      ذرو |       ذرو | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      ذرو |   والذريت | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      ذقن |     اذقان | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 3   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |      رحب |      مرحب | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      رذل |      ارذل | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      رطب |       رطب | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 2   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      رعد |       رعد | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      رفق |     مرافق | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      رقد |      مرقد | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      روض |      روضة | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 2   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |     زخرف |      زخرف | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      زهق |       زهق | verb         | FULL              |              FULL | CHANGED  | confirmed-defect              | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |      سبغ |     سابغة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      ستر |       ستر | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      سدد |      سدين | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |     سربل |    سرابيل | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |     سربل |     سربيل | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      سفح |     مسافح | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      سفن |     سفينة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 4   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |      سلل |     سلالة | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 2   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      سلل |     يتسلل | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      شطأ |       شطء | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      شكك |        شك | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 15  | semantic-branch-rejected-or-unresolved                                                                                                |
| B2   | lexical |      شكل |       شكل | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      شيد |      مشيد | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      صبغ |      صبغة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      صبو |       صبي | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      صهر |      صهرا | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      ضجع |     مضاجع | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      طفق |       طفق | verb         | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      طفل |      اطفل | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      طلب |       طلب | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      طوق |      طاقة | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 2   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      ظفر |      اظفر | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      عبث |      تعبث | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      عتب |    معتبين | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      عجم |    اعجمين | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      عرر |      معرة | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      عضد |       عضد | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      عضض |        عض | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 2   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      عنت |       عنت | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      غطو |      غطاء | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      غوص |      غواص | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      فرد |      فردى | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      قدو |     مقتدي | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      قلد |    مقاليد | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      قنع |      قانع | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      قوت |     اقوات | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      قوع |      قيعة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      قيل |      مقيل | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      كمل |     كاملة | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      لبن |       لبن | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |      لدد |       الد | noun/pronoun | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization                                                                                              |
| B2   | lexical |      لغب |      لغوب | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      مضغ |      مضغة | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      نبع |     ينبوع | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      نحل |       نحل | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      نسأ |     منسات | noun/pronoun | BLOCKED           |           BLOCKED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      نسب |       نسب | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 3   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      نعس |      نعاس | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      نقب |       نقب | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      نكس |    ناكسوا | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      نمل |      نملة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | lexical-limited-or-blocked-needs-same-root-review                                                                                     |
| B2   | lexical |      هلل |      اهلة | noun/pronoun | CONFIRMED-LIMITED | CONFIRMED-LIMITED | RETAINED | retained-linguistic-exception | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding, lexical-limited-or-blocked-needs-same-root-review |
| B2   | lexical |      هيأ |      يهيئ | verb         | FULL              |              FULL | RETAINED | false-positive-detector       | 1   | duplicate-after-shell-case-normalization, current-form-shell-or-inflection-padding                                                    |
| B2   | lexical |      وجل |       وجل | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      وقف |     موقوف | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 1   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |
| B2   | lexical |      يبس |     يابسة | noun/pronoun | CONFIRMED-LIMITED |              FULL | CHANGED  | confirmed-defect              | 2   | semantic-branch-rejected-or-unresolved, lexical-limited-or-blocked-needs-same-root-review                                             |

## Changed: lexical|ألم|اليم|noun/pronoun

**Reason:** The former family counted أَلِيمٌ beside the current أَلِيمٌۢ as a separate member even though the difference was only inflectional. The replacement uses the attested Form-IV causative instead.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- أَلَمٌ — pain; State noun; names the pain rather than describing something as painful.
- تَأَلَّمَ — he suffered; Form V perfect; shows the experiencer undergoing pain.
- يَأْلَمُ — he suffers; Form I imperfect; ongoing suffering.
- آلَمَ — he caused pain; Form IV perfect; causative development.

**Rejected/removed rows:**

- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.
- أَلِيمٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical Qur'anic occurrences of أَلِيمٌ and يَأْلَمُ were inspected. The duplicate adjective with a different case/tanwīn was rejected as shell/inflection padding.

---

## Changed: lexical|جني|جنى|noun/pronoun

**Reason:** The old family counted جَنَى beside وَجَنَى even though the initial و was only a conjunction. The repaired family replaces that shell copy with the action noun while preserving the current surface form first.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- يَجْنِي — he harvests / gathers; Form I imperfect; ongoing gathering.
- جَانٍ — one who gathers / harvests; Active participle; names the agent.
- اِجْتَنَى — he gathered / harvested; Form VIII perfect; derived gathering pattern.
- مَجْنِيٌّ — harvested / gathered; Passive participial adjective; names what has been gathered.

**Rejected/removed rows:**

- جَنَى: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical Qur'anic occurrence of وَجَنَى and aligned root evidence were inspected. وَجَنَى and جَنَى were not counted as two Ṣarf members.

---

## Changed: lexical|دأب|داب|noun/pronoun

**Reason:** كَدَأْبِ and دَأْبٌ were treated as separate despite differing only by a preposition/shell and case. The family now uses the established adjective دَؤُوبٌ instead.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- دَأَبَ — he persisted / worked diligently; Form I perfect; completed persistent action.
- يَدْأَبُ — he persists / works diligently; Form I imperfect; ongoing persistence.
- دَؤُوبٌ — persistent / diligent; Established adjective; describes sustained effort.
- دَأَبًا — persistent practice / way; Lexical verbal noun; names the habitual course.

**Rejected/removed rows:**

- دَأْبٌ: removed or replaced after historical v1.3.9 review.
- دَأْبٌ: removed or replaced after historical v1.3.9 review.
- دَأْبٌ: removed or replaced after historical v1.3.9 review.
- دَأْبٌ: removed or replaced after historical v1.3.9 review.
- دَأْبٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of دَأْب and دَأَبًا were inspected. The initial كَ and case ending were treated as shell/inflection, not new morphology.

---

## Changed: lexical|دمدم|دمدم|verb

**Reason:** The former family counted فَدَمْدَمَ and دَمْدَمَ as separate. The conjunction is removed conceptually, and the fourth related row is an active participle rather than a shell copy.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- يُدَمْدِمُ — he destroys / crushes; Imperfect of the quadriliteral verb.
- دَمْدِمْ — destroy / crush; Imperative; direct command form.
- دَمْدَمَةٌ — destruction / crushing; Verbal noun; names the action.
- مُدَمْدِمٌ — one who destroys / crushes; Active participle; names the agent.

**Rejected/removed rows:**

- دَمْدَمَ: removed or replaced after historical v1.3.9 review.

**Evidence:** The quadriliteral root د م د م was checked as a complete root, not a weak-root family. فَ was treated as a conjunction shell only.

---

## Changed: lexical|شور|تشاور|noun/pronoun

**Reason:** وَتَشَاوُرٍ and تَشَاوُرٌ were previously counted as distinct. The repaired family keeps the current form first and substitutes the Form III imperfect, while retaining the useful noun and Form III/VI contrasts.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- شُورَىٰ — consultation / counsel; Established lexical noun; meaning is not flattened to the verb.
- شَاوَرَ — he consulted; Form III perfect; completed consultation.
- مُشَاوَرَةٌ — consultation; Form III verbal noun; names the action.
- يُشَاوِرُ — he consults; Form III imperfect; ongoing consultation.

**Rejected/removed rows:**

- تَشَاوُرٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** The consultation/counsel semantic development is supported by canonical Qur'anic and reviewed project evidence. Case and conjunction variants were excluded.

---

## Changed: lexical|طرد|طارد|noun/pronoun

**Reason:** بِطَارِدِ and طَارِدٌ were counted as separate although بِ and case were shell/inflection. The replacement is the action noun طَرْدٌ.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- طَرَدَ — he drove away; Form I perfect; completed expulsion.
- يَطْرُدُ — he drives away; Form I imperfect; ongoing expulsion.
- طَرْدٌ — driving away / expulsion; Verbal noun; names the action.
- مَطْرُودٌ — one driven away; Passive participle; names the affected person.

**Rejected/removed rows:**

- طَارِدٌ: removed or replaced after historical v1.3.9 review.
- طَارِدٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrence and reviewed root-family evidence were checked. The preposition بِ and genitive ending were not counted as Ṣarf rows.

---

## Changed: lexical|غضض|يغض|verb

**Reason:** The prior family included a same-stem imperfect with only a mood/ending difference. The repaired set uses the basic perfect, feminine imperfect, imperative and verbal noun.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- غَضَّ — he lowered / restrained; Form I perfect; completed restraint.
- يَغْضُضْنَ — they lower / restrain; Form I imperfect, feminine plural; a meaningful gender/number contrast.
- يَغُضُّونَ — they lower / restrain; Form I imperfect, masculine plural; contrasts with the feminine form.
- اِغْضُضْ — lower / restrain; Form I imperative; command form.
- غَضٌّ — lowering / restraint; Verbal noun; names the action.

**Rejected/removed rows:**

- None

**Evidence:** Canonical Qur'anic occurrences of the imperative and imperfect were inspected. The same-person imperfect differing only by case/mood ending was rejected as padding.

---

## Changed: lexical|فأي|فئة|noun/pronoun

**Reason:** The old full family padded singular occurrences with case-only فِئَةٌ rows. The defensible teaching set is the current singular plus the meaningful dual and plural forms.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- فِئَتَانِ — two groups; Dual form; teaches number rather than case.
- فِئَاتٌ — groups; Sound plural; teaches plural formation.

**Rejected/removed rows:**

- فِئَةٌ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.
- فِئَةٌ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.
- فِئَةٌ: removed or replaced after historical v1.3.9 review.
- فِئَتُكُمْ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.
- فِئَتُكُمْ: removed or replaced after historical v1.3.9 review.
- فِئَةٌ: removed or replaced after historical v1.3.9 review.
- فِئَتُكُمْ: removed or replaced after historical v1.3.9 review.
- فِئَةٌ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.
- فِئَةٌ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.
- فِئَتُكُمْ: removed or replaced after historical v1.3.9 review.
- فِئَةٌ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of singular, dual and plural forms were inspected. Nominative/accusative/genitive variants were not counted as separate Ṣarf members.

---

## Changed: lexical|فأي|فئتان|noun/pronoun

**Reason:** The former full family had only singular/dual/plural number contrasts; it did not have four genuinely distinct useful forms. Case variants were removed and the family is honestly limited.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- فِئَةٌ — a group; Singular form; contrasts with the current dual.
- فِئَاتٌ — groups; Plural form; contrasts with the current dual.

**Rejected/removed rows:**

- فِئَتَانِ: removed or replaced after historical v1.3.9 review.
- فِئَتَيْنِ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical singular, dual and plural occurrences were inspected. Case-only dual variants were rejected.

---

## Changed: lexical|فلق|فالق|noun/pronoun

**Reason:** The current active participle was previously repeated with a different case ending. The repaired set uses the verb, imperfect, derived inchoative form and passive participle.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- فَلَقَ — he split; Form I perfect; completed splitting.
- يَفْلِقُ — he splits; Form I imperfect; ongoing splitting.
- اِنْفَلَقَ — it split open; Form VII perfect; inchoative/reflexive development.
- مَفْلُوقٌ — split / cleft; Passive participle; names what has been split.

**Rejected/removed rows:**

- فَالِقٌ: removed or replaced after historical v1.3.9 review.
- فَالِقٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of فَالِق and اِنْفَلَقَ were checked. Case variants of فَالِق were not counted twice.

---

## Changed: lexical|فلق|فلق|noun/pronoun

**Reason:** The root noun family was retained, but its related rows are now explicitly distinct from the current noun and teach the derived family.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- فَالِقٌ — one who splits; Active participle; agent of splitting.
- فَلَقَ — he split; Form I perfect.
- يَفْلِقُ — he splits; Form I imperfect.
- اِنْفَلَقَ — it split open; Form VII; inchoative development.
- مَفْلُوقٌ — split / cleft; Passive participle; names what has been split.

**Rejected/removed rows:**

- فَلَقَ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical root-family evidence was inspected. The current noun was kept first and no bare root was used.

---

## Changed: lexical|وجل|وجلة|noun/pronoun

**Reason:** The former family’s adjective rows collapsed a gender/lexical form after shell normalization. The repaired set uses the verb, imperfect, abstract noun and active adjective.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- وَجِلَ — he felt afraid; Form I perfect; completed state.
- يَوْجَلُ — he feels afraid; Form I imperfect; ongoing state.
- وَجَلٌ — fear / awe; Abstract noun; names the state.
- وَاجِلٌ — fearful / apprehensive; Active adjective; describes the experiencer.

**Rejected/removed rows:**

- وَجِلٌ: removed or replaced after historical v1.3.9 review.
- وَجِلُونَ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of وَجِلَ and وَجَلٌ were inspected. Case-only adjective variants were not counted twice.

---

## Changed: lexical|سيل|سيل|noun/pronoun

**Reason:** The former full family counted the current noun and a bare/case variant of the same noun as separate. Four useful forms are defensible here: the current noun, the verb, its imperfect and the active participle; no fifth row is needed for this historical repair.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- سَالَ — he/it flowed; Form I hollow perfect.
- يَسِيلُ — he/it flows; Form I imperfect.
- سَائِلٌ — flowing / one who flows; Active participle; describes the flowing agent or substance.

**Rejected/removed rows:**

- سَيْلٌ: removed or replaced after historical v1.3.9 review.
- سَيْلٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of السيل and سالت were inspected. سَيْلٌ versus السَّيْلُ was not counted as an independent Ṣarf member.

---

## Changed: lexical|طلب|مطلوب|noun/pronoun

**Reason:** The old family repeated وَالْمَطْلُوبُ as الْمَطْلُوبُ. The replacement uses the active participle طالبٌ to teach the active/passive relationship.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- طَلَبَ — he sought / requested; Form I perfect.
- يَطْلُبُ — he seeks / requests; Form I imperfect.
- طَلَبٌ — seeking / request; Verbal noun.
- طَالِبٌ — one who seeks / student; Active participle; contrasts with the passive participle current form.

**Rejected/removed rows:**

- مَطْلُوبٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical and existing reviewed ط ل ب family evidence was inspected. The conjunction/article shell was not counted twice.

---

## Changed: lexical|موج|موج|noun/pronoun

**Reason:** The former family counted الْمَوْجُ and مَوْجٌ as separate. تَمَوَّجَ replaces that noun-case duplicate and adds a genuinely derived Form V development.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- مَاجَ — it surged / moved; Form I hollow perfect.
- يَمُوجُ — it surges / moves; Form I hollow imperfect.
- مَائِجٌ — surging / agitated; Active participial adjective.
- تَمَوَّجَ — it rippled / surged; Form V; shows a derived movement pattern.

**Rejected/removed rows:**

- مَوْجٌ: removed or replaced after historical v1.3.9 review.
- مَوْجٌ: removed or replaced after historical v1.3.9 review.
- مَوْجٌ: removed or replaced after historical v1.3.9 review.
- مَوْجٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of موج and the reviewed project form catalogue were inspected. Article and case variants were rejected as padding.

---

## Changed: lexical|ورق|ورق|noun/pronoun

**Reason:** The historical family mixed paper and silver occurrences and counted case/article variants. The repaired set keeps the root branches explicit and replaces shell copies with plural, Form II and lexical silver forms.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- أَوْرَاقٌ — leaves / sheets; Broken plural; teaches number.
- وَرَّقَ — he covered with leaves / papered; Form II perfect; derived action.
- مُوَرَّقٌ — leafy / covered with leaves; Form II passive participle/adjective.
- وَرِقٌ — silver / money; Established semantic branch; meaning is kept distinct from paper/leaves.

**Rejected/removed rows:**

- وَرَقٌ: removed or replaced after historical v1.3.9 review.
- وَرَقٌ: removed or replaced after historical v1.3.9 review.
- وَرَقٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of وَرَق and وَرِق were inspected. The semantic branch is explained rather than flattened, and case/article/attached-pronoun variants are excluded.

---

## Changed: lexical|جذذ|جذاذ|noun/pronoun

**Reason:** The one-row limited decision overlooked the attested verb, imperfect, verbal noun and passive participle of the same root.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- جَذَّ — he cut off; Form I perfect.
- يَجُذُّ — he cuts off; Form I imperfect.
- جَذٌّ — cutting off; Verbal noun.
- مَجْذُوذٌ — cut off; Passive participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical جُذَاذًا and reviewed مَجْذُوذٍ evidence were inspected. No shared-root-only form was accepted without a real lexical relationship.

---

## Changed: lexical|حرف|متحرف|noun/pronoun

**Reason:** The limited decision treated the Form II branch and the noun branch as too semantically different. Under v1.3.9, the same-root development is useful when meanings are translated separately.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- حَرَّفَ — he distorted / altered; Form II perfect.
- يُحَرِّفُ — he distorts / alters; Form II imperfect.
- تَحْرِيفٌ — distortion / alteration; Form II verbal noun.
- حَرْفٌ — letter / edge; Established lexical branch; the semantic development is stated explicitly.

**Rejected/removed rows:**

- None

**Evidence:** Canonical occurrences of يُحَرِّفُونَ and مُتَحَرِّفًا were inspected. Semantic development was preserved rather than mistranslated as identical meaning.

---

## Changed: lexical|حمم|يحموم|noun/pronoun

**Reason:** The blocked decision rejected same-root heat/blackness development merely because the English meanings differ. The forms are attested and are translated individually.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- حَمَّ — he became hot / approached; Form I perfect.
- يَحُمُّ — he becomes hot / approaches; Form I imperfect.
- حُمُومٌ — heat / hotness; Verbal noun.
- حَمِيمٌ — scalding water / intense heat; Established lexical branch; meaning is not flattened to black smoke.

**Rejected/removed rows:**

- None

**Evidence:** Canonical يَحْمُومٍ and reviewed حَمِيمٍ/حُمُومٍ evidence were inspected. The semantic branches are explicitly distinguished in the row meanings.

---

## Changed: lexical|خذل|مخذول|noun/pronoun

**Reason:** The limited decision overlooked a complete attested verb, imperfect, action noun and active adjective around the passive participle.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- خَذَلَ — he abandoned / let down; Form I perfect.
- يَخْذُلُ — he abandons / lets down; Form I imperfect.
- خَذْلٌ — abandonment / letting down; Verbal noun.
- خَذُولٌ — one who abandons / repeatedly lets down; Intensive adjective.

**Rejected/removed rows:**

- None

**Evidence:** Canonical يَخْذُلْكُمْ and مَخْذُولًا evidence were inspected. Active/passive contrast is explicit.

---

## Changed: lexical|خمد|خامد|noun/pronoun

**Reason:** The former limited family contained only plural inflectional variants of خامد. The root supports an attested verb, imperfect, verbal noun and causative form.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- خَمَدَ — it died down / became extinguished; Form I perfect.
- يَخْمُدُ — it dies down / becomes extinguished; Form I imperfect.
- خُمُودٌ — dying down / extinction; Verbal noun.
- أَخْمَدَ — he extinguished; Form IV causative.

**Rejected/removed rows:**

- None

**Evidence:** Canonical خَامِدِينَ/خَامِدُونَ and reviewed root evidence were inspected. Plural endings were not treated as separate lexical members.

---

## Changed: lexical|خيط|خيط|noun/pronoun

**Reason:** The former family counted الْخَيْطُ and خَيْطٌ as separate. The verb خَاطَ replaces the case/article duplicate and gives the learner a real root-family contrast.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- خَاطَ — he sewed; Form I hollow perfect.
- خُيُوطٌ — threads; Broken plural; teaches number.
- خِيَاطَةٌ — sewing; Verbal noun.
- خَيَّاطٌ — tailor; Intensive/occupational noun; names the practitioner.

**Rejected/removed rows:**

- خَيْطٌ: removed or replaced after historical v1.3.9 review.
- خَيْطٌ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical thread occurrences and reviewed project خ ي ط evidence were inspected. Article/case variants were rejected.

---

## Changed: lexical|دحر|دحور|noun/pronoun

**Reason:** The limited family had the action noun but omitted its directly attested verb, imperfect and passive participle.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- دَحَرَ — he drove away; Form I perfect.
- يَدْحَرُ — he drives away; Form I imperfect.
- دَحْرٌ — driving away; Verbal noun.
- مَدْحُورٌ — driven away; Passive participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical دُحُورًا and reviewed مَدْحُورًا evidence were inspected.

---

## Changed: lexical|رذل|ارذل|noun/pronoun

**Reason:** The limited decision retained plural and comparative forms but missed the established verb, imperfect and adjective of the same root.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- رَذُلَ — he became base / inferior; Form I perfect.
- يَرْذُلُ — he becomes base / inferior; Form I imperfect.
- رَذِيلٌ — base / inferior; Established adjective.
- أَرْذَلُ — more inferior / lowest; Comparative/superlative adjective.
- أَرَاذِلُ — the lowliest / inferior people; Broken plural; a lexical number development.

**Rejected/removed rows:**

- None

**Evidence:** Canonical أَرَاذِلُنَا and reviewed رَذُلَ/رَذِيلٌ evidence were inspected.

---

## Changed: lexical|رعد|رعد|noun/pronoun

**Reason:** The former limited family contained only noun shell variants. The same root has a real verb, imperfect, adjective and countable noun development.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- رَعَدَ — it thundered / he trembled; Form I perfect.
- يَرْعَدُ — it thunders / he trembles; Form I imperfect.
- رَاعِدٌ — thundering; Active adjective.
- رَعْدَةٌ — thunderclap / tremor; Lexical noun with a distinct countable meaning.

**Rejected/removed rows:**

- None

**Evidence:** Canonical الرعد and approved project root evidence were inspected. Article/conjunction variants were excluded.

---

## Changed: lexical|رفق|مرافق|noun/pronoun

**Reason:** The limited decision treated مَرَافِق as isolated, despite the reviewed root catalogue containing the verb, imperfect, verbal noun and singular place/body-part noun.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- رَفَقَ — he treated gently / accompanied; Form I perfect.
- يَرْفُقُ — he treats gently; Form I imperfect.
- رِفْقٌ — gentleness / kindness; Verbal noun.
- مِرْفَقٌ — elbow / facility; Established noun; meaning is stated according to context.

**Rejected/removed rows:**

- None

**Evidence:** Canonical المرافق and reviewed رَفَقَ/رِفْقٌ evidence were inspected. The semantic development is explicit rather than flattened.

---

## Changed: lexical|زخرف|زخرف|noun/pronoun

**Reason:** The limited decision retained the noun only, although the reviewed root evidence establishes its verb, imperfect, verbal noun and passive participle.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- زَخْرَفَ — he adorned / ornamented; Form II perfect.
- يُزَخْرِفُ — he adorns / ornaments; Form II imperfect.
- زَخْرَفَةٌ — ornamentation / embellishment; Form II verbal noun.
- مُزَخْرَفٌ — ornamented / embellished; Form II passive participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical زُخْرُف and reviewed derived forms were inspected.

---

## Changed: lexical|زهق|زهق|verb

**Reason:** The current وَزَهَقَ and related زَهَقَ differed only by the conjunction. The causative أَزْهَقَ replaces that shell duplicate.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- يَزْهَقُ — it perishes / departs; Form I imperfect.
- زَهُوقٌ — liable to perish; Intensive adjective.
- زَاهِقٌ — perishing / departing; Active participial adjective.
- أَزْهَقَ — he caused to perish / destroyed; Form IV causative.

**Rejected/removed rows:**

- زَهَقَ: removed or replaced after historical v1.3.9 review.

**Evidence:** Canonical occurrences of زَهَقَ and أَزْهَقَ were inspected. وَ was treated as conjunction shell only.

---

## Changed: lexical|ستر|ستر|noun/pronoun

**Reason:** The limited decision retained only the noun, but the root has a complete attested verb, imperfect, passive participle and reflexive development.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- سَتَرَ — he concealed / covered; Form I perfect.
- يَسْتُرُ — he conceals / covers; Form I imperfect.
- مَسْتُورٌ — concealed / covered; Passive participle.
- تَسْتَتِرُونَ — you conceal yourselves; Form VIII/reflexive development; shows the root in a derived pattern.

**Rejected/removed rows:**

- None

**Evidence:** Canonical سِتْرًا and reviewed مَسْتُورًا/تَسْتَتِرُونَ evidence were inspected.

---

## Changed: lexical|سدد|سدين|noun/pronoun

**Reason:** The limited decision treated the dual noun as isolated, although the reviewed root contains the basic verb, imperfect, abstract noun and Form II verbal noun.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- سَدَّ — he blocked / closed; Form I perfect.
- يَسُدُّ — he blocks / closes; Form I imperfect.
- سَدَادٌ — soundness / rightness; Lexical noun; a semantic development of the root.
- تَسْدِيدٌ — blocking / directing correctly; Form II verbal noun.

**Rejected/removed rows:**

- None

**Evidence:** Canonical السدين and reviewed سَدَّ/سَدَادٌ evidence were inspected.

---

## Changed: lexical|طلب|طلب|noun/pronoun

**Reason:** The limited decision omitted the established verb paradigm and active/passive participles even though the same root is already reviewed in adjacent families.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- طَلَبَ — he sought / requested; Form I perfect.
- يَطْلُبُ — he seeks / requests; Form I imperfect.
- طَالِبٌ — one who seeks / student; Active participle.
- مَطْلُوبٌ — sought / requested; Passive participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical and existing reviewed ط ل ب families were inspected. The action noun current form remains first.

---

## Changed: lexical|عتب|معتبين|noun/pronoun

**Reason:** The limited decision retained an inflected passive/derived form while overlooking the established basic verb, imperfect, verbal noun and active participle.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- عَتَبَ — he reproached; Form I perfect.
- يَعْتِبُ — he reproaches; Form I imperfect.
- عَتْبٌ — reproach / blame; Verbal noun.
- مُعْتِبٌ — one who satisfies / makes amends; Active participle; a distinct derived sense.

**Rejected/removed rows:**

- None

**Evidence:** Canonical المُعْتَبِينَ and reviewed عَتَبَ/مُعْتِبٌ evidence were inspected.

---

## Changed: lexical|عنت|عنت|noun/pronoun

**Reason:** The limited decision omitted the established verb and causative branch. The same root supports a complete teaching family with honest semantic distinctions.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- عَنِتَ — he suffered hardship; Form I perfect.
- يَعْنَتُ — he suffers hardship; Form I imperfect.
- عَنَتٌ — hardship / distress; Verbal noun.
- أَعْنَتَ — he caused hardship; Form IV causative.
- مُعْنِتٌ — causing hardship; Form IV active participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical العنت and reviewed أَعْنَتَ/عَنِتَ evidence were inspected.

---

## Changed: lexical|قوت|اقوات|noun/pronoun

**Reason:** The limited decision retained the plural noun but omitted the verb, verbal noun and adjective/participle forms already evidenced in the project.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- قَاتَ — he nourished / sustained; Form I hollow perfect.
- يَقُوتُ — he nourishes / sustains; Form I hollow imperfect.
- قُوتٌ — nourishment / sustenance; Lexical noun.
- مَقِيتٌ — sustaining / one who provides sustenance; Derived adjective/active participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical أَقْوَاتَهَا and reviewed مَقِيتًا evidence were inspected.

---

## Changed: lexical|كمل|كاملة|noun/pronoun

**Reason:** The limited decision was caused by failure to reuse the already reviewed same-root completion family. Genuine state, abstract noun, adjective and Form VIII forms are available.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- كَمُلَ — became complete / perfect; Form I state verb.
- كَمَالٌ — completeness / perfection; Abstract noun.
- كَامِلٌ — complete / perfect; Established adjective; the current feminine form is kept distinct.
- اِكْتَمَلَ — became complete; Form VIII; becoming-complete development.

**Rejected/removed rows:**

- None

**Evidence:** The reviewed C1 ك م ل family specification and canonical أَكْمَلَ/كَامِلَةٌ evidence were checked. Gender/case variants were not used as the main teaching content.

---

## Changed: lexical|مضغ|مضغة|noun/pronoun

**Reason:** The limited decision retained the developmental noun only, although the root has a genuine verb, imperfect, verbal noun and passive participle.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- مَضَغَ — he chewed; Form I perfect.
- يَمْضَغُ — he chews; Form I imperfect.
- مَضْغٌ — chewing; Verbal noun.
- مَمْضُوغٌ — chewed; Passive participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical مُضْغَةٍ and reviewed Arabic morphology evidence were inspected.

---

## Changed: lexical|نبع|ينبوع|noun/pronoun

**Reason:** The limited decision treated the spring noun and its plural as an isolated lexical item, overlooking the attested verb and place noun.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- نَبَعَ — it sprang forth; Form I perfect.
- يَنْبُعُ — it springs forth; Form I imperfect.
- نَبْعٌ — springing forth / a spring; Verbal/lexical noun.
- مَنْبَعٌ — source / spring; Place noun; names the source.

**Rejected/removed rows:**

- None

**Evidence:** Canonical يَنۢبُوعًا and يَنَابِيعَ evidence were inspected. The singular/plural distinction remains explicit.

---

## Changed: lexical|نسب|نسب|noun/pronoun

**Reason:** The limited decision retained only the abstract noun and plural. The established verb, imperfect and passive participle provide useful same-root recognition.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- نَسَبَ — he attributed / traced lineage; Form I perfect.
- يَنْسُبُ — he attributes / traces lineage; Form I imperfect.
- نَسَبٌ — lineage / attribution; Lexical noun.
- مَنْسُوبٌ — attributed / ascribed; Passive participle.

**Rejected/removed rows:**

- None

**Evidence:** Canonical أَنسَابَ and نَسَبًا evidence were inspected.

---

## Changed: lexical|نقب|نقب|noun/pronoun

**Reason:** The limited decision retained the action noun only, although the root has a verb, imperfect, agent noun and Form II development in the reviewed corpus.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- نَقَبَ — he pierced / explored; Form I perfect.
- يَنْقُبُ — he pierces / explores; Form I imperfect.
- نَقِيبٌ — representative / chief; Established agent noun.
- فَنَقَّبُوا۟ — so they explored / searched; Form II perfect; derived intensive action.

**Rejected/removed rows:**

- None

**Evidence:** Canonical نَقْبًا and فَنَقَّبُوا۟ evidence were inspected.

---

## Changed: lexical|نكس|ناكسوا|noun/pronoun

**Reason:** The limited decision did not use the existing basic, imperfect, verbal-noun and Form II relations around the current active participle.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- نَكَسَ — he reversed / turned back; Form I perfect.
- يَنْكُسُ — he reverses / turns back; Form I imperfect.
- نَكْسٌ — reversal / overturning; Verbal noun.
- نَكَّسَ — he reversed / turned back repeatedly; Form II derived pattern.

**Rejected/removed rows:**

- None

**Evidence:** Canonical نَاكِسُوا۟ and نُكِسُوا۟ evidence were inspected. The active/passive and basic/derived relationships are translated separately.

---

## Changed: lexical|وجل|وجل|noun/pronoun

**Reason:** The limited decision retained the plural adjective only. The reviewed root supports verb, imperfect, abstract noun and active adjective forms.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- وَجِلَ — he felt afraid; Form I perfect.
- يَوْجَلُ — he feels afraid; Form I imperfect.
- وَجَلٌ — fear / awe; Abstract noun.
- وَاجِلٌ — fearful / apprehensive; Active adjective.

**Rejected/removed rows:**

- None

**Evidence:** Canonical وَجِلُونَ and reviewed وَجِلَ/وَجَلٌ evidence were inspected.

---

## Changed: lexical|وقف|موقوف|noun/pronoun

**Reason:** The limited decision retained only the passive participle. The root supports the active verb, imperfect, verbal noun and passive finite form.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- وَقَفَ — he stood / stopped; Form I perfect.
- يَقِفُ — he stands / stops; Form I imperfect.
- وُقُوفٌ — standing / stopping; Verbal noun.
- وُقِفُوا۟ — they were made to stand; Passive Form I finite form.

**Rejected/removed rows:**

- None

**Evidence:** Canonical وُقِفُوا۟ and مَوْقُوفُونَ evidence were inspected.

---

## Changed: lexical|يبس|يابسة|noun/pronoun

**Reason:** The limited decision retained only the plural adjective. The root supports basic verb, imperfect, abstract noun and the noun يبس.

**Semantic development:** Same-root forms are retained when attested and morphologically useful; each row carries its own meaning rather than being translated as the Qur'anic occurrence.

**Accepted related rows:**

- يَبِسَ — it became dry; Form I perfect.
- يَيْبَسُ — it becomes dry; Form I imperfect.
- يَبَسًا — dryness; Verbal noun.
- يُبْسٌ — dryness / aridity; Lexical abstract noun; distinct from the adjective.

**Rejected/removed rows:**

- None

**Evidence:** Canonical يَابِسَاتٍ and reviewed يَبِسَ/يُبْسٌ evidence were inspected.

---

## False-positive and retained queue notes

- A lexical|جزع|جزوع|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- A lexical|حصب|حصب|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- A lexical|حصد|حصيد|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- A lexical|رفرف|رفرف|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- A lexical|عوم|عام|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- A lexical|قفو|تقف|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- A lexical|قفو|قفي|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- A lexical|قنطر|قنطار|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- A lexical|مقت|مقتا|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- A lexical|هلع|هلوع|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|أصر|اصر|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|بقر|بقرة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|جذع|جذع|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B1 lexical|حفو|يحف|verb: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B1 lexical|دخر|داخر|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|رهط|رهط|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|سأم|يسام|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B1 lexical|سنبل|سنبلة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|سند|مسندة|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B1 lexical|صدف|صدفين|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B1 lexical|صنم|اصنام|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|طلب|طالب|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B1 lexical|عبقر|عبقرى|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B1 lexical|عصب|عصبة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|غضض|اغضض|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B1 lexical|كلب|كلب|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|مأي|مائة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B1 lexical|هزز|اهتزت|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|أرب|اربة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|أسف|ي|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|أمل|امل|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|أمو|امة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|بطر|بطرت|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|بهج|بهجة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|بهج|بهيج|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|بول|بال|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|جأر|يجار|verb: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|جثو|جاثية|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|جرز|جرز|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|جزأ|جزء|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|جلب|جلابيب|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|جنف|جنف|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|جود|جياد|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|حرج|حرج|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|حرض|حرض|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|حفف|حاف|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|حفو|حفي|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|حمأ|حمئة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|دخن|دخان|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|ذرو|ذرو|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|ذرو|والذريت|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|ذقن|اذقان|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|رحب|مرحب|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|رطب|رطب|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|رقد|مرقد|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|روض|روضة|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|سبغ|سابغة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|سربل|سرابيل|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|سربل|سربيل|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|سفح|مسافح|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|سفن|سفينة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|سلل|سلالة|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|سلل|يتسلل|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|شطأ|شطء|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|شكك|شك|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|شكل|شكل|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|شيد|مشيد|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|صبغ|صبغة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|صبو|صبي|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|صهر|صهرا|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|ضجع|مضاجع|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|طفق|طفق|verb: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|طفل|اطفل|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|طوق|طاقة|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|ظفر|اظفر|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|عبث|تعبث|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|عجم|اعجمين|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|عرر|معرة|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|عضد|عضد|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|عضض|عض|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|غطو|غطاء|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|غوص|غواص|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|فرد|فردى|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|قدو|مقتدي|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|قلد|مقاليد|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|قنع|قانع|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|قوع|قيعة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|قيل|مقيل|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|لبن|لبن|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|لدد|الد|noun/pronoun: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
- B2 lexical|لغب|لغوب|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|نحل|نحل|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|نسأ|منسات|noun/pronoun: retained-linguistic-exception; The family remains an explicit exception because the available evidence does not safely establish a better learner family. The scan flag was reviewed, but guessing would violate the contract.
- B2 lexical|نعس|نعاس|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|نمل|نملة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|هلل|اهلة|noun/pronoun: retained-linguistic-exception; The limited rows were reviewed against same-root evidence. The remaining forms are case, shell, attached-pronoun, narrow lexical or semantically unsafe alternatives; no defensible upgrade is established in this pass.
- B2 lexical|هيأ|يهيئ|verb: false-positive-detector; The detector is conservative: row-level review found the family’s non-current rows to be genuinely distinct and adequately evidenced; no content change is justified. This flag is recorded as a detector false positive.
