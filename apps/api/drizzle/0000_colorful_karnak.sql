CREATE TABLE IF NOT EXISTS "dict_concept" (
	"irdi" text PRIMARY KEY NOT NULL,
	"scheme" text NOT NULL,
	"source" text,
	"name_en" text,
	"name_ko" text,
	"definition" text,
	"unit" text,
	"data_type" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"successor" text,
	"payload" jsonb,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"cmd" jsonb NOT NULL,
	"undo" jsonb NOT NULL,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"doc" jsonb NOT NULL,
	"layout" jsonb,
	"issues" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "term_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"irdi" text NOT NULL,
	"note" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_commands" ADD CONSTRAINT "model_commands_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dict_concept_name_idx" ON "dict_concept" USING btree ("name_ko","name_en");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_commands_model_version_idx" ON "model_commands" USING btree ("model_id","version");