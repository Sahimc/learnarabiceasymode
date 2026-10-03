# Content-production factory

This directory is the staged authoring and review workspace for structured
Qur'anic content data. It is not the learner-facing runtime and it is not a
replacement for `content-import/surahs/`.

The factory keeps immutable source packets, worker drafts, independent review
artifacts and assembled packages separate. Only an approved assembled package
may be considered for the canonical PostgreSQL importer.

The factory is fail-closed. Source packets and drafts pin a knowledge
snapshot. Drafts are immutable revisions, review artifacts are immutable and
reviewer-scoped, and the assembler writes only after it has verified complete
coverage, source fingerprints, non-overlapping ownership and the full review
matrix. `WordBreakdown` is the authoritative decomposition; legacy
`components` are derived during assembly.

Current systems-pilot commands:

```text
npm run content:factory -- packet --surah 108
npm run content:factory -- draft --surah 108
npm run content:factory -- review --surah 108 --role source
npm run content:factory -- review --surah 108 --role morphology
npm run content:factory -- assemble --surah 108
npm run content:factory -- status --surah 108
npm run content:factory -- pilot --surah 108
npm run content:import -- --package content-authoring/assembled/108/surah.json --dry-run
```

The systems pilot is source-only and intentionally does not create custom
teaching content. The completed pilot proves source packet creation, immutable
draft creation, source review, deterministic assembly, package validation and
import dry-run. It is not a completed teaching lesson.

For a real authored worker, the `draft` command is only a source-only
scaffold. The worker must create its completed JSON artifact once at the exact
immutable draft path, then register it without overwriting it:

```text
npm run content:factory -- register-draft --surah 107 --ayah-start 1 --ayah-end 2 --draft-file content-authoring/drafts/107/packet-107-1-2-revision-001.json --worker worker-1
```

Registration validates the packet, source fingerprint, pinned knowledge
snapshot, word order and revision before the artifact enters the ledger.

Packet and draft commands also accept a non-overlapping āyah range and a
worker label. For example, the later parallel pilot can use:

```text
npm run content:factory -- packet --surah 107 --ayah-start 1 --ayah-end 2 --worker worker-1
npm run content:factory -- draft --surah 107 --ayah-start 1 --ayah-end 2 --worker worker-1
npm run content:factory -- packet --surah 107 --ayah-start 3 --ayah-end 4 --worker worker-2
npm run content:factory -- draft --surah 107 --ayah-start 3 --ayah-end 4 --worker worker-2
```

Each range produces a deterministic packet ID and unique artifact path. The
workers must never share a range or write directly to the canonical package.

For authored content, every logical āyah in every packet must receive all five
reviews: `source`, `morphology`, `grammar`, `meaning` and `pedagogy`. Reviews
may be distributed across agents and run concurrently, but approval is
per-āyah. A failed āyah can be repaired in a new draft revision without
invalidating a sibling āyah from the same worker range.

Recommended parallel pilot packet layout:

```text
content-authoring/source-packets/107/packet-107-1-2.json
content-authoring/source-packets/107/packet-107-3-4.json
content-authoring/source-packets/107/packet-107-5-6.json
content-authoring/source-packets/107/packet-107-7-7.json

content-authoring/drafts/107/packet-107-1-2-revision-001.json
content-authoring/drafts/107/packet-107-3-4-revision-001.json
content-authoring/drafts/107/packet-107-5-6-revision-001.json
content-authoring/drafts/107/packet-107-7-7-revision-001.json
```

Reviewers should use `--ayah N` when a logical āyah must be independently
approved. A repair creates a new immutable revision, for example
`...-revision-002.json`; revision 001 is never edited. The assembler selects
the highest approved revision for each logical āyah and rejects stale or
incomplete inputs.

The MVP pilot deliberately creates a source-only draft. It does not invent
custom teaching content and does not import a custom-complete package.

The canonical assembly command is:

```text
npm run content:factory -- assemble --surah 107
```

It produces `content-authoring/assembled/107/surah.json` only when all source
āyāt are covered exactly once, every selected revision is approved, blocking
issues are resolved, and all pinned knowledge snapshots match. Only this
assembled package may proceed to:

```text
npm run content:validate -- --surah 107
npm run content:import -- --package content-authoring/assembled/107/surah.json --dry-run
npm run content:import -- --package content-authoring/assembled/107/surah.json
```

The database ledger tracks packet/revision/review state. Layer-level status is
kept inside the draft artifact so the first implementation does not create a
workflow row for every individual field.
