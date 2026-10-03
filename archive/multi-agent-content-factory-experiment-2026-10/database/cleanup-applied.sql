-- Applied after exporting experiment-ledger-state.json.
-- This removes only the factory workflow state and factory-only constraint.
-- Canonical Qur'anic/runtime tables and content rows were not changed.

BEGIN;
DROP TABLE IF EXISTS content_work_issues;
DROP TABLE IF EXISTS content_work_reviews;
DROP TABLE IF EXISTS content_work_revisions;
DROP TABLE IF EXISTS content_work_units;
ALTER TABLE word_breakdowns
  DROP CONSTRAINT IF EXISTS word_breakdowns_exactly_one_scope;
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   '9b12b95103dbdb752b7486385914283cd70abfdadf91334de4cc6df1a4dbf970',
   '3889674218ad4a05c07e869602ae01d839bfa415e5823adc1b705929c27b4fd3'
 );
COMMIT;
