"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, noteContent, ingestionJobs, media } from "@/lib/db/schema";
import type { SourceType, MediaKind } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { dispatchIngestionJob } from "@/lib/background-jobs";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { assertSafePublicUrl } from "@/lib/intake";

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "untitled";
  let suffix = 1;
  for (;;) {
    const existing = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (!existing) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

function isYoutubeUrl(url: string): boolean {
  return /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i.test(url);
}

/** Creates the note in `draft` status with an empty content row and a
 * queued ingestion_jobs row, before any extraction/AI work has happened —
 * this is what the note page's "processing" banner watches. */
async function createPendingNote(placeholderTitle: string, sourceType: SourceType, sourceUrl?: string) {
  const slug = await uniqueSlug(slugify(placeholderTitle));

  const [note] = await db
    .insert(notes)
    .values({
      slug,
      title: placeholderTitle,
      status: "draft",
      sourceType,
      sourceUrl,
      primaryLanguage: "en",
    })
    .returning();

  await db.insert(noteContent).values({ noteId: note.id, language: "en" });
  await db.insert(ingestionJobs).values({ noteId: note.id, status: "queued", stage: "queued" });

  return { noteId: note.id, slug: note.slug };
}

/** Bound to the URL/YouTube form on /new. */
export async function startUrlIngestion(formData: FormData) {
  await requireOwner();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) throw new Error("URL is required");

  const parsed = assertSafePublicUrl(url);

  const sourceType: SourceType = isYoutubeUrl(url) ? "youtube" : "url";
  const { noteId, slug } = await createPendingNote(parsed.hostname, sourceType, url);

  dispatchIngestionJob({ noteId, sourceType, sourceUrl: url });

  redirect(`/notes/${slug}`);
}

/** Turns pasted text into the same structured, tagged page as a URL or document. */
export async function startTextIngestion(formData: FormData) {
  await requireOwner();
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 20) throw new Error("Paste at least 20 characters");
  if (text.length > 100_000) throw new Error("Pasted text is limited to 100,000 characters");

  const firstLine = text.split(/\r?\n/).find(Boolean)?.slice(0, 80) || "Text capture";
  const { noteId, slug } = await createPendingNote(firstLine, "manual");
  dispatchIngestionJob({ noteId, sourceType: "manual", rawText: text });
  redirect(`/notes/${slug}`);
}

/** Called from the client ingestion upload widget before it uploads
 * anything — gives it a noteId to sign an upload against, same as
 * attaching media to an existing note. */
export async function createDraftNoteForUpload(filename: string, sourceType: SourceType) {
  await requireOwner();
  return createPendingNote(filename, sourceType);
}

/** Called after the file has finished uploading to R2. Returns the final
 * slug; the widget navigates there itself (kept separate from
 * startUrlIngestion's redirect() since this one's invoked outside a
 * <form action>). */
const SOURCE_TYPE_TO_MEDIA_KIND: Partial<Record<SourceType, MediaKind>> = {
  pdf: "pdf",
  docx: "doc",
  xlsx: "spreadsheet",
};

export async function startFileIngestion(
  noteId: number,
  mediaUrl: string,
  filename: string,
  sourceType: SourceType,
): Promise<{ slug: string }> {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Note not found");

  // Record the uploaded source file as media too — it's the original
  // document, worth keeping visible/downloadable regardless of how the AI
  // draft turns out, and it's what a retry (see retryIngestionAction)
  // re-reads from if the first attempt fails.
  const kind = SOURCE_TYPE_TO_MEDIA_KIND[sourceType];
  if (kind) {
    await db.insert(media).values({ noteId, kind, provider: "r2", url: mediaUrl, mimeType: null });
  }

  dispatchIngestionJob({ noteId, sourceType, mediaUrl, filename });

  return { slug: note.slug };
}
