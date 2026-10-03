# Content import workspace

This folder is the authoring and transfer format for Qur’anic Arabic Word Tree packages. It is not the runtime database. Prompt 2 will add the validator, importer and PostgreSQL migrations described in `docs/content-import-design.md`.

Package rules:

- One sūrah is one independently validated package.
- Stable IDs are never regenerated casually.
- Provider data and custom teaching data stay distinct.
- Complete custom content is currently present for 111–114.
- Any sūrah may move from source-only or custom-partial to custom-complete only
  after the package validator confirms that every visible occurrence has the
  required reviewed teaching data.
- Tanzil text must be retained verbatim with attribution.

## Production factory handoff

Large-scale custom authoring is staged outside the canonical package files in
`content-authoring/`. Workers receive immutable source packets and write unique
draft revisions. Independent reviewers use the required matrix of source,
morphology, grammar, meaning and pedagogy reviews for every authored āyah.

The deterministic assembler combines approved packet ranges into one sūrah
package. It rejects overlapping or missing āyāt, duplicate occurrences, stale
source or knowledge fingerprints, unapproved revisions and unresolved blocking
issues. PostgreSQL remains the only canonical runtime destination, and the
transactional importer remains the only canonical write path.
