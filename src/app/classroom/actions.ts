"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  noteTags,
  tags,
  learningGuides,
} from "@/lib/db/schema";
import type { ClassroomCategory } from "@/lib/db/schema";
import { isClassroomCategory } from "@/lib/classroom";
import { slugify } from "@/lib/slug";
import { publishAssist, type PublishAssistResult } from "@/lib/ai/tasks";
import { detectPrimaryLanguage } from "@/lib/intake";
import { linkWikilinksFromText } from "@/lib/notes/link-wikilinks";
import { linkRelatedByTags } from "@/lib/notes/link-related";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

async function uniqueSlug(base: string, keepNoteId?: number): Promise<string> {
  let slug = base || "untitled";
  let suffix = 1;
  for (;;) {
    const existing = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (!existing || existing.id === keepNoteId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

/** Attach the AI-suggested tags to a note (creating tag rows as needed). */
async function applyTags(noteId: number, suggested: string[]) {
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
  await linkRelatedByTags(noteId);
}

/** Insert-or-update the AI publish assist's learning guide for a note. */
async function saveGuide(noteId: number, assist: PublishAssistResult) {
  const existing = await db.query.learningGuides.findFirst({
    where: eq(learningGuides.noteId, noteId),
  });
  const values = {
    learningMap: assist.learningMap,
    handsOn: assist.handsOn,
    resources: assist.resources,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(learningGuides).set(values).where(eq(learningGuides.id, existing.id));
  } else {
    await db.insert(learningGuides).values({ noteId, ...values });
  }
}

/**
 * Called by the composer before its first image upload — the signed-upload
 * flow needs a noteId to attach media to, so an empty classroom draft is
 * created lazily the moment the user adds an image (see
 * classroom-composer.tsx). publishClassroomArticle() then fills it in.
 */
export async function createClassroomDraft(): Promise<{ noteId: number; slug: string }> {
  await requireOwner();

  const slug = await uniqueSlug(`classroom-draft-${Date.now()}`);
  const [note] = await db
    .insert(notes)
    .values({
      slug,
      title: "Untitled classroom draft",
      status: "draft",
      sourceType: "manual",
      category: "ai",
      primaryLanguage: "en",
    })
    .returning();

  await db.insert(noteContent).values({ noteId: note.id, language: "en" });
  return { noteId: note.id, slug: note.slug };
}

/**
 * The composer's Save button. Creates (or fills in) the knowledge page,
 * then runs the AI publish assist to generate the topic (if none was
 * typed), the subtab category, tags, summary, learning map, hands-on
 * steps, and top-3 resources. AI failure degrades gracefully: the article
 * is still published and the guide can be regenerated from its page.
 */
export async function publishClassroomArticle(formData: FormData) {
  await requireOwner();

  const draftNoteId = Number(formData.get("noteId") || 0) || undefined;
  const topic = String(formData.get("topic") ?? "").trim();
  const rawCategory = String(formData.get("category") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (body.length < 10) throw new Error("Write at least a few words first");
  if (body.length > 100_000) throw new Error("Content is limited to 100,000 characters");

  const category: ClassroomCategory | undefined = isClassroomCategory(rawCategory)
    ? rawCategory
    : undefined;

  // AI publish assist — one call for everything the article page needs.
  let assist: PublishAssistResult | null = null;
  try {
    assist = await publishAssist({ topic, category, content: body });
  } catch (err) {
    console.error("publishAssist failed, publishing without a guide:", err);
  }

  const finalTopic =
    (assist?.topic || topic || body.split(/\r?\n/).find(Boolean)?.slice(0, 80) || "Untitled").slice(0, 500);
  const finalCategory: ClassroomCategory = assist?.category ?? category ?? "ai";
  const primaryLanguage = detectPrimaryLanguage([finalTopic, body].join("\n"));

  const slug = await uniqueSlug(slugify(finalTopic), draftNoteId);

  let noteId: number;
  if (draftNoteId) {
    // Draft was created early for image uploads — fill it in.
    await db
      .update(notes)
      .set({
        slug,
        title: finalTopic,
        status: "published",
        category: finalCategory,
        primaryLanguage,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, draftNoteId));
    noteId = draftNoteId;

    const content = await db.query.noteContent.findFirst({
      where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, "en")),
    });
    if (content) {
      await db
        .update(noteContent)
        .set({ bodyMarkdown: body, summary: assist?.summary ?? "" })
        .where(eq(noteContent.id, content.id));
    } else {
      await db.insert(noteContent).values({
        noteId,
        language: "en",
        bodyMarkdown: body,
        summary: assist?.summary ?? "",
      });
    }
  } else {
    const [note] = await db
      .insert(notes)
      .values({
        slug,
        title: finalTopic,
        status: "published",
        sourceType: "manual",
        category: finalCategory,
        primaryLanguage,
      })
      .returning();
    noteId = note.id;

    await db.insert(noteContent).values({
      noteId,
      language: "en",
      bodyMarkdown: body,
      summary: assist?.summary ?? "",
    });
  }

  if (assist) {
    await saveGuide(noteId, assist);
    await applyTags(noteId, [...assist.tags, finalCategory]);
  }

  // [[Wikilinks]] in the body become graph edges, same as regular notes.
  await linkWikilinksFromText(noteId, body);

  revalidatePath("/classroom");
  redirect(`/classroom/${slug}`);
}

/** Re-run the AI publish assist for an existing article (e.g. after the
 * first attempt failed, or after a big edit). Keeps the user's topic. */
export async function regenerateGuideAction(noteId: number, slug: string) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, "en")),
  });
  if (!note || !content?.bodyMarkdown) throw new Error("Nothing to build a guide from");

  const assist = await publishAssist({
    topic: note.title,
    category: note.category ?? undefined,
    content: content.bodyMarkdown,
  });

  await saveGuide(noteId, assist);
  await applyTags(noteId, assist.tags);
  await db
    .update(noteContent)
    .set({ summary: assist.summary })
    .where(eq(noteContent.id, content.id));
  if (!note.category) {
    await db.update(notes).set({ category: assist.category }).where(eq(notes.id, noteId));
  }

  revalidatePath(`/classroom/${slug}`);
}

