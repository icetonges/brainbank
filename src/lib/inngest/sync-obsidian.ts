import { inngest } from "./client";
import { listVaultFiles, fetchBlobContent, type VaultFile } from "@/lib/obsidian/github";
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

    try {
      const files = await step.run("list-files", () => listVaultFiles());

      const changed: VaultFile[] = await step.run("diff-against-db", async () => {
        const existing = await db
          .select({ sourcePath: notes.sourcePath, sourceSha: notes.sourceSha })
          .from(notes)
          .where(isNotNull(notes.sourcePath));

        const knownSha = new Map(existing.map((n) => [n.sourcePath as string, n.sourceSha]));
        return files.filter((f) => knownSha.get(f.path) !== f.sha);
      });

      await step.run("mark-running", () => markSyncRunning(runId, changed.length));

      let processed = 0;
      let failed = 0;

      for (let i = 0; i < changed.length; i++) {
        const file = changed[i];
        const result = await step.run(`sync-file-${i}`, async () => {
          try {
            const content = await fetchBlobContent(file.sha);
            await upsertNoteFromVaultFile(file, content);
            return { ok: true as const };
          } catch (err) {
            return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
          }
        });

        if (result.ok) processed += 1;
        else failed += 1;

        // Plain (non-step) write: safe to re-run on replay since it's just
        // overwriting the same row with counts re-derived from memoized
        // step results above.
        await markSyncProgress(runId, processed, failed);
      }

      await step.run("mark-succeeded", () => markSyncSucceeded(runId));

      return { runId, filesTotal: changed.length, filesProcessed: processed, filesFailed: failed };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Obsidian sync failed";
      await step.run("mark-failed", () => markSyncFailed(runId, message));
      throw err;
    }
  },
);
