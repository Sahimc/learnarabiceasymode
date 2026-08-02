CREATE TABLE "quran_text_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"ayah_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"text" text NOT NULL,
	"version" text NOT NULL,
	"attribution" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
