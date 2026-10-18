# Content import workspace

This folder is the authoring and transfer format for Qur’anic Arabic Word Tree packages. It is not the runtime database. Prompt 2 will add the validator, importer and PostgreSQL migrations described in `docs/content-import-design.md`.

Package rules:

- One sūrah is one independently validated package.
- Stable IDs are never regenerated casually.
- Provider data and custom teaching data stay distinct.
- Complete custom content is now present for Sūrah 1 and Sūrahs 78–114.
- Future sūrahs remain source-only until their complete reviewed teaching batches are authored.
- Tanzil text must be retained verbatim with attribution.
- Lexical `rootPicture` and Ṣarf root-skeleton meanings must come from `root-meanings.json`, keyed by the normalized Arabic root; never copy an occurrence translation into a root field.
- If a root is missing, add a concise, accurate meaning from approved dictionary evidence before authoring; the authoring and import gates fail closed when no dictionary entry exists.
- A normal Ṣarf family contains five reviewed forms: the current Qur’anic form first plus four genuinely useful related forms. Each row carries a form-specific meaning, meaningful distinction, lexeme/root relationship and provenance.
- A family may be explicitly marked `limited` with a reason when five useful forms would require fabrication, repetition or misleading padding. Provider morphology supplies candidates and evidence; it is not an automatic teaching answer.
