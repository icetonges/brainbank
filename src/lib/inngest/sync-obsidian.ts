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

    // 0 files found is almost always a setup problem (wrong repo, branch,
    // or folder — or the vault was never pushed to GitHub), not a healthy
    // no-op. Fail loudly with the exact config so it's fixable from the UI.
    if (files.length === 0) {
      const repo = process.env.GITHUB_OBSIDIAN_REPO;
      const branch = process.env.GITHUB_OBSIDIAN_BRANCH || "main";
      const vaultPath = process.env.GITHUB_OBSIDIAN_PATH || "notes";
      throw new Error(
        `No Markdown files found under "${vaultPath}/" on branch "${branch}" of ${repo}. ` +
          `Push your Obsidian vault's .md files to that folder, or point GITHUB_OBSIDIAN_REPO / ` +
          `GITHUB_OBSIDIAN_PATH / GITHUB_OBSIDIAN_BRANCH at the right place (see SETUP.md).`,
      );
    }

    const existing = await db
      .select({ sourcePath: notes.sourcePath, sourceSha: notes.sourceSha })
      .from(notes)
      .where(isNotNull(notes.sourcePath));
    const knownSha = new Map(existing.map((note) => [note.sourcePath as string, note.sourceSha]));
    const changed = files.filter((file) => knownSha.get(file.path) !== file.sha);

    await markSyncRunning(runId, changed.length, files.length);
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
