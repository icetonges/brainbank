"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, noteContent, tags, noteTags, media, ingestionJobs } from "@/lib/db/schema";
import type { MediaKind, MediaProvider, NoteStatus } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { translateNote, summarizeNote, suggestTags } from "@/lib/ai/tasks";
import { dispatchIngestionJob } from "@/lib/background-jobs";
import type { ModelId } from "@/lib/ai/models";
import { linkWikilinksFromText } from "@/lib/notes/link-wikilinks";

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

async function loadNoteWithContent(noteId: number, language: "en" | "zh") {
  return db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, language)),
  });
}

/** Translate a note into the given target language and store it as a new
 * note_content row (or overwrite the existing one for that language). */
export async function translateNoteAction(
  noteId: number,
  slug: string,
  target: "en" | "zh",
  modelId?: ModelId,
) {
  await requireOwner();

  const source = target === "zh" ? "en" : "zh";
  const sourceContent = await loadNoteWithContent(noteId, source);
  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!sourceContent || !note) throw new Error("Nothing to translate yet");

  const translated = await translateNote(
    {
      title: note.title,
      what: sourceContent.what ?? "",
      how: sourceContent.how ?? "",
      why: sourceContent.why ?? "",
      other: sourceContent.other ?? "",
    },
    target,
    modelId,
  );

  const existing = await loadNoteWithContent(noteId, target);
  if (existing) {
    await db
      .update(noteContent)
      .set({
        what: translated.what,
        how: translated.how,
        why: translated.why,
        other: translated.other,
      })
      .where(eq(noteContent.id, existing.id));
  } else {
    await db.insert(noteContent).values({
      noteId,
      language: target,
      what: translated.what,
      how: translated.how,
      why: translated.why,
      other: translated.other,
    });
  }

  revalidatePath(`/notes/${slug}`);
}

export async function summarizeNoteAction(
  noteId: number,
  slug: string,
  language: "en" | "zh",
  modelId?: ModelId,
) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  const content = await loadNoteWithContent(noteId, language);
  if (!note || !content) throw new Error("Nothing to summarize yet");

  const summary = await summarizeNote(
    { title: note.title, what: content.what, how: content.how, why: content.why, other: content.other },
    modelId,
  );

  await db.update(noteContent).set({ summary }).where(eq(noteContent.id, content.id));
  revalidatePath(`/notes/${slug}`);
}

export async function suggestTagsAction(
  noteId: number,
  slug: string,
  language: "en" | "zh",
  modelId?: ModelId,
) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  const content = await loadNoteWithContent(noteId, language);
  if (!note || !content) throw new Error("Nothing to tag yet");

  const { tags: suggested } = await suggestTags(
    { title: note.title, what: content.what, how: content.how, why: content.why, other: content.other },
    modelId,
  );

  for (const name of suggested) {
    const normalized = name.trim().toLowerCase();
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

  revalidatePath(`/notes/${slug}`);
}

export async function attachMediaAction(
  noteId: number,
  slug: string,
  input: {
    kind: MediaKind;
    provider: MediaProvider;
    url: string;
    sizeBytes: number;
    mimeType: string;
  },
) {
  await requireOwner();

  await db.insert(media).values({
    noteId,
    kind: input.kind,
    provider: input.provider,
    url: input.url,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
  });

  revalidatePath(`/notes/${slug}`);
}

export async function deleteMediaAction(mediaId: number, slug: string) {
  await requireOwner();
  await db.delete(media).where(eq(media.id, mediaId));
  revalidatePath(`/notes/${slug}`);
}

export async function retryIngestionAction(noteId: number, slug: string) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Note not found");

  let mediaUrl: string | undefined;
  let filename: string | undefined;

  if (!note.sourceUrl && note.sourceType !== "manual") {
    const mediaRow = await db.query.media.findFirst({ where: eq(media.noteId, noteId) });
    if (mediaRow) {
      mediaUrl = mediaRow.url;
      filename = mediaRow.url.split("/").pop();
    }
  }

  await db.insert(ingestionJobs).values({ noteId, status: "queued", stage: "queued" });

  dispatchIngestionJob({
    noteId,
    sourceType: note.sourceType,
    sourceUrl: note.sourceUrl ?? undefined,
    mediaUrl,
    filename,
  });

  revalidatePath(`/notes/${slug}`);
}

/** Edits a note's title and its current-language what/how/why/other fields.
 * The slug is intentionally left unchanged so existing links (including
 * [[wikilinks]] from other notes) keep working even after a rename;
 * re-scans the edited text for new [[wikilinks]] afterward. */
export async function updateNoteAction(
  noteId: number,
  slug: string,
  language: "en" | "zh",
  formData: FormData,
) {
  await requireOwner();

  const title = String(formData.get("title") ?? "").trim();
  const what = String(formData.get("what") ?? "").trim();
  const how = String(formData.get("how") ?? "").trim();
  const why = String(formData.get("why") ?? "").trim();
  const other = String(formData.get("other") ?? "").trim();

  if (!title) throw new Error("Title is required");

  await db
    .update(notes)
    .set({ title, updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  const existing = await loadNoteWithContent(noteId, language);
  if (existing) {
    await db
      .update(noteContent)
      .set({ what, how, why, other })
      .where(eq(noteContent.id, existing.id));
  } else {
    await db.insert(noteContent).values({ noteId, language, what, how, why, other });
  }

  await linkWikilinksFromText(noteId, what, how, why, other);

  revalidatePath(`/notes/${slug}`);
  redirect(`/notes/${slug}?lang=${language}`);
}

const CYCLE_STATUS: Record<NoteStatus, NoteStatus> = {
  draft: "published",
  published: "private",
  private: "draft",
};

/** Cycles a note's status draft -> published -> private -> draft, or sets
 * an explicit target status if one is passed (used by the three buttons on
 * the note page, which each pass their own target). */
export async function updateNoteStatusAction(
  noteId: number,
  slug: string,
  target?: NoteStatus,
) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Note not found");

  const nextStatus = target ?? CYCLE_STATUS[note.status];

  await db
    .update(notes)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  revalidatePath(`/notes/${slug}`);
  revalidatePath("/");
}

export async function deleteNoteAction(noteId: number) {
  await requireOwner();
  // All related rows (note_content, note_tags, media, edges,
  // ingestion_jobs) cascade-delete via FK constraints — see schema.ts.
  await db.delete(notes).where(eq(notes.id, noteId));
  revalidatePath("/");
  redirect("/");
}
