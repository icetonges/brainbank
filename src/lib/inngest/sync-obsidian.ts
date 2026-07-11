import { inngest } from "./client";
import { listVaultFiles, fetchBlobContent } from "@/lib/obsidian/github";
import {
  upsertNoteFromVaultFile,
  markSyncRunning,
  markSyncProgress,
  markSyncSucceeded,
  markSyncFailed,
} from "@/lib/obsidian/persist";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";

export interface ObsidianSyncEventData {
  runId: number;
}

/** Executes a vault sync without requiring Inngest Cloud to call the app. */
export async function runObsidianSyncDirect(runId: number) {
  try {
    const files = await listVaultFiles();
    const existing = await db
      .select({ sourcePath: notes.sourcePath, sourceSha: notes.sourceSha })
      .from(notes)
      .where(isNotNull(notes.sourcePath));
    const knownSha = new Map(existing.map((note) => [note.sourcePath as string, note.sourceSha]));
    const changed = files.filter((file) => knownSha.get(file.path) !== file.sha);

    await markSyncRunning(runId, changed.length);
    let processed = 0;
    let failed = 0;
    for (const file of changed) {
      try {
        const content = await fetchBlobContent(file.sha);
        await upsertNoteFromVaultFile(file, content);
        processed += 1;
      } catch {
        failed += 1;
      }
      await markSyncProgress(runId, processed, failed);
    }
    await markSyncSucceeded(runId);
    return { runId, filesTotal: changed.length, filesProcessed: processed, filesFailed: failed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Obsidian sync failed";
    await markSyncFailed(runId, message);
    throw err;
  }
}

// One-way Obsidian -> site sync (PLAN.md §8): lists every .md file under
// the configured vault path, diffs each file's git blob sha against what
// we last synced, and runs only the changed ones through the same
// code-first-with-AI-fallback pipeline as any other ingestion source (see
// src/lib/obsidian/persist.ts). A single vault-wide pass is one Inngest
// run, tracked as one obsidian_sync_runs row.
export const syncObsidianVault = inngest.createFunction(
  {
    id: "sync-obsidian-vault",
    retries: 1,
    triggers: [{ event: "obsidian/sync.requested" }],
  },
  async ({ event, step }) => {
    const { runId } = event.data as ObsidianSyncEventData;
    return step.run("sync-vault", () => runObsidianSyncDirect(runId));
  },
);
