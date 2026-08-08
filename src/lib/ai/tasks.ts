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
  getModel,
  GROUNDED_FALLBACK_CHAIN,
  LOCAL_ONLY_CHAIN,
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
// All three registered models (models.ts) run through the same
// agent-server (every other provider was pulled out per explicit
// instruction — see models.ts's header comment), so this doesn't protect
// against the Mac being asleep or Funnel being down — every model fails
// together in that case. It DOES protect against one model erroring or
// timing out (a gpt-oss:120b cold-load timeout, a transient agent_loop
// failure) while the others are fine, and it's what makes the classroom
// composer's model picker a real "try my pick, fall back automatically"
// choice rather than just a label.

export type TaskName =
  | "assist"
  | "summarize"
  | "tag-and-link"
  | "translate"
  | "draft"
  | "publish-assist"
  // Diary + knowledge engine. The first two run local-only (raw diary text
  // never leaves the Mac — see LOCAL_ONLY_CHAIN in models.ts); "synthesize"
  // operates on already-distilled atoms and uses the normal chain.
  | "diary-title"
  | "distill"
  | "synthesize"
  // /trends' on-demand "generate/refresh summary" button (trends/actions.ts)
  // — reads already-public AI news + GitHub Trending data, so like
  // "synthesize" it's on the normal chain, no localOnly restriction.
  | "trends-overview";

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
  // All three default to the local model like everything else, but the two
  // diary-facing ones additionally pass { localOnly: true } at the call
  // site, which is what actually prevents falling through to Google — a
  // preferred-model default alone would not (see chainFor).
  "diary-title": DEFAULT_MODEL_ID,
  distill: DEFAULT_MODEL_ID,
  synthesize: DEFAULT_MODEL_ID,
  "trends-overview": DEFAULT_MODEL_ID,
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
  localOnly = false,
): ModelId[] {
  const base = objectMode
    ? OBJECT_FALLBACK_CHAIN
    : grounded
      ? GROUNDED_FALLBACK_CHAIN
      : FALLBACK_CHAIN;
  // `localOnly` is the diary privacy boundary (see LOCAL_ONLY_CHAIN in
  // models.ts). Intersecting rather than replacing keeps every other
  // guarantee above intact — a local-only OBJECT-mode call still excludes
  // any local model that can't do structured output, it just also can't
  // escape to Google.
  const chain = localOnly ? base.filter((id) => LOCAL_ONLY_CHAIN.includes(id)) : base;
  const unsafePreferred =
    (grounded && AGENTIC_MODELS.includes(preferred)) ||
    (objectMode && NO_STRUCTURED_OUTPUT_MODELS.includes(preferred)) ||
    // An explicit override pointing at a non-local model is IGNORED under
    // localOnly, exactly like an agentic override is under `grounded`:
    // honoring a caller's model preference is never worth quietly sending
    // diary text to a commercial API.
    (localOnly && !LOCAL_ONLY_CHAIN.includes(preferred));
  const safePreferred = unsafePreferred ? chain[0] : preferred;
  if (!safePreferred) {
    throw new Error(
      "No eligible model for this task — a local-only task found no local model registered (see LOCAL_ONLY_CHAIN in models.ts).",
    );
  }
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
// Distinguishes "the shared local agent-server itself is down, unreachable,
// or hung" from "this specific model gave a bad response" (wrong JSON shape,
// validation failure, etc). The former is pointless to retry against a
// different *local* model — see withFallback below for why — the latter
// genuinely can succeed on a different local model (e.g. a schema issue
// specific to qwen3.6, or gpt-oss:120b's cold-load timeout). Matches our
// own AbortSignal.timeout() firing (name "TimeoutError", or "AbortError"
// on older runtimes) and raw fetch-level failures (ECONNREFUSED/ENOTFOUND/
// "fetch failed") — not, e.g., a Zod validation error or a thrown
// application Error with an unrelated message.
function isInfraFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("network") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  );
}

