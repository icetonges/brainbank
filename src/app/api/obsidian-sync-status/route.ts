import { auth } from "@/auth";
import { db } from "@/lib/db";
import { obsidianSyncRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { staleJobMessage } from "@/lib/job-health";

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

  const staleError = staleJobMessage(run.status, run.startedAt ?? run.createdAt);
  if (staleError) {
    await db
      .update(