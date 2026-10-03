DROP INDEX "content_work_reviews_revision_reviewer_idx";--> statement-breakpoint
ALTER TABLE "content_work_reviews" ADD COLUMN "scope_id" text DEFAULT 'packet' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_work_reviews_revision_scope_reviewer_idx" ON "content_work_reviews" USING btree ("revision_id","scope_id","reviewer_role","reviewer_id");
