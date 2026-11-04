# Compositional gloss audit workflow

The occurrence-level audit stays paused until the user resumes it. Resume at Sūrah 3:34, word 1.

## Per-verse work

The full coverage rows and their decision lookup caches live outside the Git workspace at:

`%USERPROFILE%\.codex\quran-compositional-gloss-audit\store`

For a verse, load its current rows with:

```powershell
node scripts/compositional-gloss-audit-store.mjs lookup --surah 3 --ayah 34
```

Add `--word N` for one occurrence. The helper reads only that sūrah's coverage and decision files. Do not use ripgrep over the full `coverage-ledger.jsonl` or scan the global decision log to retrieve a verse. Preserve every existing record and append each new decision to both the global decision log and that sūrah's decision shard after the verse is adjudicated.

The lookup returns the full decision history for each occurrence and identifies its latest row. Check that history against the checkpoint before adding a decision; if the checkpoint points at a row that already has a decision, preserve it and report the mismatch rather than replacing or duplicating it.

## Sūrah boundary

Only after all occurrences in a sūrah are adjudicated, reconcile and verify the full-corpus ledger:

```powershell
node scripts/render-compositional-gloss-ledger.mjs --surah-complete=N
node scripts/verify-compositional-gloss-ledger.mjs
```

Rendering refuses to run without an explicit completed-sūrah number and refuses to publish if that sūrah still has pending or stale segmented decisions. The old refresh command delegates to the same renderer. It overwrites stable generated outputs instead of creating another timestamped full-size snapshot set. The full-corpus verification is run only at this sūrah boundary.

The split migration's counts and hashes are in the external `store-manifest.json`. It preserves original JSONL records, including all decision history rows for duplicate occurrence IDs. The audit checkpoint remains in `PHASE-1-CHECKPOINT.md`.
