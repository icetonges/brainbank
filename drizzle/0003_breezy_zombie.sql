CREATE TYPE "public"."trending_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'audio' BEFORE 'pdf';--> statement-breakpoint
CREATE TABLE "github_trending_developers" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"username" varchar(255) NOT NULL,
	"display_name" varchar(255) DEFAULT '' NOT NULL,
	"profile_url" text NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"popular_repo_name" varchar(255),
	"popular_repo_url" text,
	"popular_repo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_trending_developers_run_id_username_unique" UNIQUE("run_id","username")
);
--> statement-breakpoint
CREATE TABLE "github_trending_repos" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_zh" text DEFAULT '' NOT NULL,
	"language" varchar(100),
	"stars" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"stars_in_period" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_trending_repos_run_id_url_unique" UNIQUE("run_id","url")
);
--> statement-breakpoint
CREATE TABLE "github_trending_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"cadence" "trending_cadence" NOT NULL,
	"date" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_trending_runs_cadence_date_unique" UNIQUE("cadence","date")
);
--> statement-breakpoint
ALTER TABLE "note_content" ADD COLUMN "audio_segments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note_content" ADD COLUMN "audio_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "note_content" ADD COLUMN "audio_source_hash" text;--> statement-breakpoint
ALTER TABLE "trend_digests" ADD COLUMN "insight" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_digests" ADD COLUMN "action_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_digests" ADD COLUMN "watch_list" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_digests" ADD COLUMN "summary_markdown_zh" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_digests" ADD COLUMN "insight_zh" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_digests" ADD COLUMN "action_items_zh" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_digests" ADD COLUMN "watch_list_zh" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_items" ADD COLUMN "summary_zh" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_trending_developers" ADD CONSTRAINT "github_trending_developers_run_id_github_trending_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."github_trending_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_trending_repos" ADD CONSTRAINT "github_trending_repos_run_id_github_trending_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."github_trending_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_trending_developers_run_idx" ON "github_trending_developers" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "github_trending_repos_run_idx" ON "github_trending_repos" USING btree ("run_id");