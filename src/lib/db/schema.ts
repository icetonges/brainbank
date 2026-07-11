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
export type MediaKind = (typeof mediaKindEnum.enumValues)[number];
export type MediaProvider = (typeof mediaProviderEnum.enumValues)[number];
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
  primaryLanguage: languageEnum("primary_language").default("en").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const noteContent = pgTable("note_content", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  language: languageEnum("language").notNull(),
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
