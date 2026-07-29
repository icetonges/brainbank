import {
  generateObject,
  generateText,
  streamText,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { resolveModel } from "./providers";
import {
  AGENTIC_MODELS,
  DEFAULT_MODEL_ID,
  FALLBACK_CHAIN,
  GROUNDED_FALLBACK_CHAIN,
  NO_STRUCTURED_OUTPUT_MODELS,
  OBJECT_FALLBACK_CHAIN,
  type ModelId,
} from "./models";
import { classroomCategoryEnum, type ClassroomCategory } from "@/lib/db/schema";

// --- THE CHAIN ---
//
// This file is the only place in the app allowed to call generateText /
// generateObject / streamText. Every AI-powered feature — the AI Assist
// panel, translate, summarize, tag suggestion, and anything the ingestion
// pipeline needs later (PLAN.md §5–6) — goes through one of the functions
// below instead of talking to a model directly. That's what "AI assist and
// other AI features sit below the LLM chain" means in practice: the UI and
// server actions call `summarizeNote()` / `translateText()` / etc., never
// `resolveModel()` or an @ai-sdk/* package themselves.
//
// Each task has a default model tuned for that job (the cheapest capable
// model for high-volume mechanical tasks, the flagship default for
// anything that needs more care) but every function accepts an explicit
// override, so the AI Assist panel's model picker can point any task at
// any registered model.
//
// "Chain" isn't just naming — every task actually runs through
// withFallback() below, which retries against FALLBACK_CHAIN (models.ts)
// if the preferred model's call fails (rate limit, spend cap, outage).
// Only local/default is registered right now (every other provider was
// pulled out per explicit instruction — see models.ts's header comment),
// so FALLBACK_CHAIN is a single entry and there's currently no real
// fallback destination: if the Mac is asleep or agent-server is
// unreachable, a task fails outright instead of using a different
// provider. The machinery still runs the same way it would with more
// models registered, so restoring redundancy later is just adding entries
// back to models.ts/providers.ts.

export type TaskName =
  | "assist"
  | "summarize"
  | "tag-and-link"
  | "translate"
  | "draft"
  | "publish-assist"
  | "format-article";

// Every task defaults to the local self-hosted model (DEFAULT_MODEL_ID —
// see models.ts, MODELS[].isDefault) — private, free, no external API call.
// This is a preference, not an exclusive route: every task still runs
// through withFallback() below, so if the Mac is asleep or agent-server
// isn't reachable, the call transparently falls through to the next model
// in FALLBACK_CHAIN / GROUNDED_FALLBACK_CHAIN instead of failing outright.
export const TASK_MODELS: Record<TaskName, ModelId> = {
  // assist is the one task that was always allowed an agentic,
  // web-searching model — it's an open-ended chat helper, not a transform
  // over fixed input. No agentic model is currently registered (see
  // AGENTIC_MODELS in models.ts), so this distinction is dormant right
  // now, but the plumbing (chainFor()'s grounded=false path) is kept for
  // when one is added back — an agentic model must never become the
  // preferred/fallback model for the grounded tasks below.
  assist: DEFAULT_MODEL_ID,
  summarize: DEFAULT_MODEL_ID,
  "tag-and-link": DEFAULT_MODEL_ID,
  // Every other task is a *grounded* transform — it must operate only on
  // the text it's given, never on whatever a model's built-in web search
  // decides to fetch. This mattered concretely when Groq's agentic
  // "compound" model was registered: making it the top-1 model for these
  // four tasks, guarded by only a prompt-level "don't browse" instruction,
  // broke a real translation in production (corrupted title AND body)
  // despite the instruction — a prompt-only guard isn't reliable against
  // an agentic model. See AGENTIC_MODELS / GROUNDED_FALLBACK_CHAIN in
  // models.ts for the actual (structural, not just prompted) enforcement
  // mechanism, applied here via withFallback's { grounded: true } default.
  // No agentic model is currently registered, so local is safe as the
  // preferred model for all four of these regardless.
  translate: DEFAULT_MODEL_ID,
  draft: DEFAULT_MODEL_ID,
  "publish-assist": DEFAULT_MODEL_ID,
  "format-article": DEFAULT_MODEL_ID,
};

// Left in every grounded task's system prompt as harmless defense-in-depth
// even though these tasks no longer route to an agentic model by default —
// costs nothing for a non-agentic model to ignore, and still matters if a
// user's explicit model-picker override ever points one of these tasks at
// compound.
const NO_BROWSING_INSTRUCTION =
  "Do not browse the web, search the internet, visit any URL, or run code — even if the text mentions a website, a link, or a domain name. Work only from the exact text given to you; never fetch, verify, or supplement it with outside information.";

/**
 * Preferred model first, then the rest of the chain in order (deduped).
 * Grounded tasks (everything except assist) use GROUNDED_FALLBACK_CHAIN
 * and never even start from an agentic model: if an explicit override
 * asks for one anyway (e.g. someone picks Compound in a task's model
 * picker without knowing it can autonomously browse), it's swapped for
 * the first grounded model instead of honored — letting a "translate
 * this" call quietly fetch and blend in live web content is a
 * correctness bug, not a preference to respect.
 *
 * `objectMode` additionally strips NO_STRUCTURED_OUTPUT_MODELS (models.ts)
 * out of the chain entirely — for generateObject calls, a model that's
 * known to not honor a JSON schema isn't a "might fail, worth trying"
 * candidate, it's a guaranteed Zod validation failure every time, so
 * there's no reason to ever spend a full (often slow) generation on it. If
 * an explicit override still asks for one anyway, it's swapped out the
 * same way an agentic-model override is for grounded tasks.
 */
function chainFor(
  preferred: ModelId,
  grounded: boolean,
  objectMode = false,
): ModelId[] {
  const chain = objectMode
    ? OBJECT_FALLBACK_CHAIN
    : grounded
      ? GROUNDED_FALLBACK_CHAIN
      : FALLBACK_CHAIN;
  const unsafePreferred =
    (grounded && AGENTIC_MODELS.includes(preferred)) ||
    (objectMode && NO_STRUCTURED_OUTPUT_MODELS.includes(preferred));
  const safePreferred = unsafePreferred ? chain[0] : preferred;
  return [safePreferred, ...chain.filter((id) => id !== safePreferred)];
}

/**
 * Runs `attempt` against each model in chainFor(preferred, grounded) until
 * one succeeds, logging and moving on when a model errors instead of
 * failing the whole task. This is what makes the model registry an actual
 * fallback chain rather than just a routing table: a provider outage,
 * rate limit, or spend cap no longer takes down every AI feature that
 * defaults to that model. `grounded` defaults to true — pass `false` only
 * for tasks (currently just assist) where an agentic, web-searching model
 * is acceptable. Pass `objectMode: true` for generateObject calls — see
 * chainFor's doc comment.
 */
async function withFallback<T>(
  label: TaskName,
  preferred: ModelId,
  attempt: (model: LanguageModel) => Promise<T>,
  options: {
    grounded?: boolean;
    objectMode?: boolean;
    onModelUsed?: (modelId: ModelId) => void;
  } = {},
): Promise<T> {
  const chain = chainFor(preferred, options.grounded ?? true, options.objectMode ?? false);
  let lastError: unknown;
  for (const modelId of chain) {
    try {
      const result = await attempt(resolveModel(modelId));
      options.onModelUsed?.(modelId);
      return result;
    } catch (err) {
      lastError = err;
      console.error(`[ai:${label}] ${modelId} failed, falling back to next model in chain`, err);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`[ai:${label}] every model in the fallback chain failed`);
}

// --- SCHEMA COERCION FOR generateObject FIELDS ---
//
// The local self-hosted model (and possibly others without real
// structured-output support) is instructed via the schema/prompt to
// return a JSON array, but sometimes answers with a plain string instead
// (e.g. tags as "one, two, three" rather than ["one","two","three"]) —
// observed in production against local/default's publish-assist output.
// The system prompts below now spell out the exact shape explicitly, which
// fixes most of it, but z.preprocess() here is the backstop: it runs
// before schema validation, so a string in an array slot is coerced into
// an array instead of failing NoObjectGeneratedError and burning a
// fallback attempt on a different (paid) model over one shape mistake.
// Real arrays pass through untouched.
function arrayOfStrings(description: string) {
  return z.preprocess((val) => {
    if (typeof val === "string") {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return val;
  }, z.array(z.string()).describe(description));
}

// Same problem, one level deeper: publishAssist's `resources` needs an
// array of {title,url,description} objects, but a weaker/local model can
// answer with an array of plain description strings instead (also
// observed in production). Best-effort reconstruction from a string
// (pull out an embedded URL if present, use the leading text as the
// title) is not as good as the model returning real objects — which is
// why the system prompt below asks for that explicitly and shows an
// example — but it means an otherwise-good response still validates and
// gets used instead of being thrown away entirely.
function resourceItemSchema() {
  return z.preprocess((val) => {
    if (typeof val === "string") {
      const urlMatch = val.match(/https?:\/\/[^\s)\]"'<>]+/);
      const titleMatch = val.match(/^[\d.\s*]*\**\s*([^*:：\-–]{1,80})/);
      return {
        title: (titleMatch?.[1] ?? val.slice(0, 60)).trim(),
        url: urlMatch?.[0] ?? "",
        description: val,
      };
    }
    return val;
  }, z.object({
    title: z.string().describe("Name of the resource"),
    url: z
      .string()
      .describe(
        "The resource's real, stable URL — official docs, GitHub repo, or well-known site. Never invent a URL.",
      ),
    description: z.string().describe("One sentence: what it covers and why it's worth the time"),
  }));
}

// Reinforces the exact JSON shape for array fields that local models have
// been observed to flatten into a single string — appended to any
// generateObject system prompt whose schema has an array-of-strings or
// array-of-objects field. Cheap insurance: costs a capable model nothing
// to already be doing this right, and measurably helps a weaker one.
const JSON_ARRAY_SHAPE_REMINDER =
  'Return real JSON, not a description of JSON. Every field described as a list/array MUST be an actual JSON array of separate items — e.g. ["item one","item two"], never a single comma-separated string like "item one, item two". Every field described as a list of objects MUST be an array of real JSON objects with each named property set, never a list of plain strings.';

// Some models occasionally answer with real line breaks escaped as the
// literal two-character sequence "\" + "n" (and "\t" for tabs) instead of
// actual whitespace — collapsing headings/lists/code fences into one
// unreadable line with "\n" printed as text instead of a break. This
// happens both on plain generateText output (translate) and inside
// generateObject's structured fields (publishAssist's learningMap/handsOn,
// draftNoteFromSource, translateNote) — a model that decides to represent
// a multi-line value as an escaped string does so the same way whether
// it's producing raw text or a JSON field, so every multi-line AI field
// that ends up rendered as markdown needs this same cleanup, not just the
// translate path. Rewriting the escapes back to real whitespace fixes the
// overwhelming majority of cases; the only false-positive risk is a code
// sample that legitimately contains a literal backslash-n (e.g. a regex
// pattern), which is rare enough to accept as a trade-off for everything
// else rendering correctly.
function unescapeLiteralWhitespace(text: string): string {
  return text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

// Every task in this file produces markdown that can legitimately run
// long (a full classroom article body, a learning map, hands-on steps) —
// without an explicit ceiling, generateText/generateObject fall back to
// whatever a given provider's own default is, which is not the same
// across Groq/Gemini/Anthropic and in at least one case was small enough
// to cut a translated article off partway through. Setting the same
// generous, safe-for-every-model-in-the-chain ceiling everywhere makes
// that failure mode explicit and consistent instead of provider-dependent.
const MAX_OUTPUT_TOKENS = 8192;

// Nothing in this file bounded how long to wait on agent-server before this
// fix — if it (or the local model underneath it) hangs instead of erroring
// (no response at all, not even a fast failure), the call rides all the way
// to Vercel's own hard function-duration ceiling with no response ever
// reaching the client. Observed in production on /api/ai/assist: "Vercel
// Runtime Timeout Error: Task timed out after 300 seconds", chatbox stuck
// on "Thinking…" the whole time, no error surfaced anywhere. abortSignal on
// every call here makes a hang fail fast and go through the same
// fallback/error path as any other failure, well inside that ceiling.
// TASK_TIMEOUT_MS covers every single-shot generateText/generateObject call
// below. streamAssist needs a different shape (see its own comment): a
// short bound on waiting for the *first* token (STREAM_FIRST_BYTE_TIMEOUT_MS
// — this is what actually catches a hang, since the known Ollama
// tools+stream bug fails fast with a 502 rather than hanging, so a real
// hang means agent-server/the Mac itself is stuck) and a much longer one
// once tokens are actually arriving (STREAM_TOTAL_TIMEOUT_MS — has to be
// generous enough that a real, working, long streamed answer never gets cut
// off), plus its own bound on the non-streaming retry (FALLBACK_TIMEOUT_MS).
const TASK_TIMEOUT_MS = 120_000;
const STREAM_FIRST_BYTE_TIMEOUT_MS = 20_000;
const STREAM_TOTAL_TIMEOUT_MS = 180_000;
const FALLBACK_TIMEOUT_MS = 90_000;

// --- summarize ---

export interface NoteForAi {
  title: string;
  what?: string | null;
  how?: string | null;
  why?: string | null;
  other?: string | null;
}

function noteToPrompt(note: NoteForAi) {
  return [
    `Title: ${note.title}`,
    note.what ? `What: ${note.what}` : null,
    note.how ? `How: ${note.how}` : null,
    note.why ? `Why: ${note.why}` : null,
    note.other ? `Other: ${note.other}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function summarizeNote(
  note: NoteForAi,
  modelId?: ModelId,
): Promise<string> {
  const { text } = await withFallback(
    "summarize",
    modelId ?? TASK_MODELS.summarize,
    (model) =>
      generateText({
        model,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        system:
          "You write a single, dense sentence summarizing a personal knowledge-base note. No preamble, no quotes, just the sentence.",
        prompt: noteToPrompt(note),
      }),
  );
  return text.trim();
}

// --- tag-and-link ---

const tagSuggestionSchema = z.object({
  tags: arrayOfStrings("3-6 short lowercase tags (single words or hyphenated phrases)"),
  relatedTopics: arrayOfStrings("0-5 topics or concepts this note is likely connected to"),
});

export type TagSuggestion = z.infer<typeof tagSuggestionSchema>;

export async function suggestTags(
  note: NoteForAi,
  modelId?: ModelId,
): Promise<TagSuggestion> {
  const { object } = await withFallback(
    "tag-and-link",
    modelId ?? TASK_MODELS["tag-and-link"],
    (model) =>
      generateObject({
        model,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: tagSuggestionSchema,
        system: `You tag notes in a personal knowledge base. Tags are short, lowercase, and reusable across notes (prefer existing-sounding general terms over one-off phrases). ${JSON_ARRAY_SHAPE_REMINDER} Example of the exact shape expected: {"tags":["react","state-management"],"relatedTopics":["redux","context-api"]}`,
        prompt: noteToPrompt(note),
      }),
    { objectMode: true },
  );
  return object;
}

// --- translate ---

// Long-form markdown (a classroom article's full body, a learning guide's
// map/hands-on steps) can run well past what a single generateText call
// reliably returns in one response, however high MAX_OUTPUT_TOKENS is set
// — this is what caused the bug where a translated article came back
// roughly half the length of the source. Two independent defenses fix it,
// because either alone can still get caught out by one dense chunk:
//   1. Split the input into markdown-aware chunks *before* sending it, so
//      no single call is ever asked to produce more than a comfortable
//      fraction of any model's output ceiling.
//   2. Check finishReason on every response anyway — if a model still
//      cuts a chunk off mid-way ("length"), split THAT chunk in half and
//      retry each half recursively instead of accepting the truncated
//      text. This is the hard guarantee: no output is ever silently
//      accepted short of covering its whole input.
// Together these guarantee the full input is translated regardless of
// length, at the cost of more (parallelized) round trips for long articles.
const TRANSLATE_CHUNK_MAX_CHARS = 3000;
// Below this, a chunk that still gets truncated can't usefully be split
// further — return whatever came back rather than recursing forever.
const TRANSLATE_MIN_SPLITTABLE_CHARS = 200;

/** Splits markdown into blank-line-delimited blocks, keeping fenced code
 * blocks atomic (never splits inside a ``` fence) so a chunk boundary can
 * never land in the middle of a code sample. Blocks include their
 * trailing blank line, so `chunks.join("")` reconstructs the original
 * text exactly. */
function splitIntoBlocks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    current.push(line);
    if (!inFence && line.trim() === "") {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

/** Greedily packs blocks into chunks up to `maxChars`, never splitting a
 * block apart (so a chunk can only exceed maxChars if a single block —
 * e.g. one big code fence — already does on its own). */
function chunkMarkdown(markdown: string, maxChars: number): string[] {
  const blocks = splitIntoBlocks(markdown);
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length > maxChars) {
      chunks.push(current);
      current = block;
    } else {
      current += block;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [markdown];
}

/** Roughly the midpoint of `text`, snapped forward to the nearest blank
 * line (or failing that, line break) so a forced split doesn't land
 * inside a sentence or a code fence. */
function findSplitPoint(text: string): number {
  const mid = Math.floor(text.length / 2);
  const blankNear = text.indexOf("\n\n", mid);
  if (blankNear !== -1) return blankNear + 2;
  const lineNear = text.indexOf("\n", mid);
  return lineNear !== -1 ? lineNear + 1 : mid;
}

function translateSystemPrompt(targetLabel: string): string {
  return `Translate the given text into ${targetLabel}. Preserve meaning and tone.

If the text contains markdown, preserve its structure exactly — keep every heading marker (#, ##, ###), bullet (-, *) and numbered list marker, blank line between blocks, bold (**text**) and italic (*text*) marker, and table pipe/row layout in place; translate only the prose inside those elements. Leave code blocks (fenced with \`\`\`), inline code (\`text\`), URLs, and link targets ([text](url) — translate the link text, not the URL) untouched. A run of short list items must come back as the same number of separate list items, not collapsed into one paragraph.

This may be one fragment of a longer document that was split into pieces before translation. Translate ONLY the text given, in full, start to end — never summarize, shorten, condense, or skip any part of it, however long it is. Do not add an introduction, conclusion, or any commentary — your output is spliced directly between other translated fragments with no separator.

Output real line breaks between blocks, never the two characters backslash-n as text.

${NO_BROWSING_INSTRUCTION} This includes any URL that appears inside the text being translated — translate the link text if there is one, leave the URL itself untouched, and do not visit it.

Return only the translation, no commentary.`;
}

async function translateChunk(
  chunk: string,
  target: "en" | "zh",
  modelId: ModelId,
  onModelUsed?: (id: ModelId) => void,
): Promise<string> {
  const targetLabel = target === "zh" ? "Simplified Chinese" : "English";
  const result = await withFallback(
    "translate",
    modelId,
    (model) =>
      generateText({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        system: translateSystemPrompt(targetLabel),
        prompt: chunk,
      }),
    { onModelUsed },
  );
  const translated = unescapeLiteralWhitespace(result.text.trim());

  if (result.finishReason === "length" && chunk.length > TRANSLATE_MIN_SPLITTABLE_CHARS) {
    // The model ran out of output room mid-chunk. Splitting this specific
    // chunk in half and retrying each half is the only way to guarantee
    // completeness — accepting the truncated text here would silently
    // reproduce the exact "half the article is missing" bug this exists
    // to prevent.
    console.error(
      `[ai:translate] chunk (${chunk.length} chars) hit the output-token ceiling, splitting and retrying`,
    );
    const splitAt = findSplitPoint(chunk);
    const [a, b] = [chunk.slice(0, splitAt), chunk.slice(splitAt)];
    // Sequential, not Promise.all — see the comment on translateWithMeta's
    // chunk loop below for why: the local model is one instance handling
    // one generation at a time, so firing both halves at once just queues
    // the second behind the first inside agent-server while ITS OWN
    // abortSignal clock (TASK_TIMEOUT_MS) keeps running from dispatch time,
    // not from when it actually starts generating — a real risk of timing
    // out in queue rather than actually failing to translate.
    const ta = await translateChunk(a, target, modelId, onModelUsed);
    const tb = await translateChunk(b, target, modelId, onModelUsed);
    return `${ta}${tb}`;
  }

  return translated;
}

// Matches any http(s) URL. Used to mask every URL — in the body, the
// summary, AND the title/topic field, all three go through translateText
// — before the text ever reaches a model, and restore them afterward.
// This is a hard guarantee rather than a prompt-level ask: NO_BROWSING_
// INSTRUCTION tells a model not to act on a URL it sees, but this removes
// the URL from what it sees in the first place, the same way dropping
// sourceUrl from draftNoteFromSource's prompt does. A short title/topic
// string that's just "https://example.com" (or has one embedded) is
// exactly the shape that made compound decide to browse before — masking
// it here closes that gap regardless of what field it showed up in.
const URL_PATTERN = /https?:\/\/[^\s)\]"'<>]+/g;

/** Rare delimiter unlikely to appear in real content and unlikely to be
 * touched by a translation model (nothing to translate about it), so the
 * restore step can find placeholders back out reliably. */
function urlPlaceholder(index: number): string {
  return `§URL${index}§`;
}

function protectUrls(text: string): { masked: string; urls: string[] } {
  const urls: string[] = [];
  const masked = text.replace(URL_PATTERN, (url) => {
    const token = urlPlaceholder(urls.length);
    urls.push(url);
    return token;
  });
  return { masked, urls };
}

function restoreUrls(text: string, urls: string[]): string {
  if (urls.length === 0) return text;
  return text.replace(/§URL(\d+)§/g, (whole, indexStr: string) => {
    const url = urls[Number(indexStr)];
    return url ?? whole;
  });
}

async function translateWithMeta(
  text: string,
  target: "en" | "zh",
  modelId: ModelId | undefined,
  onModelUsed?: (id: ModelId) => void,
): Promise<string> {
  if (!text.trim()) return "";
  const chosenModel = modelId ?? TASK_MODELS.translate;
  const { masked, urls } = protectUrls(text);
  const chunks = chunkMarkdown(masked, TRANSLATE_CHUNK_MAX_CHARS);

  if (chunks.length <= 1) {
    const result = await translateChunk(masked, target, chosenModel, onModelUsed);
    return restoreUrls(result, urls);
  }

  // Chunks are independent in principle, but they're translated
  // sequentially, not concurrently — this app only ever has ONE model
  // registered (local/default, see models.ts's header comment), a single
  // self-hosted Ollama instance that generates one response at a time.
  // Firing every chunk's generateText call at once via Promise.all doesn't
  // actually parallelize the work; agent-server just queues them, and each
  // queued call's own abortSignal (TASK_TIMEOUT_MS, see translateChunk)
  // keeps counting down from the moment it was dispatched — not from when
  // Ollama actually starts generating it. A long article split into several
  // chunks could time out several of them purely for having waited in
  // queue, which surfaces as the whole translation failing outright (this
  // function isn't allSettled — one rejected chunk rejects the join).
  // Sequential dispatch costs nothing in real wall-clock time against a
  // single-instance model (it was always going to process them one at a
  // time either way) and removes that failure mode entirely.
  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateChunk(chunk, target, chosenModel, onModelUsed));
  }
  return restoreUrls(translatedChunks.join(""), urls);
}

export async function translateText(
  text: string,
  target: "en" | "zh",
  modelId?: ModelId,
): Promise<string> {
  return translateWithMeta(text, target, modelId);
}

/**
 * Same as translateText, but also reports which model(s) actually
 * produced the translation (more than one means the fallback chain kicked
 * in partway through) — used by the classroom article translate action to
 * record "translated on <date> by <model>" against the saved content.
 */
export async function translateTextWithMeta(
  text: string,
  target: "en" | "zh",
  modelId?: ModelId,
): Promise<{ text: string; models: ModelId[] }> {
  const used = new Set<ModelId>();
  const result = await translateWithMeta(text, target, modelId, (id) => used.add(id));
  return { text: result, models: Array.from(used) };
}

export interface TranslatedNote {
  title: string;
  what: string;
  how: string;
  why: string;
  other: string;
}

export async function translateNote(
  note: { title: string; what: string; how: string; why: string; other: string },
  target: "en" | "zh",
  modelId?: ModelId,
): Promise<TranslatedNote> {
  const targetLabel = target === "zh" ? "Simplified Chinese" : "English";

  const { object } = await withFallback(
    "translate",
    modelId ?? TASK_MODELS.translate,
    (model) =>
      generateObject({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: z.object({
          title: z.string(),
          what: z.string(),
          how: z.string(),
          why: z.string(),
          other: z.string(),
        }),
        system: `Translate every field into ${targetLabel}. Keep empty fields empty. Preserve meaning and tone. Translate the FULL text of every field, however long — never shorten, summarize, condense, or omit any part of a field. Return only the translated fields. ${NO_BROWSING_INSTRUCTION}`,
        prompt: JSON.stringify(note),
      }),
    { objectMode: true },
  );
  return {
    title: unescapeLiteralWhitespace(object.title),
    what: unescapeLiteralWhitespace(object.what),
    how: unescapeLiteralWhitespace(object.how),
    why: unescapeLiteralWhitespace(object.why),
    other: unescapeLiteralWhitespace(object.other),
  };
}

// --- assist (streaming chat) ---

const ASSIST_SYSTEM_PROMPT =
  "You are the AI assist panel inside brainbank, a personal knowledge base. Help the user draft or refine a note's What (the concept/fact), How (mechanism or steps), and Why (context/reasoning). Be concise and concrete; prefer structured, scannable answers over long prose.";

// Used by the /llm page's chatbox — a general-purpose chat, not the
// narrower note-drafting assist above. Deliberately doesn't claim this app
// hands it retrieval over brainbank's own notes (it doesn't — nothing here
// implements that), only what's actually true: the underlying agent-server
// key has tools scope (see "local API deployment.md"), so the model can
// autonomously call its own configured knowledge-base/skill tools
// server-side if it decides to. Overstating that in the prompt would just
// train the model to claim capabilities it may not have.
const KNOWLEDGE_CHAT_SYSTEM_PROMPT =
  "You are the local chat assistant on brainbank's /llm page, running on the user's self-hosted agent-server — no external API, nothing leaves their machine. Your API key has tool-calling enabled, so you may autonomously use whatever knowledge-base search or skills your own configuration exposes when it's actually useful, not by default for every message. Be concise and concrete; prefer structured, scannable answers over long prose.";

type AssistContext = "note" | "knowledge";

// The /llm page's chatbox (llm-chat-panel.tsx) wants token-usage numbers
// alongside each reply — something the plain-text stream this function
// returns has no room for on its own, and redesigning the wire protocol
// would mean touching the note-assist panel too (it reads this same
// endpoint's output as plain text and knows nothing about a richer
// format). Instead, once generation finishes, a small distinctive trailer
// is appended to the very end of the response; the client (same constants,
// see splitUsageTrailer in llm-chat-panel.tsx) strips it back out before
// rendering and reads the numbers from it. Only emitted when
// context === "knowledge" — the note-assist panel doesn't look for this
// and would otherwise show the raw marker as garbage trailing text.
const USAGE_TRAILER_PREFIX = "\n\n<!--BRAINBANK:USAGE:";
const USAGE_TRAILER_SUFFIX = "-->";

interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

function usageTrailer(usage: UsageLike | undefined): string {
  if (!usage) return "";
  return `${USAGE_TRAILER_PREFIX}${JSON.stringify({
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
  })}${USAGE_TRAILER_SUFFIX}`;
}

/**
 * Streaming chat behind the AI Assist panel (context: "note") and the /llm
 * page's chatbox (context: "knowledge") — same chain and streaming
 * mechanics, different system prompt. Unlike the other tasks this can't
 * just retry-and-return, because the point is to pipe tokens to the
 * client as they arrive — so the fallback chain is applied to the *start*
 * of the stream: each model in chainFor() is tried in turn, and we peek
 * the first chunk before committing to a response. A model that errors
 * before producing a token (the common case — a provider rejects the
 * request outright because it's rate-limited or over its spend cap, same
 * failure mode that took down every AI feature before this fix) is
 * skipped in favor of the next one, invisibly to the client. A model that
 * fails *after* it has already streamed some text can't be recovered —
 * that partial output already reached the client — so that case just ends
 * the response rather than silently retrying into a second answer.
 */
export async function streamAssist(
  messages: ModelMessage[],
  modelId?: ModelId,
  context: AssistContext = "note",
): Promise<Response> {
  const chain = chainFor(modelId ?? TASK_MODELS.assist, false);
  const systemPrompt = context === "knowledge" ? KNOWLEDGE_CHAT_SYSTEM_PROMPT : ASSIST_SYSTEM_PROMPT;
  let lastError: unknown;

  for (const id of chain) {
    let reader: ReadableStreamDefaultReader<string>;
    let first: ReadableStreamReadResult<string>;
    // Only populated for context === "knowledge" (see usageTrailer above)
    // — carrying just the promise forward, rather than the whole `result`
    // object, keeps this hoistable out of the try block without fighting
    // streamText's generic return type.
    let usagePromise: Promise<UsageLike> | undefined;
    // Bounds the streaming attempt in two phases on the same controller:
    // a short STREAM_FIRST_BYTE_TIMEOUT_MS while nothing has arrived yet
    // (this is what actually catches a hang — the known Ollama
    // tools+stream bug below fails FAST with a 502, it doesn't hang, so a
    // real hang past this point means agent-server or the Mac itself is
    // stuck), then a much longer STREAM_TOTAL_TIMEOUT_MS once the first
    // chunk has arrived, so a real, working, long streamed answer never
    // gets cut off. Without this, a genuine hang rides all the way to
    // Vercel's own hard function-duration ceiling with no response ever
    // reaching the client — see the comment on STREAM_FIRST_BYTE_TIMEOUT_MS
    // above for the production incident this fixes.
    const abortController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () =>
        abortController.abort(
          new Error(`agent-server did not send a first token for ${id} within ${STREAM_FIRST_BYTE_TIMEOUT_MS / 1000}s`),
        ),
      STREAM_FIRST_BYTE_TIMEOUT_MS,
    );
    try {
      const result = streamText({
        model: resolveModel(id),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages,
        abortSignal: abortController.signal,
      });
      reader = result.textStream.getReader();
      usagePromise = context === "knowledge" ? result.usage : undefined;
      first = await reader.read();
      clearTimeout(timer);
      // An immediately-empty stream (done on the very first read, zero
      // bytes) is NOT a legitimate "the model said nothing" answer — every
      // system prompt here asks for a real reply, and this exact shape
      // (200 OK, zero content, no thrown error) is what agent-server
      // returns when its tools-scoped agent_loop's internal step comes
      // back empty. Silently returning an empty 200 to the client is how
      // this previously showed up as a blank chat bubble with no error
      // anywhere — throwing here routes it through the same fallback path
      // as a thrown network error instead of being mistaken for success.
      if (first.done) {
        throw new Error(`agent-server returned an empty response for ${id} (streaming)`);
      }
      // Reschedule on the same controller/signal, now bounding the rest of
      // the stream instead of the wait for the first token.
      timer = setTimeout(
        () =>
          abortController.abort(
            new Error(`${id} took longer than ${STREAM_TOTAL_TIMEOUT_MS / 1000}s to finish streaming a response`),
          ),
        STREAM_TOTAL_TIMEOUT_MS,
      );
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      console.error(
        `[ai:assist] ${id} produced no usable output over streaming, trying a single non-streaming call against the same model before moving on`,
        err,
      );
      // Real streaming (stream: true in the wire request — see
      // requestBodyValues in the AI SDK's own error log) has been observed
      // failing specifically against agent-server/Ollama with a 502
      // "agent loop failed: Expecting value: line 1 column 1 (char 0)" —
      // that exact message is Python's json.loads("") error, and it lines
      // up with a known upstream Ollama bug (ollama/ollama#9084, #9092):
      // enabling tools breaks stream:true on its OpenAI-compatible /v1
      // endpoint, silently returning one complete block instead of real
      // SSE chunks, which agent_loop.py's incremental parser then chokes
      // on. Our agent-server key has tools scope (see "local API
      // deployment.md"), so every request is in the affected shape.
      // generateText's doGenerate call never sends stream:true, so it
      // sidesteps that specific crash — but it doesn't rule out
      // agent_loop's own tool/skill step separately coming back empty in
      // non-streaming mode too (a 200 with empty text, not an error), so
      // that outcome is checked for below instead of assumed to mean
      // success.
      try {
        const { text, usage } = await generateText({
          model: resolveModel(id),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages,
          abortSignal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
        });
        if (!text.trim()) {
          throw new Error(`agent-server returned an empty response for ${id} (non-streaming)`);
        }
        const trailer = context === "knowledge" ? usageTrailer(usage) : "";
        return new Response(text + trailer, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch (fallbackErr) {
        lastError = fallbackErr;
        console.error(`[ai:assist] ${id} non-streaming fallback also failed, falling back to next model in chain`, fallbackErr);
        continue;
      }
    }

    // Reached only when the streaming try block above completed without
    // throwing — reader/first are guaranteed assigned, and first.done is
    // guaranteed false (checked above), so first.value is real content.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(first.value));
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            controller.enqueue(encoder.encode(chunk.value));
          }
          clearTimeout(timer);
          if (usagePromise) {
            try {
              const trailer = usageTrailer(await usagePromise);
              if (trailer) controller.enqueue(encoder.encode(trailer));
            } catch (usageErr) {
              // Non-fatal — the reply itself already streamed successfully;
              // losing the usage numbers isn't worth failing the message.
              console.error(`[ai:assist] ${id} usage lookup failed (non-fatal)`, usageErr);
            }
          }
          controller.close();
        } catch (err) {
          clearTimeout(timer);
          console.error(`[ai:assist] ${id} failed mid-stream`, err);
          controller.error(err);
        }
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("[ai:assist] every model in the fallback chain failed");
}

// --- draft (ingestion pipeline: raw extracted text -> a structured note) ---

const draftedNoteSchema = z.object({
  title: z
    .string()
    .describe("A concise, specific title for this note (not just the source's own title if a better one fits the content)"),
  what: z.string().describe("The core concept or fact, in your own words"),
  how: z.string().describe("The mechanism, process, or steps to apply it — empty string if not applicable"),
  why: z.string().describe("The context, reasoning, or motivation behind it — empty string if not applicable"),
  other: z.string().describe("Anything else worth keeping: caveats, open questions — empty string if none"),
  summary: z.string().describe("A single dense sentence summarizing the note"),
  tags: arrayOfStrings("3-6 short lowercase tags, reusable across notes"),
});

export type DraftedNote = z.infer<typeof draftedNoteSchema>;

export interface DraftSourceInput {
  sourceTitle: string;
  sourceText: string;
  sourceUrl?: string | null;
}

/**
 * Turns raw extracted text (from a URL, YouTube transcript, PDF, docx, or
 * xlsx — see src/lib/ingest/extract.ts) into a structured note in the
 * app's what/how/why/other template, with a summary and starter tags.
 * This is the one step in the ingestion pipeline that has to be an LLM —
 * everything upstream of it (fetching, parsing) is plain code per
 * PLAN.md §13.
 */
// --- format-article (AI Classroom: raw pasted content -> publication-ready markdown) ---

/** Every markdown image reference in a body — used by the formatter's
 * safety net to guarantee no uploaded image is lost in the rewrite. */
function extractImageRefs(markdown: string): string[] {
  return markdown.match(/!\[[^\]]*\]\([^)\s]+\)/g) ?? [];
}

export interface FormatArticleInput {
  /** User-entered topic; empty string if none. */
  topic: string;
  /** The raw pasted/typed content, in whatever shape it arrived. */
  content: string;
}

/**
 * The composer's auto-formatting pass: takes whatever the user dropped in
 * the box — a wall of plain text, a messy webpage paste, a transcript,
 * scattered notes, a link dump — and rewrites it into a clean,
 * publication-ready markdown article for the classroom page. It is a
 * *restructuring* pass, not a summarizer: every fact, number, quote, code
 * block, link, and uploaded image must survive.
 *
 * A safety net re-appends any image reference the model dropped, so an
 * uploaded image can never be silently lost; any other failure falls back
 * to the original body in the caller (publishClassroomArticle).
 */
export async function formatArticleContent(
  input: FormatArticleInput,
  modelId?: ModelId,
): Promise<string> {
  const { text } = await withFallback(
    "format-article",
    modelId ?? TASK_MODELS["format-article"],
    (model) =>
      generateText({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        system: [
      "You are a professional technical editor. Rewrite the user's raw content into a clean, well-structured, publication-ready markdown article. The input may be messy — a plain-text wall, a pasted webpage, chat/transcript fragments, a list of links, rough notes — your job is structure and polish, NOT summarization.",
      "",
      "Hard rules:",
      "- Preserve every fact, number, claim, quote, and example. Do not invent content, do not editorialize, do not drop information. Light copy-editing (grammar, flow, deduplication of exact repeats) is fine.",
      "- Keep every image reference ![alt](url) EXACTLY as-is (same URL). You may move an image to the most relevant section and improve its alt text, but never delete one.",
      "- Keep every link URL unchanged. Bare URLs become [descriptive text](url). YouTube links stay as plain links on their own line.",
      "- Keep code blocks verbatim, fenced with the right language tag (```python, ```ts, …). Keep inline code in backticks. Keep math ($…$) and ```mermaid blocks untouched.",
      "- Keep [[wikilinks]] exactly as written — they connect this article into a knowledge graph.",
      "- Write in the same language as the input (English or Chinese). Do not translate.",
      `- ${NO_BROWSING_INSTRUCTION} Format a bare URL as [descriptive text](url) using only what the URL/surrounding text already tells you — never visit it to find out what it is.`,
      "",
      "Structure (adapt to the content — skip what doesn't fit):",
      "- Do NOT add an H1 title; the page renders the title separately. Start with a short 1-3 sentence lead paragraph giving the BLUF (bottom line up front).",
      "- Organize the rest under descriptive ## section headings (### for subsections). Prefer 3-6 sections for a typical article.",
      "- Use bullet or numbered lists for enumerations and steps, tables for comparisons or structured data, and > blockquotes for key takeaways, definitions, or notable quotes.",
      "- Bold the handful of terms or conclusions a skimming reader must catch. Use --- sparingly to separate major parts.",
      "- End with a short '## Key takeaways' section (3-5 bullets) when the content is substantial enough to warrant one.",
      "",
      "Output ONLY the markdown article body — no commentary, no wrapping code fence around the whole thing.",
      "Use real line breaks between blocks, never the two characters backslash-n as literal text.",
        ].join("\n"),
        prompt: [
          input.topic ? `Topic: ${input.topic}` : null,
          `Raw content:\n${input.content}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
  );

  let formatted = unescapeLiteralWhitespace(text.trim());
  // Strip an accidental whole-body code fence.
  const fenced = formatted.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fenced) formatted = fenced[1].trim();

  // Safety net: any uploaded image the model lost gets re-appended so it
  // still renders (and stays attached to the note's media gallery).
  const originalImages = extractImageRefs(input.content);
  const missing = originalImages.filter((ref) => {
    const url = ref.match(/\(([^)\s]+)\)/)?.[1];
    return url ? !formatted.includes(url) : false;
  });
  if (missing.length > 0) {
    formatted += `\n\n${missing.join("\n\n")}\n`;
  }

  return formatted;
}

// --- publish-assist (AI Classroom: content -> learning guide) ---

const publishAssistSchema = z.object({
  topic: z
    .string()
    .describe("A concise, specific topic/title for this article (max ~80 chars)"),
  category: z
    .enum(classroomCategoryEnum.enumValues)
    .describe("Which AI Classroom subtab this article belongs under"),
  tags: arrayOfStrings("3-6 short lowercase tags reusable across articles"),
  summary: z.string().describe("A single dense sentence summarizing the article"),
  learningMap: z
    .string()
    .describe(
      "A markdown learning map for this topic: an ordered roadmap from beginner to competent, grouped into stages, each stage with 2-4 concrete things to learn and why they matter",
    ),
  handsOn: z
    .string()
    .describe(
      "Markdown step-by-step hands-on instructions to get practical experience with this topic: numbered steps, each concrete and actionable (commands, tools, or exercises), starting from zero setup",
    ),
  resources: z
    .array(resourceItemSchema())
    .min(3)
    .max(3)
    .describe("The top 3 learning resources for this topic"),
});

export type PublishAssistResult = z.infer<typeof publishAssistSchema>;
export type { ClassroomCategory };

export interface PublishAssistInput {
  /** User-entered topic; empty string means "generate one from the content". */
  topic: string;
  /** User-chosen subtab; undefined means "classify it yourself". */
  category?: ClassroomCategory;
  /** The raw article content (markdown; may contain URLs/YouTube links/images). */
  content: string;
}

/**
 * The "AI publish assist" behind AI Classroom (/classroom/new): given the
 * user's raw content it produces everything the article page needs — a
 * topic (if none was given), the subtab it belongs under, tags, a summary,
 * a learning map, step-by-step hands-on instructions, and the top three
 * suggested resources with links. One generateObject call so the pieces
 * stay consistent with each other.
 */
export async function publishAssist(
  input: PublishAssistInput,
  modelId?: ModelId,
): Promise<PublishAssistResult> {
  const { object } = await withFallback(
    "publish-assist",
    modelId ?? TASK_MODELS["publish-assist"],
    (model) =>
      generateObject({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: publishAssistSchema,
        system: [
          "You are the AI publish assistant for the 'AI Classroom' section of a personal knowledge base about AI.",
          "From the user's article content, produce: a topic, the best-fitting category, tags, a one-sentence summary, a learning map (staged roadmap in markdown), hands-on step-by-step instructions (numbered markdown steps a beginner can actually follow), and the top 3 learning resources.",
          "Categories: knowledge (concepts/theory), skill (abilities to practice), mcp (Model Context Protocol), api (APIs/SDKs), best-practices, use-cases, step-by-step (tutorials/guides), ai-evaluation (evals/benchmarks), ai-models (specific models), ai (general/anything else).",
          "Resources must be real and well-known (official documentation, GitHub repositories, established courses/channels). If unsure a URL is real, pick a better-known resource instead — never fabricate links.",
          "Write the topic, summary, learning map, and hands-on steps in the same language as the user's content (English or Chinese). Tags stay lowercase English.",
          "Write learningMap and handsOn as real markdown with real line breaks between headings, list items, and paragraphs — never the two characters backslash-n as literal text in place of a line break.",
          input.topic ? "Keep the user's topic unless it's clearly unusable; you may lightly clean it up." : "",
          input.category ? `The user already chose the category "${input.category}" — keep it.` : "",
          `${NO_BROWSING_INSTRUCTION} Suggest resources from what you already know of real, well-known documentation/repos/courses — do not browse to verify or discover one.`,
          `${JSON_ARRAY_SHAPE_REMINDER} "resources" specifically MUST be an array of exactly 3 objects shaped like {"title":"...","url":"https://...","description":"..."} — never an array of plain strings. Example of the exact shape expected for both fields: "tags":["prompt-engineering","fine-tuning"], "resources":[{"title":"Official Docs","url":"https://example.com/docs","description":"The canonical reference for this topic."}, ...2 more objects like it].`,
        ]
          .filter(Boolean)
          .join("\n"),
        prompt: [
          input.topic ? `Topic: ${input.topic}` : null,
          `Content:\n${input.content}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
    { objectMode: true },
  );

  return {
    ...object,
    topic: input.topic || object.topic,
    category: input.category ?? object.category,
    summary: unescapeLiteralWhitespace(object.summary),
    learningMap: unescapeLiteralWhitespace(object.learningMap),
    handsOn: unescapeLiteralWhitespace(object.handsOn),
  };
}

export async function draftNoteFromSource(
  input: DraftSourceInput,
  modelId?: ModelId,
): Promise<DraftedNote> {
  const { object } = await withFallback(
    "draft",
    modelId ?? TASK_MODELS.draft,
    (model) =>
      generateObject({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: draftedNoteSchema,
        system: `You turn raw source material into a personal knowledge-base note using the what/how/why/other template: what is the core idea, how does it work or get applied, why does it matter, and anything else worth keeping. Be concrete and specific to the source, not generic. Leave a field as an empty string if the source genuinely has nothing for it — don't pad. ${NO_BROWSING_INSTRUCTION} ${JSON_ARRAY_SHAPE_REMINDER} Example: "tags":["distributed-systems","consensus"].`,
        // Deliberately excludes input.sourceUrl — the note is drafted from
        // sourceText alone (already fetched/extracted upstream by plain
        // code, see lib/ingest/extract.ts), so the model never needs the
        // URL to do this job. The URL still reaches the page: it's stored
        // straight from input on the note itself (see ingest-actions.ts /
        // ingest-source.ts) and rendered as the "Source" link independent
        // of anything the model sees or returns. Not putting a real,
        // fetchable-looking URL in front of an agentic model in the first
        // place is a stronger guarantee than asking it not to act on one.
        prompt: [
          `Source title: ${input.sourceTitle}`,
          `Source text:\n${input.sourceText}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
    { objectMode: true },
  );
  return {
    ...object,
    what: unescapeLiteralWhitespace(object.what),
    how: unescapeLiteralWhitespace(object.how),
    why: unescapeLiteralWhitespace(object.why),
    other: unescapeLiteralWhitespace(object.other),
    summary: unescapeLiteralWhitespace(object.summary),
  };
}
