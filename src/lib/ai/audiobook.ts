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

// Duration-based truncation check — the safety net the two comments above
// this point both said didn't exist ("no reliable way to get audio
// duration from an mp3 buffer without a decoding dependency this repo
// doesn't have"). It exists now: music-metadata decodes just the header/
// frame info (not the whole audio) to get duration cheaply. This matters
// because clause-level splitting (above) removes the *known* trigger for
// truncation, but doesn't prove there's no OTHER trigger (a stray "……",
// an em dash, a run of whitespace, a Latin-script run inside CJK text —
// anything not in the punctuation set splitLongText knows about). Rather
// than keep chasing individual punctuation marks one production bug at a
// time, this checks the actual observable symptom directly: does the
// returned clip's length roughly match how long that much text should
// take to read aloud. If it's implausibly short, that's a truncated
// response regardless of *why*, and it's worth a retry.
//
// The per-language floor is deliberately generous (i.e. a low bar to
// clear) — this only needs to catch "stopped after the first clause and
// dropped the rest," not fine-tune against real narration speed, so a
// wide margin against false-flagging a legitimately fast/short clip
// matters more than precision.
const MIN_CHARS_PER_SEC: Record<"en" | "zh", number> = { en: 8, zh: 2 };
const MIN_EXPECTED_SECONDS = 0.35; // floor for very short pieces (a lone word)
const MAX_TTS_ATTEMPTS = 3;

function expectedMinSeconds(text: string, language: "en" | "zh"): number {
  return Math.max(MIN_EXPECTED_SECONDS, text.length / MIN_CHARS_PER_SEC[language]);
}

/** Parses just enough of the mp3 to read its duration from the header/
 *  frame data — not a full decode. Returns null (rather than throwing) on
 *  anything music-metadata can't parse, so an unusual-but-valid response
 *  from agent-server doesn't get treated as evidence of truncation just
 *  because this repo's duration check couldn't read it. */
async function getAudioDurationSeconds(buffer: Buffer, mimeType: string): Promise<number | null> {
  try {
    const { parseBuffer } = await import("music-metadata");
    const meta = await parseBuffer(buffer, mimeType);
    return meta.format.duration ?? null;
  } catch {
    return null;
  }
}

/** One TTS call, retried (up to MAX_TTS_ATTEMPTS total) on either a thrown
 *  error (network hiccup, cold-loading model slot on agent-server) OR a
 *  suspiciously-short response (see the duration check above) — both are
 *  "this attempt didn't actually produce the requested audio," just
 *  discovered two different ways. Logs every attempt's outcome, including
 *  the piece's own text, so a run against real content tells you exactly
 *  which paragraph is still failing and how short the clip came back —
 *  see this file's `npm run audiobooks:generate` for where that log
 *  surfaces when run locally. Gives up and returns the last (possibly
 *  still-short) result after MAX_TTS_ATTEMPTS rather than failing the
 *  whole article generation over one stubborn clause. */
async function synthesizeSpeechChecked(
  input: Parameters<typeof synthesizeSpeech>[0],
  language: "en" | "zh",
): ReturnType<typeof synthesizeSpeech> {
  const expected = expectedMinSeconds(input.text, language);
  const preview = input.text.length > 40 ? `${input.text.slice(0, 40)}…` : input.text;
  let last: Awaited<ReturnType<typeof synthesizeSpeech>> | undefined;

  for (let attempt = 1; attempt <= MAX_TTS_ATTEMPTS; attempt++) {
    let result: Awaited<ReturnType<typeof synthesizeSpeech>>;
    try {
      result = await synthesizeSpeech(input);
    } catch (err) {
      console.warn(
        `[audiobook] TTS call failed (attempt ${attempt}/${MAX_TTS_ATTEMPTS}): ${err instanceof Error ? err.message : err} — "${preview}"`,
      );
      if (attempt === MAX_TTS_ATTEMPTS) throw err;
      continue;
    }
    last = result;
    const duration = await getAudioDurationSeconds(Buffer.from(result.audio), result.contentType);
    if (duration === null) {
      // Can't measure it — accept as-is rather than false-flagging.
      return result;
    }
    if (duration >= expected) {
      console.log(
        `[audiobook] ok (${duration.toFixed(2)}s, expected ≥${expected.toFixed(2)}s, ${input.text.length} chars) — "${preview}"`,
      );
      return result;
    }
    console.warn(
      `[audiobook] SUSPECTED TRUNCATION attempt ${attempt}/${MAX_TTS_ATTEMPTS}: got ${duration.toFixed(2)}s, expected ≥${expected.toFixed(2)}s for ${input.text.length} chars — "${preview}"`,
    );
  }
  console.error(`[audiobook] giving up after ${MAX_TTS_ATTEMPTS} attempts, likely still truncated — "${preview}"`);
  return last!;
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
      const { audio, contentType } = await synthesizeSpeechChecked({ text: pieces[i], voice }, language);
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
