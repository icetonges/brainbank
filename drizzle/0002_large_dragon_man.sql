CREATE TYPE "public"."atom_kind" AS ENUM('fact', 'preference', 'pattern', 'goal', 'person', 'project', 'skill', 'question', 'idea');--> statement-breakpoint
CREATE TYPE "public"."atom_link_type" AS ENUM('supports', 'contradicts', 'refines', 'caused-by', 'relates-to');--> statement-breakpoint
CREATE TYPE "public"."atom_status" AS ENUM('active', 'archived', 'merged');--> statement-breakpoint
CREATE TYPE "public"."classroom_category" AS ENUM('knowledge', 'skill', 'mcp', 'api', 'best-practices', 'use-cases', 'step-by-step', 'ai-evaluation', 'ai-models', 'ai');--> statement-breakpoint
CREATE TYPE "public"."insight_kind" AS ENUM('highlight', 'theme', 'idea', 'business', 'recommendation', 'reflection');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('new', 'starred', 'dismissed', 'acted-on');--> statement-breakpoint
CREATE TYPE "public"."knowledge_origin" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."knowledge_run_kind" AS ENUM('distill', 'synthesize', 'decay');--> statement-breakpoint
CREATE TYPE "public"."diary_mood" AS ENUM('great', 'good', 'neutral', 'low', 'rough');--> statement-breakpoint
CREATE TYPE "public"."title_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."trend_category" AS ENUM('news', 'paper', 'repo');--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'diary';--> statement-breakpoint
CREATE TABLE "classroom_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"subcategory_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classroom_sections_subcategory_id_name_unique" UNIQUE("subcategory_id","name")
);
--> statement-breakpoint
CREATE TABLE "classroom_subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classroom_subcategories_name_unique" UNIQUE("name"),
	CONSTRAINT "classroom_subcategories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title_source" "title_source" DEFAULT 'auto' NOT NULL,
	"mood" "diary_mood",
	"energy" integer,
	"scratch" text DEFAULT '' NOT NULL,
	"distilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_entries_note_id_unique" UNIQUE("note_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_atom_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"atom_id" integer NOT NULL,
	"note_id" integer,
	"excerpt" text DEFAULT '' NOT NULL,
	"is_reinforcement" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_atoms" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "atom_kind" DEFAULT 'fact' NOT NULL,
	"statement" varchar(500) NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"salience" real DEFAULT 0.5 NOT NULL,
	"reinforcement_count" integer DEFAULT 1 NOT NULL,
	"status" "atom_status" DEFAULT 'active' NOT NULL,
	"origin" "knowledge_origin" DEFAULT 'auto' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"merged_into_id" integer,
	"embedding" vector(768),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reinforced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_insight_atoms" (
	"insight_id" integer NOT NULL,
	"atom_id" integer NOT NULL,
	CONSTRAINT "knowledge_insight_atoms_insight_id_atom_id_pk" PRIMARY KEY("insight_id","atom_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "insight_kind" DEFAULT 'highlight' NOT NULL,
	"title" varchar(300) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" "insight_status" DEFAULT 'new' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"generated_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_atom_id" integer NOT NULL,
	"to_atom_id" integer NOT NULL,
	"link_type" "atom_link_type" DEFAULT 'relates-to' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"origin" "knowledge_origin" DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_links_from_atom_id_to_atom_id_link_type_unique" UNIQUE("from_atom_id","to_atom_id","link_type")
);
--> statement-breakpoint
CREATE TABLE "knowledge_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "knowledge_run_kind" DEFAULT 'distill' NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"note_id" integer,
	"atoms_created" integer DEFAULT 0 NOT NULL,
	"atoms_reinforced" integer DEFAULT 0 NOT NULL,
	"links_created" integer DEFAULT 0 NOT NULL,
	"insights_created" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_guides" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"learning_map" text DEFAULT '' NOT NULL,
	"hands_on" text DEFAULT '' NOT NULL,
	"learning_map_zh" text DEFAULT '' NOT NULL,
	"hands_on_zh" text DEFAULT '' NOT NULL,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_digests" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" varchar(10) NOT NULL,
	"summary_markdown" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_digests_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "trend_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"digest_id" integer NOT NULL,
	"category" "trend_category" NOT NULL,
	"source" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "note_content" ADD COLUMN "title" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "note_content" ADD COLUMN "translated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "note_content" ADD COLUMN "translated_model" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "category" "classroom_category";--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "subcategory_id" integer;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "section_id" integer;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "section_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "obsidian_sync_runs" ADD COLUMN "files_scanned" integer;--> statement-breakpoint
ALTER TABLE "classroom_sections" ADD CONSTRAINT "classroom_sections_subcategory_id_classroom_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."classroom_subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_atom_sources" ADD CONSTRAINT "knowledge_atom_sources_atom_id_knowledge_atoms_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."knowledge_atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_atom_sources" ADD CONSTRAINT "knowledge_atom_sources_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_insight_atoms" ADD CONSTRAINT "knowledge_insight_atoms_insight_id_knowledge_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."knowledge_insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_insight_atoms" ADD CONSTRAINT "knowledge_insight_atoms_atom_id_knowledge_atoms_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."knowledge_atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_from_atom_id_knowledge_atoms_id_fk" FOREIGN KEY ("from_atom_id") REFERENCES "public"."knowledge_atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_to_atom_id_knowledge_atoms_id_fk" FOREIGN KEY ("to_atom_id") REFERENCES "public"."knowledge_atoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_runs" ADD CONSTRAINT "knowledge_runs_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_guides" ADD CONSTRAINT "learning_guides_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_items" ADD CONSTRAINT "trend_items_digest_id_trend_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."trend_digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_entries_occurred_at_idx" ON "diary_entries" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "knowledge_atom_sources_atom_idx" ON "knowledge_atom_sources" USING btree ("atom_id");--> statement-breakpoint
CREATE INDEX "knowledge_atoms_embedding_idx" ON "knowledge_atoms" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "knowledge_atoms_status_idx" ON "knowledge_atoms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_insights_status_idx" ON "knowledge_insights" USING btree ("status");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_subcategory_id_classroom_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."classroom_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_section_id_classroom_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."classroom_sections"("id") ON DELETE set null ON UPDATE no action;