/** The edit page's Save button — updates topic, category, and body; slug is
 * kept stable so existing links keep working. Optionally re-runs the AI
 * publish assist over the new content. */
export async function updateClassroomArticle(
  noteId: number,
  slug: string,
  formData: FormData,
) {
  await requireOwner();

  const topic = String(formData.get("topic") ?? "").trim();
  const rawCategory = String(formData.get("category") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const regenerate = formData.get("regenerate") === "on";

  if (!topic) throw new Error("Topic is required");
  if (!isClassroomCategory(rawCategory)) throw new Error("Pick a category");

  await db
    .update(notes)
    .set({ title: topic.slice(0, 500), category: rawCategory, updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, "en")),
  });
  if (content) {
    await db.update(noteContent).set({ bodyMarkdown: body }).where(eq(noteContent.id, content.id));
  } else {
    await db.insert(noteContent).values({ noteId, language: "en", bodyMarkdown: body });
  }

  await linkWikilinksFromText(noteId, body);

  if (regenerate) {
    try {
      const assist = await publishAssist({ topic, category: rawCategory, content: body });
      await saveGuide(noteId, assist);
      await applyTags(noteId, assist.tags);
      if (content) {
        await db
          .update(noteContent)
          .set({ summary: assist.summary })
          .where(eq(noteContent.id, content.id));
      }
    } catch (err) {
      console.error("publishAssist regenerate failed:", err);
    }
  }

  revalidatePath(`/classroom/${slug}`);
  revalidatePath("/classroom");
  redirect(`/classroom/${slug}`);
}

export async function deleteClassroomArticle(noteId: number) {
  await requireOwner();
  // note_content, note_tags, media, edges, and learning_guides all
  // cascade-delete via FK constraints — see schema.ts.
  await db.delete(notes).where(eq(notes.id, noteId));
  revalidatePath("/classroom");
  redirect("/classroom");
}
