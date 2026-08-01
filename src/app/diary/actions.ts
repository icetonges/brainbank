"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  diaryEntries,
  tags,
  noteTags,
} from "@/lib/db/schema";
import type { DiaryMood } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { diaryTitleAndTags } from "@/lib/ai/tasks";
import { LIFE_AREA_SLUGS } from "@/lib/knowledge/taxonomy";
import { dispatchDistillJob } from "@/lib/background-jobs";
import { linkWikilinksFromText } from "@/lib/notes/link-wikilinks";
import { slugify } from "@/lib/slug";

// Diary entries are `notes` rows with source_type "diary" and status
// ALWAYS "private" — see the sourceTypeEnum comment in schema.ts for why
// they share the notes table, and note that unlike classroom articles
// there is deliberately no public/private toggle here. A diary is private
// by definition; making that a per-entry setting would only create a way
// to publish one by accident.
//
// A maxDuration export can't live in a "use server" file (see the long
// comment in classroom/actions.ts) — the pages that invoke these actions
// export it themselves, and vercel.json covers src/app/diary/** too.

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

async function uniqueSlug(base: string, keepNoteId?: number): Promise<string> {
  let slug = base || "entry";
  let suffix = 1;
  for (;;) {
    const existing = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (!existing || existing.id === keepNoteId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

/** Diary slugs lead with the date so the URL is chronologically sortable
 *  and stays meaningful even if the title is later regenerated. */
function diarySlugBase(occurredAt: Date, title: string): string {
  const date = occurredAt.toISOString().slice(0, 10);
  const titlePart = slugify(title);
  return titlePart && titlePart !== "note" ? `${date}-${titlePart}` : date;
}

async function applyTags(noteId: number, names: string[]) {
  for (const raw of names) {
    const name = raw.trim().toLowerCase().slice(0, 60);
    if (!name) continue;
    let tag = await db.query.tags.findFirst({ where: eq(tags.name, name) });
    if (!tag) [tag] = await db.insert(tags).values({ name }).returning();
    const linked = await db.query.noteTags.findFirst({
      where: and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tag.id)),
    });
    if (!linked) await db.insert(noteTags).values({ noteId, tagId: tag.id });
  }
}

async function replaceTags(noteId: number, names: string[]) {
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId));
  await applyTags(noteId, names);
}

/**
 * Called by the composer before its first image upload — the signed-upload
 * flow needs a noteId to attach media to, so an empty private draft is
 * created lazily on first paste/drop. Mirrors createClassroomDraft.
 */
export async function createDiaryDraft(): Promise<{ noteId: number; slug: string }> {
  await requireOwner();

  const slug = await uniqueSlug(`diary-draft-${Date.now()}`);
  const [note] = await db
    .insert(notes)
    .values({
      slug,
      title: "Untitled entry",
      status: "private",
      sourceType: "diary",
      primaryLanguage: "en",
    })
    .returning();

  await db.insert(noteContent).values({ noteId: note.id, language: "en" });
  await db.insert(diaryEntries).values({ noteId: note.id });

  return { noteId: note.id, slug: note.slug };
}

