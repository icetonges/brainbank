"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, noteContent, tags, noteTags, media } from "@/lib/db/schema";
import type { MediaKind, MediaProvider } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { translateNote, summarizeNote, suggestTags } from "@/lib/ai/tasks";
import type { ModelId } from "@/lib/ai/models";

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
