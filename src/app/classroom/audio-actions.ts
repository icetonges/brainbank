"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, noteContent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { synthesizeSpeech, markdownToSpeechText, chunkForSpeech, speechTextHash } from "@/lib/ai/media";
import { uploadBufferToR2 } from "@/lib/storage/r2";
import { attachMediaAction } from "@/app/notes/[slug]/actions";

// Same "maxDuration lives on the invoking page" situation as the rest of
// classroom/actions.ts (see the long comment there) — classroom/[slug]/
// page.tsx already exports maxDuration=500 and vercel.json covers
// src/app/classroom/** at the platform level, so generateArticleAudioAction
// (called from a <form action> on that page) inherits both without needing
// anything here.

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

/**
 * Turns an article's body into a playable audiobook: strips markdown down
 * to plain prose, splits it into TTS-sized chunks (chunkForSpeech), calls
 * agent-server's TTS once per chunk, and uploads each segment to R2. The
 * ordered segment URLs, a generation timestamp, and a hash of the source
 * text (for staleness detection) land on the note_content row so every
 * future visitor streams the same files instead of the audio being
 * regenerated per view — see the audioSegments comment in db/schema.ts.
 *
 * Owner-only: generation costs real time on the self-hosted agent-server
 * (one TTS call per chunk, sequential), unlike just streaming an
 * already-generated file back, which needs no gating at all.
 */
export async function generateArticleAudioAction(
  noteId: number,
  slug: string,
  language: "en" | "zh",
) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Article not found");

  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, language)),
  });
  if (!content?.bodyMarkdown?.trim()) throw new Error("This article has no text to read yet");

  const plainText = markdownToSpeechText(content.bodyMarkdown);
  if (!plainText.trim()) throw new Error("Nothing left to read after stripping formatting");

  const sourceHash = speechTextHash(plainText);
  const chunks = chunkForSpeech(plainText);

  const segmentUrls: string[] = [];
  let totalBytes = 0;
  // Sequential, not Promise.all — same reasoning as the rest of this app's
  // AI calls (classroom/actions.ts's header comment): agent-server is one
  // process behind one model slot, so concurrent chunks would just queue
  // behind each other anyway, with worse error attribution if one fails.
  for (let i = 0; i < chunks.length; i++) {
    const { audio, contentType } = await synthesizeSpeech({ text: chunks[i] });
    const ext = contentType.includes("wav") ? "wav" : contentType.includes("flac") ? "flac" : "mp3";
    const buffer = Buffer.from(audio);
    totalBytes += buffer.byteLength;
    const key = `notes/${noteId}/audiobook/${language}-${String(i).padStart(3, "0")}.${ext}`;
    const { publicUrl } = await uploadBufferToR2(key, buffer, contentType);
    segmentUrls.push(publicUrl);
  }

  await db
    .update(noteContent)
    .set({ audioSegments: segmentUrls, audioGeneratedAt: new Date(), audioSourceHash: sourceHash })
    .where(eq(noteContent.id, content.id));

  // Logged in `media` too (not just noteContent) for the same reason the
  // composers log every upload there — one consistent place that answers
  // "what storage does this note own," independent of which feature
  // generated it.
  await attachMediaAction(noteId, slug, {
    kind: "audio",
    provider: "r2",
    url: segmentUrls[0],
    sizeBytes: totalBytes,
    mimeType: "audio/mpeg",
  });

  revalidatePath(`/classroom/${slug}`);
}
