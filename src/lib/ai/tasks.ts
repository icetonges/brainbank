import { generateObject, generateText, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { resolveModel } from "./providers";
import { DEFAULT_MODEL_ID, type ModelId } from "./models";
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

export type TaskName =
  | "assist"
  | "summarize"
  | "tag-and-link"
  | "translate"
  | "draft"
  | "publish-assist";

export const TASK_MODELS: Record<TaskName, ModelId> = {
  assist: DEFAULT_MODEL_ID,
  summarize: "gemini-3.1-flash-lite",
  "tag-and-link": "gemini-3.1-flash-lite",
  translate: DEFAULT_MODEL_ID,
  draft: DEFAULT_MODEL_ID,
  "publish-assist": DEFAULT_MODEL_ID,
};

function modelFor(task: TaskName, override?: ModelId) {
  return resolveModel(override ?? TASK_MODELS[task]);
}

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
  const { text } = await generateText({
    model: modelFor("summarize", modelId),
    system:
      "You write a single, dense sentence summarizing a personal knowledge-base note. No preamble, no quotes, just the sentence.",
    prompt: noteToPrompt(note),
  });
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
  const { object } = await generateObject({
    model: modelFor("tag-and-link", modelId),
    schema: tagSuggestionSchema,
    system:
      "You tag notes in a personal knowledge base. Tags are short, lowercase, and reusable across notes (prefer existing-sounding general terms over one-off phrases).",
    prompt: noteToPrompt(note),
  });
  return object;
}

// --- translate ---

export async function translateText(
  text: string,
  target: "en" | "zh",
  modelId?: ModelId,
): Promise<string> {
  if (!text.trim()) return "";
  const targetLabel = target === "zh" ? "Simplified Chinese" : "English";
  const { text: translated } = await generateText({
    model: modelFor("translate", modelId),
    system: `Translate the given text into ${targetLabel}. Preserve meaning and tone.

If the text contains markdown, preserve its structure exactly — keep every heading marker (#, ##, ###), bullet (-, *) and numbered list marker, blank line between blocks, bold (**text**) and italic (*text*) marker, and table pipe/row layout in place; translate only the prose inside those elements. Leave code blocks (fenced with \`\`\`), inline code (\`text\`), URLs, and link targets ([text](url) — translate the link text, not the URL) untouched. A run of short list items must come back as the same number of separate list items, not collapsed into one paragraph.

Return only the translation, no commentary.`,
    prompt: text,
  });
  return translated.trim();
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
  const model = modelFor("translate", modelId);
  const targetLabel = target === "zh" ? "Simplified Chinese" : "English";

  const { object } = await generateObject({
    model,
    schema: z.object({
      title: z.string(),
      what: z.string(),
      how: z.string(),
      why: z.string(),
      other: z.string(),
    }),
    system: `Translate every field into ${targetLabel}. Keep empty fields empty. Preserve meaning and tone, return only the translated fields.`,
    prompt: JSON.stringify(note),
  });
  return object;
}

// --- assist (streaming chat) ---

export function streamAssist(messages: ModelMessage[], modelId?: ModelId) {
  return streamText({
    model: modelFor("assist", modelId),
    system:
      "You are the AI assist panel inside brainbank, a personal knowledge base. Help the user draft or refine a note's What (the concept/fact), How (mechanism or steps), and Why (context/reasoning). Be concise and concrete; prefer structured, scannable answers over long prose.",
    messages,
  });
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
  const { object } = await generateObject({
    model: modelFor("publish-assist", modelId),
    schema: publishAssistSchema,
    system: [
      "You are the AI publish assistant for the 'AI Classroom' section of a personal knowledge base about AI.",
      "From the user's article content, produce: a topic, the best-fitting category, tags, a one-sentence summary, a learning map (staged roadmap in markdown), hands-on step-by-step instructions (numbered markdown steps a beginner can actually follow), and the top 3 learning resources.",
      "Categories: knowledge (concepts/theory), skill (abilities to practice), mcp (Model Context Protocol), api (APIs/SDKs), best-practices, use-cases, step-by-step (tutorials/guides), ai-evaluation (evals/benchmarks), ai-models (specific models), ai (general/anything else).",
      "Resources must be real and well-known (official documentation, GitHub repositories, established courses/channels). If unsure a URL is real, pick a better-known resource instead — never fabricate links.",
      "Write the topic, summary, learning map, and hands-on steps in the same language as the user's content (English or Chinese). Tags stay lowercase English.",
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
  });

  return {
    ...object,
    topic: input.topic || object.topic,
    category: input.category ?? object.category,
  };
}

export async function draftNoteFromSource(
  input: DraftSourceInput,
  modelId?: ModelId,
): Promise<DraftedNote> {
  const { object } = await generateObject({
    model: modelFor("draft", modelId),
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
  });
  return object;
}
