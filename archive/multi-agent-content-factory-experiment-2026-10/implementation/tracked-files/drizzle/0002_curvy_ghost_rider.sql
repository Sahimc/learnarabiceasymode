CREATE TABLE "content_work_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"issue_code" text NOT NULL,
	"severity" text NOT NULL,
	"scope_id" text NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_work_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"reviewer_role" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"independent" boolean DEFAULT true NOT NULL,
	"status" text NOT NULL,
	"artifact_path" text,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_work_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"work_unit_id" text NOT NULL,
	"revision" integer NOT NULL,
	"source_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"draft_path" text,
	"assembled_path" text,
	"layer_state" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_work_units" (
	"id" text PRIMARY KEY NOT NULL,
	"packet_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"surah_number" integer NOT NULL,
	"ayah_start" integer NOT NULL,
	"ayah_end" integer NOT NULL,
	"source_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"assigned_worker" text,
	"packet_path" text,
	"approved_artifact_path" text,
	"import_package_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_work_issues_revision_idx" ON "content_work_issues" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "content_work_issues_status_idx" ON "content_work_issues" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_work_reviews_revision_reviewer_idx" ON "content_work_reviews" USING btree ("revision_id","reviewer_role","reviewer_id");--> statement-breakpoint
CREATE INDEX "content_work_reviews_status_idx" ON "content_work_reviews" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_work_revisions_unit_revision_idx" ON "content_work_revisions" USING btree ("work_unit_id","revision");--> statement-breakpoint
CREATE INDEX "content_work_revisions_status_idx" ON "content_work_revisions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_work_units_packet_idx" ON "content_work_units" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "content_work_units_status_idx" ON "content_work_units" USING btree ("status");--> statement-breakpoint
ALTER TABLE "word_breakdowns" ADD CONSTRAINT "word_breakdowns_exactly_one_scope" CHECK (num_nonnulls("word_breakdowns"."teaching_entry_id", "word_breakdowns"."word_occurrence_id") = 1);