async function withFallback<T>(
  label: TaskName,
  preferred: ModelId,
  attempt: (model: LanguageModel) => Promise<T>,
  options: {
    grounded?: boolean;
    objectMode?: boolean;
    /** Diary privacy boundary — see chainFor / LOCAL_ONLY_CHAIN. */
    localOnly?: boolean;
    onModelUsed?: (modelId: ModelId) => void;
  } = {},
): Promise<T> {
  // A mutable queue (not a plain for-of over the static chain array) so a
  // quality-gate failure (see the heavy-skip branch below) can prune
  // upcoming candidates instead of just running through all of them.
  const queue = chainFor(
    preferred,
    options.grounded ?? true,
    options.objectMode ?? false,
    options.localOnly ?? false,
  );
  let lastError: unknown;
  while (queue.length > 0) {
    const modelId = queue.shift() as ModelId;
    try {
      const result = await attempt(resolveModel(modelId));
      options.onModelUsed?.(modelId);
      return result;
    } catch (err) {
      lastError = err;
      console.error(`[ai:${label}] ${modelId} failed, falling back to next model in chain`, err);
      // All three registered models currently share one ProviderId
      // ("local" — see models.ts's header comment) — meaning they're all
      // the same single physical Mac/agent-server behind a Tailscale
      // Funnel, not independent services. When a failure looks like that
      // shared infrastructure being down/hung rather than a model-specific
      // bad response, trying the next local model is guaranteed to fail
      // the same way and costs another full TASK_TIMEOUT_MS doing it —
      // multiplied by however many sequential AI calls a task like
      // translateClassroomArticleAction makes, this is exactly what turns
      // one degraded agent-server into a multi-minute cascade that blows
      // through the page's maxDuration even after raising it (observed:
      // the action dying mid-guide-translation on a long article after the
      // body had already saved successfully). Stop the chain early here
      // instead of burning the clock on retries that can't succeed.
      const failedProvider = getModel(modelId).provider;
      if (isInfraFailure(err) && queue.every((id) => getModel(id).provider === failedProvider)) {
        console.error(
          `[ai:${label}] ${modelId}'s failure looks like the shared "${failedProvider}" agent-server is unreachable, not a model-specific issue — every remaining model in the chain is the same provider, so skipping them instead of retrying`,
        );
        break;
      }
      // A TranslationQualityError (tasks.ts's translate-quality gate)
      // means THIS model produced a bad response, not that the shared
      // agent-server is down — worth trying a different already-warm
      // model, but not worth paying a `heavy` model's cold VRAM-swap cost
      // (60s+, see models.ts's `heavy` flag) chasing what's frequently a
      // stylistic disagreement rather than a real error. Observed in
      // production: two warm models both flagged the same chunk for the
      // same reason, and gpt-oss-120b (heavy) cold-loading in response to
      // try a third time pushed a multi-chunk translation past Vercel's
      // 290s ceiling with nothing ever getting saved — worse than just
      // accepting a warm model's answer would have been. Skip any
      // remaining heavy candidate specifically for this error type; it's
      // still tried for anything else (a real thrown error, a
      // generateObject schema failure, etc.).
      if (err instanceof TranslationQualityError) {
        const before = queue.length;
        for (let i = queue.length - 1; i >= 0; i--) {
          if (getModel(queue[i]).heavy) queue.splice(i, 1);
        }
        if (queue.length < before) {
          console.error(
            `[ai:${label}] ${modelId} failed a quality check — skipping the remaining heavy model rather than paying its cold-load cost for it`,
          );
        }
      }
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
    // Same "missing field entirely" failure already handled for
    // publishAssist's `resources` below — observed in production on
    // `tags` too (both local Qwen models: an otherwise well-formed
    // topic/category/summary/learningMap/handsOn/resources object with
    // `tags` just absent). Coercing to [] costs nothing (tags are always
    // additive/optional to a working article) and is a far better outcome
    // than discarding an entire good generation over one missing array.
    if (val === undefined || val === null) return [];
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

// The inverse shape mistake from arrayOfStrings above: a field documented
// as a markdown STRING (numbered/bulleted steps as lines within one block
// of text) sometimes comes back as a JSON array of strings instead — one
// array item per step — observed in production on publishAssist's handsOn
// field against local/default. Reconstructing a numbered markdown list from
// the array is strictly better than throwing the whole generateObject call
// away over a shape mistake the content itself already has right.
function markdownStringOrList(description: string) {
  return z.preprocess((val) => {
    if (Array.isArray(val)) {
      return val
        .map((item, i) => `${i + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`)
        .join("\n");
    }
    return val;
  }, z.string().describe(description));
}

// Reinforces the exact JSON shape for array fields that local models have
// been observed to flatten into a single string — appended to any
// generateObject system prompt whose schema has an array-of-strings or
// array-of-objects field. Cheap insurance: costs a capable model nothing
// to already be doing this right, and measurably helps a weaker one.
const JSON_ARRAY_SHAPE_REMINDER =
  'Return real JSON, not a description of JSON. Every field described as a list/array MUST be an actual JSON array of separate items — e.g. ["item one","item two"], never a single comma-separated string like "item one, item two". Every field described as a list of objects MUST be an array of real JSON objects with each named property set, never a list of plain strings.';

// Both local models are Qwen3-family, which hybrid-reason by default:
// unless told otherwise, they can spend part or all of a turn on internal
// chain-of-thought before (or instead of) answering. That's a plausible,
// consistent explanation for a whole class of failures seen in production
// across this file's generateObject calls (extract/reconcile/synthesize)
// that plain schema coercion can't fix, because there's no JSON to coerce
// when it happens: usage shows real output tokens spent but an empty
// `text`/`content` ("the model did not return a response", finishReason
// "stop" — not a truncation), and separately a response that was a
// hallucinated tool-call envelope (mcp__sequentialthinking__...) instead
// of an answer. Both look like the model reasoning itself into never
// producing (or producing a tool call instead of) the requested object.
// Qwen3's documented soft switch is the literal string "/no_think"
// appended to the user turn (see Qwen3's usage guide) — distinct from the
// hard enable_thinking=False switch, which would have to be set in
// agent-server's chat template config on the Mac, outside this repo's
// reach. A structured-output task never uses visible reasoning (only the
// final JSON matters), so suppressing it costs nothing here even if this
// particular local deployment turns out to ignore the switch.
const NO_THINKING_SUFFIX = "\n\n/no_think";

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

This may be one fragment of a longer document that was split into pieces before translation. Translate ONLY the text given, in full, start to end — never summarize, shorten, condense, or skip any part of it, however long it is. Do not add an introduction, conclusion, or any commentary — your output is spliced directly between other translated fragments (each fragment already starts and ends at a complete block boundary, like a paragraph or heading — never mid-sentence).

Output real line breaks between blocks, never the two characters backslash-n as text.

${NO_BROWSING_INSTRUCTION} This includes any URL that appears inside the text being translated — translate the link text if there is one, leave the URL itself untouched, and do not visit it.

Return only the translation, no commentary.`;
}

// --- TRANSLATION QUALITY VALIDATION ---
//
// generateText returning 200/non-empty/finishReason !== "length" is NOT
// the same as "this chunk actually got translated" — observed in
// production against the local default model (see the "Local Server
// Latency Investigation" article's own Chinese translation): a short
// chunk sometimes comes back as a conversational refusal or clarifying
// question ("I need the original English text you want translated...")
// instead of a translation, and a long, numeric/technical chunk sometimes
// comes back with dropped or duplicated sentences, or drifts into the
// wrong language. Both look identical to a good response at the
// generateText call site — no thrown error, no truncation — which is why
// they were previously spliced straight into the saved article.
// detectTranslationProblem() is the check that closes that gap; a
// non-null result is turned into a thrown TranslationQualityError (see
// translateChunk/translateNote below) so it flows through the exact same
// withFallback() escalation as a network error: try the next model in the
// chain instead of silently keeping a bad answer from this one.

/** A model that ignores "return only the translation, no commentary"
 * tends to do so in one of a handful of recognizable shapes — a
 * clarifying question, an apology/refusal, a request for the source text
 * — in either language. This isn't an exhaustive classifier, just enough
 * to catch the failure mode actually observed. */
const REFUSAL_PATTERNS: RegExp[] = [
  /please provide/i,
  /could you (please )?provide/i,
  /i need the (original|source) (text|content)/i,
  /as an ai( language model)?/i,
  /i('m| am) sorry,? (but )?i (can'?t|cannot|am unable to)/i,
  /i (can'?t|cannot|am unable to) (translate|assist|help)/i,
  /请提供/,
  /我需要(原文|原始文本|源文本)/,
  /作为(一个)?(AI|人工智能)/,
  /很抱歉[，,]?(我)?(无法|不能)/,
];

function looksLikeRefusalOrMeta(text: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(text));
}

/** Strips fenced/inline code and the §URLn§ placeholders (protectUrls
 * below) before the language/structure checks run — none of that content
 * is ever expected to be in the target language, and code left untouched
 * is the system prompt being followed correctly, not a translation
 * failure. */
function stripNonProseForChecks(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/§URL\d+§/g, " ");
}

const CJK_PATTERN = /[一-鿿㐀-䶿]/g;
const LETTER_PATTERN = /[A-Za-z一-鿿㐀-䶿]/g;

/** Fraction of CJK characters among "letters" (Latin + CJK) in the text,
 * or -1 if there isn't enough letter content to judge anything from (a
 * chunk that's just a heading, a lone code fence, or a table of numbers
 * shouldn't be flagged for not "looking Chinese enough"). */
function cjkRatio(text: string): number {
  const letters = text.match(LETTER_PATTERN);
  if (!letters || letters.length < 20) return -1;
  const cjk = text.match(CJK_PATTERN);
  return (cjk?.length ?? 0) / letters.length;
}

/** Counts of the markdown structure elements translateSystemPrompt
 * explicitly promises to preserve 1:1 (heading markers, list items, table
 * rows) — a cheap, code-level check on the one guarantee a prompt-only
 * instruction can't enforce by itself. A large mismatch is exactly the
 * shape of the "list collapsed into one paragraph" / dropped-section bugs
 * seen before. */
function structureCounts(text: string): {
  headings: number;
  listItems: number;
  tableRows: number;
} {
  let headings = 0;
  let listItems = 0;
  let tableRows = 0;
  for (const line of text.split("\n")) {
    if (/^\s{0,3}#{1,6}\s/.test(line)) headings++;
    else if (/^\s*([-*+]|\d+[.)])\s/.test(line)) listItems++;
    else if (/^\s*\|.*\|\s*$/.test(line)) tableRows++;
  }
  return { headings, listItems, tableRows };
}

/** Inline code spans and PascalCase/acronym-style identifiers (each capital
 * letter counts as its own "hump", so this also catches all-caps acronyms
 * like "SVM" or "NN") — product names, class names, acronyms, and similar
 * identifiers that a real translation has to carry over verbatim (the
 * system prompt already asks for exactly that: inline code untouched,
 * proper nouns not translated). Deliberately loose/overinclusive — this
 * is a signal, not a strict parser.
 *
 * Multi-word Title Case phrases ("Claude Code", "BashTool's API") are only
 * included when target === "en", i.e. the source is Chinese and an English
 * phrase embedded in it is anomalous enough to be a reliable "this should
 * survive verbatim" signal. When the source is English (target === "zh"),
 * the exact same shape matches ordinary capitalized headers and generic
 * technical terms ("Naive Bayes", "Best Use Cases", "Supervised Learning
 * Algorithms") that a correct translation is supposed to render in Chinese.
 * Including them there produced false positives that rejected genuine zh
 * translations from every model in the fallback chain (article 186, an ML
 * algorithms cheat sheet, 2026-08-03) — see checkKeyTermsPreserved. */
function extractKeyTerms(text: string, target: "en" | "zh"): string[] {
  const terms = new Set<string>();
  for (const m of text.matchAll(/`([^`]{2,40})`/g)) terms.add(m[1].trim());
  for (const m of text.matchAll(/\b[A-Z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/g)) terms.add(m[0]);
  if (target === "en") {
    for (const m of text.matchAll(/\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){1,3}\b/g)) terms.add(m[0]);
  }
  return Array.from(terms);
}

/**
 * Catches a different failure mode than every check below it: a response
 * that's fluent, correctly formatted, and genuinely in the target
 * language — but about a different topic than the source chunk entirely.
 * Observed in production: a chunk from a Chinese article specifically
 * about Claude Code's BashTool came back, in English, as a fluent,
 * well-structured, entirely unrelated article about K12 cybersecurity
 * curricula. Nothing above catches that — it's not empty, not a refusal,
 * it's the right language, and hallucinated prose can easily mimic the
 * same heading/list shape. But a genuine translation of a chunk that
 * mentions "Claude Code" and "BashTool" repeatedly has no reason to drop
 * those exact strings; a chunk that dropped nearly all of them has almost
 * certainly stopped being about the source text at all. */
function checkKeyTermsPreserved(
  original: string,
  translated: string,
  target: "en" | "zh",
): string | null {
  const terms = extractKeyTerms(original, target);
  // A couple of incidental matches isn't meaningful evidence either way —
  // only judge a chunk with enough distinctive terms to say something.
  if (terms.length < 2) return null;
  const survived = terms.filter((term) => translated.includes(term));
  const ratio = survived.length / terms.length;
  if (ratio < 0.4) {
    return `most of the source's specific terms/names are missing from the output (${survived.length}/${terms.length} survived — e.g. ${terms.slice(0, 5).join(", ")})`;
  }
  return null;
}

/**
 * Returns a short human-readable problem description if `translated`
 * doesn't look like a genuine translation of `original`, or null if it
 * passes. Deliberately conservative — a false positive just costs a retry
 * against the next model in the fallback chain; a false negative is the
 * exact bug this exists to catch, so each check errs toward flagging.
 */
function detectTranslationProblem(
  original: string,
  translated: string,
  target: "en" | "zh",
): string | null {
  const trimmed = translated.trim();
  if (!trimmed && original.trim()) return "empty output for non-empty input";

  if (looksLikeRefusalOrMeta(trimmed)) {
    return "output looks like a refusal or clarifying question, not a translation";
  }

  const termProblem = checkKeyTermsPreserved(original, trimmed, target);
  if (termProblem) return termProblem;

  const originalProse = stripNonProseForChecks(original);
  const translatedProse = stripNonProseForChecks(trimmed);

  if (target === "zh") {
    const outRatio = cjkRatio(translatedProse);
    const inRatio = cjkRatio(originalProse);
    if (outRatio >= 0 && outRatio < 0.15 && (inRatio < 0 || inRatio < 0.05)) {
      return `output has almost no Chinese characters (ratio ${outRatio.toFixed(2)})`;
    }
  } else {
    const outRatio = cjkRatio(translatedProse);
    if (outRatio > 0.3) {
      return `output is still mostly Chinese characters (ratio ${outRatio.toFixed(2)})`;
    }
  }

  const before = structureCounts(original);
  const after = structureCounts(translated);
  const totalBefore = before.headings + before.listItems + before.tableRows;
  // Only flag content that appears to have been LOST — headings or list
  // items that disappeared. An INCREASE (e.g. a run of values reformatted
  // into a table) doesn't reliably mean anything was dropped — observed
  // in production as a false trigger (a chunk went from 0 table rows to
  // 6, with two different models agreeing, which looks like a legitimate
  // reformatting of tabular-looking content rather than two independent
  // models making the identical mistake). A net decrease has no such
  // innocent explanation and matches the actual bug this check exists
  // for (a run of list items collapsed into one paragraph), so only
  // decreases count toward the drift total.
  const drop =
    Math.max(0, before.headings - after.headings) +
    Math.max(0, before.listItems - after.listItems) +
    Math.max(0, before.tableRows - after.tableRows);
  // Allow a drop of 1 outright (a boundary line the regex just barely
  // miscounts either side of isn't worth failing over); beyond that,
  // require the drop to be a real fraction of the total so one dropped
  // bullet in a huge chunk doesn't false-positive.
  if (drop > 1 && totalBefore > 0 && drop / totalBefore > 0.2) {
    return `markdown structure lost content (headings/list-items/table-rows ${before.headings}/${before.listItems}/${before.tableRows} -> ${after.headings}/${after.listItems}/${after.tableRows})`;
  }

  return null;
}

/** Thrown by translateChunk/translateNote when a response passes
 * generateText/generateObject with no error but fails
 * detectTranslationProblem — deliberately a plain Error (not matched by
 * isInfraFailure in withFallback above), so the chain treats it as "this
 * model gave a bad response, try the next one" rather than "the shared
 * agent-server is down, stop retrying" — see withFallback's isInfraFailure
 * comment for that distinction. */
class TranslationQualityError extends Error {
  constructor(reason: string) {
    super(`translation failed quality check: ${reason}`);
    this.name = "TranslationQualityError";
  }
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
      }).then((r) => {
        // A still-truncated response ("length") is handled by the
        // split-and-retry logic below, not here — a half-finished chunk
        // can fail these checks for reasons that have nothing to do with
        // translation quality (cut off mid-sentence, mid-CJK-character).
        if (r.finishReason !== "length") {
          const problem = detectTranslationProblem(chunk, r.text, target);
          if (problem) throw new TranslationQualityError(problem);
        }
        return r;
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
    // `a` originally ended at (or right after) a blank line — findSplitPoint
    // snaps the split there specifically so neither half cuts through a
    // block — but the `.trim()` a few lines up strips that blank line back
    // off of `ta` once translated. Re-adding it here is what keeps a
    // paragraph and the list/heading that followed it from being fused into
    // one unbroken block once ta+tb are concatenated (this is the same
    // fix, and the same reasoning, as the top-level chunk join in
    // translateWithMeta below).
    return `${ta}\n\n${tb}`;
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
  // sequentially, not concurrently — all three registered models
  // (models.ts) run through the same physical Mac Studio / single Ollama
  // instance, which generates one response at a time regardless of which
  // of the three is asked. Firing every chunk's generateText call at once
  // via Promise.all doesn't
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
  // chunkMarkdown's own chunks are built from splitIntoBlocks, which keeps
  // each block's trailing blank line specifically so `chunks.join("")`
  // reconstructs the ORIGINAL text exactly (see its doc comment) — but
  // translateChunk above ends every translated chunk with `.trim()`, which
  // strips that same trailing blank line back off before it ever gets
  // here. Joining with "" the way the original chunks do therefore fuses
  // every chunk boundary — a paragraph ending one chunk and a heading or
  // list starting the next lose their separating blank line and collapse
  // into a single run-on block once rendered. This is exactly the
  // formatting-loss bug seen on longer translated classroom articles (the
  // original English, produced in one un-chunked generateText call, never
  // hits this path). Every chunk here is a whole, complete markdown
  // block(s) — never a mid-block fragment — so a blank line between
  // consecutive chunks is always the correct separator to restore.
  return restoreUrls(translatedChunks.join("\n\n"), urls);
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
      }).then((r) => {
        // Same quality gate as translateChunk above, applied per field —
        // a generateObject call can return a schema-valid object whose
        // string fields are still a refusal/clarifying question or the
        // wrong language, and that's just as invisible to the caller as
        // the plain-text case.
        const fields = ["title", "what", "how", "why", "other"] as const;
        for (const field of fields) {
          const problem = detectTranslationProblem(note[field] ?? "", r.object[field] ?? "", target);
          if (problem) throw new TranslationQualityError(`field "${field}": ${problem}`);
        }
        return r;
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
    // result.usage below is typed PromiseLike<LanguageModelUsage> by the AI
    // SDK (a bare thenable, not a full Promise — no .catch/.finally), so
    // this has to be PromiseLike too rather than Promise; `await` works the
    // same either way where usagePromise is consumed below.
    let usagePromise: PromiseLike<UsageLike> | undefined;
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
  handsOn: markdownStringOrList(
    "Markdown step-by-step hands-on instructions to get practical experience with this topic: numbered steps, each concrete and actionable (commands, tools, or exercises), starting from zero setup",
  ),
  // Ideally exactly 3 (the prompt below asks for that explicitly), but not
  // enforced as a hard minimum — local/default has been observed omitting
  // this field entirely on an otherwise-good response (handsOn's example is
  // the same generation: everything else came back correctly-shaped, this
  // one field just didn't). A missing/empty field failing the whole
  // generateObject call and throwing away a good topic/summary/learning-map
  // is a worse outcome than an article that lands with 1-2 resources (or
  // none, worth re-running "Generate AI guide" for) instead of exactly 3.
  resources: z.preprocess(
    (val) => (val === undefined || val === null ? [] : val),
    z
      .array(resourceItemSchema())
      .max(3)
      .describe(
        "The top 3 learning resources for this topic — never omit this field; include fewer than 3 real ones if that's genuinely all that fit, rather than leaving it out",
      ),
  ),
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
          `${JSON_ARRAY_SHAPE_REMINDER} "resources" specifically MUST be an array of exactly 3 objects shaped like {"title":"...","url":"https://...","description":"..."} — never an array of plain strings, and never omitted from the response even if you can only think of 1 or 2 real ones. Example of the exact shape expected for both fields: "tags":["prompt-engineering","fine-tuning"], "resources":[{"title":"Official Docs","url":"https://example.com/docs","description":"The canonical reference for this topic."}, ...2 more objects like it].`,
          `"handsOn" specifically MUST be a single JSON string containing markdown (numbered steps as lines of text within that one string, e.g. "1. Do X\\n2. Do Y\\n3. Do Z") — never a JSON array with one step per array item.`,
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

// =====================================================================
// DIARY + KNOWLEDGE ENGINE
// =====================================================================
//
// PRIVACY: diaryTitleAndTags and extractKnowledgeAtoms both pass
// { localOnly: true }, which structurally removes every non-local model
// from their fallback chain (see chainFor / LOCAL_ONLY_CHAIN in models.ts).
// Raw diary text therefore has no code path to a commercial API, even when
// the Mac is unreachable — in that case these throw and the caller retries
// later. synthesizeInsights deliberately does NOT set the flag: it reads
// distilled atoms (one abstraction step off raw text), where availability
// is worth more than the marginal privacy delta.

// --- diary-title (auto subject line + life tags) ---

const diaryTitleSchema = z.object({
  title: z
    .string()
    .describe(
      "A short, specific, human subject line for this diary entry (max ~70 chars). Concrete and evocative of what actually happened, never generic like 'Daily entry' or 'My thoughts'.",
    ),
  tags: arrayOfStrings(
    "2-5 lowercase tags. Prefer the provided life-area vocabulary; add specific free-form tags only when they add real recall value.",
  ),
  mood: z
    .enum(["great", "good", "neutral", "low", "rough"])
    .describe("Overall emotional tone of the entry, inferred from how it's written"),
});

export type DiaryTitleResult = z.infer<typeof diaryTitleSchema>;

/**
 * Names and tags a diary entry from its content — the "subject title auto
 * generated" half of the composer (the user can always type their own,
 * which sets titleSource="manual" and stops this from overwriting it).
 *
 * `lifeAreas` is the curated vocabulary from lib/knowledge/taxonomy.ts,
 * passed in rather than imported so this module stays free of knowledge-
 * layer imports (tasks.ts is the AI boundary; it shouldn't know about the
 * knowledge domain).
 */
export async function diaryTitleAndTags(
  input: { body: string; scratch?: string; occurredAt: Date },
  lifeAreas: string[],
  modelId?: ModelId,
): Promise<DiaryTitleResult> {
  const { object } = await withFallback(
    "diary-title",
    modelId ?? TASK_MODELS["diary-title"],
    (model) =>
      generateObject({
        model,
        maxOutputTokens: 1024,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: diaryTitleSchema,
        system: [
          "You name and tag personal diary entries. You are reading someone's private journal — be respectful, literal, and never moralize, advise, or editorialize.",
          "",
          `Preferred life-area tags (use these where they fit): ${lifeAreas.join(", ")}.`,
          "You may add up to 2 specific free-form tags beyond that list when the entry has a concrete recurring subject worth tracking (a project name, a place, an activity). Lowercase, hyphenated.",
          "",
          "The title must read like something the author would recognize at a glance in a list a year from now — reference the actual specific thing that happened, not the category of thing.",
          "Write the title in the same language the entry is written in.",
          "",
          NO_BROWSING_INSTRUCTION,
          JSON_ARRAY_SHAPE_REMINDER,
          'Example: {"title":"Rewired the deploy pipeline, finally green","tags":["work","side-project"],"mood":"good"}',
        ].join("\n"),
        prompt: [
          `Date: ${input.occurredAt.toISOString().slice(0, 10)}`,
          `Entry:\n${input.body}`,
          input.scratch?.trim() ? `Scratch notes:\n${input.scratch}` : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
    { objectMode: true, localOnly: true },
  );
  return { ...object, title: object.title.trim().slice(0, 200) };
}

// --- distill (diary entry -> candidate knowledge atoms) ---

const ATOM_KINDS = [
  "fact",
  "preference",
  "pattern",
  "goal",
  "person",
  "project",
  "skill",
  "question",
  "idea",
] as const;

// The local models occasionally invent a plausible-sounding "kind" that
// isn't one of the nine above ("strategy", "approach", "methodology",
// "ongoing_question", "tooling", ... all observed in practice) even with
// the prompt spelling the exact tokens out — and because atoms is a plain
// z.array(atomCandidateSchema), ONE bad kind fails the WHOLE array,
// silently discarding every other good atom the model found in that
// entry. This coerces the common near-misses onto the closest real kind
// before validation runs, falling back to "idea" (closest thing to a
// catch-all) for anything still unrecognized, so an odd label costs one
// atom's precision instead of the entire extraction.
const ATOM_KIND_ALIASES: Record<string, (typeof ATOM_KINDS)[number]> = {
  strategy: "pattern",
  approach: "pattern",
  methodology: "pattern",
  tooling: "skill",
  tool: "skill",
  technique: "skill",
  ongoing_question: "question",
  open_question: "question",
  belief: "preference",
  value: "preference",
  habit: "pattern",
  routine: "pattern",
  insight: "idea",
  observation: "fact",
  relationship: "person",
  milestone: "goal",
  plan: "goal",
};

function coerceAtomKind(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ATOM_KINDS as readonly string[]).includes(normalized)) return normalized;
  return ATOM_KIND_ALIASES[normalized] ?? "idea";
}

const atomCandidateSchema = z.object({
  kind: z
    .preprocess(coerceAtomKind, z.enum(ATOM_KINDS))
    .describe("What type of knowledge this is"),
  statement: z
    .string()
    .describe(
      "ONE self-contained sentence, written in the third person about the author (e.g. 'Prefers deep work before 10am'). Must stand alone without the entry for context.",
    ),
  // detail/excerpt/confidence coerced from missing/wrong-typed rather than
  // required outright — observed failure mode alongside the kind mismatch
  // above: a local model sometimes omits one of these three entirely
  // instead of writing "detail":"" as the prompt's example shows, which
  // used to fail the whole atom (and thus the whole array) over a field
  // whose own description already says empty/best-effort is fine.
  detail: z
    .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
    .describe("Optional supporting nuance or caveat. Empty string if there's nothing to add."),
  excerpt: z
    .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
    .describe("The short passage from the entry that justifies this, quoted near-verbatim."),
  confidence: z
    .preprocess((v) => (typeof v === "number" ? v : 0.5), z.number())
    .describe(
      "0.0-1.0 — how strongly this single entry supports the claim. A passing mention is ~0.3; an explicit clear statement is ~0.8.",
    ),
});

const distillSchema = z.object({
  atoms: z.preprocess(
    (val) => {
      if (val === undefined || val === null) return [];
      // A content-rich entry (e.g. pasted meeting notes) can legitimately
      // surface more than 8 candidates, and the local model sometimes
      // returns all of them instead of picking the top 8 as instructed.
      // Slicing here means an over-generous response still saves the
      // first 8 atoms instead of failing max() validation and losing the
      // whole entry's extraction to a single array-length mismatch.
      return Array.isArray(val) ? val.slice(0, 8) : val;
    },
    z
      .array(atomCandidateSchema)
      .max(8)
      .describe("The durable knowledge worth remembering from this entry. Zero is a valid answer."),
  ),
});

export type AtomCandidate = z.infer<typeof atomCandidateSchema>;

/**
 * The core extraction step: reads one diary entry and proposes small,
 * standalone claims worth remembering. Everything downstream (dedupe,
 * reinforcement, contradiction, decay) operates on these — see
 * lib/knowledge/distill.ts.
 *
 * The prompt fights the two failure modes that make this kind of feature
 * useless in practice: (1) restating the entry as "atoms" (transient
 * events aren't knowledge), and (2) inventing generic self-help platitudes
 * that would be true of anyone. Both are called out explicitly with
 * examples, because a weaker local model will happily do either.
 */
export async function extractKnowledgeAtoms(
  input: { title: string; body: string; scratch?: string; occurredAt: Date },
  modelId?: ModelId,
): Promise<AtomCandidate[]> {
  const { object } = await withFallback(
    "distill",
    modelId ?? TASK_MODELS.distill,
    (model) =>
      generateObject({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: distillSchema,
        system: [
          "You extract DURABLE knowledge from a person's private diary entry, building a long-term model of who they are, what they're working on, and how they operate. You are reading private material: be precise and respectful, never judgmental.",
          "",
          "Extract only things that will still be TRUE and USEFUL months from now:",
          "- preferences and working habits ('Thinks best in the morning, schedules meetings after lunch')",
          "- ongoing projects and their state ('Building a personal knowledge base app called BrainBank')",
          "- goals and intentions ('Wants to ship the diary feature before the end of the quarter')",
          "- people who matter and what about them ('Daughter Mia is learning piano; practices together on weekends')",
          "- skills being built, and evidence of progress",
          "- recurring patterns the author may not have named themselves",
          "- open questions and unresolved threads",
          "- ideas worth developing later",
          "",
          "DO NOT extract:",
          "- transient events with no lasting significance ('Had pasta for lunch', 'It rained today')",
          "- restatements of the entry — you are distilling, not summarizing",
          "- generic advice or platitudes true of anyone ('Rest is important', 'Consistency matters'). Every atom must be specific to THIS person.",
          "- anything you inferred beyond what the text supports. No speculation.",
          "",
          "Write every statement in the third person about the author, self-contained, so it makes sense read on its own years later with no other context.",
          "Returning an empty array is correct and expected for a mundane entry. Never pad.",
          "Write statements in the same language the entry is written in.",
          "",
          NO_BROWSING_INSTRUCTION,
          JSON_ARRAY_SHAPE_REMINDER,
          'Example: {"atoms":[{"kind":"preference","statement":"Prefers to do deep technical work before 10am and batch meetings in the afternoon","detail":"Has said this holds even on days that start badly.","excerpt":"got the hard part done before standup again","confidence":0.7}]}',
        ].join("\n"),
        prompt:
          [
            `Date: ${input.occurredAt.toISOString().slice(0, 10)}`,
            `Title: ${input.title}`,
            `Entry:\n${input.body}`,
            input.scratch?.trim() ? `Scratch notes (raw fragments — mine these too):\n${input.scratch}` : null,
          ]
            .filter(Boolean)
            .join("\n\n") + NO_THINKING_SUFFIX,
      }),
    { objectMode: true, localOnly: true },
  );

  return object.atoms.map((a) => ({
    ...a,
    statement: unescapeLiteralWhitespace(a.statement).trim().slice(0, 500),
    detail: unescapeLiteralWhitespace(a.detail ?? "").trim(),
    excerpt: (a.excerpt ?? "").trim().slice(0, 1000),
    // Clamp — a model returning 1.5 or -0.2 shouldn't poison the
    // confidence arithmetic in reinforceAtom.
    confidence: Math.min(1, Math.max(0, Number(a.confidence) || 0.5)),
  }));
}

// --- reconcile (is this candidate the same belief as an existing atom?) ---

const RECONCILE_VERDICTS = ["same", "contradicts", "refines", "distinct"] as const;

function asVerdict(value: unknown): (typeof RECONCILE_VERDICTS)[number] | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return (RECONCILE_VERDICTS as readonly string[]).includes(normalized)
    ? (normalized as (typeof RECONCILE_VERDICTS)[number])
    : undefined;
}

/**
 * Observed in production: the reconcile call's two-field schema
 * ({verdict, rationale}) is small enough that the local models frequently
 * substitute their own field names for it instead — real failures logged
 * include {answer,reasoning}, {result}, {relationship,explanation}, and
 * {response:{label}} — even though the *value* is almost always one of the
 * four valid verdict words. Failing the whole distillation run over a
 * field-naming mismatch throws away a correct answer, so this scans the
 * raw response for a recognizable verdict word under any of the names
 * actually seen (plus one level of nesting) before validating strictly.
 * A response with no verdict word anywhere (e.g. a hallucinated tool call)
 * still falls through to the strict schema below and fails loudly, which
 * is correct — there's nothing to recover there.
 */
function coerceReconcileShape(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;

  const rationaleOf = (o: Record<string, unknown>) => {
    const r = o.rationale ?? o.reasoning ?? o.explanation ?? o.reason;
    return typeof r === "string" ? r : "";
  };

  for (const key of ["verdict", "answer", "result", "relationship", "label"]) {
    const v = asVerdict(obj[key]);
    if (v) return { verdict: v, rationale: rationaleOf(obj) };
  }

  for (const key of ["response", "result", "answer", "output"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object") {
      const nestedObj = nested as Record<string, unknown>;
      for (const nk of ["verdict", "answer", "result", "relationship", "label"]) {
        const v = asVerdict(nestedObj[nk]);
        if (v) return { verdict: v, rationale: rationaleOf(nestedObj) || rationaleOf(obj) };
      }
    }
  }

  // Last resort: any value anywhere that's a bare verdict word.
  for (const v of Object.values(obj)) {
    const found = asVerdict(v);
    if (found) return { verdict: found, rationale: rationaleOf(obj) };
  }

  return raw; // let the strict schema fail loudly with a clear error
}

const reconcileSchema = z.preprocess(
  coerceReconcileShape,
  z.object({
    verdict: z
      .enum(RECONCILE_VERDICTS)
      .describe(
        "same = restates the existing atom; contradicts = incompatible with it; refines = narrows/extends it; distinct = unrelated",
      ),
    rationale: z
      .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
      .describe("One short sentence explaining the verdict"),
  }),
);

export type ReconcileVerdict = z.infer<typeof reconcileSchema>;

/**
 * Vector similarity gets us CANDIDATE matches; it can't tell "I now prefer
 * mornings" from "I no longer prefer mornings" — those embed almost
 * identically while meaning opposite things. This second pass makes that
 * call, and it's what lets the knowledge base UPDATE a belief instead of
 * storing both halves of a contradiction forever.
 */
export async function reconcileAtom(
  candidate: { kind: string; statement: string },
  existing: { kind: string; statement: string; detail: string },
  modelId?: ModelId,
): Promise<ReconcileVerdict> {
  const { object } = await withFallback(
    "distill",
    modelId ?? TASK_MODELS.distill,
    (model) =>
      generateObject({
        model,
        // Was 512 — observed in production truncating mid-response
        // (finishReason: "length", no object generated) on the more
        // verbose local model even though its actual JSON is tiny; this
        // task's output is two short fields, so 2048 is generous headroom
        // rather than a real cost, and it's cheap insurance against the
        // same truncation recurring on a wordier model in the chain.
        maxOutputTokens: 2048,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: reconcileSchema,
        system: [
          "You compare two claims about the same person and decide their relationship. Be strict and literal.",
          "",
          "- 'same': they assert the same thing, even if worded differently.",
          "- 'contradicts': both cannot be true of the person at the same time. Pay close attention to negation, reversal, and change over time — 'prefers X' vs 'no longer prefers X' is a contradiction, not a match.",
          "- 'refines': the new claim narrows, qualifies, or adds detail to the existing one without conflicting.",
          "- 'distinct': they're about different things.",
          "",
          "When genuinely unsure between 'same' and 'distinct', answer 'distinct' — a duplicate atom is easy to merge later, but wrongly collapsing two different beliefs silently destroys information.",
          'Respond with a JSON object with exactly two keys: "verdict" (one of "same", "contradicts", "refines", "distinct") and "rationale" (one short sentence). Do not use any other key names.',
          NO_BROWSING_INSTRUCTION,
        ].join("\n"),
        prompt:
          [
            `Existing (${existing.kind}): ${existing.statement}`,
            existing.detail ? `Existing detail: ${existing.detail}` : null,
            `New (${candidate.kind}): ${candidate.statement}`,
          ]
            .filter(Boolean)
            .join("\n") + NO_THINKING_SUFFIX,
      }),
    { objectMode: true, localOnly: true },
  );
  return object;
}

// --- synthesize (atoms -> highlights, themes, ideas, business angles) ---

const INSIGHT_KINDS = ["highlight", "theme", "idea", "business", "recommendation", "reflection"] as const;

function asInsightKind(value: unknown): (typeof INSIGHT_KINDS)[number] | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return (INSIGHT_KINDS as readonly string[]).includes(normalized)
    ? (normalized as (typeof INSIGHT_KINDS)[number])
    : undefined;
}

/**
 * Same failure mode as coerceReconcileShape above, seen in production on
 * this call too: the model wrote a genuinely good insight but under
 * {type, content, atoms} instead of {kind, title, body, atomIndexes} — one
 * long paragraph with no separate title at all. Rather than lose well-
 * written content to a field-naming/shape mismatch, this renames the
 * fields it recognizes and, when there's no separate title, carves one out
 * of the leading clause of `content` (several real responses wrote a
 * natural "Punchy title: body" sentence into that single string) or falls
 * back to a truncation.
 */
function coerceInsightShape(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;

  const kind = obj.kind ?? obj.type ?? obj.insightType ?? obj.category;
  const atomIndexes = obj.atomIndexes ?? obj.atoms ?? obj.atomIds ?? obj.indexes ?? obj.sources;

  let title = typeof obj.title === "string" ? obj.title : undefined;
  let body = typeof obj.body === "string" ? obj.body : undefined;

  if ((!title || !body) && typeof obj.content === "string" && obj.content.trim()) {
    const content = obj.content.trim();
    // "Punchy title: rest of the insight" — several observed responses
    // wrote exactly this shape into the single content string.
    const split = content.match(/^([\s\S]{10,90}?)[:—-]\s+([\s\S]+)$/);
    if (split) {
      title ??= split[1].trim();
      body ??= split[2].trim();
    } else {
      title ??= content.length > 90 ? `${content.slice(0, 87).trim()}…` : content;
      body ??= content;
    }
  }

  return { kind, title, body, atomIndexes };
}

const insightSchema = z.preprocess(
  coerceInsightShape,
  z.object({
    kind: z
      .preprocess(asInsightKind, z.enum(INSIGHT_KINDS))
      .describe("What type of insight this is"),
    title: z
      .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
      .describe("A punchy one-line title (max ~90 chars)"),
    body: z
      .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
      .describe(
        "2-5 sentences of markdown. Concrete and specific to this person's actual material. For 'business', include what the angle is, why THEY specifically are positioned for it, and a realistic first step.",
      ),
    atomIndexes: z.preprocess(
      (val) => (val === undefined || val === null ? [] : val),
      z
        .array(z.number())
        .describe("Indexes (from the numbered list given) of the atoms this insight draws on"),
    ),
  }),
);

const synthesizeSchema = z.object({
  insights: z.preprocess(
    (val) => (val === undefined || val === null ? [] : val),
    z.array(insightSchema).max(8).describe("The insights worth surfacing"),
  ),
});

export type SynthesizedInsight = z.infer<typeof insightSchema>;

export interface SynthesizeInput {
  /** Numbered atom list — index position is what atomIndexes refers to. */
  atoms: { kind: string; statement: string; detail: string; reinforcementCount: number }[];
  /** Human label for the window being synthesized ("this week", "all time"). */
  periodLabel: string;
  /** Restrict output to these kinds, or omit for the full mix. */
  kinds?: string[];
}

/**
 * The "gets smarter over time" payoff: reads the accumulated atom set and
 * produces highlights, themes the author hasn't named, ideas, and business
 * angles grounded in their own material.
 *
 * Note this runs on the NORMAL chain (no localOnly) — it reads distilled
 * atoms, not raw entries. See this section's header comment.
 */
export async function synthesizeInsights(
  input: SynthesizeInput,
  modelId?: ModelId,
  onModelUsed?: (id: ModelId) => void,
): Promise<SynthesizedInsight[]> {
  if (input.atoms.length === 0) return [];

  const numbered = input.atoms
    .map(
      (a, i) =>
        `[${i}] (${a.kind}, seen ${a.reinforcementCount}x) ${a.statement}${a.detail ? ` — ${a.detail}` : ""}`,
    )
    .join("\n");

  const { object } = await withFallback(
    "synthesize",
    modelId ?? TASK_MODELS.synthesize,
    (model) =>
      generateObject({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: synthesizeSchema,
        system: [
          "You are a sharp, candid personal strategist. You've been given a knowledge base distilled from someone's diary: durable facts about how they work, what they're building, who matters to them, and what they're trying to achieve.",
          "",
          "Produce insights that are worth their attention:",
          "- highlight: what genuinely mattered in this period, stated so they feel it",
          "- theme: a through-line across several atoms they probably haven't named themselves. This is the highest-value output — connect things that sit far apart.",
          "- idea: a specific creative direction built from their OWN material",
          "- business: a venture or monetization angle. Say what the angle is, why THIS person is unusually positioned for it given their actual skills and projects, and a realistic first step. No generic startup advice.",
          "- recommendation: one concrete thing to do next",
          "- reflection: a question worth sitting with, drawn from a tension or contradiction in the material",
          "",
          "Rules:",
          "- Ground every insight in the atoms provided and cite their indexes. Never invent facts about this person.",
          "- Atoms reinforced many times are well-established; a single-sighting atom is tentative — weight them accordingly and don't build a business plan on one weak observation.",
          "- Be specific and non-obvious. A generic insight that would apply to any professional is a failure, even if it's true.",
          "- Be direct. Skip the flattery and the hedging.",
          input.kinds?.length
            ? `- Only produce insights of these kinds: ${input.kinds.join(", ")}.`
            : "- Produce a mix, weighted toward themes and ideas.",
          "",
          'Each insight object must use exactly these four keys: "kind", "title", "body", "atomIndexes". Do not use other key names like "type", "content", or "atoms".',
          NO_BROWSING_INSTRUCTION,
          JSON_ARRAY_SHAPE_REMINDER,
        ].join("\n"),
        prompt:
          [`Period: ${input.periodLabel}`, `Knowledge base (${input.atoms.length} atoms):`, numbered].join(
            "\n\n",
          ) + NO_THINKING_SUFFIX,
      }),
    { objectMode: true, onModelUsed },
  );

  return object.insights.map((i) => ({
    ...i,
    title: unescapeLiteralWhitespace(i.title).trim().slice(0, 300),
    body: unescapeLiteralWhitespace(i.body).trim(),
    // Drop hallucinated out-of-range indexes rather than letting them
    // become broken insight->atom links.
    atomIndexes: (i.atomIndexes ?? []).filter(
      (n) => Number.isInteger(n) && n >= 0 && n < input.atoms.length,
    ),
  }));
}

// --- trends overview (on-demand version of fetch-trends.ts's writeDailyOverview) ---
//
// scripts/fetch-trends.ts's writeDailyOverview does the same job for the
// unattended daily cron, but deliberately uses its own simpler pickModel()
// rather than this file's withFallback/chainFor — it's a standalone script
// outside the app. This is the in-app counterpart for the /trends page's
// manual "generate/refresh summary" button: same idea (summarize today's
// pulled items into an overview/insight/action-items/watch-list), but wired
// through the app's normal task machinery so it gets automatic per-model
// fallback and an explicit model override from the page's picker, neither
// of which the cron script needs since it always runs unattended.

const trendsOverviewSchema = z.object({
  overviewEn: z
    .string()
    .describe(
      "3-5 plain-English sentences summarizing today's pulled AI news and GitHub Trending activity together, as one combined picture. Prose only, no markdown, no headings.",
    ),
  overviewZh: z.string().describe("The same overview, in Simplified Chinese (a real translation, not independent commentary)."),
  insight: z
    .string()
    .describe(
      "One or two sentences naming a non-obvious pattern or connection across TODAY's items specifically — not a generic AI-industry observation, not a restatement of any single item.",
    ),
  insightZh: z.string().describe("The insight, in Simplified Chinese."),
  actionItems: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe(
      "3-5 concrete, specific things a reader building agentic AI systems or a personal knowledge base could actually do this week, grounded in today's specific items — not generic advice.",
    ),
  actionItemsZh: z.array(z.string()).min(3).max(5).describe("The same action items, in Simplified Chinese, same order."),
  watchList: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 short phrases naming emerging signals from today's items worth monitoring but not yet actionable."),
  watchListZh: z.array(z.string()).min(3).max(5).describe("The same watch-list items, in Simplified Chinese, same order."),
});

export type TrendsOverview = z.infer<typeof trendsOverviewSchema>;

export interface TrendsOverviewInput {
  items: { category: string; title: string; source: string; summary: string }[];
  githubRepos: { fullName: string; description: string; language: string | null; stars: number }[];
}

export async function generateTrendsOverview(
  input: TrendsOverviewInput,
  modelId?: ModelId,
): Promise<TrendsOverview> {
  const newsBullets =
    input.items
      .map((i) => `- [${i.category}] ${i.title} (${i.source})${i.summary ? `: ${i.summary}` : ""}`)
      .join("\n") || "(nothing pulled)";
  const repoBullets =
    input.githubRepos
      .map(
        (r) =>
          `- ${r.fullName}${r.language ? ` (${r.language})` : ""} — ${r.stars} stars${r.description ? `: ${r.description}` : ""}`,
      )
      .join("\n") || "(nothing pulled)";

  const { object } = await withFallback(
    "trends-overview",
    modelId ?? TASK_MODELS["trends-overview"],
    (model) =>
      generateObject({
        model,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
        schema: trendsOverviewSchema,
        system: [
          "You analyze today's pulled AI news, research, and GitHub Trending repos for the top of a digest page read by someone building agentic AI products and maintaining a personal knowledge base. Stay grounded in the specific items given — never invent details not present in the lists. Write every field in both English and Simplified Chinese as instructed per-field; the Chinese fields are translations of their English counterparts, not independent commentary.",
          "Favor practical, builder-focused takeaways — agentic AI/agent-harness engineering, agent loop design, graph/knowledge engineering, LLM tooling and wikis — over generic industry commentary.",
          'Every field must use exactly the key names given: "overviewEn", "overviewZh", "insight", "insightZh", "actionItems", "actionItemsZh", "watchList", "watchListZh". Do not rename or nest them.',
          NO_BROWSING_INSTRUCTION,
          JSON_ARRAY_SHAPE_REMINDER,
        ].join("\n\n"),
        prompt:
          [`AI news/research pulled today:\n${newsBullets}`, `GitHub Trending repos (today's daily snapshot):\n${repoBullets}`].join(
            "\n\n",
          ) + NO_THINKING_SUFFIX,
      }),
    { objectMode: true },
  );

  return {
    overviewEn: unescapeLiteralWhitespace(object.overviewEn).trim(),
    overviewZh: unescapeLiteralWhitespace(object.overviewZh).trim(),
    insight: unescapeLiteralWhitespace(object.insight).trim(),
    insightZh: unescapeLiteralWhitespace(object.insightZh).trim(),
    actionItems: object.actionItems,
    actionItemsZh: object.actionItemsZh,
    watchList: object.watchList,
    watchListZh: object.watchListZh,
  };
}
