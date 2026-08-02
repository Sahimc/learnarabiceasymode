CREATE TABLE "audio_references" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"reciter" text,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ayah_teaching_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"ayah_id" text NOT NULL,
	"summary" text,
	"sentence_map" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ayahs" (
	"id" text PRIMARY KEY NOT NULL,
	"surah_id" text NOT NULL,
	"number" integer NOT NULL,
	"arabic" text NOT NULL,
	"translation" text,
	"natural_meaning" text,
	"status" text NOT NULL,
	"source_provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_import_items" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "content_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"error_summary" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"schema_version" text NOT NULL,
	"content_version" text NOT NULL,
	"status" text NOT NULL,
	"source_path" text NOT NULL,
	"checksum" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drill_options" (
	"id" text PRIMARY KEY NOT NULL,
	"drill_id" text NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drills" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_families" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_family_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"form" text NOT NULL,
	"meaning" text NOT NULL,
	"difference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"scope" jsonb NOT NULL,
	"print_options" jsonb NOT NULL,
	"content_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"output_path" text,
	"page_count" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lemmas" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"transliteration" text,
	"source_evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "morphology_records" (
	"id" text PRIMARY KEY NOT NULL,
	"occurrence_id" text NOT NULL,
	"provider" text NOT NULL,
	"root_id" text,
	"lemma_id" text,
	"part_of_speech" text,
	"features" jsonb,
	"segmentation" jsonb,
	"syntax" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recognition_clues" (
	"id" text PRIMARY KEY NOT NULL,
	"teaching_entry_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "root_picture_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"root_id" text NOT NULL,
	"text" text NOT NULL,
	"source" text DEFAULT 'project-authored' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roots" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"transliteration" text,
	"source_evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentence_map_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"ayah_teaching_id" text NOT NULL,
	"order" integer NOT NULL,
	"text" text NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"attribution" text,
	"license" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"record_type" text NOT NULL,
	"record_key" text NOT NULL,
	"raw" jsonb NOT NULL,
	"checksum" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surahs" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"arabic_name" text NOT NULL,
	"transliteration" text NOT NULL,
	"english_label" text NOT NULL,
	"ayah_count" integer NOT NULL,
	"status" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_word_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"meaning" text NOT NULL,
	"type" text NOT NULL,
	"root" text DEFAULT '' NOT NULL,
	"root_picture" text DEFAULT '' NOT NULL,
	"construction" text NOT NULL,
	"components" jsonb NOT NULL,
	"grammar" text NOT NULL,
	"sentence_role" text NOT NULL,
	"recognition_clue" text NOT NULL,
	"forms" jsonb NOT NULL,
	"takeaway" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"author" text,
	"provider" text,
	"license" text,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transliterations" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"text" text NOT NULL,
	"provider" text,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volume_surahs" (
	"volume_id" text NOT NULL,
	"surah_id" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "volume_surahs_volume_id_surah_id_pk" PRIMARY KEY("volume_id","surah_id")
);
--> statement-breakpoint
CREATE TABLE "volumes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_breakdown_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"breakdown_id" text NOT NULL,
	"stable_part_id" text NOT NULL,
	"part_order" integer NOT NULL,
	"source_text" text NOT NULL,
	"display_text" text NOT NULL,
	"label" text NOT NULL,
	"meaning" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_breakdowns" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"mode" text NOT NULL,
	"source_text" text NOT NULL,
	"teaching_entry_id" text,
	"word_occurrence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"surah_id" text NOT NULL,
	"ayah_id" text NOT NULL,
	"position" integer NOT NULL,
	"arabic" text NOT NULL,
	"transliteration" text,
	"gloss" text,
	"status" text NOT NULL,
	"shared_teaching_id" text,
	"occurrence_role" text,
	"root_id" text,
	"lemma_id" text,
	"source_refs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ayahs_surah_number_idx" ON "ayahs" USING btree ("surah_id","number");--> statement-breakpoint
CREATE INDEX "content_imports_package_idx" ON "content_imports" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_packages_checksum_idx" ON "content_packages" USING btree ("checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "source_records_provider_key_idx" ON "source_records" USING btree ("provider_id","record_key");--> statement-breakpoint
CREATE UNIQUE INDEX "surahs_number_idx" ON "surahs" USING btree ("number");--> statement-breakpoint
CREATE INDEX "teaching_word_entries_package_idx" ON "teaching_word_entries" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_breakdown_parts_stable_idx" ON "word_breakdown_parts" USING btree ("breakdown_id","stable_part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_breakdown_parts_order_idx" ON "word_breakdown_parts" USING btree ("breakdown_id","part_order");--> statement-breakpoint
CREATE UNIQUE INDEX "word_breakdowns_shared_idx" ON "word_breakdowns" USING btree ("teaching_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_breakdowns_override_idx" ON "word_breakdowns" USING btree ("word_occurrence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_occurrences_ayah_position_idx" ON "word_occurrences" USING btree ("ayah_id","position");--> statement-breakpoint
CREATE INDEX "word_occurrences_arabic_idx" ON "word_occurrences" USING btree ("arabic");