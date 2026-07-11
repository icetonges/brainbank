import { auth } from "@/auth";
import { db } from "@/lib/db";
import { obsidianSyncRuns } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

// Polled by ObsidianSyncStatus while a sync is running. Owner-only — unlike
// ingest-status, there's no public-facing page this backs.
export async function GET() {
  const session = await auth();
  if (!session) return new Response("Not signed in", { status: 401 });

  const run = await db.query.obsidianSyncRuns.findFirst({
    orderBy: desc(obsidianSyncRuns.createdAt),
  });

  if (!run) {
    return Response.json({ status: null, filesTotal: null, filesProcessed: 0, filesFailed: 0, error: null });
  }

  return Response.json({
    status: run.status,
    filesTotal: run.filesTotal,
    filesProcessed: run.filesProcessed,
    filesFailed: run.filesFailed,
    error: run.error,
  });
}
