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

// TTS chunking — deliberately conservative and split at clause level, not
// just sentence level. Two distinct failure modes have been observed in
// production against agent-server/mlx-audio's qwen3-tts:
//
//  1. The old sentence-split regex required trailing WHITESPACE after
//     terminal punctuation (`\s+`) to count as a split point. That's true
//     for English ("Hello. World.") but never true for Chinese prose,
//     which has no space after "。"/"！"/"？" — so a long Chinese
//     paragraph was never actually being split into sentences at all
//     before falling through to the (English-tuned) hard character
//     ceiling. Fixed below by requiring `\s*` (zero-or-more) instead.
//
//  2. Independent of length: a short Chinese sentence with an internal
//     comma ("A，B。") synthesized audio for clause A, then silently
//     stopped — no error thrown, just a truncated clip with clause B
//     dropped entirely. The failing example was well under any reasonable
//     character ceiling, so chunk-SIZE tuning alone can't defend against
//     this — the fix is that clause punctuation (commas, semicolons, the
//     Chinese enumeration comma "、") is now always a real split boundary,
//     not just an overflow fallback for oversized sentences. Every clause
//     becomes its own TTS call and therefore its own audio segment, so
//     there's no longer a multi-clause span inside one call that a model
//     hiccup can truncate partway through.
//
//  3. (Found after (2) shipped and STILL didn't fix production audio —
//     verified by hand-tracing this function against a real article's
//     text.) The first version of this fix re-merged short trailing
//     fragments (under a MIN_MERGE_CHARS length check) back onto the
//     previous piece to avoid dozens of tiny one-clause clips. That
//     merge was the bug: every fragment coming out of the punctuation
//     split above ALREADY ends in a delimiter (that's what a split point
//     is), so gluing another fragment onto it unconditionally puts that
//     delimiter back in the MIDDLE of the resulting piece — reintroducing
//     exactly the internal-punctuation shape that triggers the model's
//     silent truncation. And a 15-char threshold merged constantly for
//     Chinese, where a complete clause is routinely 5-15 characters (e.g.
//     a trailing "，避免盲猜。" clause got glued onto the clause before it,
//     putting the "，" back mid-piece and losing "避免盲猜" to truncation
//     on every regeneration). Fix: no merging across a delimiter, ever —
//     see splitLongText below. Each punctuation-delimited fragment is
//     unconditionally its own piece, full stop. That does mean a run of
//     several very short clauses now becomes several very short clips
//     instead of one merged one — a minor UX cost, deliberately accepted
//     over the alternative of silently losing words again.
//
// Chinese also gets a lower absolute ceiling than English (MAX_TTS_CHARS
// per language) since it packs far more spoken content per character (no
// inter-word spaces, each character is a full syllable) — the same
// character count is more audio in Chinese than in English, so treating
// them identically under-protects Chinese specifically.
const MAX_TTS_CHARS_EN = 1800;
const MAX_TTS_CHARS_ZH = 350;

function maxCharsFor(language: "en" | "zh"): number {
  return language === "zh" ? MAX_TTS_CHARS_ZH : MAX_TTS_CHARS_EN;
}

/** Hard character slice — only reached when a single clause has no
 *  punctuation at all for hundreds of characters (a run-on sentence or a
 *  URL-heavy line). Last resort, not the common path. */
function hardSlice(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    out.push(text.slice(i, i + maxChars));
  }
  return out;
}

/** A single block's speechText split into one-clause-or-so pieces, each
 *  its own TTS call — see the comment above for why this splits at
 *  clause (not just sentence) punctuation, and why that has to be
 *  unconditional rather than only kicking in once a sentence exceeds
 *  maxChars. Scoped to one markdown block's text, never merging across
 *  paragraph boundaries (see the audioSegments comment in db/schema.ts
 *  for why per-block generation replaced the old whole-article chunker in
 *  the first place). */
function splitLongText(text: string, language: "en" | "zh" = "en"): string[] {
  const maxChars = maxCharsFor(language);
  const fragments = text.split(/(?<=[.!?。！？,，、;；:：])\s*/).filter(Boolean);

  if (fragments.length <= 1) {
    return text.length <= maxChars ? [text] : hardSlice(text, maxChars);
  }

  // Every fragment here — except possibly the very last one — already
  // ends in a delimiter (that's what produced the split at that point).
  // Merging ANY two of them, in either direction, necessarily puts one of
  // those delimiters back in the middle of the resulting piece instead of
  // at the end — which is exactly the shape that triggers the model's
  // silent truncation (see the header comment). So there is no safe merge
  // here: every fragment is unconditionally its own piece. The only
  // exception is a genuinely UNDELIMITED trailing remnant — only possible
  // for the last fragment, when the source text doesn't end in
  // punctuation at all (e.g. a stray "等" with nothing after it) — which
  // has no delimiter of its own to lose track of — but even that fragment
  // isn't merged onto the previous piece, because the previous piece's OWN
  // trailing delimiter would end up mid-string. So it's just left as its
  // own short, standalone piece — a minor one-word clip at worst, not a
  // correctness bug (see header comment point 3 for the merge logic this
  // replaced, and why it was unsafe).
  const pieces: string[] = [];
  for (const fragment of fragments) {
    if (fragment.length <= maxChars) {
      pieces.push(fragment);
    } else {
      pieces.push(...hardSlice(fragment, maxChars));
    }
  }
  return pieces;
}

/** Transient-failure safety net around a single TTS call — retries once
 *  before giving up, since a one-off network hiccup or a cold-loading
 *  model slot on agent-server shouldn't sacrifice an otherwise-good piece
 *  when a second attempt would likely just work. Does not attempt to
 *  detect a *truncated-but-successful* response (no reliable way to get
 *  audio duration from an mp3 buffer without a decoding dependency this
 *  repo doesn't have) — that class of failure is what the clause-level
 *  splitting above targets instead, by keeping every single call's input
 *  short enough that there's nothing left in it to truncate. */
async function synthesizeSpeechWithRetry(
  input: Parameters<typeof synthesizeSpeech>[0],
): ReturnType<typeof synthesizeSpeech> {
  try {
    return await synthesizeSpeech(input);
  } catch (err) {
    console.warn(
      `[audiobook] TTS call failed, retrying once: ${err instanceof Error ? err.message : err}`,
    );
    return synthesizeSpeech(input);
  }
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
    const pieces = splitLongText(block.speechText!, language);
    for (let i = 0; i < pieces.length; i++) {
      const { audio, contentType } = await synthesizeSpeechWithRetry({ text: pieces[i], voice });
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
