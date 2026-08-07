// Core audiobook generation — deliberately uses ONLY relative imports (no
// "@/..." aliases), unlike the rest of this app, because it's shared by
// two very different runtimes:
//   1. The owner-only Server Action (app/classroom/audio-actions.ts),
//      running inside Next.js where aliases resolve fine.
//   2. scripts/generate-audiobooks.ts, run standalone via tsx on your own
//      machine (see that script's header for why) — same convention
//      scripts/fetch-trends.ts already established for exactly this
//      reason (its own header comment: "relative paths don't depend on
//      tsx also picking up tsconfig paths").
// attachMediaAction (the `media` table catalog entry) and the auth check
// are deliberately NOT here — those are web-action-only concerns and
// live in audio-actions.ts, which wraps this function.

import { db } from "../db";
import { noteContent } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { synthesizeSpeech, speechTextHash } from "./media";
import { splitMarkdownBlocks, speechTextForStaleness } from "../markdown-blocks";
import { uploadBufferToR2 } from "../storage/r2";

const MAX_TTS_CHARS = 1800;

/** A single block's speechText can still be too long for one TTS call
 *  (a huge paragraph, or a long bullet list) — split on sentence
 *  boundaries as a last resort, scoped to one markdown block's text
 *  instead of merging across paragraph boundaries (see the audioSegments
 *  comment in db/schema.ts for why per-block generation replaced the old
 *  whole-article chunker in the first place). */
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

export interface GenerateAudioResult {
  segments: { blockIndex: number; url: string }[];
  sourceHash: string;
  totalBytes: number;
}

/**
 * Turns one article's body into a playable, click-to-play audiobook:
 * splits the markdown into the same top-level blocks the article renders
 * (splitMarkdownBlocks — one paragraph/heading/list/blockquote each),
 * calls agent-server's TTS once per speakable block (code/tables/images
 * skipped), and uploads each segment to R2 tagged with the block it came
 * from. Writes the result onto the note_content row so every future
 * visitor streams the same files instead of regenerating per view.
 *
 * `voice` should be resolved by the caller and passed through explicitly
 * — this function doesn't fall back to TTS_DEFAULT_VOICE itself, since
 * that fallback (and the dropdown selection it defers to) is a web-UI
 * concern that lives in audio-actions.ts; the script sets it from a CLI
 * flag instead. Passing the SAME voice for every block in one call here
 * is what keeps one article's narration consistent — see the caller's
 * comment for why leaving this undefined can otherwise get you a
 * different-sounding narrator per paragraph.
 */
export async function generateArticleAudio(
  noteId: number,
  language: "en" | "zh",
  voice: string | undefined,
): Promise<GenerateAudioResult> {
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
  // Sequential, not Promise.all — agent-server is one process behind one
  // model slot, so concurrent calls would just queue behind each other
  // anyway, with worse error attribution if one fails.
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

  return { segments, sourceHash, totalBytes };
}