function parseOccurredAt(raw: string): Date {
  // <input type="datetime-local"> submits "YYYY-MM-DDTHH:mm" with no zone;
  // new Date() reads that as local time, which is what the writer means.
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseMood(raw: string): DiaryMood | null {
  const allowed: DiaryMood[] = ["great", "good", "neutral", "low", "rough"];
  return allowed.includes(raw as DiaryMood) ? (raw as DiaryMood) : null;
}

/**
 * The composer's Save. Writes the entry immediately, then (a) names/tags it
 * with a fast local model when the user didn't supply a title, and (b) fires
 * the distillation job in the background.
 *
 * AI failure is never fatal here: an entry that can't be auto-titled keeps
 * a date-based fallback title and can be renamed by hand or re-run later.
 * Losing a written diary entry because a model was unreachable would be
 * unforgivable, so every AI step is wrapped and degrades.
 */
export async function saveDiaryEntry(formData: FormData) {
  await requireOwner();

  const draftNoteId = Number(formData.get("noteId") || 0) || undefined;
  const manualTitle = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const scratch = String(formData.get("scratch") ?? "").trim();
  const rawLanguage = String(formData.get("language") ?? "en").trim();
  const occurredAt = parseOccurredAt(String(formData.get("occurredAt") ?? ""));
  const mood = parseMood(String(formData.get("mood") ?? ""));
  const energyRaw = Number(formData.get("energy") ?? 0);
  const energy = Number.isInteger(energyRaw) && energyRaw >= 1 && energyRaw <= 5 ? energyRaw : null;
  const manualTags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (body.length < 1 && scratch.length < 1) {
    throw new Error("Write something first");
  }
  if (body.length > 100_000) throw new Error("Entry is limited to 100,000 characters");
  const primaryLanguage: "en" | "zh" = rawLanguage === "zh" ? "zh" : "en";

  // Auto title/tags only when the user didn't name it themselves — a typed
  // title is authoritative and must never be overwritten by a model.
  let title = manualTitle;
  const titleSource: "auto" | "manual" = manualTitle ? "manual" : "auto";
  let aiTags: string[] = [];
  let aiMood: DiaryMood | null = null;

  if (!manualTitle || manualTags.length === 0) {
    try {
      const result = await diaryTitleAndTags(
        { body, scratch, occurredAt },
        LIFE_AREA_SLUGS,
      );
      if (!manualTitle) title = result.title;
      aiTags = result.tags;
      aiMood = result.mood as DiaryMood;
    } catch (err) {
      console.error("[diary] auto title/tag failed, saving without it:", err);
    }
  }

  if (!title) {
    // Last-resort title so an entry is never nameless — the date plus the
    // opening words, which is still recognizable in a list.
    const firstLine = (body || scratch).split(/\r?\n/).find(Boolean) ?? "";
    title = firstLine.slice(0, 70) || occurredAt.toISOString().slice(0, 10);
  }

  const finalTags = manualTags.length > 0 ? manualTags : aiTags;
  const finalMood = mood ?? aiMood;
  const slug = await uniqueSlug(diarySlugBase(occurredAt, title), draftNoteId);

  let noteId: number;

  if (draftNoteId) {
    await db
      .update(notes)
      .set({ slug, title: title.slice(0, 500), primaryLanguage, updatedAt: new Date() })
      .where(eq(notes.id, draftNoteId));
    noteId = draftNoteId;

    const existing = await db.query.noteContent.findFirst({
      where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, primaryLanguage)),
    });
    if (existing) {
      await db
        .update(noteContent)
        .set({ bodyMarkdown: body })
        .where(eq(noteContent.id, existing.id));
    } else {
      await db
        .insert(noteContent)
        .values({ noteId, language: primaryLanguage, bodyMarkdown: body });
    }

    await db
      .update(diaryEntries)
      .set({ occurredAt, titleSource, mood: finalMood, energy, scratch, distilledAt: null })
      .where(eq(diaryEntries.noteId, noteId));
  } else {
    const [note] = await db
      .insert(notes)
      .values({
        slug,
        title: title.slice(0, 500),
        status: "private",
        sourceType: "diary",
        primaryLanguage,
      })
      .returning();
    noteId = note.id;

    await db
      .insert(noteContent)
      .values({ noteId, language: primaryLanguage, bodyMarkdown: body });
    await db
      .insert(diaryEntries)
      .values({ noteId, occurredAt, titleSource, mood: finalMood, energy, scratch });
  }

  await applyTags(noteId, finalTags);
  // [[Wikilinks]] work in diary entries too — that's what lets an entry
  // point at a classroom article and show up in the same graph.
  await linkWikilinksFromText(noteId, body, scratch);

  // Knowledge extraction runs in the background so the save returns now.
  dispatchDistillJob({ noteId });

  revalidatePath("/diary");
  redirect(`/diary/${slug}`);
}

/** The edit page's Save. Re-queues distillation since the text changed. */
export async function updateDiaryEntry(noteId: number, slug: string, formData: FormData) {
  await requireOwner();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const scratch = String(formData.get("scratch") ?? "").trim();
  const occurredAt = parseOccurredAt(String(formData.get("occurredAt") ?? ""));
  const mood = parseMood(String(formData.get("mood") ?? ""));
  const energyRaw = Number(formData.get("energy") ?? 0);
  const energy = Number.isInteger(energyRaw) && energyRaw >= 1 && energyRaw <= 5 ? energyRaw : null;
  const tagList = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const redistill = formData.get("redistill") === "on";

  if (!title) throw new Error("Title is required");

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Entry not found");

  await db
    .update(notes)
    .set({ title: title.slice(0, 500), updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  const existing = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, note.primaryLanguage)),
  });
  if (existing) {
    await db
      .update(noteContent)
      .set({ bodyMarkdown: body })
      .where(eq(noteContent.id, existing.id));
  } else {
    await db
      .insert(noteContent)
      .values({ noteId, language: note.primaryLanguage, bodyMarkdown: body });
  }

  await db
    .update(diaryEntries)
    .set({
      occurredAt,
      mood,
      energy,
      scratch,
      // Editing the title by hand makes it authoritative from now on.
      titleSource: "manual",
      ...(redistill ? { distilledAt: null } : {}),
    })
    .where(eq(diaryEntries.noteId, noteId));

  await replaceTags(noteId, tagList);
  await linkWikilinksFromText(noteId, body, scratch);

  if (redistill) dispatchDistillJob({ noteId });

  revalidatePath(`/diary/${slug}`);
  revalidatePath("/diary");
  redirect(`/diary/${slug}`);
}

/** Manual "distill now" from an entry page — the on-demand half of the
 *  auto-on-save + manual-rerun cadence. */
export async function redistillEntryAction(noteId: number, slug: string) {
  await requireOwner();
  await db
    .update(diaryEntries)
    .set({ distilledAt: null })
    .where(eq(diaryEntries.noteId, noteId));
  dispatchDistillJob({ noteId });
  revalidatePath(`/diary/${slug}`);
}

export async function deleteDiaryEntry(noteId: number) {
  await requireOwner();
  // diary_entries, note_content, note_tags, media, edges, and
  // knowledge_atom_sources all cascade via FK constraints (schema.ts).
  // Atoms themselves deliberately survive: knowledge learned from an entry
  // shouldn't evaporate because the raw entry was deleted — the source row
  // simply disappears from that atom's evidence trail.
  await db.delete(notes).where(eq(notes.id, noteId));
  revalidatePath("/diary");
  redirect("/diary");
}
