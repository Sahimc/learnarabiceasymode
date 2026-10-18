ALTER TABLE "teaching_word_entries" ADD COLUMN IF NOT EXISTS "sarf_review" jsonb;
UPDATE "teaching_word_entries"
SET "sarf_review" = '{"status":"limited","limitedReason":"Legacy database row requires review under the five-form Ṣarf contract.","provenance":["Legacy database row; re-import required for the current contract."],"reviewedBy":"Codex","reviewedAt":"legacy"}'::jsonb
WHERE "sarf_review" IS NULL;
ALTER TABLE "teaching_word_entries" ALTER COLUMN "sarf_review" SET NOT NULL;

ALTER TABLE "form_family_entries" ADD COLUMN IF NOT EXISTS "relationship" text;
UPDATE "form_family_entries"
SET "relationship" = 'Legacy form-family row requires review under the five-form Ṣarf contract.'
WHERE "relationship" IS NULL;
ALTER TABLE "form_family_entries" ALTER COLUMN "relationship" SET NOT NULL;

ALTER TABLE "form_family_entries" ADD COLUMN IF NOT EXISTS "provenance" text;
UPDATE "form_family_entries"
SET "provenance" = 'Legacy form-family row requires review under the five-form Ṣarf contract.'
WHERE "provenance" IS NULL;
ALTER TABLE "form_family_entries" ALTER COLUMN "provenance" SET NOT NULL;
