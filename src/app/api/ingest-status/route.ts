import { db } from "@/lib/db";
import { ingestionJobs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { staleJobMessage } from "@/lib/job-health";

export const runtime = "nodejs";

// Polled by IngestStatusBanner while a note is processing. Not
// auth-gated — published notes are public read, and job status isn't
// sensitive.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const noteId = Number(searchParams.get("noteId"));
  if (!noteId) return new Response("noteId is required", { status: 400 });

  const job = await db.query.ingestionJobs.findFirst({
    where: eq(ingestionJobs.noteId, noteId),
    orderBy: desc(ingestionJobs.createdAt),
  });

  if (!job) return Response.json({ status: "succeeded", stage: null, error: null });

  const staleError = staleJobMessage(job.status, job.startedAt ?? job.createdAt);
  if (staleError) {
    await db
      .update(ingestionJobs)
      .set({ status: "failed", error: staleError, finishedAt: new Date() })
      .where(eq(ingestionJobs.id, job.id));
    return Response.json({ status: "failed", stage: job.stage, error: staleError });
  }

  return Response.json({ status: job.status, stage: job.stage, error: job.error });
}
