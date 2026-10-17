# Content review ledger

This directory is the durable audit trail for Qur'anic Word Tree authoring and repair.

The governing rules live in `docs/content-authoring/quranic-word-tree-contract.json` (active contract version 1.3.8). The ledger does not replace that contract; it records what was done under which contract version. Historical contract versions remain immutable and are accepted only as history.

## Ledger rules

- `ledger.jsonl` is append-only JSON Lines. Do not delete or rewrite an earlier record.
- Every contract change, lesson review, batch audit, import and rendered-route verification gets a record.
- Every lesson record names the sūrah, āyah, word position, occurrence, teaching ID, contract version, checks, evidence and resulting status.
- Ṣarf records distinguish a full five-form family from a reviewed limited family; a limited family must carry an explicit reason and may not be used to hide padding.
- A later correction appends a new record and points to the earlier record; it does not erase history.
- `passed` and `passed-limited` are the only completion statuses. `pending`, `in-review` and `blocked` remain unfinished.
- A goal or batch cannot be declared complete while a required occurrence lacks a current ledger record or has an unresolved status.

Generated `limited-sarf-audit-*.json` reports are disposable run artifacts and are kept in the external audit archive, not in the repository. The append-only ledger and its numbered shards are the durable audit record.

The first record establishes the active contract. The full-Qur'an review has not started from that record alone.
