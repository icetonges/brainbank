ALTER TYPE "public"."source_type" ADD VALUE 'obsidian';--> statement-breakpoint
CREATE TABLE "obsidian_sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"files_total" integer,
	"files_processed" integer DEFAULT 0,
	"files_failed" integer DEFAULT 0,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "source_path" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "source_sha" varchar(64);