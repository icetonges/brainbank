import { inngest } from "./client";
import { extractSource } from "@/lib/ingest/extract";
import { draftNoteFromSource } from "@/lib/ai/tasks";
import {
  markJobRunning,
  markJobStage,
  markJobSucceeded,
  markJobFailed,
  saveDraftedNote,
} from "@/lib/ingest/persist";
import type { SourceType } from "@/lib/db/schema";

export interface IngestEventData {
  noteId: number;
  sourceType: SourceType;
  sourceUrl?: string;
  mediaUrl?: string;
  filename?: string;
}

// The full pipeline from PLAN.md §5: fetch/parse the source (plain code,
// see src/lib/ingest/extract.ts) → draft a what/how/why/other note from it
// (the one LLM step, tasks.ts) → save. Runs as a background job because
// transcribing a video or parsing a 50MB PDF can easily outlast a Vercel
// function's request timeout.
export const ingestSource = inngest.createFunction(
  {
    id: "ingest-source",
    retries: 2,
    triggers: [{ event: "note/ingest.requested" }],
  },
  async ({ event, step }) => {
    const { noteId, sourceType, sourceUrl, mediaUrl, filename } = event.data as IngestEventData;

    try {
      await step.run("mark-running", () => markJobRunning(noteId, "extracting"));

      const extracted = await step.run("extract", () =>
        extractSource({ sourceType, sourceUrl, mediaUrl, filename }),
      );

      await step.run("mark-drafting", () => markJobStage(noteId, "drafting"));

      const draft = await step.run("draft", () =>
        draftNoteFromSource({
          sourceTitle: extracted.title,
          sourceText: extracted.text,
          sourceUrl,
        }),
      );

      await step.run("mark-saving", () => markJobStage(noteId, "saving"));

      const slug = await step.run("save", () => saveDraftedNote(noteId, draft));

      await step.run("mark-succeeded", () => markJobSucceeded(noteId));

      return { noteId, slug };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ingestion failed";
      await step.run("mark-failed", () => markJobFailed(noteId, message));
      throw err;
    }
  },
);
