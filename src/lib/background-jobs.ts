import { after } from "next/server";
import { runIngestionDirect, type IngestEventData } from "@/lib/inngest/ingest-source";
import { runObsidianSyncDirect } from "@/lib/inngest/sync-obsidian";

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
