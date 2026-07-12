import { db } from "@/lib/db";
import { notes, noteContent, tags, noteTags, obsidianSyncRuns } from "@/lib/db/schema";
import type { NoteStatus } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import { linkWikilinksFromText } from "@/lib/notes/link-wikilinks";
import { linkRelatedByTags } from "@/lib/notes/link-related";
import { parseFrontmatter } from "./frontmatter";
import { splitSections } from "./sections";
import { draftNoteFromSource } from "@/lib/ai/tasks";
import type { VaultFile } from "./github";

const VALID_STATUSES: NoteStatus[] = ["draft", "published", "private"];
const VALID_LANGUAGES = ["en", "zh"] as const;

async function uniqueSlug(baseSlug: string, excludeNoteId?: number): Promise<string> {
  let slug = baseSlug || "untitled";
  let suffix = 1;
  for (;;) {
    const existing = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (!existing || existing.id === excludeNoteId) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

function titleFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim() || "Untitled";
}

/**
 * Imports one vault file into the DB: parses its frontmatter, uses the
 * body directly if it already has What/How/Why/Other headers (code-first —
 * PLAN.md §13), otherwise runs it through the same AI drafting step as any
 * other ingestion source. Upserts by source_path so re-syncing an unchanged
 * file is a no-op the next time (caller only invokes this for files whose
 * sha actually changed).
 */
export async function upsertNoteFromVaultFile(file: VaultFile, rawContent: string): Promise<void> {
  const { data, body } = parseFrontmatter(rawContent);

  const title = (typeof data.title === "string" && data.title.trim()) || titleFromPath(file.path);

  const status: NoteStatus =
    typeof data.status === "string" && VALID_STATUSES.includes(data.status as NoteStatus)
      ? (data.status as NoteStatus)
      : "published";

  const language: "en" | "zh" =
    typeof data.language === "string" && (VALID_LANGUAGES as readonly string[]).includes(data.language)
      ? (data.language as "en" | "zh")
      : "en";

  const frontmatterTags = Array.isArray(data.tags) ? data.tags : [];

  const sections = splitSections(body);
  let what: string, how: string, why: string, other: string, summary: string;
  let draftedTags: string[] = [];

  if (sections) {
    what = sections.what ?? "";
    how = sections.how ?? "";
    why = sections.why ?? "";
    other = sections.other ?? "";
    summary = "";
  } else {
    const draft = await draftNoteFromSource({ sourceTitle: title, sourceText: body });
    what = draft.what;
    how = draft.how;
    why = draft.why;
    other = draft.other;
    summary = draft.summary;
    draftedTags = draft.tags;
  }

  const existing = await db.query.notes.findFirst({ where: eq(notes.sourcePath, file.path) });

  let noteId: number;
  if (existing) {
    noteId = existing.id;
    await db
      .update(notes)
      .set({ title, status, sourceSha: file.sha, updatedAt: new Date() })
      .where(eq(notes.id, noteId));
  } else {
    const slug = await uniqueSlug(slugify(title));
    const [created] = await db
      .insert(notes)
      .values({
        slug,
        title,
        status,
        sourceType: "obsidian",
        sourcePath: file.path,
        sourceSha: file.sha,
        primaryLanguage: language,
      })
      .returning();
    noteId = created.id;
  }

  const existingContent = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, language)),
  });
  if (existingContent) {
    await db
      .update(noteContent)
      .set({ what, how, why, other, summary, bodyMarkdown: body })
      .where(eq(noteContent.id, existingContent.id));
  } else {
    await db.insert(noteContent).values({
      noteId,
      language,
      what,
      how,
      why,
      other,
      summary,
      bodyMarkdown: body,
    });
  }

  for (const rawTag of [...frontmatterTags, ...draftedTags]) {
    const normalized = rawTag.trim().toLowerCase();
    if (!normalized) continue;

    let tag = await db.query.tags.findFirst({ where: eq(tags.name, normalized) });
    if (!tag) {
      [tag] = await db.insert(tags).values({ name: normalized }).returning();
    }

    const existingLink = await db.query.noteTags.findFirst({
      where: and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tag.id)),
    });
    if (!existingLink) {
      await db.insert(noteTags).values({ noteId, tagId: tag.id });
    }
  }

  await linkWikilinksFromText(noteId, what, how, why, other);
  await linkRelatedByTags(noteId);
}

// --- sync run tracking (one row per vault-wide sync pass) ---

export async function createSyncRun(): Promise<number> {
  const [run] = await db.insert(obsidianSyncRuns).values({ status: "queued" }).returning();
  return run.id;
}

export async function markSyncRunning(runId: number, filesTotal: number, filesScanned?: number) {
  await db
    .update(obsidianSyncRuns)
    .set({ status: "running", filesTotal, filesScanned: filesScanned ?? null, startedAt: new Date() })
    .where(eq(obsidianSyncRuns.id, runId));
}

export async function markSyncProgress(runId: number, processed: number, failed: number) {
  await db
    .update(obsidianSyncRuns)
    .set({ filesProcessed: processed, filesFailed: failed })
    .where(eq(obsidianSyncRuns.id, runId));
}

export async function markSyncSucceeded(runId: number) {
  await db
    .update(obsidianSyncRuns)
    .set({ status: "succeeded", finishedAt: new Date() })
    .where(eq(obsidianSyncRuns.id, runId));
}

export async function markSyncFailed(runId: number, error: string) {
  await db
    .update(obsidianSyncRuns)
    .set({ status: "failed", error: error.slice(0, 2000), finishedAt: new Date() })
    .where(eq(obsidianSyncRuns.id, runId));
}
