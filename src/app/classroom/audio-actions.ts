"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, noteContent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { synthesizeSpeech, speechTextHash } from "@/lib/ai/media";
import { splitMarkdownBlocks, speechTextForStaleness } from "@/lib/markdown-blocks";
import { uploadBufferToR2 } from "@/lib/storage/r2";
import { attachMediaAction } from "@/app/notes/[slug]/actions";

// Same "maxDuration lives on the invoking page" situation as the rest of
// classroom/actions.ts (see the long comment there) — classroom/[slug]/
// page.tsx already exports maxDuration=500 and vercel.json covers
// src/app/classroom/** at the platform level, so generateArticleAudioAction
// (called from a <form action> on that page) inherits both without needing
// anything here.

const MAX_TTS_CHARS = 1800;

/** A single block's speechText can still be too long for one TTS call
 *  (a huge paragraph, or a long bullet list) — split on sentence
 *  boundaries as a last resort. Same logic the old whole-article chunker
 *  used, just scoped to one markdown block's text instead of merging
 *  across paragraph boundaries (which is the behavior that was replaced —
 *  see the audioSegments comment in db/schema.ts). */
function splitLongText(text: string, maxChars = MAX_TTS_CHARS): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.split(/(?<=[.!?。！？])\s+/);
  const pieces: string[] = [];
  let piece = "";
  for (const sentence of sentences) {
    const withSentence = piece ? `${piece} ${sentence}` : sentence;
    if (withSentence.length <= maxChars) {
      piece = withSentence;
    } else {
      if (piece) pieces.push(piece.trim());
      piece = sentence.length <= maxChars ? sentence : sentence.slice(0, maxChars);
    }
  }
  if (piece.trim()) pieces.push(piece.trim());
  return pieces;
}

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

/**
 * Turns an article's body into a playable, hoverable audiobook: splits the
 * markdown into the same top-level blocks the article renders
 * (splitMarkdownBlocks — one paragraph/heading/list/blockquote each),
 * calls agent-server's TTS once per speakable block (code/tables/images
 * are skipped, same reasoning as before, just applied per-block), and
 * uploads each segment to R2 tagged with the block it came from. The
 * segments, a generation timestamp, the voice used, and a hash of the
 * source text (for staleness detection) land on the note_content row so
 * every future visitor streams the same files instead of the audio being
 * regenerated per view.
 *
 * Previously this merged the WHOLE article into ~1800-char chunks
 * ignoring paragraph boundaries entirely, which on a code-heavy article
 * (most of the content living inside fenced code blocks that get
 * stripped before TTS) could leave a chunk with almost nothing left to
 * say — "a few words" per file. Per-block generation fixes that (a
 * chunk's content now only ever comes from ONE paragraph, so stripped
 * code can't silently eat an entire chunk) and is also what makes
 * hover-to-play possible at all.
 *
 * Owner-only: generation costs real time on the self-hosted agent-server
 * (one TTS call per block, sequential, so a long article now makes
 * noticeably more calls than the old flat-chunk version did — slower to
 * generate, far more granular to listen to).
 */
export async function generateArticleAudioAction(
  noteId: number,
  slug: string,
  language: "en" | "zh",
  formData: FormData,
) {
  await requireOwner();

  const voice = (formData.get("voice") as string | null)?.trim() || undefined;

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Article not found");

  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, language)),
  });
  if (!content?.bodyMarkdown?.trim()) throw new Error("This article has no text to read yet");

  const blocks = splitMarkdownBlocks(content.bodyMarkdown);
  const speakable = blocks.filter((b) => b.speechText);
  if (speakable.length === 0) throw new Error("Nothing left to read after stripping formatting");

  const sourceHash = speechTextHash(speechTextForStaleness(content.bodyMarkdown));

  const segments: { blockIndex: number; url: string }[] = [];
  let totalBytes = 0;
  // Sequential, not Promise.all — same reasoning as the rest of this app's
  // AI calls (classroom/actions.ts's header comment): agent-server is one
  // process behind one model slot, so concurrent calls would just queue
  // behind each other anyway, with worse error attribution if one fails.
  for (const block of speakable) {
    const pieces = splitLongText(block.speechText!);
    for (let i = 0; i < pieces.length; i++) {
      const { audio, contentType } = await synthesizeSpeech({ text: pieces[i], voice });
      const ext = contentType.includes("wav") ? "wav" : contentType.includes("flac") ? "flac" : "mp3";
      const buffer = Buffer.from(audio);
      totalBytes += buffer.byteLength;
      const key = `notes/${noteId}/audiobook/${language}-${String(block.index).padStart(3, "0")}-${i}.${ext}`;
      const { publicUrl } = await uploadBufferToR2(key, buffer, contentType);
      segments.push({ blockIndex: block.index, url: publicUrl });
    }
  }

  await db
    .update(noteContent)
    .set({
      audioSegments: segments,
      audioGeneratedAt: new Date(),
      audioSourceHash: sourceHash,
      audioVoice: voice ?? null,
    })
    .where(eq(noteContent.id, content.id));

  // Logged in `media` too (not just noteContent) for the same reason the
  // composers log every upload there — one consistent place that answers
  // "what storage does this note own," independent of which feature
  // generated it.
  await attachMediaAction(noteId, slug, {
    kind: "audio",
    provider: "r2",
    url: segments[0].url,
    sizeBytes: totalBytes,
    mimeType: "audio/mpeg",
  });

  revalidatePath(`/classroom/${slug}`);
}
