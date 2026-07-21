import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { obsidianSyncRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { staleJobMessage } from "@/lib/job-health";
import { isObsidianSyncConfigured } from "@/lib/obsidian/github";
import { triggerObsidianSyncAction } from "./actions";
import { ObsidianSyncStatus } from "@/components/obsidian-sync-status";
import { isObsidianWebhookConfigured } from "@/lib/obsidian/webhook";

export const dynamic = "force-dynamic";

// drizzle-orm wraps every driver error in a generic "Failed query: <sql>
// params: ..." message — the actual reason (missing table, auth failure,
// whatever) is the driver's own error, nested one level down in `.cause`,
// not in `.message`. Walking the cause chain is the only way to surface
// it; without this the owner-facing error message is just the SQL text
// back at them, which is useless for diagnosis.
function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join("\nCaused by: ");
}

// Mirrors the DB error handling in graph/page.tsx. Without this, a DB
// error here throws uncaught out of the Server Component and takes down
// the whole page with Next's generic "Something went wrong" screen. This
// page is owner-only (see the redirect below), so there's no reason to
// hide the raw driver error behind a vague category guess the way a
// public-facing page might — show it as-is, that's the fastest path to
// actually diagnosing whatever's wrong (missing migration, bad
// DATABASE_URL, Neon project paused/unreachable, etc.).
async function loadLatestRun(): Promise<
  | { run: typeof obsidianSyncRuns.$inferSelect | undefined; error: null }
  | { run: undefined; error: string }
> {
  try {
    const run = await db.query.obsidianSyncRuns.findFirst({ orderBy: desc(obsidianSyncRuns.createdAt) });
    return { run, error: null };
  } catch (err) {
    console.error("Failed to load Obsidian sync status:", err);
    const raw = describeError(err);
    const hint = /relation .* does not exist/i.test(raw)
      ? " (the obsidian_sync_runs table doesn't exist in this database yet — run `npm run db:migrate` or `npm run db:push` against it)"
      : "";
    return { run: undefined, error: `${raw}${hint}` };
  }
}

export default async function ObsidianPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const configured = isObsidianSyncConfigured();
  const automaticSyncConfigured = isObsidianWebhookConfigured();

  let latestRun: typeof obsidianSyncRuns.$inferSelect | undefined;
  let loadError: string | null = null;
  if (configured) {
    const result = await loadLatestRun();
    latestRun = result.run;
    loadError = result.error;
  }

  // Self-heal a run whose background worker died (dev-server restart,
  // serverless timeout): without this the "Sync now" button stays disabled
  // on "Syncing…" forever. Same rule the polling endpoint applies.
  if (!loadError && latestRun && (latestRun.status === "queued" || latestRun.status === "running")) {
    const staleError = staleJobMessage(latestRun.status, latestRun.startedAt ?? latestRun.createdAt);
    if (staleError) {
      try {
        await db
          .update(obsidianSyncRuns)
          .set({ status: "failed", error: staleError, finishedAt: new Date() })
          .where(eq(obsidianSyncRuns.id, latestRun.id));
        latestRun = { ...latestRun, status: "failed", error: staleError };
      } catch (err) {
        console.error("Failed to self-heal stale Obsidian sync run:", err);
      }
    }
  }

  const syncing = latestRun?.status === "queued" || latestRun?.status === "running";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Obsidian sync</h1>
        <p className="mt-1 text-fg-secondary">
          One-way: write notes in your Obsidian vault and push them to a{" "}
          <code className="text-accent">notes/</code> folder in a GitHub repo, and sync them in
          automatically. Notes with{" "}
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
      ) : loadError ? (
        <div className="rounded-lg border border-danger/50 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">Couldn&apos;t load sync status.</p>
          <p className="mt-1 whitespace-pre-line font-mono text-sm">{loadError}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-bg-elevated p-5">
          <div className="mb-4 rounded-md border border-border bg-bg p-3 text-sm text-fg-secondary">
            <p className="font-medium text-fg">
              Automatic GitHub sync: {automaticSyncConfigured ? "ready" : "setup required"}
            </p>
            {automaticSyncConfigured ? (
              <p className="mt-1">
                Pushes affecting Markdown files under <code className="text-accent">notes/</code>{" "}
                trigger this importer automatically.
              </p>
            ) : (
              <p className="mt-1">
                Set <code className="text-accent">GITHUB_WEBHOOK_SECRET</code> and add a GitHub push
                webhook targeting <code className="text-accent">/api/obsidian-webhook</code>.
              </p>
            )}
          </div>
          <ObsidianSyncStatus
            initialStatus={latestRun?.status ?? null}
            initialFilesScanned={latestRun?.filesScanned ?? null}
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
