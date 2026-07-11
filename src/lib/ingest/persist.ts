import { db } from "@/lib/db";
import { notes, noteContent, tags, noteTags, ingestionJobs, media } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import { linkWikilinksFromText } from "@/lib/notes/link-wikilinks";
import type { DraftedNote } from "@/lib/ai/tasks";

export async function markJobRunning(noteId: number, stage: string) {
  await db
    .update(ingestionJobs)
    .set({ status: "running", stage, startedAt: new Date() })
    .where(eq(ingestionJobs.noteId, noteId));
}

export async function markJobStage(noteId: number, stage: string) {
  await db.update(ingestionJobs).set({ stage }).where(eq(ingestionJobs.noteId, noteId));
}

export async function markJobSucceeded(noteId: number) {
  await db
    .update(ingestionJobs)
    .set({ status: "succeeded", stage: "done", finishedAt: new Date() })
    .where(eq(ingestionJobs.noteId, noteId));
}

export async function markJobFailed(noteId: number, error: string) {
  await db
    .update(ingestionJobs)
    .set({ status: "failed", error: error.slice(0, 2000), finishedAt: new Date() })
    .where(eq(ingestionJobs.noteId, noteId));
}

async function uniqueSlug(baseSlug: string, excludeNoteId: number): Promise<string> {
  let slug = baseSlug || "untitled";
  let suffix = 1;
  for (;;) {
    const existing = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (!existing || existing.id === excludeNoteId) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

/**
 * Writes a drafted note (from draftNoteFromSource) into the DB: renames the
 * note from its placeholder title/slug to the AI-drafted one, fills in
 * what/how/why/other/summary, creates any new tags, and derives graph
 * edges from [[wikilinks]] the draft happened to use. Returns the final
 * slug (it may differ from the placeholder one passed in at creation).
 */
export async function saveDraftedNote(noteId: number, draft: DraftedNote, imageUrl?: string): Promise<string> {
  const newSlug = await uniqueSlug(slugify(draft.title), noteId);

  await db
    .update(notes)
    .set({ title: draft.title, slug: newSlug, status: "published", updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  const existingContent = await db.query.noteContent.findFirst({
    where: eq(noteContent.noteId, noteId),
  });

  if (existingContent) {
    await db
      .update(noteContent)
      .set({
        what: draft.what,
        how: draft.how,
        why: draft.why,
        other: draft.other,
        summary: draft.summary,
      })
      .where(eq(noteContent.id, existingContent.id));
  } else {
    await db.insert(noteContent).values({
      noteId,
      language: "en",
      what: draft.what,
      how: draft.how,
      why: draft.why,
      other: draft.other,
      summary: draft.summary,
    });
  }

  for (const rawTag of draft.tags) {
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

  await linkWikilinksFromText(noteId, draft.what, draft.how, draft.why, draft.other);

  if (imageUrl) {
    const existingImage = await db.query.media.findFirst({
      where: and(eq(media.noteId, noteId), eq(media.url, imageUrl)),
    });
    if (!existingImage) {
      await db.insert(media).values({
        noteId,
        kind: "image",
        provider: "cloudinary",
        url: imageUrl,
      });
    }
  }

  return newSlug;
}

/**
 * Code-only counterpart to saveDraftedNote for image/video uploads (PLAN.md
 * §5, §13): there's no text to draft a What/How/Why/Other page from, so
 * this skips the AI step entirely — renames the note from its placeholder
 * title/slug to one derived from the filename, publishes it, and attaches
 * the uploaded file as its media. The owner (or AI Assist afterward) fills
 * in What/How/Why by hand.
 */
export async function saveMediaOnlyNote(
  noteId: number,
  title: string,
  mediaUrl: string,
  kind: "image" | "video",
  provider: "cloudinary" | "r2",
): Promise<string> {
  const newSlug = await uniqueSlug(slugify(title), noteId);

  await db
    .update(notes)
    .set({ title, slug: newSlug, status: "published", updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  const existingMedia = await db.query.media.findFirst({
    where: and(eq(media.noteId, noteId), eq(media.url, mediaUrl)),
  });
  if (!existingMedia) {
    await db.insert(media).values({ noteId, kind, provider, url: mediaUrl });
  }

  return newSlug;
}
