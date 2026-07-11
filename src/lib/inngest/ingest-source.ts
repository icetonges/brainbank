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
  rawText?: string;
}

/** Executes one ingestion without depending on Inngest Cloud registration. */
export async function runIngestionDirect(data: IngestEventData) {
  const { noteId, sourceType, sourceUrl, mediaUrl, filename, rawText } = data;

  try {
    await markJobRunning(noteId, "extracting");
    const extracted = await extractSource({ sourceType, sourceUrl, mediaUrl, filename, rawText });
    await markJobStage(noteId, "drafting");
    const draft = await draftNoteFromSource({
      sourceTitle: extracted.title,
      sourceText: extracted.text,
      sourceUrl,
    });
    await markJobStage(noteId, "saving");
    const slug = await saveDraftedNote(noteId, draft, extracted.imageUrl);
    await markJobSucceeded(noteId);
    return { noteId, slug };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    await markJobFailed(noteId, message);
    throw err;
  }
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
    return step.run("process-ingestion", () =>
      runIngestionDirect(event.data as IngestEventData),
    );
  },
);
