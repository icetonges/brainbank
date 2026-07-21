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
// Before this, a single provider error (e.g. Gemini hitting its monthly
// spend cap) took the whole task down with it even though other
// registered — and in some cases free — models were available.

export type TaskName =
  | "assist"
  | "summarize"
  | "tag-and-link"
  | "translate"
  | "draft"
  | "publish-assist"
  | "format-article";

export const TASK_MODELS: Record<TaskName, ModelId> = {
  // assist is the one task allowed an agentic, web-searching model — it's
  // an open-ended chat helper, not a transform over fixed input.
  assist: DEFAULT_MODEL_ID,
  summarize: "gemini-3.1-flash-lite",
  "tag-and-link": "gemini-3.1-flash-lite",
  // Every other task is a *grounded* transform — it must operate only on
  // the text it's given, never on whatever a model's built-in web search
  // decides to fetch. DEFAULT_MODEL_ID is deliberately NOT used here (see
  // AGENTIC_MODELS in models.ts): it currently resolves to groq/compound,
  // whose autonomous web search corrupted translations that mentioned a
  // URL.
  translate: "openai/gpt-oss-120b",
  draft: "openai/gpt-oss-120b",
  "publish-assist": "openai/gpt-oss-120b",
  "format-article": "openai/gpt-oss-120b",
};

/**
 * Preferred model first, then the rest of the chain in order (deduped).
 * Grounded tasks (everything except assist) use GROUNDED_FALLBACK_CHAIN
 * and never even start from an agentic model: if an explicit override
 * asks for one anyway (e.g. someone picks Compound in a task's model
 * picker without knowing it can autonomously browse), it's swapped for
 * the first grounded model instead of honored — letting a "translate
 * this" call quietly fetch and blend in live web content is a
 * correctness bug, not a preference to respect.
 */
function chainFor(preferred: ModelId, grounded: boolean): ModelId[] {
  const chain = grounded ? GROUNDED_FALLBACK_CHAIN : FALLBACK_CHAIN;
  const safePreferred =
    grounded && AGENTIC_MODELS.includes(preferred) ? chain[0] : preferred;
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
 * is acceptable.
 */
async function withFallback<T>(
  label: TaskName,
  preferred: ModelId,
  attempt: (model: LanguageModel) => Promise<T>,
  options: { grounded?: boolean; onModelUsed?: (modelId: ModelId) => void } = {},
): Promise<T> {
  const chain = chainFor(preferred, options.grounded ?? true);
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
        system:
          "You write a single, dense sentence summarizing a personal knowledge-base note. No preamble, no quotes, just the sentence.",
        prompt: noteToPrompt(note),
      }),
  );
  return text.trim();
}

// --- tag-and-link ---

const tagSuggestionSchema = z.object({
  tags: z
    .array(z.string())
    .describe("3-6 short lowercase tags (single words or hyphenated phrases)"),
  relatedTopics: z
    .array(z.string())
    .describe("0-5 topics or concepts this note is likely connected to"),
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
        schema: tagSuggestionSchema,
        system:
          "You tag notes in a personal knowledge base. Tags are short, lowercase, and reusable across notes (prefer existing-sounding general terms over one-off phrases).",
        prompt: noteToPrompt(note),
      }),
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
    const [ta, tb] = await Promise.all([
      translateChunk(a, target, modelId, onModelUsed),
      translateChunk(b, target, modelId, onModelUsed),
    ]);
    return `${ta}${tb}`;
  }

  return translated;
}

async function translateWithMeta(
  text: string,
  target: "en" | "zh",
  modelId: ModelId | undefined,
  onModelUsed?: (id: ModelId) => void,
): Promise<string> {
  if (!text.trim()) return "";
  const chosenModel = modelId ?? TASK_MODELS.translate;
  const chunks = chunkMarkdown(text, TRANSLATE_CHUNK_MAX_CHARS);

  if (chunks.length <= 1) {
    return translateChunk(text, target, chosenModel, onModelUsed);
  }

  // Chunks are independent, so translate them concurrently — Promise.all
  // preserves result order even though calls may resolve out of order, so
  // joining is still safe. Each chunk goes through the full model
  // fallback chain and the recursive length-guard on its own.
  const translatedChunks = await Promise.all(
    chunks.map((chunk) => translateChunk(chunk, target, chosenModel, onModelUsed)),
  );
  return translatedChunks.join("");
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
        schema: z.object({
          title: z.string(),
          what: z.string(),
          how: z.string(),
          why: z.string(),
          other: z.string(),
        }),
        system: `Translate every field into ${targetLabel}. Keep empty fields empty. Preserve meaning and tone. Translate the FULL text of every field, however long — never shorten, summarize, condense, or omit any part of a field. Return only the translated fields.`,
        prompt: JSON.stringify(note),
      }),
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

/**
 * Streaming chat behind the AI Assist panel. Unlike the other tasks this
 * can't just retry-and-return, because the point is to pipe tokens to the
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
): Promise<Response> {
  const chain = chainFor(modelId ?? TASK_MODELS.assist, false);
  let lastError: unknown;

  for (const id of chain) {
    let reader: ReadableStreamDefaultReader<string>;
    let first: ReadableStreamReadResult<string>;
    try {
      const result = streamText({
        model: resolveModel(id),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        system: ASSIST_SYSTEM_PROMPT,
        messages,
      });
      reader = result.textStream.getReader();
      first = await reader.read();
    } catch (err) {
      lastError = err;
      console.error(`[ai:assist] ${id} failed before first token, falling back`, err);
      continue;
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (first.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(first.value));
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            controller.enqueue(encoder.encode(chunk.value));
          }
          controller.close();
        } catch (err) {
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
  tags: z
    .array(z.string())
    .describe("3-6 short lowercase tags, reusable across notes"),
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
  tags: z
    .array(z.string())
    .describe("3-6 short lowercase tags reusable across articles"),
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
    .array(
      z.object({
        title: z.string().describe("Name of the resource"),
        url: z
          .string()
          .describe(
            "The resource's real, stable URL — official docs, GitHub repo, or well-known site. Never invent a URL.",
          ),
        description: z
          .string()
          .describe("One sentence: what it covers and why it's worth the time"),
      }),
    )
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
        schema: draftedNoteSchema,
        system:
          "You turn raw source material into a personal knowledge-base note using the what/how/why/other template: what is the core idea, how does it work or get applied, why does it matter, and anything else worth keeping. Be concrete and specific to the source, not generic. Leave a field as an empty string if the source genuinely has nothing for it — don't pad.",
        prompt: [
          `Source title: ${input.sourceTitle}`,
          input.sourceUrl ? `Source URL: ${input.sourceUrl}` : null,
          `Source text:\n${input.sourceText}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
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
