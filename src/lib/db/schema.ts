import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  integer,
  bigint,
  pgEnum,
  primaryKey,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

// --- enums ---
export const noteStatusEnum = pgEnum("note_status", ["draft", "published", "private"]);
export const sourceTypeEnum = pgEnum("source_type", [
  "manual",
  "url",
  "youtube",
  "pdf",
  "docx",
  "xlsx",
  "image",
  "video",
  "obsidian",
]);
export const languageEnum = pgEnum("language", ["en", "zh"]);
export const mediaKindEnum = pgEnum("media_kind", [
  "image",
  "video",
  "pdf",
  "doc",
  "spreadsheet",
  "other",
]);
export const mediaProviderEnum = pgEnum("media_provider", ["cloudinary", "r2"]);
export const edgeTypeEnum = pgEnum("edge_type", [
  "link",
  "related",
  "source-of",
  "derived-from",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

// AI Classroom subtabs — a note whose `category` is set shows up under that
// subtab on /classroom. Kept as an enum so the tab list, the AI publish
// assist's classification, and the DB stay in lockstep.
export const classroomCategoryEnum = pgEnum("classroom_category", [
  "knowledge",
  "skill",
  "mcp",
  "api",
  "best-practices",
  "use-cases",
  "step-by-step",
  "ai-evaluation",
  "ai-models",
  "ai",
]);

export type ClassroomCategory = (typeof classroomCategoryEnum.enumValues)[number];

export type NoteStatus = (typeof noteStatusEnum.enumValues)[number];
export type SourceType = (typeof sourceTypeEnum.enumValues)[number];
export type MediaKind = (typeof mediaKindEnum.enumValues)[number];
export type MediaProvider = (typeof mediaProviderEnum.enumValues)[number];
export type EdgeType = (typeof edgeTypeEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];

// --- tables ---
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 500 }).notNull(),
  status: noteStatusEnum("status").default("draft").notNull(),
  sourceType: sourceTypeEnum("source_type").default("manual").notNull(),
  sourceUrl: text("source_url"),
  // Set only for notes synced in from an Obsidian vault (source_type
  // "obsidian") — the file's path within the vault repo (e.g.
  // "notes/foo.md") and its git blob sha, used to detect changed files on
  // the next sync without re-fetching/re-diffing every file's content.
  sourcePath: text("source_path"),
  sourceSha: varchar("source_sha", { length: 64 }),
  primaryLanguage: languageEnum("primary_language").default("en").notNull(),
  // Non-null only for AI Classroom articles — which subtab they live under.
  category: classroomCategoryEnum("category"),
  // User-defined finer-grained label within a category (e.g.
  // "Newsletters", "Claude Code Deep Dive from Leaked Code") — backed by
  // classroomSubcategories below (its own table, like tags/noteTags)
  // rather than a fixed enum like `category`, since the list is meant to
  // grow. Optional; null means uncategorized within its subtab. Deleting
  // a subcategory clears it here rather than deleting the article.
  subcategoryId: integer("subcategory_id").references(() => classroomSubcategories.id, {
    onDelete: "set null",
  }),
  // Finer-grained still: a chapter/section *within* the subcategory above
  // (e.g. subcategory "Claude Code Deep Dive from Leaked Code" breaks into
  // sections "Quick Start", "Core Mechanisms", "Tools"...) — see
  // classroomSections below. Optional; null means unsectioned within its
  // subcategory. Deleting a section clears it here rather than deleting
  // the article.
  sectionId: integer("section_id").references(() => classroomSections.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// The AI Classroom's user-managed subcategory list (e.g. "General
// Knowledge", "Newsletters") — a real table, not a free-text column, so
// the composer's picker can list, sort, and reuse existing values instead
// of scraping distinct strings off notes.
export const classroomSubcategories = pgTable("classroom_subcategories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// A subcategory's sections — one subcategory has many sections (e.g.
// "Claude Code Deep Dive from Leaked Code" breaks down into "Quick Start",
// "Core Mechanisms", "Tools", etc.), and every section belongs to exactly
// one subcategory. Same real-table pattern as classroomSubcategories so the
// composer's picker can list/sort/reuse existing values; unique per
// subcategory (not globally) since the same section name could reasonably
// exist under two different subcategories.
export const classroomSections = pgTable(
  "classroom_sections",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    subcategoryId: integer("subcategory_id")
      .notNull()
      .references(() => classroomSubcategories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.subcategoryId, t.name)],
);

export const noteContent = pgTable("note_content", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  language: languageEnum("language").notNull(),
  // Per-language title — only set for classroom articles' *translated* row
  // (the original-language title lives on notes.title, same as before, so
  // this stays empty until the translate button fills it in). The article
  // page falls back to notes.title when this is empty, so nothing else
  // needs to change for untranslated articles or regular notes.
  title: text("title").default(""),
  bodyMarkdown: text("body_markdown").default("").notNull(),
  what: text("what").default(""),
  how: text("how").default(""),
  why: text("why").default(""),
  other: text("other").default(""),
  summary: text("summary").default(""),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] })],
);

export const edges = pgTable("edges", {
  id: serial("id").primaryKey(),
  fromNoteId: integer("from_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  toNoteId: integer("to_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  relationshipType: edgeTypeEnum("relationship_type").default("link").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  kind: mediaKindEnum("kind").notNull(),
  provider: mediaProviderEnum("provider").notNull(),
  url: text("url").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 150 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ingestionJobs = pgTable("ingestion_jobs", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").references(() => notes.id, { onDelete: "cascade" }),
  status: jobStatusEnum("status").default("queued").notNull(),
  stage: varchar("stage", { length: 100 }),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One row per AI Classroom article — the "AI publish assist" output that
// accompanies the user's own content: a learning map, step-by-step hands-on
// instructions, and the top suggested resources (title + URL + why).
// Cascade-deletes with its note.
export interface GuideResource {
  title: string;
  url: string;
  description: string;
}

export const learningGuides = pgTable("learning_guides", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  learningMap: text("learning_map").default("").notNull(),
  handsOn: text("hands_on").default("").notNull(),
  // Chinese renditions of the guide, filled by the article page's translate
  // button (translateClassroomArticleAction). Empty string = not translated.
  learningMapZh: text("learning_map_zh").default("").notNull(),
  handsOnZh: text("hands_on_zh").default("").notNull(),
  resources: jsonb("resources").$type<GuideResource[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Tracks one run of the Obsidian one-way sync (PLAN.md §8) — a single
// vault-wide pass, as opposed to ingestion_jobs which tracks one source
// (URL/file) each. filesTotal/filesProcessed/filesFailed let the UI show
// progress across a vault with many notes.
export const obsidianSyncRuns = pgTable("obsidian_sync_runs", {
  id: serial("id").primaryKey(),
  status: jobStatusEnum("status").default("queued").notNull(),
  // How many vault .md files were found in the repo at all — filesTotal is
  // only the *changed* subset, so without this a misconfigured repo/path
  // (0 files found) looks identical to "everything already up to date".
  filesScanned: integer("files_scanned"),
  filesTotal: integer("files_total"),
  filesProcessed: integer("files_processed").default(0),
  filesFailed: integer("files_failed").default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
