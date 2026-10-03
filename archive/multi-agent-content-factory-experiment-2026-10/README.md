# Multi-Agent Content Factory Experiment Archive

This archive preserves the Qur'anic content-production factory experiment so
it can be reconstructed later without remaining in the active application
workflow.

## Boundary and commits

- Pre-experiment baseline: `de3558eb9f1b1d7c3e5b9a58ab5cac358b82cf88` —
  `Complete Surah 111 Word Tree content`
- Experiment commit: `73158eb198639b96e57e7193aba3a2b14639f55e` — `Build deterministic content production factory`
- Cleanup commits: `4a44ef9` archived the experiment and restored the active
  tree; `f2f7d46` kept the archive out of active TypeScript and lint discovery.
- Uncommitted pilot state: Sūrah 107 packets, four revision-001 drafts, and
  the Sūrah 107 review/issue artifacts created after the experiment commit.

`de3558e` already contained the normal canonical workflow and the approved
custom-complete Sūrahs 111–114. Sūrah 107 was canonical source-only content.

## What was tested

The experiment tested a staged PostgreSQL-backed authoring factory:

1. immutable source packets for non-overlapping āyah ranges;
2. worker-owned immutable draft revisions;
3. pinned production-knowledge snapshots and source fingerprints;
4. independent source, morphology, grammar, meaning, and pedagogy review
   artifacts with structured issue manifests;
5. a fail-closed assembler and review matrix; and
6. transfer to the existing canonical importer only after approval.

The implementation, schemas, tests, documentation, migrations, knowledge
snapshot machinery, provider override data, Sūrah 108 systems pilot, and the
complete Sūrah 107 pilot are preserved below. The baseline-relative Git patch
is `experiment-changes.patch`.

## What happened

The factory commit implemented the machinery and a source-only Sūrah 108
systems pilot. The later Sūrah 107 pilot created four source packets covering
25 visible occurrences, four revision-001 drafts, and five independent review
passes. The reviewers found 19 structured issues, including blockers, but no
Sūrah 107 authored content was imported or promoted. The database ledger still
showed the pilot as review-required with no approved artifact.

The experiment is paused because the multi-agent workflow introduced more
coordination, review-adjudication, and content-model complexity than the
current simpler production workflow needs. The active repository has therefore
been restored to the `de3558e` behavior.

## Archive layout

- `experiment-changes.patch`: binary-capable Git diff from `de3558e` to
  `73158eb`.
- `implementation/tracked-files/`: copies of the tracked factory changes
  outside `content-authoring/`, preserving repository paths.
- `pilot-artifacts/content-authoring/`: the complete tracked Sūrah 108 pilot,
  knowledge/factory workspace, and uncommitted Sūrah 107 packets, drafts, and
  reviews.
- `pilot-artifacts/content-authoring-moved-original/`: the original working
  `content-authoring/` tree moved into the archive during cleanup; it is kept
  as an exact recovery copy alongside the verified archive copy above.
- `database/experiment-ledger-state.json`: exported experiment ledger rows,
  experiment migration rows, and the factory-only `word_breakdowns` check
  constraint before cleanup.

## Database decision

The experiment added migrations `0002_curvy_ghost_rider` and
`0003_lowly_greymalkin`. They created the `content_work_*` ledger tables,
added review scope metadata, and added the factory-only
`word_breakdowns_exactly_one_scope` check. The ledger tables contained only
factory workflow state and were exported before cleanup. Canonical Qur'anic
tables and canonical content rows were not rolled back or rewritten.

Cleanup was applied transactionally using `database/cleanup-applied.sql`:
the four `content_work_*` tables, the factory-only breakdown constraint, and
the two factory migration-history rows were removed after export. The normal
baseline migration set now applies cleanly.

## Codex configuration

During the experiment, `C:\Users\Sahim Chowdhury\.codex\config.toml` received:

```toml
[agents]
enabled = true
max_concurrent_threads_per_session = 8
```

This was outside Git and was added only for the experiment. The previous
configuration had no explicit `agents.max_concurrent_threads_per_session` or
legacy `agents.max_threads` value. The block is restored to that previous
state; unrelated Codex settings are not changed.

## Restoring the experiment later

Start from the restored active tree and apply `experiment-changes.patch` with
Git. Then copy `pilot-artifacts/content-authoring/` back to the repository's
`content-authoring/` path. Restore the archived migration/schema files and
ledger data only after reviewing the database compatibility and the current
content-production contract. Do not import the Sūrah 107 pilot without a new
independent approval decision.
