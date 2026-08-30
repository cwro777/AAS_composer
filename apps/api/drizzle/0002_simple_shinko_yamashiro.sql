CREATE TABLE IF NOT EXISTS "samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"node" text NOT NULL,
	"signal" text NOT NULL,
	"semantic_id" text,
	"unit" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"num_value" double precision,
	"text_value" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "samples" ADD CONSTRAINT "samples_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "samples_model_signal_at_idx" ON "samples" USING btree ("model_id","signal","at");