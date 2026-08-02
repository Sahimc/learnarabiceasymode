# Content import workspace

This folder is the authoring and transfer format for Qur’anic Arabic Word Tree packages. It is not the runtime database. Prompt 2 will add the validator, importer and PostgreSQL migrations described in `docs/content-import-design.md`.

Package rules:

- One sūrah is one independently validated package.
- Stable IDs are never regenerated casually.
- Provider data and custom teaching data stay distinct.
- Complete custom content is required for 112–114 in the first starter import.
- Sūrahs 109–111 intentionally remain source-only until authored.
- Tanzil text must be retained verbatim with attribution.
