import { generateObject, generateText, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { resolveModel } from "./providers";
import { DEFAULT_MODEL_ID, type ModelId } from "./models";

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

export type TaskName = "assist" | "summarize" | "tag-and-link" | "translate" | "draft";

export const TASK_MODELS: Record<TaskName, ModelId> = {
  assist: DEFAULT_MODEL_ID,
  summarize: "gemini-3.1-flash-lite",
  "tag-and-link": "gemini-3.1-flash-lite",
  translate: DEFAULT_MODEL_ID,
  draft: DEFAULT_MODEL_ID,
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
    system: `Translate the given text into ${targetLabel}. Preserve meaning and tone. Return only the translation, no commentary.`,
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
