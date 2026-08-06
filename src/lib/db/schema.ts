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
  index,
  real,
  boolean,
  vector,
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
  // A daily diary entry (see diaryEntries below). Diary entries are stored
  // as regular `notes` rows on purpose rather than in a table of their own:
  // that way they inherit the media/upload pipeline, the shared `tags`
  // table, [[wikilink]] edges, and full-text search for free, AND — more
  // importantly — the knowledge graph spans diary and classroom content in
  // one place instead of two disconnected islands. Diary-specific fields
  // (when it happened, mood, energy) live in the diaryEntries side-table.
  "diary",
]);
export const languageEnum = pgEnum("language", ["en", "zh"]);
export const mediaKindEnum = pgEnum("media_kind", [
  "image",
  "video",
  "audio",
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
  // "Newsletters", "Claude Code Deep Dive") — backed by
  // classroomSubcategories below (its own table, like tags/noteTags)
  // rather than a fixed enum like `category`, since the list is meant to
  // grow. Optional; null means uncategorized within its subtab. Deleting
  // a subcategory clears it here rather than deleting the article.
  subcategoryId: integer("subcategory_id").references(() => classroomSubcategories.id, {
    onDelete: "set null",
  }),
  // Finer-grained still: a chapter/section *within* the subcategory above
  // (e.g. subcategory "Claude Code Deep Dive" breaks into
  // sections "Quick Start", "Core Mechanisms", "Tools"...) — see
  // classroomSections below. Optional; null means unsectioned within its
  // subcategory. Deleting a section clears it here rather than deleting
  // the article.
  sectionId: integer("section_id").references(() => classroomSections.id, {
    onDelete: "set null",
  }),
  // Manual display order of this article within its section (lower first)
  // — set by the section page's drag-to-reorder UI (owner-only). New
  // articles default to 0 (front of the list) until manually ordered.
  sectionOrder: integer("section_order").default(0).notNull(),
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
  // Backs the subcategory's own landing page at the top-level route
  // /[subcategorySlug] (e.g. "Claude Code Deep Dive" -> "claudecodedeepdive")
  // — see src/lib/slug.ts's subcategorySlug() and src/app/[subcategorySlug].
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// A subcategory's sections — one subcategory has many sections (e.g.
// "Claude Code Deep Dive" breaks down into "Quick Start",
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
    // Explicit display order within the subcategory (lower first) — the
    // picker's dropdown and any listing follow this rather than alphabetical,
    // since a course-like subcategory (e.g. "Claude Code Deep Dive") wants
    // "Quick Start" before "In-Depth Study" regardless of spelling. New
    // sections default to 0 (front of the list) until manually ordered.
    sortOrder: integer("sort_order").default(0).notNull(),
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
  // Set only when this row was produced by the article page's AI translate
  // button (translateClassroomArticleAction) — null for a hand-authored
  // original-language row. Lets the article page show "Translated <date>
  // by <model>" on the translated language only, and lets a future re-run
  // tell a stale translation apart from a fresh one.
  translatedAt: timestamp("translated_at", { withTimezone: true }),
  // Comma-separated ModelId(s) actually used (see ModelId in lib/ai/models.ts).
  // Usually one; more than one means the fallback chain kicked in partway
  // through this row's chunks.
  translatedModel: text("translated_model"),
  // Generated audiobook (see lib/ai/media.ts's synthesizeSpeech and
  // classroom/audio-actions.ts) — an ordered array of segment URLs rather
  // than one file, because a long article is chunked into several TTS
  // calls (agent-server's qwen3-tts has a practical input-length ceiling)
  // and naive byte-level mp3 concatenation isn't reliably valid; the
  // player (components/audio-player.tsx) just advances through the array
  // on "ended" instead. Generated once and reused by every visitor — see
  // audioSourceHash below for staleness detection.
  audioSegments: jsonb("audio_segments").$type<string[]>().default([]).notNull(),
  audioGeneratedAt: timestamp("audio_generated_at", { withTimezone: true }),
  // sha256 of the plain-text (markdown stripped) content the audio was
  // generated from — lets the article page show "text changed since this
  // was recorded" instead of silently serving stale audio after an edit.
  audioSourceHash: text("audio_source_hash"),
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

// --- DIARY ---
//
// One row per diary entry, extending the `notes` row that actually holds
// the title/body/media/tags (source_type "diary", status always "private").
// Same 1:1 side-table pattern as learningGuides: the shared columns stay on
// `notes` so every existing feature keeps working, and only the fields that
// are meaningless for a non-diary note live here.
export const titleSourceEnum = pgEnum("title_source", ["auto", "manual"]);

// A coarse self-report, captured with one click in the composer rather than
// typed. Deliberately a small fixed scale — the point is a signal the
// knowledge engine can correlate against ("side-project entries are mostly
// energized; work entries mostly drained"), not precise emotional logging.
export const moodEnum = pgEnum("diary_mood", [
  "great",
  "good",
  "neutral",
  "low",
  "rough",
]);

export type TitleSource = (typeof titleSourceEnum.enumValues)[number];
export type DiaryMood = (typeof moodEnum.enumValues)[number];

export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id")
      .notNull()
      .unique()
      .references(() => notes.id, { onDelete: "cascade" }),
    // When the entry is ABOUT, which is not the same as when the row was
    // created (notes.createdAt) — backdating yesterday's evening at 7am the
    // next morning is normal diary behavior, and every timeline, heatmap,
    // and "this week" synthesis window keys off this instead.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    // Whether notes.title was written by the user or generated from the
    // body by the AI — lets the UI show "AI-named, click to rename" and
    // lets a re-distill safely regenerate an auto title without ever
    // clobbering one the user typed themselves.
    titleSource: titleSourceEnum("title_source").default("auto").notNull(),
    mood: moodEnum("mood"),
    // 1–5 self-reported energy, same rationale as mood above. Null = not
    // recorded, which is common and must stay cheap to leave blank.
    energy: integer("energy"),
    // The freeform "scratch pad" half of the composer — unstructured
    // fragments, todo shards, half-thoughts. Kept separate from the main
    // body so the AI can be told to treat it as raw material (mine it for
    // atoms) without it being rendered as part of the written entry.
    scratch: text("scratch").default("").notNull(),
    // Set once the distillation job has successfully turned this entry into
    // knowledge atoms. Null means "never distilled" — the assistant page's
    // backlog query looks for exactly that, so a failed or skipped run is
    // retried rather than silently lost.
    distilledAt: timestamp("distilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("diary_entries_occurred_at_idx").on(t.occurredAt)],
);

// --- KNOWLEDGE LAYER ---
//
// The self-evolving part. The design goal is that the knowledge base gets
// SMARTER over time, not merely BIGGER — which means it needs more than an
// append-only pile of AI summaries. Four mechanisms do that work:
//
//   1. Atoms, not documents. Each entry is distilled into small standalone
//      claims ("prefers deep work before 10am", "shipping X taught Y").
//      Small units can be independently reinforced, contradicted, merged,
//      and retired; a blob summary can only be replaced wholesale.
//   2. Reinforcement. A new entry that restates something already known
//      doesn't create a duplicate — it bumps that atom's confidence and
//      reinforcement count and appends a source row. Repeated observations
//      therefore become *stronger beliefs*, and the evidence trail behind
//      any claim stays inspectable.
//   3. Contradiction. When new evidence conflicts with an existing atom,
//      the pair gets an explicit "contradicts" link and is surfaced for
//      review, so beliefs get UPDATED rather than duplicated. This is the
//      difference between a system that learns and one that just hoards.
//   4. Decay + trim. Atoms not reinforced for a long time lose salience and
//      fall into a "stale?" queue. Nothing is auto-deleted (that would lose
//      real history); the owner archives or pins deliberately.
//
// Insights (highlights, themes, ideas, business opportunities) are then
// synthesized OVER the atom set rather than over raw entries — one step of
// abstraction that both improves quality and keeps raw personal text out of
// the synthesis prompt.

export const atomKindEnum = pgEnum("atom_kind", [
  "fact", // something true about the world or the owner's situation
  "preference", // how they like to work/live
  "pattern", // a recurring behavior or correlation observed over time
  "goal", // something they're trying to achieve
  "person", // a relationship and what matters about it
  "project", // ongoing work, side project, or venture
  "skill", // a capability being built
  "question", // an unresolved thread worth returning to
  "idea", // a seed worth developing
]);

export const atomStatusEnum = pgEnum("atom_status", [
  "active",
  "archived", // manually trimmed — kept for history, excluded from synthesis
  "merged", // folded into another atom; mergedIntoId points at the survivor
]);

export const knowledgeOriginEnum = pgEnum("knowledge_origin", ["auto", "manual"]);

export const atomLinkTypeEnum = pgEnum("atom_link_type", [
  "supports",
  "contradicts",
  "refines",
  "caused-by",
  "relates-to",
]);

export type AtomKind = (typeof atomKindEnum.enumValues)[number];
export type AtomStatus = (typeof atomStatusEnum.enumValues)[number];
export type KnowledgeOrigin = (typeof knowledgeOriginEnum.enumValues)[number];
export type AtomLinkType = (typeof atomLinkTypeEnum.enumValues)[number];

// nomic-embed-text (already present on the agent-server — see models.ts's
// note that it's embedding-only and never registered as a chat model)
// returns 768-dimension vectors. Changing embedding model means changing
// this number AND re-embedding every existing atom, so it's exported for
// the embedding lib to assert against rather than duplicated as a literal.
export const EMBEDDING_DIMENSIONS = 768;

export const knowledgeAtoms = pgTable(
  "knowledge_atoms",
  {
    id: serial("id").primaryKey(),
    kind: atomKindEnum("kind").default("fact").notNull(),
    // One self-contained sentence — this is what gets embedded, matched,
    // and shown on the constellation. Kept short deliberately: a claim you
    // can't state in a sentence is usually two claims.
    statement: varchar("statement", { length: 500 }).notNull(),
    // Optional supporting nuance, caveats, or the reasoning behind it.
    detail: text("detail").default("").notNull(),
    // 0–1. Starts modest for a single observation and climbs with each
    // independent reinforcement (see reinforceAtom in lib/knowledge/distill).
    confidence: real("confidence").default(0.5).notNull(),
    // How central this is to the owner's life/work right now. Decays with
    // time-since-reinforcement, which is what drives the "stale?" queue.
    salience: real("salience").default(0.5).notNull(),
    reinforcementCount: integer("reinforcement_count").default(1).notNull(),
    status: atomStatusEnum("status").default("active").notNull(),
    origin: knowledgeOriginEnum("origin").default("auto").notNull(),
    // Pinned atoms never decay and are never suggested for trimming — the
    // owner has said explicitly "this one matters, stop asking".
    pinned: boolean("pinned").default(false).notNull(),
    // Set when status = "merged": which atom absorbed this one. Keeps old
    // ids resolvable instead of breaking every source row pointing here.
    mergedIntoId: integer("merged_into_id"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastReinforcedAt: timestamp("last_reinforced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // HNSW over cosine distance — what similarAtoms() in
    // lib/knowledge/similarity.ts orders by. Requires the pgvector
    // extension (`CREATE EXTENSION IF NOT EXISTS vector;`) to exist BEFORE
    // db:push runs, or index creation fails.
    index("knowledge_atoms_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    index("knowledge_atoms_status_idx").on(t.status),
  ],
);

// The evidence trail: every entry that produced OR reinforced an atom.
// Append-only — this is what makes a claim auditable ("why do you think
// that about me?") and what the UI shows when you expand an atom.
export const knowledgeAtomSources = pgTable(
  "knowledge_atom_sources",
  {
    id: serial("id").primaryKey(),
    atomId: integer("atom_id")
      .notNull()
      .references(() => knowledgeAtoms.id, { onDelete: "cascade" }),
    noteId: integer("note_id").references(() => notes.id, { onDelete: "cascade" }),
    // The specific sentence/passage that justified it, quoted from the
    // entry — far more useful in review than just a link to the entry.
    excerpt: text("excerpt").default("").notNull(),
    // False for the row that created the atom, true for every later
    // observation that re-confirmed it.
    isReinforcement: boolean("is_reinforcement").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("knowledge_atom_sources_atom_idx").on(t.atomId)],
);

// The graph among atoms — how the assistant reasons about structure
// ("these three goals all depend on that one skill").
export const knowledgeLinks = pgTable(
  "knowledge_links",
  {
    id: serial("id").primaryKey(),
    fromAtomId: integer("from_atom_id")
      .notNull()
      .references(() => knowledgeAtoms.id, { onDelete: "cascade" }),
    toAtomId: integer("to_atom_id")
      .notNull()
      .references(() => knowledgeAtoms.id, { onDelete: "cascade" }),
    linkType: atomLinkTypeEnum("link_type").default("relates-to").notNull(),
    // Why the engine drew this link — shown on hover in the constellation.
    rationale: text("rationale").default("").notNull(),
    // Contradictions start unresolved and appear in the review queue; the
    // owner resolves by editing/archiving one side.
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    origin: knowledgeOriginEnum("origin").default("auto").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.fromAtomId, t.toAtomId, t.linkType)],
);

export const insightKindEnum = pgEnum("insight_kind", [
  "highlight", // what actually mattered in a period
  "theme", // a through-line the owner may not have noticed
  "idea", // a creative suggestion built from their own material
  "business", // a venture/monetization angle grounded in their skills
  "recommendation", // a concrete "do this next"
  "reflection", // a question worth sitting with
]);

export const insightStatusEnum = pgEnum("insight_status", [
  "new",
  "starred",
  "dismissed",
  "acted-on",
]);

export type InsightKind = (typeof insightKindEnum.enumValues)[number];
export type InsightStatus = (typeof insightStatusEnum.enumValues)[number];

export const knowledgeInsights = pgTable(
  "knowledge_insights",
  {
    id: serial("id").primaryKey(),
    kind: insightKindEnum("kind").default("highlight").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body").default("").notNull(),
    status: insightStatusEnum("status").default("new").notNull(),
    // The window this was synthesized over, so the UI can group "this
    // week" vs "all time" and a later run can supersede an older one.
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    // Comma-separated ModelId(s) — same convention as
    // noteContent.translatedModel.
    generatedModel: text("generated_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("knowledge_insights_status_idx").on(t.status)],
);

// Which atoms an insight was built from — the "show your work" link, so a
// suggestion is never an unattributable assertion.
export const knowledgeInsightAtoms = pgTable(
  "knowledge_insight_atoms",
  {
    insightId: integer("insight_id")
      .notNull()
      .references(() => knowledgeInsights.id, { onDelete: "cascade" }),
    atomId: integer("atom_id")
      .notNull()
      .references(() => knowledgeAtoms.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.insightId, t.atomId] })],
);

// One row per distillation or synthesis pass — same observability pattern
// as ingestionJobs/obsidianSyncRuns, so the assistant page can show what
// the engine has been doing and surface failures instead of hiding them.
export const knowledgeRunKindEnum = pgEnum("knowledge_run_kind", [
  "distill",
  "synthesize",
  "decay",
]);

export const knowledgeRuns = pgTable("knowledge_runs", {
  id: serial("id").primaryKey(),
  kind: knowledgeRunKindEnum("kind").default("distill").notNull(),
  status: jobStatusEnum("status").default("queued").notNull(),
  noteId: integer("note_id").references(() => notes.id, { onDelete: "cascade" }),
  atomsCreated: integer("atoms_created").default(0).notNull(),
  atomsReinforced: integer("atoms_reinforced").default(0).notNull(),
  linksCreated: integer("links_created").default(0).notNull(),
  insightsCreated: integer("insights_created").default(0).notNull(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

// --- TRENDS ---
//
// The daily AI news/trends digest (Trends nav tab). Populated entirely by
// an external process — scripts/fetch-trends.mjs, run once a day by
// .github/workflows/fetch-trends.yml — not by any in-app action, which is
// why there's no "use server" actions file alongside this like every other
// feature: the app only ever reads these two tables.
//
// One trend_digests row per calendar day (an AI-written overview of that
// day), with many trend_items rows under it (one per news article/paper/
// repo pulled that day). A trend_item's url is globally unique so the
// daily fetch can safely re-pull a feed's last N days and rely on ON
// CONFLICT DO NOTHING to skip anything already stored, rather than tracking
// per-feed cursors.
export const trendCategoryEnum = pgEnum("trend_category", ["news", "paper", "repo"]);

export const trendDigests = pgTable("trend_digests", {
  id: serial("id").primaryKey(),
  // "YYYY-MM-DD" (UTC) — a string key rather than a `date` column so it
  // matches the same plain-string day-key the rest of the app already uses
  // (e.g. diarySlugBase in app/diary/actions.ts), with no timezone parsing
  // ambiguity at read time.
  date: varchar("date", { length: 10 }).notNull().unique(),
  // AI-written "here's what mattered today" overview across every item
  // pulled that day. Empty until the fetch script's summarization step
  // finishes — a partial day (items saved, overview not yet written) still
  // renders, just without the top summary.
  summaryMarkdown: text("summary_markdown").default("").notNull(),
  // The three enrichment fields beyond a plain overview: `insight` is one
  // non-obvious takeaway/pattern across the day's items (not just a
  // restatement), `actionItems` are concrete things worth doing this week,
  // `watchList` is what's worth keeping an eye on but isn't actionable yet.
  // All written in the same generateObject call as the overview (see
  // writeDailyOverview in fetch-trends.ts) — one AI round-trip, not four.
  insight: text("insight").default("").notNull(),
  actionItems: jsonb("action_items").$type<string[]>().default([]).notNull(),
  watchList: jsonb("watch_list").$type<string[]>().default([]).notNull(),
  // Chinese renditions of the four fields above — same "AI writes both
  // languages in one call" approach as trendItems.summaryZh below, so
  // /trends?lang=zh has real translated content instead of falling back to
  // English prose inside an otherwise-Chinese UI.
  summaryMarkdownZh: text("summary_markdown_zh").default("").notNull(),
  insightZh: text("insight_zh").default("").notNull(),
  actionItemsZh: jsonb("action_items_zh").$type<string[]>().default([]).notNull(),
  watchListZh: jsonb("watch_list_zh").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const trendItems = pgTable("trend_items", {
  id: serial("id").primaryKey(),
  digestId: integer("digest_id")
    .notNull()
    .references(() => trendDigests.id, { onDelete: "cascade" }),
  category: trendCategoryEnum("category").notNull(),
  // Human-readable feed name (e.g. "MIT Technology Review", "arXiv cs.CL",
  // "GitHub Trending") rather than an enum — new sources are just a new
  // string in fetch-trends.mjs, no migration needed.
  source: varchar("source", { length: 120 }).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull().unique(),
  // Short AI-written one-liner — what/why this is worth a look. Empty if
  // the summarization pass failed for this item; the raw title/link still
  // renders either way (see runIngestionDirect-era "AI failure is never
  // fatal" precedent elsewhere in this codebase).
  summary: text("summary").default("").notNull(),
  // Chinese rendition of `summary` — the item's own title/source/url are
  // NOT translated (a headline is the actual source's real title, not our
  // content to rewrite; the URL obviously can't be), only the AI-written
  // summary is, generated in the same call as `summary` itself.
  summaryZh: text("summary_zh").default("").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TrendCategory = (typeof trendCategoryEnum.enumValues)[number];

// --- GITHUB TRENDING ---
//
// A snapshot of the REAL github.com/trending page (repositories AND
// developers), not an approximation — an earlier version of this feature
// tried to fake "trending" via the Search API (recently-created repos
// ranked by stars), which can't represent developer trending at all since
// there's no API for that. This scrapes the actual page instead — see
// scripts/fetch-github-trending.ts for the parser and its fragility caveats
// (GitHub's markup isn't a stable contract; the script degrades to "0
// parsed" rather than throwing if the page structure changes, and logs a
// warning so that's diagnosable from Action run logs rather than silently
// going stale).
//
// Three independent cadences (daily/weekly/monthly), matching GitHub's own
// ?since= options on the trending page. Each run captures BOTH the repo
// list and the developer list for its cadence in one pass — see the three
// .github/workflows/fetch-github-trending-*.yml files.
export const trendingCadenceEnum = pgEnum("trending_cadence", [
  "daily",
  "weekly",
  "monthly",
]);

export type TrendingCadence = (typeof trendingCadenceEnum.enumValues)[number];

export const githubTrendingRuns = pgTable(
  "github_trending_runs",
  {
    id: serial("id").primaryKey(),
    cadence: trendingCadenceEnum("cadence").notNull(),
    // "YYYY-MM-DD" (UTC) the run happened — same plain-string day-key
    // convention as trend_digests.date. Unique per cadence so a re-run on
    // the same day (e.g. a manual workflow_dispatch) updates in place
    // rather than piling up duplicate runs; see getOrCreateRun() in the
    // fetch script, which deletes and re-inserts that run's rows.
    date: varchar("date", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.cadence, t.date)],
);

export const githubTrendingRepos = pgTable(
  "github_trending_repos",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => githubTrendingRuns.id, { onDelete: "cascade" }),
    // Position on GitHub's own trending page (1-based) — preserved rather
    // than re-derived from stars, since the page's ordering isn't purely
    // stars-in-period (ties, etc.) and "same order GitHub showed" is the
    // point of scraping the real page instead of the Search API.
    rank: integer("rank").notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    description: text("description").default("").notNull(),
    // Batch-translated (one AI call per run covers every repo's
    // description at once — see translateDescriptions in
    // fetch-github-trending.ts) rather than per-repo, since these are short
    // and don't need the per-item quality gate trend_items' summaries get.
    // fullName/url/language/stars/forks are never translated — they're
    // identifiers and data, not prose.
    descriptionZh: text("description_zh").default("").notNull(),
    language: varchar("language", { length: 100 }),
    stars: integer("stars").default(0).notNull(),
    forks: integer("forks").default(0).notNull(),
    // Stars gained within the run's own cadence window (GitHub's "N stars
    // today" / "this week" / "this month" line) — the actual trending
    // signal, as opposed to `stars`' all-time total.
    starsInPeriod: integer("stars_in_period").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("github_trending_repos_run_idx").on(t.runId),
    unique().on(t.runId, t.url),
  ],
);

export const githubTrendingDevelopers = pgTable(
  "github_trending_developers",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => githubTrendingRuns.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    username: varchar("username", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).default("").notNull(),
    profileUrl: text("profile_url").notNull(),
    avatarUrl: text("avatar_url").default("").notNull(),
    // The "popular repo" GitHub credits each trending developer with —
    // absent for some entries (org accounts, or GitHub not attributing one
    // that day), hence nullable rather than empty-string like the text
    // fields above.
    popularRepoName: varchar("popular_repo_name", { length: 255 }),
    popularRepoUrl: text("popular_repo_url"),
    popularRepoDescription: text("popular_repo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("github_trending_developers_run_idx").on(t.runId),
    unique().on(t.runId, t.username),
  ],
);
