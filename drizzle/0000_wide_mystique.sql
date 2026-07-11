CREATE TYPE "public"."edge_type" AS ENUM('link', 'related', 'source-of', 'derived-from');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'zh');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'pdf', 'doc', 'spreadsheet', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_provider" AS ENUM('cloudinary', 'r2');--> statement-breakpoint
CREATE TYPE "public"."note_status" AS ENUM('draft', 'published', 'private');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('manual', 'url', 'youtube', 'pdf', 'docx', 'xlsx', 'image', 'video');--> statement-breakpoint
CREATE TABLE "edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_note_id" integer NOT NULL,
	"to_note_id" integer NOT NULL,
	"relationship_type" "edge_type" DEFAULT 'link' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"stage" varchar(100),
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"kind" "media_kind" NOT NULL,
	"provider" "media_provider" NOT NULL,
	"url" text NOT NULL,
	"size_bytes" bigint,
	"mime_type" varchar(150),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"language" "language" NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"what" text DEFAULT '',
	"how" text DEFAULT '',
	"why" text DEFAULT '',
	"other" text DEFAULT '',
	"summary" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "note_tags" (
	"note_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "note_tags_note_id_tag_id_pk" PRIMARY KEY("note_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"status" "note_status" DEFAULT 'draft' NOT NULL,
	"source_type" "source_type" DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"primary_language" "language" DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_note_id_notes_id_fk" FOREIGN KEY ("from_note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_note_id_notes_id_fk" FOREIGN KEY ("to_note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_content" ADD CONSTRAINT "note_content_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;