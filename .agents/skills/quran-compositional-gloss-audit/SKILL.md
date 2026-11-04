---
name: quran-compositional-gloss-audit
description: Safe, occurrence-level compositional gloss audit workflow using active-sūrah shards and boundary-only consolidated-ledger reconciliation.
---

# Qur’an Compositional Gloss Audit

Use this skill for any task involving the occurrence-level compositional gloss audit. Read the repository root `AGENTS.md` first; its approval boundaries are mandatory.

## Before an audit batch

- Read the current checkpoint and relevant occurrence records. Keep the stated pause/resume boundary intact.
- Verify sūrah, āyah, repository word position, occurrence ID, and canonical source position from repository data and the canonical corpus. Never infer locations from memory.
- Load only the requested verse from the active sūrah shards with `node scripts/compositional-gloss-audit-store.mjs lookup --surah N --ayah N [--word N]`.
- Review each displayed Arabic split, English gloss, and local context separately. Record an occurrence-specific decision/comment; do not extrapolate from another occurrence.
- Do not rebuild, export, or reconcile the full ledger during ordinary verse processing. Do not create timestamped full-ledger snapshots.

## Active-sūrah records

The store is outside the repository at `%USERPROFILE%\.codex\quran-compositional-gloss-audit\store` by default. It contains `coverage-by-surah/NNN.jsonl` and `decisions-by-surah/NNN.jsonl`. `QURAN_AUDIT_STORE_ROOT` may point to an isolated store for a dry run. Never set it to a directory inside the repository. Keep the global audit ledger, decision history, and checkpoint immutable during read-only investigations.

Preserve repeated decision IDs as separate historical records. Never replace the full decision history with a one-row-per-occurrence map. Do not silently skip or overwrite existing decisions or coverage records.

## Completed-sūrah boundary

Only after the whole sūrah is complete and the user authorized boundary reconciliation:

1. Reconcile the completed sūrah’s coverage and all decision history.
2. Verify no occurrence is missing, duplicated, silently changed, or unresolved for that sūrah.
3. Run the full renderer and verifier with `--surah-complete=N`.
4. Use stable output filenames and inspect output sizes before writing. Keep backups outside the repository.

The original full-corpus builder requires `--full-corpus-bootstrap`; it is not an ordinary verse-audit tool. Do not invoke it during occurrence reviews.

## Validation and performance

After workflow-script changes, run `npm run test:audit-workflow`. The test copies only the active sūrah shards to a temporary directory, calls the lookup with `--trace`, and verifies that it reads only those two sūrah files and writes nothing to authoritative records. Ensure generated file counts and sizes return to their original values after temporary files are cleaned up.

Run `node scripts/verify-compositional-gloss-audit-store.mjs` only at deliberate full integrity checkpoints, not per verse. It checks every shard against its stored hash/count and checks the authoritative ledger, decision-history, and checkpoint hashes.

Avoid broad Git operations and repeated whole-repository scans. Never access a remote without explicit user authorization. Do not delete archives, Git objects, decisions, or checkpoints without separate approval.
