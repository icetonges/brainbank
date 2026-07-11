import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { obsidianSyncRuns } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { isObsidianSyncConfigured } from "@/lib/obsidian/github";
import { triggerObsidianSyncAction } from "./actions";
import { ObsidianSyncStatus } from "@/components/obsidian-sync-status";

export const dynamic = "force-dynamic";

export default async function ObsidianPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const configured = isObsidianSyncConfigured();
  const latestRun = configured
    ? await db.query.obsidianSyncRuns.findFirst({ orderBy: desc(obsidianSyncRuns.createdAt) })
    : undefined;

  const syncing = latestRun?.status === "queued" || latestRun?.status === "running";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Obsidian sync</h1>
        <p className="mt-1 text-fg-secondary">
          One-way: write notes in your Obsidian vault, push them to a{" "}
          <code className="text-accent">notes/</code> folder in a GitHub repo, and sync them in
          here. Notes with{" "}
          <code className="text-accent">## What</code> / <code className="text-accent">## How</code>{" "}
          / <code className="text-accent">## Why</code> / <code className="text-accent">## Other</code>{" "}
          headers are used as-is; anything else is drafted into that template by AI, same as any
          other source. See <code className="text-accent">SETUP.md</code> for the vault/repo
          setup.
        </p>
      </div>

      {!configured ? (
        <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">Not configured yet.</p>
          <p className="mt-1 text-sm">
            Set <code className="text-accent">GITHUB_TOKEN</code> and{" "}
            <code className="text-accent">GITHUB_OBSIDIAN_REPO</code> in{" "}
            <code className="text-accent">.env.local</code> (optionally{" "}
            <code className="text-accent">GITHUB_OBSIDIAN_BRANCH</code> and{" "}
            <code className="text-accent">GITHUB_OBSIDIAN_PATH</code>, both default to sensible
            values). See <code className="text-accent">.env.example</code>.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-bg-elevated p-5">
          <ObsidianSyncStatus
            initialStatus={latestRun?.status ?? null}
            initialFilesTotal={latestRun?.filesTotal ?? null}
            initialFilesProcessed={latestRun?.filesProcessed ?? null}
            initialFilesFailed={latestRun?.filesFailed ?? null}
            initialError={latestRun?.error ?? null}
          />
          <form action={triggerObsidianSyncAction} className="mt-4">
            <button
              type="submit"
              disabled={syncing}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
