import { after } from "next/server";
import { runIngestionDirect, type IngestEventData } from "@/lib/inngest/ingest-source";
import { runObsidianSyncDirect } from "@/lib/inngest/sync-obsidian";
import { runDistillDirect, type DistillEventData } from "@/lib/inngest/distill-diary";

type Scheduler = (task: () => Promise<void>) => void;

function logBackgroundFailure(kind: string, error: unknown) {
  console.error(`${kind} background job failed`, error);
}

export function dispatchIngestionJob(
  data: IngestEventData,
  schedule: Scheduler = after,
  run: (data: IngestEventData) => Promise<unknown> = runIngestionDirect,
) {
  schedule(async () => {
    try {
      await run(data);
    } catch (error) {
      logBackgroundFailure("Ingestion", error);
    }
  });
}

export function dispatchObsidianSync(
  runId: number,
  schedule: Scheduler = after,
  run: (runId: number) => Promise<unknown> = runObsidianSyncDirect,
) {
  schedule(async () => {
    try {
      await run(runId);
    } catch (error) {
      logBackgroundFailure("Obsidian sync", error);
    }
  });
}

/**
 * Fire-and-forget knowledge distillation for a saved diary entry.
 *
 * Swallowing the error here is deliberate and safe: distillDiaryEntry
 * records its own failure on the knowledge_runs row and leaves
 * diaryEntries.distilledAt null, so a failed pass is visible on
 * /assistant and retryable from the backlog rather than lost. Letting it
 * reject would surface a scary error on a diary save that actually
 * succeeded.
 */
export function dispatchDistillJob(
  data: DistillEventData,
  schedule: Scheduler = after,
  run: (data: DistillEventData) => Promise<unknown> = runDistillDirect,
) {
  schedule(async () => {
    try {
      await run(data);
    } catch (error) {
      logBackgroundFailure("Diary distillation", error);
    }
  });
}
