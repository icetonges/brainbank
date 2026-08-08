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
import { synthesizeSpeech, speechTextHash, TtsRateLimitError } from "./media";
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

// Duration-based truncation check — logs the actual vs. expected clip
// length so a real run's console output tells you which pieces look
// suspicious, WITHOUT retrying based on that signal. It used to retry
// (up to 3x per piece) on anything under the floor, which sounded right
// in theory but broke against a real run: qwen3-tts here reads Chinese at
// something like 3.5-6.5+ chars/sec (much faster than the first guessed
// floor of 2), so nearly every short, completely-normal clip measured
// "too short" against that floor and got retried 3 times for nothing —
// tripling call volume against a local, single-model-slot TTS backend,
// which is almost certainly what produced the "could not reach TTS
// service at http://127.0.0.1:8090" 502s partway through that run (the
// backend didn't recover; it got hammered off the back of a bad
// heuristic). A duration floor that's loose enough to not misfire on a
// fast-but-complete short clause is also too loose to reliably tell
// "read fast" apart from "dropped the last few characters" — the signal
// just isn't precise enough at that resolution to safely automate a
// retry loop against a resource-constrained local model server. So: this
// stays purely informational (one log line per piece, real duration vs a
// deliberately generous floor) for a human to spot-check, and the actual
// defense against truncation is the clause-level splitting above, which
// removes the mechanism (multi-clause spans with a punctuation mark
// mid-piece) rather than trying to detect its symptom after the fact.
const MIN_CHARS_PER_SEC: Record<"en" | "zh", number> = { en: 15, zh: 8 };
const MIN_EXPECTED_SECONDS = 0.3; // floor for very short pieces (a lone word)

function expectedMinSeconds(text: string, language: "en" | "zh"): number {
  return Math.max(MIN_EXPECTED_SECONDS, text.length / MIN_CHARS_PER_SEC[language]);
}

// Client-side pacing for agent-server's own per-key rate limit — observed
// directly against production: "rate limit exceeded: 60 requests/minute
// for this key", a 429 from agent-server itself (not from qwen3-tts or
// mlx-audio, and not documented anywhere in THIS repo — agent-server is a
// separate project; see agent-server-patch/README.md for what little
// about it lives here). Nothing paced calls before this, and clause-level
// splitting (above) increases how many calls one article needs, which is
// what pushed a real run over the limit.
//
// 1500ms between calls (= 40/min) is deliberately well under 60, not
// shaved close to it: agent-server's exact window algorithm (fixed vs.
// sliding minute, whether other endpoints share the same budget as
// /v1/audio/speech, whether there's burst allowance) isn't known from
// this codebase. If 429s still happen after this, that's the place to
// look — agent-server's own rate-limiter source or its /docs, not a
// tighter guess made from here — and MIN_CALL_INTERVAL_MS below is the
// one number to adjust once the real policy is known.
const MIN_CALL_INTERVAL_MS = 1500;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 20_000; // used only when agent-server sends no Retry-After
let lastTtsCallAt = 0;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Blocks until at least MIN_CALL_INTERVAL_MS has passed since the last
 *  TTS call started. Module-level state, not per-request — correct here
 *  because generateArticleAudio already calls agent-server strictly
 *  sequentially (see that function's comment on why), so there's only
 *  ever one caller pacing itself against its own last call, never two
 *  concurrent generations racing this timestamp. */
async function paceTtsCall(): Promise<void> {
  const wait = lastTtsCallAt + MIN_CALL_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastTtsCallAt = Date.now();
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

/** One TTS call — paced against agent-server's rate limit (see above),
 *  then retried on a thrown error: once for an ordinary failure (network
 *  hiccup, cold-loading model slot), or specifically on a 429 by waiting
 *  out agent-server's own Retry-After (falling back to a fixed guess if
 *  it didn't send one) before the retry, rather than immediately
 *  re-firing into an active rate-limit window — which is exactly what
 *  blind retry-once did against a real 429 (see the error log this fix
 *  responds to: the retry failed with the identical 429 a heartbeat
 *  later). Never retries based on the duration heuristic (see the
 *  comment above for why that turned out unsafe against a real local
 *  backend) — it only logs what it measured. */
async function synthesizeSpeechChecked(
  input: Parameters<typeof synthesizeSpeech>[0],
  language: "en" | "zh",
): ReturnType<typeof synthesizeSpeech> {
  const preview = input.text.length > 40 ? `${input.text.slice(0, 40)}…` : input.text;
  await paceTtsCall();
  let result: Awaited<ReturnType<typeof synthesizeSpeech>>;
  try {
    result = await synthesizeSpeech(input);
  } catch (err) {
    if (err instanceof TtsRateLimitError) {
      const backoffMs = err.retryAfterMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS;
      console.warn(
        `[audiobook] rate limited by agent-server, waiting ${(backoffMs / 1000).toFixed(1)}s before retrying: ${err.message} — "${preview}"`,
      );
      await sleep(backoffMs);
      await paceTtsCall();
      result = await synthesizeSpeech(input);
    } else {
      console.warn(
        `[audiobook] TTS call failed, retrying once: ${err instanceof Error ? err.message : err} — "${preview}"`,
      );
      await paceTtsCall();
      result = await synthesizeSpeech(input);
    }
  }

  const duration = await getAudioDurationSeconds(Buffer.from(result.audio), result.contentType);
  if (duration !== null) {
    const expected = expectedMinSeconds(input.text, language);
    if (duration < expected) {
      console.warn(
        `[audiobook] short clip (informational only, not retried): got ${duration.toFixed(2)}s, expected ≥${expected.toFixed(2)}s for ${input.text.length} chars — "${preview}"`,
      );
    }
  }
  return result;
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
